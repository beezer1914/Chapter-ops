"""Tests for payment plan routes — /api/payment-plans/*"""

from datetime import date

from app.extensions import db as _db
from app.models import PaymentPlan, Payment
from tests.conftest import make_user, make_organization, make_chapter, make_membership


def _login(client, email="treasurer@example.com", password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _setup_chapter():
    org = make_organization()
    return make_chapter(org)


def _setup_treasurer(chapter):
    user = make_user(email="treasurer@example.com", first_name="Treas", last_name="Urer")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="treasurer")
    _db.session.commit()
    return user


def _setup_member(chapter, email="member@example.com"):
    user = make_user(email=email, first_name="Basic", last_name="Member")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="member")
    _db.session.commit()
    return user


def _make_plan(chapter, user, total=600, installments=6):
    plan = PaymentPlan(
        chapter_id=chapter.id,
        user_id=user.id,
        frequency="monthly",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        total_amount=total,
        installment_amount=round(total / installments, 2),
        expected_installments=installments,
    )
    _db.session.add(plan)
    _db.session.flush()
    return plan


class TestListPlans:
    def test_secretary_can_list_all(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            secretary = make_user(email="secretary@example.com", first_name="Sec", last_name="Retary")
            secretary.active_chapter_id = chapter.id
            make_membership(secretary, chapter, role="secretary")
            member = _setup_member(chapter)
            _make_plan(chapter, member)
            _db.session.commit()

        _login(client, email="secretary@example.com")
        resp = client.get("/api/payment-plans")
        assert resp.status_code == 200
        assert len(resp.get_json()["plans"]) == 1

    def test_member_can_view_own_plans(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            _make_plan(chapter, member)
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/payment-plans?mine=true")
        assert resp.status_code == 200
        assert len(resp.get_json()["plans"]) == 1

    def test_member_cannot_list_all(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_member(chapter)
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/payment-plans")
        assert resp.status_code == 403


class TestCreatePlan:
    def test_treasurer_can_create(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            member_id = member.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payment-plans", json={
            "user_id": member_id,
            "frequency": "monthly",
            "start_date": "2026-03-01",
            "end_date": "2026-08-31",
            "total_amount": 600,
            "expected_installments": 6,
        })
        assert resp.status_code == 201
        data = resp.get_json()["plan"]
        assert data["installment_amount"] == "100.00"
        assert data["total_amount"] == "600.00"
        assert data["status"] == "active"

    def test_auto_calculates_installment(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            member_id = member.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payment-plans", json={
            "user_id": member_id,
            "frequency": "weekly",
            "start_date": "2026-01-01",
            "end_date": "2026-03-31",
            "total_amount": 500,
            "expected_installments": 3,
        })
        assert resp.status_code == 201
        assert resp.get_json()["plan"]["installment_amount"] == "166.67"

    def test_invalid_dates_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            member_id = member.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payment-plans", json={
            "user_id": member_id,
            "frequency": "monthly",
            "start_date": "2026-06-01",
            "end_date": "2026-01-01",
            "total_amount": 600,
            "expected_installments": 6,
        })
        assert resp.status_code == 400

    def test_missing_fields_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payment-plans", json={"total_amount": 600})
        assert resp.status_code == 400


class TestPlanDetail:
    def test_get_plan_with_payments(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            plan = _make_plan(chapter, member)
            payment = Payment(
                chapter_id=chapter.id, user_id=member.id,
                amount=100, payment_type="installment", method="cash", plan_id=plan.id,
            )
            _db.session.add(payment)
            plan_id = plan.id
            _db.session.commit()

        _login(client)
        resp = client.get(f"/api/payment-plans/{plan_id}")
        assert resp.status_code == 200
        data = resp.get_json()["plan"]
        assert len(data["payments"]) == 1
        assert data["total_paid"] == "100.00"

    def test_member_can_view_own_plan(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            plan = _make_plan(chapter, member)
            plan_id = plan.id
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get(f"/api/payment-plans/{plan_id}")
        assert resp.status_code == 200


class TestCancelPlan:
    def test_treasurer_can_cancel(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            plan = _make_plan(chapter, member)
            plan_id = plan.id
            _db.session.commit()

        _login(client)
        resp = client.patch(f"/api/payment-plans/{plan_id}", json={"status": "cancelled"})
        assert resp.status_code == 200
        assert resp.get_json()["plan"]["status"] == "cancelled"

    def test_cannot_cancel_already_cancelled(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            plan = _make_plan(chapter, member)
            plan.status = "cancelled"
            plan_id = plan.id
            _db.session.commit()

        _login(client)
        resp = client.patch(f"/api/payment-plans/{plan_id}", json={"status": "cancelled"})
        assert resp.status_code == 400
