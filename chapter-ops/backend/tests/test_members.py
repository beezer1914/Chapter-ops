"""Tests for member management routes — /api/members/*"""

import pytest
from app.extensions import db as _db
from tests.conftest import make_user, make_organization, make_chapter, make_membership


def _login(client, email="president@example.com", password="Str0ng!Password1"):
    """Helper to log in."""
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _setup_chapter():
    """Create org + chapter, return chapter."""
    org = make_organization()
    chapter = make_chapter(org)
    return chapter


def _setup_president(chapter):
    user = make_user(email="president@example.com", first_name="Pres", last_name="Ident")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="president")
    _db.session.commit()
    return user


def _setup_member(chapter, email="member@example.com", first_name="Basic", last_name="Member"):
    user = make_user(email=email, first_name=first_name, last_name=last_name)
    user.active_chapter_id = chapter.id
    membership = make_membership(user, chapter, role="member")
    _db.session.commit()
    return user, membership


class TestListMembers:
    """GET /api/members"""

    def test_member_can_list_roster(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _setup_member(chapter)
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/members")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["members"]) == 2

    def test_roster_sorted_by_role_then_name(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _setup_member(chapter, email="alice@example.com", first_name="Alice", last_name="Aardvark")
            _setup_member(chapter, email="bob@example.com", first_name="Bob", last_name="Zebra")
            _db.session.commit()

        _login(client, email="alice@example.com")
        resp = client.get("/api/members")
        members = resp.get_json()["members"]
        # President should be first (highest role)
        assert members[0]["role"] == "president"
        # Among members, Aardvark before Zebra
        member_names = [m["user"]["last_name"] for m in members if m["role"] == "member"]
        assert member_names == ["Aardvark", "Zebra"]

    def test_inactive_members_hidden(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            user, membership = _setup_member(chapter)
            membership.active = False
            _db.session.commit()

        _login(client)
        resp = client.get("/api/members")
        members = resp.get_json()["members"]
        # Only the president (inactive member is hidden)
        assert len(members) == 1

    def test_includes_user_info(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _db.session.commit()

        _login(client)
        resp = client.get("/api/members")
        member = resp.get_json()["members"][0]
        assert "user" in member
        assert "email" in member["user"]
        assert "full_name" in member["user"]

    def test_unauthenticated_cannot_list(self, client):
        resp = client.get("/api/members")
        assert resp.status_code == 401


class TestUpdateMember:
    """PATCH /api/members/<membership_id>"""

    def test_president_can_change_role(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _, membership = _setup_member(chapter)
            membership_id = membership.id
            _db.session.commit()

        _login(client)
        resp = client.patch(f"/api/members/{membership_id}", json={"role": "secretary"})
        assert resp.status_code == 200
        assert resp.get_json()["member"]["role"] == "secretary"

    def test_president_can_change_financial_status(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _, membership = _setup_member(chapter)
            membership_id = membership.id
            _db.session.commit()

        _login(client)
        resp = client.patch(f"/api/members/{membership_id}", json={"financial_status": "not_financial"})
        assert resp.status_code == 200
        assert resp.get_json()["member"]["financial_status"] == "not_financial"

    def test_cannot_change_own_role(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            president = _setup_president(chapter)
            pres_membership = president.get_membership(chapter.id)
            membership_id = pres_membership.id
            _db.session.commit()

        _login(client)
        resp = client.patch(f"/api/members/{membership_id}", json={"role": "member"})
        assert resp.status_code == 403

    def test_cannot_promote_above_own_role(self, client, app):
        """A treasurer cannot promote someone to president."""
        with app.app_context():
            chapter = _setup_chapter()
            treasurer = make_user(email="treasurer@example.com", first_name="Treas", last_name="Urer")
            treasurer.active_chapter_id = chapter.id
            make_membership(treasurer, chapter, role="treasurer")
            _, membership = _setup_member(chapter)
            membership_id = membership.id
            _db.session.commit()

        # Note: treasurer doesn't meet president role_required, so this is 403 from decorator
        _login(client, email="treasurer@example.com")
        resp = client.patch(f"/api/members/{membership_id}", json={"role": "president"})
        assert resp.status_code == 403

    def test_invalid_role_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _, membership = _setup_member(chapter)
            membership_id = membership.id
            _db.session.commit()

        _login(client)
        resp = client.patch(f"/api/members/{membership_id}", json={"role": "supreme_leader"})
        assert resp.status_code == 400

    def test_invalid_financial_status_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _, membership = _setup_member(chapter)
            membership_id = membership.id
            _db.session.commit()

        _login(client)
        resp = client.patch(f"/api/members/{membership_id}", json={"financial_status": "super_financial"})
        assert resp.status_code == 400

    def test_member_cannot_update(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _, membership = _setup_member(chapter)
            membership_id = membership.id
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.patch(f"/api/members/{membership_id}", json={"role": "secretary"})
        assert resp.status_code == 403


class TestDeactivateMember:
    """DELETE /api/members/<membership_id>"""

    def test_president_can_deactivate_member(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _, membership = _setup_member(chapter)
            membership_id = membership.id
            _db.session.commit()

        _login(client)
        resp = client.delete(f"/api/members/{membership_id}")
        assert resp.status_code == 200

        # Verify member no longer appears in roster
        resp = client.get("/api/members")
        members = resp.get_json()["members"]
        member_ids = [m["id"] for m in members]
        assert membership_id not in member_ids

    def test_cannot_deactivate_self(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            president = _setup_president(chapter)
            pres_membership = president.get_membership(chapter.id)
            membership_id = pres_membership.id
            _db.session.commit()

        _login(client)
        resp = client.delete(f"/api/members/{membership_id}")
        assert resp.status_code == 403

    def test_member_cannot_deactivate(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            president = _setup_president(chapter)
            _, membership = _setup_member(chapter)
            pres_membership = president.get_membership(chapter.id)
            pres_membership_id = pres_membership.id
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.delete(f"/api/members/{pres_membership_id}")
        assert resp.status_code == 403

    def test_deactivate_nonexistent_member(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _db.session.commit()

        _login(client)
        resp = client.delete("/api/members/nonexistent-id")
        assert resp.status_code == 404
