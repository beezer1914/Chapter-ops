"""Tests for payment routes — /api/payments/*"""

from app.extensions import db as _db
from app.models import Payment
from tests.conftest import make_user, make_organization, make_chapter, make_membership


def _login(client, email="treasurer@example.com", password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _setup_chapter():
    org = make_organization()
    chapter = make_chapter(org)
    return chapter


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


def _setup_secretary(chapter):
    user = make_user(email="secretary@example.com", first_name="Sec", last_name="Retary")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="secretary")
    _db.session.commit()
    return user


def _make_payment(chapter, user, amount=50.00, method="cash"):
    payment = Payment(
        chapter_id=chapter.id,
        user_id=user.id,
        amount=amount,
        payment_type="one-time",
        method=method,
    )
    _db.session.add(payment)
    _db.session.flush()
    return payment


class TestListPayments:
    def test_secretary_can_list(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            secretary = _setup_secretary(chapter)
            member = _setup_member(chapter)
            _make_payment(chapter, member)
            _db.session.commit()

        _login(client, email="secretary@example.com")
        resp = client.get("/api/payments")
        assert resp.status_code == 200
        assert len(resp.get_json()["payments"]) == 1
        assert "user" in resp.get_json()["payments"][0]

    def test_member_cannot_list(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_member(chapter)
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/payments")
        assert resp.status_code == 403

    def test_filter_by_method(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            _make_payment(chapter, member, method="cash")
            _make_payment(chapter, member, method="check")
            _db.session.commit()

        _login(client)
        resp = client.get("/api/payments?method=cash")
        assert len(resp.get_json()["payments"]) == 1


class TestCreatePayment:
    def test_treasurer_can_record_payment(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            member_id = member.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payments", json={
            "user_id": member_id,
            "amount": 100.00,
            "method": "cash",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["payment"]["amount"] == "100.00"
        assert data["payment"]["method"] == "cash"

    def test_invalid_amount_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            member_id = member.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payments", json={
            "user_id": member_id,
            "amount": -50,
            "method": "cash",
        })
        assert resp.status_code == 400

    def test_invalid_method_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            member_id = member.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payments", json={
            "user_id": member_id,
            "amount": 50,
            "method": "bitcoin",
        })
        assert resp.status_code == 400

    def test_nonmember_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            outsider = make_user(email="outsider@example.com")
            outsider_id = outsider.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payments", json={
            "user_id": outsider_id,
            "amount": 50,
            "method": "cash",
        })
        assert resp.status_code == 400

    def test_missing_fields_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/payments", json={"amount": 50})
        assert resp.status_code == 400


class TestPaymentSummary:
    def test_summary_totals(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            _make_payment(chapter, member, amount=100, method="cash")
            _make_payment(chapter, member, amount=50, method="check")
            _db.session.commit()

        _login(client)
        resp = client.get("/api/payments/summary")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total_collected"] == "150.00"
        assert data["by_method"]["cash"] == "100.00"
        assert data["by_method"]["check"] == "50.00"

    def test_secretary_cannot_access_summary(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_secretary(chapter)
            _db.session.commit()

        _login(client, email="secretary@example.com")
        resp = client.get("/api/payments/summary")
        assert resp.status_code == 403


class TestMyPayments:
    def test_member_sees_own_payments(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = _setup_member(chapter)
            _make_payment(chapter, member, amount=75)
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/payments/mine")
        assert resp.status_code == 200
        assert len(resp.get_json()["payments"]) == 1

    def test_member_does_not_see_others(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            treasurer = _setup_treasurer(chapter)
            member = _setup_member(chapter)
            _make_payment(chapter, treasurer, amount=100)  # treasurer's payment
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/payments/mine")
        assert len(resp.get_json()["payments"]) == 0
