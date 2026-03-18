"""Tests for authentication routes — /api/auth/*."""

import uuid
from datetime import datetime, timezone, timedelta

from app.extensions import db
from app.models import User, InviteCode
from tests.conftest import make_user, make_organization, make_chapter, make_membership, make_invite

VALID_PASSWORD = "Str0ng!Password1"


class TestLogin:
    def test_successful_login(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()

        resp = client.post("/api/auth/login", json={
            "email": "alice@example.com",
            "password": VALID_PASSWORD,
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["user"]["email"] == "alice@example.com"

    def test_wrong_password(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()

        resp = client.post("/api/auth/login", json={
            "email": "alice@example.com",
            "password": "Wrong!Password99",
        })
        assert resp.status_code == 401
        assert "Invalid email or password" in resp.get_json()["error"]

    def test_nonexistent_email(self, client, db_session):
        resp = client.post("/api/auth/login", json={
            "email": "nobody@example.com",
            "password": VALID_PASSWORD,
        })
        assert resp.status_code == 401

    def test_deactivated_user(self, client, db_session):
        make_user(email="deactivated@example.com", password=VALID_PASSWORD, active=False)
        db_session.commit()

        resp = client.post("/api/auth/login", json={
            "email": "deactivated@example.com",
            "password": VALID_PASSWORD,
        })
        assert resp.status_code == 403
        assert "deactivated" in resp.get_json()["error"]

    def test_missing_fields(self, client):
        resp = client.post("/api/auth/login", json={"email": "a@b.com"})
        assert resp.status_code == 400

    def test_login_email_case_insensitive(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()

        resp = client.post("/api/auth/login", json={
            "email": "ALICE@example.com",
            "password": VALID_PASSWORD,
        })
        assert resp.status_code == 200


class TestRegisterWithInvite:
    """Registration with an invite code — joins the invited chapter."""

    def test_register_with_valid_invite(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        president = make_user(email="pres@example.com")
        make_membership(president, chapter, role="president")
        invite = make_invite(chapter, created_by=president.id, code="INVITE123", role="member")
        db_session.commit()

        resp = client.post("/api/auth/register", json={
            "email": "newmember@example.com",
            "password": VALID_PASSWORD,
            "first_name": "New",
            "last_name": "Member",
            "invite_code": "INVITE123",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["user"]["active_chapter_id"] == chapter.id

        # Invite should be marked used
        db_session.expire_all()
        invite_after = InviteCode.query.filter_by(code="INVITE123").first()
        assert invite_after.used is True

    def test_register_with_invalid_invite(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "email": "new@example.com",
            "password": VALID_PASSWORD,
            "first_name": "New",
            "last_name": "User",
            "invite_code": "BAD_CODE",
        })
        assert resp.status_code == 400
        assert "Invalid invite code" in resp.get_json()["error"]

    def test_register_with_used_invite(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        president = make_user(email="pres@example.com")
        invite = make_invite(chapter, created_by=president.id, code="USED_CODE")
        invite.used = True
        db_session.commit()

        resp = client.post("/api/auth/register", json={
            "email": "new@example.com",
            "password": VALID_PASSWORD,
            "first_name": "New",
            "last_name": "User",
            "invite_code": "USED_CODE",
        })
        assert resp.status_code == 400
        assert "expired or already been used" in resp.get_json()["error"]


class TestRegisterWithoutInvite:
    """Registration without an invite code — founder path."""

    def test_register_without_invite(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "email": "founder@example.com",
            "password": VALID_PASSWORD,
            "first_name": "Jane",
            "last_name": "Founder",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["user"]["active_chapter_id"] is None

    def test_register_empty_invite_code_treated_as_no_invite(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "email": "founder2@example.com",
            "password": VALID_PASSWORD,
            "first_name": "John",
            "last_name": "Founder",
            "invite_code": "",
        })
        assert resp.status_code == 201
        assert resp.get_json()["user"]["active_chapter_id"] is None

    def test_register_duplicate_email(self, client, db_session):
        make_user(email="taken@example.com")
        db_session.commit()

        resp = client.post("/api/auth/register", json={
            "email": "taken@example.com",
            "password": VALID_PASSWORD,
            "first_name": "Dup",
            "last_name": "User",
        })
        assert resp.status_code == 409
        assert "already exists" in resp.get_json()["error"]

    def test_register_weak_password(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "email": "weak@example.com",
            "password": "short",
            "first_name": "Weak",
            "last_name": "Pass",
        })
        assert resp.status_code == 400

    def test_register_missing_required_fields(self, client, db_session):
        resp = client.post("/api/auth/register", json={
            "email": "missing@example.com",
        })
        assert resp.status_code == 400
        assert "Missing required fields" in resp.get_json()["error"]


class TestLogout:
    def test_logout(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "alice@example.com",
            "password": VALID_PASSWORD,
        })

        resp = client.post("/api/auth/logout")
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True

        # Should be unauthenticated now
        resp = client.get("/api/auth/user")
        assert resp.status_code == 401


class TestGetCurrentUser:
    def test_get_user_authenticated(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user(email="alice@example.com", password=VALID_PASSWORD)
        make_membership(user, chapter, role="president")
        user.active_chapter_id = chapter.id
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "alice@example.com",
            "password": VALID_PASSWORD,
        })

        resp = client.get("/api/auth/user")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user"]["email"] == "alice@example.com"
        assert len(data["memberships"]) == 1

    def test_get_user_unauthenticated(self, client):
        resp = client.get("/api/auth/user")
        assert resp.status_code == 401


class TestSwitchChapter:
    def test_switch_chapter(self, client, db_session):
        org = make_organization()
        chapter1 = make_chapter(org, name="Chapter A")
        chapter2 = make_chapter(org, name="Chapter B")
        user = make_user(email="alice@example.com", password=VALID_PASSWORD)
        make_membership(user, chapter1, role="member")
        make_membership(user, chapter2, role="member")
        user.active_chapter_id = chapter1.id
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "alice@example.com",
            "password": VALID_PASSWORD,
        })

        resp = client.post("/api/auth/switch-chapter", json={
            "chapter_id": chapter2.id,
        })
        assert resp.status_code == 200
        assert resp.get_json()["active_chapter_id"] == chapter2.id

    def test_switch_to_non_member_chapter(self, client, db_session):
        org = make_organization()
        chapter1 = make_chapter(org, name="My Chapter")
        chapter2 = make_chapter(org, name="Not My Chapter")
        user = make_user(email="alice@example.com", password=VALID_PASSWORD)
        make_membership(user, chapter1, role="member")
        user.active_chapter_id = chapter1.id
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "alice@example.com",
            "password": VALID_PASSWORD,
        })

        resp = client.post("/api/auth/switch-chapter", json={
            "chapter_id": chapter2.id,
        })
        assert resp.status_code == 403
