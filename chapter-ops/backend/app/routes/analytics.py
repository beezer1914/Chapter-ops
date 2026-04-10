"""
Analytics routes — /api/analytics/*

Officer-level chapter health reporting.

  GET /chapter?period_id=<optional>   Full analytics snapshot for a period
"""

from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

from flask import Blueprint, g, jsonify, request
from flask_login import login_required
from sqlalchemy import func, case

from app.extensions import db
from app.models.chapter_period import ChapterPeriod
from app.models.membership import ChapterMembership
from app.models.payment import Payment
from app.models.expense import Expense
from app.utils.decorators import chapter_required, role_required

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")


def _dues_summary(chapter_id: str, period_id: str) -> dict:
    """
    Aggregate ChapterPeriodDues for a given period.
    Returns totals + per-fee-type breakdown.
    """
    try:
        from app.models.chapter_period_dues import ChapterPeriodDues

        rows = (
            db.session.query(
                ChapterPeriodDues.fee_type_id,
                ChapterPeriodDues.fee_type_label,
                func.sum(ChapterPeriodDues.amount_owed).label("owed"),
                func.sum(ChapterPeriodDues.amount_paid).label("paid"),
                func.count(ChapterPeriodDues.id).label("members"),
                func.sum(
                    case(
                        (ChapterPeriodDues.status == "paid", 1),
                        else_=0,
                    )
                ).label("fully_paid"),
                func.sum(
                    case(
                        (ChapterPeriodDues.status == "exempt", 1),
                        else_=0,
                    )
                ).label("exempt"),
            )
            .filter(
                ChapterPeriodDues.chapter_id == chapter_id,
                ChapterPeriodDues.period_id == period_id,
                ChapterPeriodDues.status != "exempt",
            )
            .group_by(
                ChapterPeriodDues.fee_type_id,
                ChapterPeriodDues.fee_type_label,
            )
            .order_by(ChapterPeriodDues.fee_type_label)
            .all()
        )

        total_owed = sum(r.owed or Decimal("0") for r in rows)
        total_paid = sum(r.paid or Decimal("0") for r in rows)
        total_remaining = total_owed - total_paid
        collection_rate = (
            round(float(total_paid / total_owed) * 100)
            if total_owed > 0 else 100
        )

        # Total unique members with dues (non-exempt)
        total_members_row = (
            db.session.query(
                func.count(func.distinct(ChapterPeriodDues.user_id)).label("n")
            )
            .filter(
                ChapterPeriodDues.chapter_id == chapter_id,
                ChapterPeriodDues.period_id == period_id,
                ChapterPeriodDues.status != "exempt",
            )
            .scalar()
        ) or 0

        paid_members = (
            db.session.query(
                func.count(func.distinct(ChapterPeriodDues.user_id)).label("n")
            )
            .filter(
                ChapterPeriodDues.chapter_id == chapter_id,
                ChapterPeriodDues.period_id == period_id,
            )
            .filter(
                ~ChapterPeriodDues.user_id.in_(
                    db.session.query(ChapterPeriodDues.user_id)
                    .filter(
                        ChapterPeriodDues.chapter_id == chapter_id,
                        ChapterPeriodDues.period_id == period_id,
                        ChapterPeriodDues.status.in_(["unpaid", "partial"]),
                    )
                    .scalar_subquery()
                )
            )
            .scalar()
        ) or 0

        by_fee_type = []
        for r in rows:
            r_owed = r.owed or Decimal("0")
            r_paid = r.paid or Decimal("0")
            r_rate = round(float(r_paid / r_owed) * 100) if r_owed > 0 else 100
            by_fee_type.append({
                "fee_type_id": r.fee_type_id,
                "label": r.fee_type_label,
                "owed": str(r_owed),
                "paid": str(r_paid),
                "remaining": str(r_owed - r_paid),
                "collection_rate": r_rate,
                "member_count": r.members,
            })

        return {
            "total_owed": str(total_owed),
            "total_paid": str(total_paid),
            "total_remaining": str(total_remaining),
            "collection_rate": collection_rate,
            "member_count": total_members_row,
            "fully_paid_members": paid_members,
            "by_fee_type": by_fee_type,
        }
    except Exception:
        return {
            "total_owed": "0",
            "total_paid": "0",
            "total_remaining": "0",
            "collection_rate": 0,
            "member_count": 0,
            "fully_paid_members": 0,
            "by_fee_type": [],
        }


def _member_status(chapter_id: str) -> dict:
    """Active member distribution by financial_status."""
    rows = (
        db.session.query(
            ChapterMembership.financial_status,
            func.count(ChapterMembership.id).label("n"),
        )
        .filter_by(chapter_id=chapter_id, active=True)
        .group_by(ChapterMembership.financial_status)
        .all()
    )
    result = {"financial": 0, "not_financial": 0, "neophyte": 0, "exempt": 0, "total": 0}
    for status, n in rows:
        if status in result:
            result[status] = n
        result["total"] += n
    return result


def _monthly_payments(chapter_id: str, months: int = 12) -> list:
    """Payment totals grouped by calendar month, last N months."""
    cutoff = date.today().replace(day=1) - timedelta(days=1)
    cutoff = (cutoff.replace(day=1) - timedelta(days=(months - 1) * 28)).replace(day=1)

    rows = (
        db.session.query(
            func.to_char(Payment.created_at, "YYYY-MM").label("month"),
            func.sum(Payment.amount).label("total"),
            func.count(Payment.id).label("count"),
        )
        .filter(
            Payment.chapter_id == chapter_id,
            Payment.created_at >= datetime.combine(cutoff, datetime.min.time()),
        )
        .group_by("month")
        .order_by("month")
        .all()
    )

    return [
        {"month": r.month, "total": str(r.total or Decimal("0")), "count": r.count}
        for r in rows
    ]


def _event_stats(chapter_id: str, start_date, end_date) -> dict:
    """Event attendance stats for the period date range."""
    try:
        from app.models.event import Event, EventAttendance

        events = (
            Event.query
            .filter(
                Event.chapter_id == chapter_id,
                Event.status == "published",
                Event.start_datetime >= datetime.combine(start_date, datetime.min.time()),
                Event.start_datetime <= datetime.combine(end_date, datetime.max.time()),
            )
            .order_by(Event.start_datetime.desc())
            .all()
        )

        if not events:
            return {"total_events": 0, "avg_attendance_rate": 0, "top_events": []}

        rates = []
        for ev in events:
            if ev.capacity and ev.capacity > 0:
                rates.append(round((ev.attendee_count or 0) / ev.capacity * 100))

        top = sorted(events, key=lambda e: e.attendee_count or 0, reverse=True)[:5]

        return {
            "total_events": len(events),
            "avg_attendance_rate": round(sum(rates) / len(rates)) if rates else None,
            "top_events": [
                {
                    "id": e.id,
                    "title": e.title,
                    "date": e.start_datetime.isoformat() if e.start_datetime else None,
                    "attendee_count": e.attendee_count or 0,
                    "capacity": e.capacity,
                }
                for e in top
            ],
        }
    except Exception:
        return {"total_events": 0, "avg_attendance_rate": 0, "top_events": []}


def _budget_summary(chapter_id: str) -> list:
    """Per-committee budget vs. actual spending breakdown."""
    try:
        from app.models.committee import Committee

        committees = (
            Committee.query
            .filter_by(chapter_id=chapter_id, is_active=True)
            .order_by(Committee.name)
            .all()
        )
        if not committees:
            return []

        result = []
        for c in committees:
            def _sum(*statuses):
                val = (
                    db.session.query(func.sum(Expense.amount))
                    .filter(
                        Expense.chapter_id == chapter_id,
                        Expense.committee_id == c.id,
                        Expense.status.in_(statuses),
                    )
                    .scalar()
                )
                return Decimal(str(val or 0))

            spent = _sum("approved", "paid")
            pending = _sum("pending")
            budget = c.budget_amount or Decimal("0")
            remaining = max(Decimal("0"), budget - spent)

            result.append({
                "committee_id": c.id,
                "name": c.name,
                "chair": {"id": c.chair.id, "full_name": c.chair.full_name} if c.chair else None,
                "budget": str(budget),
                "spent": str(spent),
                "pending": str(pending),
                "remaining": str(remaining),
                "over_budget": bool(spent > budget and budget > Decimal("0")),
                "utilization_rate": round(float(spent / budget) * 100) if budget > 0 else 0,
            })

        return result
    except Exception:
        return []


@analytics_bp.route("/chapter", methods=["GET"])
@login_required
@chapter_required
@role_required("secretary")
def chapter_analytics():
    """
    Full analytics snapshot for a period.

    Query params:
      period_id — optional; defaults to active period
    """
    chapter = g.current_chapter

    # ── Resolve period ─────────────────────────────────────────────────
    period_id = request.args.get("period_id")
    if period_id:
        period = ChapterPeriod.query.filter_by(id=period_id, chapter_id=chapter.id).first()
        if not period:
            return jsonify({"error": "Period not found."}), 404
    else:
        period = ChapterPeriod.query.filter_by(chapter_id=chapter.id, is_active=True).first()

    # ── All periods for the picker ─────────────────────────────────────
    all_periods = (
        ChapterPeriod.query
        .filter_by(chapter_id=chapter.id)
        .order_by(ChapterPeriod.start_date.desc())
        .all()
    )

    # ── Previous period ────────────────────────────────────────────────
    prev_period = None
    if period:
        prev_period = (
            ChapterPeriod.query
            .filter(
                ChapterPeriod.chapter_id == chapter.id,
                ChapterPeriod.start_date < period.start_date,
            )
            .order_by(ChapterPeriod.start_date.desc())
            .first()
        )

    # ── Build payload ──────────────────────────────────────────────────
    payload = {
        "period": period.to_dict() if period else None,
        "prev_period": prev_period.to_dict() if prev_period else None,
        "all_periods": [p.to_dict() for p in all_periods],
        "dues_summary": _dues_summary(chapter.id, period.id) if period else None,
        "prev_dues_summary": _dues_summary(chapter.id, prev_period.id) if prev_period else None,
        "member_status": _member_status(chapter.id),
        "monthly_payments": _monthly_payments(chapter.id, months=12),
        "event_stats": _event_stats(
            chapter.id,
            period.start_date if period else date.today().replace(month=1, day=1),
            period.end_date if period else date.today(),
        ),
        "budget_summary": _budget_summary(chapter.id),
    }

    return jsonify(payload), 200
