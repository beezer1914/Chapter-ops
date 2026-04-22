"""
Dues reminder service — derives upcoming and delinquent installment reminders.

Invoked by the `flask send-dues-reminders` CLI command, which is driven by a
Render cron job (see CLAUDE.md for deployment).

Pure helpers (`next_installment_date`, `is_delinquent`, `determine_reminder`)
are side-effect free for unit testing. `send_dues_reminders` is the orchestrator
that queries plans, dispatches emails, and stamps `last_reminder_sent_at`.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from dateutil.relativedelta import relativedelta

logger = logging.getLogger(__name__)

UPCOMING_DAYS_BEFORE = 3
DELINQUENT_CADENCE_DAYS = 7

ReminderType = Literal["upcoming", "delinquent"]


def _interval(frequency: str):
    if frequency == "weekly":
        return timedelta(days=7)
    if frequency == "biweekly":
        return timedelta(days=14)
    if frequency == "monthly":
        return relativedelta(months=1)
    raise ValueError(f"Unknown payment plan frequency: {frequency}")


def _installments_paid(plan) -> int:
    """Floor of total_paid / installment_amount — how many full installments are covered."""
    amount = Decimal(str(plan.installment_amount or 0))
    if amount <= 0:
        return 0
    return int(plan.total_paid() / amount)


def next_installment_date(plan) -> date:
    """
    The next scheduled installment date.

    When a plan is in arrears, this is the oldest unpaid installment date
    (which will be in the past). When on-schedule, it is the upcoming
    installment.
    """
    paid = _installments_paid(plan)
    return plan.start_date + _interval(plan.frequency) * paid


def is_delinquent(plan, today: date) -> bool:
    if plan.status != "active" or plan.is_complete():
        return False
    return next_installment_date(plan) < today


def determine_reminder(
    plan,
    today: date,
    now: datetime,
    upcoming_days: int = UPCOMING_DAYS_BEFORE,
    delinquent_cadence_days: int = DELINQUENT_CADENCE_DAYS,
) -> ReminderType | None:
    """Decide whether (and which) reminder should fire for this plan right now."""
    if plan.status != "active" or plan.is_complete():
        return None

    last = plan.last_reminder_sent_at
    if last is not None and (now - last).days < delinquent_cadence_days:
        return None

    due = next_installment_date(plan)
    if due < today:
        return "delinquent"
    if (due - today).days == upcoming_days:
        return "upcoming"
    return None


def send_dues_reminders(
    session,
    today: date | None = None,
    now: datetime | None = None,
) -> dict:
    """
    Scan all active payment plans and dispatch reminders. Returns a summary dict:
      {"upcoming": N, "delinquent": N, "failed": N, "skipped": N}
    """
    from app.models.chapter import Chapter
    from app.models.payment_plan import PaymentPlan
    from app.models.user import User
    from app.utils.email import (
        send_installment_delinquent_email,
        send_installment_upcoming_email,
    )

    today = today or date.today()
    now = now or datetime.now(timezone.utc)

    summary = {"upcoming": 0, "delinquent": 0, "failed": 0, "skipped": 0}

    plans = session.query(PaymentPlan).filter(PaymentPlan.status == "active").all()

    for plan in plans:
        kind = determine_reminder(plan, today, now)
        if kind is None:
            summary["skipped"] += 1
            continue

        user = session.get(User, plan.user_id)
        chapter = session.get(Chapter, plan.chapter_id)
        if user is None or chapter is None:
            summary["skipped"] += 1
            continue

        due = next_installment_date(plan)
        remaining = Decimal(str(plan.total_amount)) - plan.total_paid()

        if kind == "upcoming":
            ok = send_installment_upcoming_email(
                to=user.email,
                user_name=user.first_name,
                chapter_name=chapter.name,
                installment_amount=Decimal(str(plan.installment_amount)),
                due_date=due,
                remaining_balance=remaining,
            )
        else:
            ok = send_installment_delinquent_email(
                to=user.email,
                user_name=user.first_name,
                chapter_name=chapter.name,
                installment_amount=Decimal(str(plan.installment_amount)),
                original_due_date=due,
                days_past_due=(today - due).days,
                remaining_balance=remaining,
            )

        if ok:
            plan.last_reminder_sent_at = now
            summary[kind] += 1
        else:
            summary["failed"] += 1
            logger.warning(
                "Reminder email failed for plan %s (%s) — will retry next run",
                plan.id,
                kind,
            )

    session.commit()
    return summary
