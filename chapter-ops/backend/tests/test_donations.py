"""Tests for donation routes — /api/donations/*"""

from app.extensions import db as _db
from app.models import Donation
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


def _setup_secretary(chapter):
    user = make_user(email="secretary@example.com", first_name="Sec", last_name="Retary")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="secretary")
    _db.session.commit()
    return user


class TestListDonations:
    def test_secretary_can_list(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            _setup_secretary(chapter)
            donation = Donation(
                chapter_id=chapter.id, donor_name="Jane Doe",
                amount=250, method="cash",
            )
            _db.session.add(donation)
            _db.session.commit()

        _login(client, email="secretary@example.com")
        resp = client.get("/api/donations")
        assert resp.status_code == 200
        assert len(resp.get_json()["donations"]) == 1

    def test_member_cannot_list(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            member = make_user(email="member@example.com")
            member.active_chapter_id = chapter.id
            make_membership(member, chapter, role="member")
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/donations")
        assert resp.status_code == 403


class TestCreateDonation:
    def test_treasurer_can_create(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/donations", json={
            "donor_name": "John Smith",
            "donor_email": "john@example.com",
            "amount": 500,
            "method": "check",
            "notes": "Annual fundraiser",
        })
        assert resp.status_code == 201
        data = resp.get_json()["donation"]
        assert data["donor_name"] == "John Smith"
        assert data["amount"] == "500.00"

    def test_donation_with_member_link(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            member = make_user(email="member@example.com", first_name="Don", last_name="Or")
            member.active_chapter_id = chapter.id
            make_membership(member, chapter, role="member")
            member_id = member.id
            _db.session.commit()

        _login(client)
        resp = client.post("/api/donations", json={
            "donor_name": "Don Or",
            "amount": 100,
            "method": "cash",
            "user_id": member_id,
        })
        assert resp.status_code == 201
        assert resp.get_json()["donation"]["user_id"] == member_id

    def test_invalid_amount_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/donations", json={
            "donor_name": "Test",
            "amount": -10,
            "method": "cash",
        })
        assert resp.status_code == 400

    def test_missing_fields_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/donations", json={"amount": 100})
        assert resp.status_code == 400

    def test_invalid_method_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_treasurer(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/donations", json={
            "donor_name": "Test",
            "amount": 100,
            "method": "crypto",
        })
        assert resp.status_code == 400
