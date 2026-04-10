"""
Dues Service — centralized logic for period-based dues tracking.

Three entry points:
  seed_period_dues(chapter, period)      — called when a period is created or activated.
                                           Creates ChapterPeriodDues rows for every
                                           active member × every configured fee type.

  seed_member_dues(chapter, user_id)     — called when a new member joins. Seeds dues
                                           rows for the active period only.

  apply_payment(chapter, user_id, fee_type_id, amount)
                                         — called after a payment is recorded. Updates
                                           the matching dues row and recomputes financial
                                           status. Returns True if a dues row was found
                                           and updated, False otherwise (caller should
                                           fall back to legacy auto-promote).

  recompute_financial_status(chapter, user_id)
                                         — derives ChapterMembership.financial_status
                                           from the active period's dues rows. No-op if
                                           the dues system isn't configured for this chapter.

These functions never commit — callers are responsible for db.session.commit().
"""

import logging
from decimal import Decimal

from app.extensions import db

logger = logging.getLogger(__name__)


def _get_fee_types(chapter) -> list[dict]:
    return (chapter.config or {}).get("fee_types", [])


def _get_active_period(chapter):
    from app.models.chapter_period import ChapterPeriod
    return ChapterPeriod.query.filter_by(chapter_id=chapter.id, is_active=True).first()


def _is_member_exempt(membership) -> bool:
    """True if this member is permanently exempt from dues."""
    return (
        getattr(membership, "member_type", None) == "life"
        or membership.financial_status == "exempt"
    )


# ── Seeding ───────────────────────────────────────────────────────────────────


def seed_period_dues(chapter, period) -> int:
    """
    Create ChapterPeriodDues rows for all active members and all configured fee types.

    Skips rows that already exist (idempotent — safe to call on activate too).
    Returns the number of new rows created.
    """
    from app.models import ChapterMembership
    from app.models.chapter_period_dues import ChapterPeriodDues

    fee_types = _get_fee_types(chapter)
    if not fee_types:
        return 0

    memberships = ChapterMembership.query.filter_by(
        chapter_id=chapter.id, active=True
    ).all()

    created = 0
    for m in memberships:
        for ft in fee_types:
            existing = ChapterPeriodDues.query.filter_by(
                period_id=period.id,
                user_id=m.user_id,
                fee_type_id=ft["id"],
            ).first()

            is_exempt = _is_member_exempt(m)
            owed = Decimal("0") if is_exempt else Decimal(str(ft.get("default_amount", 0)))
            if is_exempt:
                status = "exempt"
            elif owed == Decimal("0"):
                status = "paid"
            else:
                status = "unpaid"

            if existing:
                # Fix legacy rows where $0-owed fee types were incorrectly seeded as "unpaid"
                if existing.amount_owed == Decimal("0") and existing.status == "unpaid":
                    existing.status = "paid"
                continue

            db.session.add(ChapterPeriodDues(
                chapter_id=chapter.id,
                period_id=period.id,
                user_id=m.user_id,
                fee_type_id=ft["id"],
                fee_type_label=ft.get("label", ft["id"]),
                amount_owed=owed,
                amount_paid=Decimal("0"),
                status=status,
            ))
            created += 1

    logger.info(f"Seeded {created} dues records for period {period.id} in chapter {chapter.id}")
    return created


def seed_member_dues(chapter, user_id: str) -> int:
    """
    Create ChapterPeriodDues rows for a new member joining the chapter.

    Only seeds the currently active period. Skips if no active period or no fee types.
    """
    from app.models import ChapterMembership
    from app.models.chapter_period_dues import ChapterPeriodDues

    fee_types = _get_fee_types(chapter)
    active_period = _get_active_period(chapter)
    if not fee_types or not active_period:
        return 0

    membership = ChapterMembership.query.filter_by(
        chapter_id=chapter.id, user_id=user_id, active=True
    ).first()
    if not membership:
        return 0

    created = 0
    for ft in fee_types:
        exists = db.session.query(
            ChapterPeriodDues.query.filter_by(
                period_id=active_period.id,
                user_id=user_id,
                fee_type_id=ft["id"],
            ).exists()
        ).scalar()
        if exists:
            continue

        is_exempt = _is_member_exempt(membership)
        owed = Decimal("0") if is_exempt else Decimal(str(ft.get("default_amount", 0)))
        if is_exempt:
            status = "exempt"
        elif owed == Decimal("0"):
            status = "paid"
        else:
            status = "unpaid"

        db.session.add(ChapterPeriodDues(
            chapter_id=chapter.id,
            period_id=active_period.id,
            user_id=user_id,
            fee_type_id=ft["id"],
            fee_type_label=ft.get("label", ft["id"]),
            amount_owed=owed,
            amount_paid=Decimal("0"),
            status=status,
        ))
        created += 1

    return created


# ── Period rollover ───────────────────────────────────────────────────────────


def rollover_unpaid_dues(chapter, prev_period, new_period) -> int:
    """
    Carry forward unpaid balances from a completed period into the new active period.

    For every member who has an outstanding balance (unpaid or partial) in
    prev_period, increase amount_owed on the matching dues row in new_period by
    the remaining balance. If no row exists for that fee type in new_period yet,
    a new row is created.

    Should be called AFTER seed_period_dues(chapter, new_period) so the base
    rows already exist. Non-fatal — callers should wrap in try/except.
    Does not commit.

    Returns the number of dues rows that were updated or created.
    """
    from app.models.chapter_period_dues import ChapterPeriodDues

    # Rows with an outstanding balance in the previous period
    unpaid_rows = ChapterPeriodDues.query.filter(
        ChapterPeriodDues.chapter_id == chapter.id,
        ChapterPeriodDues.period_id == prev_period.id,
        ChapterPeriodDues.status.in_(["unpaid", "partial"]),
    ).all()

    if not unpaid_rows:
        return 0

    updated = 0
    for old_row in unpaid_rows:
        remaining = old_row.amount_owed - old_row.amount_paid
        if remaining <= Decimal("0"):
            continue

        # Find the matching row in the new period
        new_row = ChapterPeriodDues.query.filter_by(
            chapter_id=chapter.id,
            period_id=new_period.id,
            user_id=old_row.user_id,
            fee_type_id=old_row.fee_type_id,
        ).first()

        carry_note = (
            f"Includes {remaining:,.2f} carried forward from {prev_period.name}."
        )

        if new_row:
            if new_row.status == "exempt":
                continue  # Never touch exempt rows
            new_row.amount_owed += remaining
            # Recompute status after increasing amount_owed
            if new_row.amount_paid >= new_row.amount_owed:
                new_row.status = "paid"
            elif new_row.amount_paid > Decimal("0"):
                new_row.status = "partial"
            else:
                new_row.status = "unpaid"
            existing_note = new_row.notes or ""
            new_row.notes = (existing_note + "\n" + carry_note).strip()
        else:
            # No row exists yet — create a carryforward-only row
            db.session.add(ChapterPeriodDues(
                chapter_id=chapter.id,
                period_id=new_period.id,
                user_id=old_row.user_id,
                fee_type_id=old_row.fee_type_id,
                fee_type_label=old_row.fee_type_label,
                amount_owed=remaining,
                amount_paid=Decimal("0"),
                status="unpaid",
                notes=carry_note,
            ))

        updated += 1

    logger.info(
        f"Rolled over {updated} dues records from period {prev_period.id} "
        f"to period {new_period.id} in chapter {chapter.id}"
    )
    return updated


# ── Payment application ───────────────────────────────────────────────────────


def apply_payment(chapter, user_id: str, fee_type_id: str | None, amount: Decimal) -> bool:
    """
    Apply a payment to the active period's dues records.

    If fee_type_id is given: update only the matching dues row.
    If fee_type_id is None: distribute the amount proportionally across all
      unpaid/partial rows for the active period (largest balance first).

    Returns True if at least one dues row was updated (caller should then call
    recompute_financial_status). Returns False if no dues system is active for
    this member (caller should fall back to legacy auto-promote).
    """
    from app.models.chapter_period_dues import ChapterPeriodDues

    active_period = _get_active_period(chapter)
    if not active_period:
        return False

    if fee_type_id:
        dues = ChapterPeriodDues.query.filter_by(
            period_id=active_period.id,
            chapter_id=chapter.id,
            user_id=user_id,
            fee_type_id=fee_type_id,
        ).first()
        if not dues or dues.status == "exempt":
            return False
        _apply_to_row(dues, amount)
        return True

    # No fee_type_id — distribute across all owed rows
    owed_rows = ChapterPeriodDues.query.filter(
        ChapterPeriodDues.period_id == active_period.id,
        ChapterPeriodDues.chapter_id == chapter.id,
        ChapterPeriodDues.user_id == user_id,
        ChapterPeriodDues.status.in_(["unpaid", "partial"]),
    ).order_by(
        # Apply to largest balance first for predictable behavior
        (ChapterPeriodDues.amount_owed - ChapterPeriodDues.amount_paid).desc()
    ).all()

    if not owed_rows:
        return False

    remaining = amount
    for row in owed_rows:
        if remaining <= Decimal("0"):
            break
        to_apply = min(remaining, row.amount_owed - row.amount_paid)
        _apply_to_row(row, to_apply)
        remaining -= to_apply

    return True


def _apply_to_row(dues, amount: Decimal) -> None:
    """Update a single dues row with the given payment amount."""
    dues.amount_paid = min(dues.amount_owed, dues.amount_paid + amount)
    if dues.amount_paid >= dues.amount_owed:
        dues.status = "paid"
    elif dues.amount_paid > Decimal("0"):
        dues.status = "partial"


# ── Financial status recomputation ────────────────────────────────────────────


def recompute_financial_status(chapter, user_id: str) -> bool:
    """
    Derive ChapterMembership.financial_status from the active period's dues rows.

    A member is "financial" when every non-exempt dues row is "paid".
    Otherwise they remain "not_financial".

    No-op (returns False) when:
    - No active period exists
    - No dues rows exist for this member (dues system not configured)
    - Member status is "neophyte" or "exempt" (don't override)
    """
    from app.models import ChapterMembership
    from app.models.chapter_period_dues import ChapterPeriodDues

    active_period = _get_active_period(chapter)
    if not active_period:
        return False

    dues_rows = ChapterPeriodDues.query.filter_by(
        chapter_id=chapter.id,
        user_id=user_id,
        period_id=active_period.id,
    ).all()

    owed_rows = [d for d in dues_rows if d.status != "exempt"]
    if not owed_rows:
        return False  # No obligations — don't change status

    membership = ChapterMembership.query.filter_by(
        chapter_id=chapter.id, user_id=user_id, active=True
    ).first()
    if not membership:
        return False

    if membership.financial_status in ("neophyte", "exempt"):
        return False  # Never override these special statuses

    def _row_satisfied(d) -> bool:
        return d.status == "paid" or d.amount_owed == Decimal("0")

    new_status = "financial" if all(_row_satisfied(d) for d in owed_rows) else "not_financial"
    if membership.financial_status == new_status:
        return False

    membership.financial_status = new_status
    logger.info(
        f"Member {user_id} financial_status updated to '{new_status}' "
        f"for period {active_period.id} in chapter {chapter.id}"
    )
    return True
