"""Tests for app.services.dues_reminders."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from app.extensions import db as _db
from app.models import Payment, PaymentPlan
from app.services.dues_reminders import (
    determine_reminder,
    is_delinquent,
    next_installment_date,
    send_dues_reminders,
)
from tests.conftest import (
    make_chapter,
    make_membership,
    make_organization,
    make_user,
)


# ── Pure-logic tests (fake plan objects) ─────────────────────────────────────

def _fake_plan(
    frequency="monthly",
    start_date=date(2026, 1, 1),
    installment_amount=Decimal("100.00"),
    total_amount=Decimal("600.00"),
    total_paid=Decimal("0.00"),
    status="active",
    last_reminder_sent_at=None,
):
    """Build a duck-typed plan for pure-logic tests — no DB."""
    paid = Decimal(total_paid)
    total = Decimal(total_amount)
    return SimpleNamespace(
        frequency=frequency,
        start_date=start_date,
        installment_amount=installment_amount,
        total_amount=total,
        status=status,
        last_reminder_sent_at=last_reminder_sent_at,
        total_paid=lambda: paid,
        is_complete=lambda: paid >= total,
    )


class TestNextInstallmentDate:
    def test_weekly_on_schedule(self):
        plan = _fake_plan(frequency="weekly", start_date=date(2026, 1, 1))
        # 0 paid → next is start_date
        assert next_installment_date(plan) == date(2026, 1, 1)

    def test_weekly_after_three_payments(self):
        plan = _fake_plan(
            frequency="weekly",
            start_date=date(2026, 1, 1),
            total_paid=Decimal("300.00"),  # 3 full installments of $100
        )
        assert next_installment_date(plan) == date(2026, 1, 22)

    def test_biweekly(self):
        plan = _fake_plan(
            frequency="biweekly",
            start_date=date(2026, 1, 1),
            total_paid=Decimal("200.00"),  # 2 installments
        )
        assert next_installment_date(plan) == date(2026, 1, 29)

    def test_monthly_calendar_rollover(self):
        plan = _fake_plan(
            frequency="monthly",
            start_date=date(2026, 1, 31),
            total_paid=Decimal("100.00"),  # 1 installment
        )
        # relativedelta(months=1) clamps Jan 31 + 1mo to Feb 28/29
        assert next_installment_date(plan) == date(2026, 2, 28)

    def test_partial_payment_does_not_advance(self):
        # Paid $50 of a $100 installment — still on installment 0
        plan = _fake_plan(total_paid=Decimal("50.00"))
        assert next_installment_date(plan) == date(2026, 1, 1)


class TestIsDelinquent:
    def test_on_schedule_not_delinquent(self):
        plan = _fake_plan(start_date=date(2026, 4, 1), total_paid=Decimal("300.00"))
        # Next due = Apr 1 + 3mo = Jul 1; today is before
        assert is_delinquent(plan, today=date(2026, 5, 1)) is False

    def test_past_due_is_delinquent(self):
        plan = _fake_plan(start_date=date(2026, 1, 1), total_paid=Decimal("100.00"))
        # Next due = Feb 1; today is Mar 1
        assert is_delinquent(plan, today=date(2026, 3, 1)) is True

    def test_completed_plan_not_delinquent(self):
        plan = _fake_plan(total_paid=Decimal("600.00"))  # fully paid
        assert is_delinquent(plan, today=date(2030, 1, 1)) is False

    def test_cancelled_plan_not_delinquent(self):
        plan = _fake_plan(status="cancelled", start_date=date(2020, 1, 1))
        assert is_delinquent(plan, today=date(2026, 1, 1)) is False

    def test_same_day_as_due_not_delinquent(self):
        # Exact match on due date — caught by upcoming/skip, not delinquent
        plan = _fake_plan(start_date=date(2026, 1, 1), total_paid=Decimal("0"))
        assert is_delinquent(plan, today=date(2026, 1, 1)) is False


class TestDetermineReminder:
    NOW = datetime(2026, 4, 21, 14, 0, tzinfo=timezone.utc)

    def test_upcoming_fires_exactly_n_days_before(self):
        # Due Apr 24, today Apr 21, N=3 → upcoming
        plan = _fake_plan(start_date=date(2026, 4, 24), total_paid=Decimal("0"))
        assert determine_reminder(plan, today=date(2026, 4, 21), now=self.NOW) == "upcoming"

    def test_upcoming_does_not_fire_outside_window(self):
        plan = _fake_plan(start_date=date(2026, 4, 25), total_paid=Decimal("0"))
        # 4 days out — silent
        assert determine_reminder(plan, today=date(2026, 4, 21), now=self.NOW) is None

    def test_delinquent_fires_when_past_due(self):
        plan = _fake_plan(start_date=date(2026, 4, 10), total_paid=Decimal("0"))
        assert determine_reminder(plan, today=date(2026, 4, 21), now=self.NOW) == "delinquent"

    def test_cadence_gate_suppresses_recent_reminder(self):
        # Sent 2 days ago — within 7-day cadence → skip
        recent = self.NOW - timedelta(days=2)
        plan = _fake_plan(
            start_date=date(2026, 4, 10),
            total_paid=Decimal("0"),
            last_reminder_sent_at=recent,
        )
        assert determine_reminder(plan, today=date(2026, 4, 21), now=self.NOW) is None

    def test_cadence_gate_lifts_after_seven_days(self):
        old = self.NOW - timedelta(days=8)
        plan = _fake_plan(
            start_date=date(2026, 4, 10),
            total_paid=Decimal("0"),
            last_reminder_sent_at=old,
        )
        assert determine_reminder(plan, today=date(2026, 4, 21), now=self.NOW) == "delinquent"

    def test_completed_plan_never_fires(self):
        plan = _fake_plan(total_paid=Decimal("600.00"))
        assert determine_reminder(plan, today=date(2026, 1, 1), now=self.NOW) is None


# ── Integration test (real DB, mocked email) ─────────────────────────────────

def _seed_member_with_plan(chapter, *, total_paid=Decimal("0"), start_date=date(2026, 1, 1)):
    user = make_user(email=f"m{id(start_date)}@example.com", first_name="Plan", last_name="Member")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="member")

    plan = PaymentPlan(
        chapter_id=chapter.id,
        user_id=user.id,
        frequency="monthly",
        start_date=start_date,
        end_date=date(2027, 1, 1),
        total_amount=Decimal("600.00"),
        installment_amount=Decimal("100.00"),
        status="active",
    )
    _db.session.add(plan)
    _db.session.flush()

    if total_paid > 0:
        pay = Payment(
            chapter_id=chapter.id,
            user_id=user.id,
            amount=total_paid,
            payment_type="installment",
            method="stripe",
            plan_id=plan.id,
        )
        _db.session.add(pay)

    _db.session.flush()
    return user, plan


class TestSendDuesReminders:
    def test_orchestrator_dispatches_and_stamps_timestamps(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)

            # Plan 1: delinquent (start Jan 1, no payments, today Apr 21)
            _, delinquent_plan = _seed_member_with_plan(chapter, start_date=date(2026, 1, 1))

            # Plan 2: upcoming (start Apr 24, no payments, today Apr 21 → due in 3)
            _, upcoming_plan = _seed_member_with_plan(chapter, start_date=date(2026, 4, 24))

            # Plan 3: on-schedule, not in window (due May 24)
            _, silent_plan = _seed_member_with_plan(chapter, start_date=date(2026, 5, 24))

            _db.session.commit()

            today = date(2026, 4, 21)
            now = datetime(2026, 4, 21, 14, 0, tzinfo=timezone.utc)

            with patch(
                "app.utils.email.send_installment_upcoming_email",
                return_value=True,
            ) as up_mock, patch(
                "app.utils.email.send_installment_delinquent_email",
                return_value=True,
            ) as del_mock:
                summary = send_dues_reminders(_db.session, today=today, now=now)

            assert summary == {"upcoming": 1, "delinquent": 1, "failed": 0, "skipped": 1}
            assert up_mock.call_count == 1
            assert del_mock.call_count == 1

            _db.session.refresh(delinquent_plan)
            _db.session.refresh(upcoming_plan)
            _db.session.refresh(silent_plan)

            # SQLite drops tzinfo on DateTime(timezone=True) — Postgres preserves it.
            # Compare naive wall-time instead.
            assert delinquent_plan.last_reminder_sent_at.replace(tzinfo=None) == now.replace(tzinfo=None)
            assert upcoming_plan.last_reminder_sent_at.replace(tzinfo=None) == now.replace(tzinfo=None)
            assert silent_plan.last_reminder_sent_at is None

    def test_failed_send_does_not_stamp_timestamp(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _, plan = _seed_member_with_plan(chapter, start_date=date(2026, 1, 1))
            _db.session.commit()

            today = date(2026, 4, 21)
            now = datetime(2026, 4, 21, 14, 0, tzinfo=timezone.utc)

            with patch(
                "app.utils.email.send_installment_delinquent_email",
                return_value=False,
            ):
                summary = send_dues_reminders(_db.session, today=today, now=now)

            assert summary["failed"] == 1
            assert summary["delinquent"] == 0

            _db.session.refresh(plan)
            assert plan.last_reminder_sent_at is None
