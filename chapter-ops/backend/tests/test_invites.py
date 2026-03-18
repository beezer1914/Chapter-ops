"""Tests for invite management routes — /api/invites/*"""

import pytest
from app.extensions import db as _db
from tests.conftest import make_user, make_organization, make_chapter, make_membership, make_invite


def _login(client, email="president@example.com", password="Str0ng!Password1"):
    """Helper to log in and return the response."""
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _setup_president(chapter):
    """Create a president user with active chapter set."""
    user = make_user(email="president@example.com", first_name="Pres", last_name="User")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="president")
    _db.session.commit()
    return user


def _setup_member(chapter, email="member@example.com"):
    """Create a basic member user."""
    user = make_user(email=email, first_name="Basic", last_name="Member")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="member")
    _db.session.commit()
    return user


def _setup_secretary(chapter):
    """Create a secretary user."""
    user = make_user(email="secretary@example.com", first_name="Sec", last_name="Retary")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="secretary")
    _db.session.commit()
    return user


class TestListInvites:
    """GET /api/invites"""

    def test_secretary_can_list_invites(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            president = _setup_president(chapter)
            secretary = _setup_secretary(chapter)
            make_invite(chapter, created_by=president.id, code="TESTCODE")
            _db.session.commit()

        _login(client, email="secretary@example.com")
        resp = client.get("/api/invites")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["invites"]) == 1
        assert data["invites"][0]["code"] == "TESTCODE"
        assert "created_by_name" in data["invites"][0]

    def test_member_cannot_list_invites(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_member(chapter)
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/invites")
        assert resp.status_code == 403

    def test_unauthenticated_cannot_list_invites(self, client):
        resp = client.get("/api/invites")
        assert resp.status_code == 401


class TestCreateInvite:
    """POST /api/invites"""

    def test_president_can_create_invite(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_president(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/invites", json={"role": "member", "expires_in_days": 7})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert len(data["invite"]["code"]) == 8
        assert data["invite"]["role"] == "member"

    def test_secretary_cannot_create_invite(self, client, app):
        """Secretary is below treasurer — cannot create invites."""
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_secretary(chapter)
            _db.session.commit()

        _login(client, email="secretary@example.com")
        resp = client.post("/api/invites", json={"role": "member"})
        assert resp.status_code == 403

    def test_cannot_create_invite_above_own_role(self, client, app):
        """Treasurer cannot create a president-level invite."""
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user(email="treasurer@example.com", first_name="Treas", last_name="Urer")
            user.active_chapter_id = chapter.id
            make_membership(user, chapter, role="treasurer")
            _db.session.commit()

        _login(client, email="treasurer@example.com")
        resp = client.post("/api/invites", json={"role": "president"})
        assert resp.status_code == 403

    def test_invalid_role_rejected(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_president(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/invites", json={"role": "superadmin"})
        assert resp.status_code == 400

    def test_invalid_expiry_rejected(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_president(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/invites", json={"expires_in_days": 0})
        assert resp.status_code == 400

    def test_default_role_is_member(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_president(chapter)
            _db.session.commit()

        _login(client)
        resp = client.post("/api/invites", json={})
        assert resp.status_code == 201
        assert resp.get_json()["invite"]["role"] == "member"


class TestRevokeInvite:
    """DELETE /api/invites/<invite_id>"""

    def test_president_can_revoke_unused_invite(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            president = _setup_president(chapter)
            invite = make_invite(chapter, created_by=president.id, code="REVOKEME")
            invite_id = invite.id
            _db.session.commit()

        _login(client)
        resp = client.delete(f"/api/invites/{invite_id}")
        assert resp.status_code == 200

    def test_cannot_revoke_used_invite(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            president = _setup_president(chapter)
            invite = make_invite(chapter, created_by=president.id, code="USEDCODE")
            invite.used = True
            invite_id = invite.id
            _db.session.commit()

        _login(client)
        resp = client.delete(f"/api/invites/{invite_id}")
        assert resp.status_code == 400

    def test_cannot_revoke_other_chapter_invite(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_president(chapter)

            chapter2 = make_chapter(org, name="Other Chapter")
            other_user = make_user(email="other@example.com", first_name="Other", last_name="User")
            invite = make_invite(chapter2, created_by=other_user.id, code="OTHERCH")
            invite_id = invite.id
            _db.session.commit()

        _login(client)
        resp = client.delete(f"/api/invites/{invite_id}")
        assert resp.status_code == 404

    def test_revoke_nonexistent_invite(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            _setup_president(chapter)
            _db.session.commit()

        _login(client)
        resp = client.delete("/api/invites/nonexistent-id")
        assert resp.status_code == 404
