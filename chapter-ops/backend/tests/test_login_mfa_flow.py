"""Tests for login endpoint's 3-way branch on MFA state."""

import pytest

from tests.conftest import make_user, make_organization, make_chapter, make_membership
from app.services.mfa_service import generate_secret, encrypt_secret, generate_backup_codes, hash_backup_codes
from app.models import UserMFA
from app.extensions import db


class TestLoginMFABranch:
    @pytest.fixture(autouse=True)
    def _restore_enforcement(self, app):
        """Restore MFA_ENFORCEMENT_ENABLED to its original value after each test."""
        original = app.config.get("MFA_ENFORCEMENT_ENABLED", False)
        yield
        app.config["MFA_ENFORCEMENT_ENABLED"] = original

    def test_no_mfa_no_required_role_logs_in_normally(self, app, client, db_session):
        u = make_user(email="n@example.com", password="Str0ng!Password1")
        org = make_organization()
        ch = make_chapter(org)
        make_membership(u, ch, role="member")
        db_session.commit()
        resp = client.post("/api/auth/login", json={
            "email": "n@example.com",
            "password": "Str0ng!Password1",
        })
        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("success") is True
        assert body.get("requires_mfa") is None
        assert body.get("requires_enrollment") is None

    def test_enrolled_user_gets_requires_mfa(self, app, client, db_session):
        u = make_user(email="e@example.com", password="Str0ng!Password1")
        db_session.commit()
        secret = generate_secret()
        db.session.add(UserMFA(
            user_id=u.id,
            secret=encrypt_secret(secret),
            enabled=True,
            backup_codes_hashed=hash_backup_codes(generate_backup_codes()),
        ))
        db.session.commit()
        resp = client.post("/api/auth/login", json={
            "email": "e@example.com",
            "password": "Str0ng!Password1",
        })
        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("requires_mfa") is True
        assert "mfa_token" in body
        # No session established yet
        assert body.get("user") is None

    def test_required_role_unenrolled_gets_requires_enrollment(self, app, client, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = True
        u = make_user(email="t@example.com", password="Str0ng!Password1")
        org = make_organization()
        ch = make_chapter(org)
        make_membership(u, ch, role="treasurer")
        db_session.commit()
        resp = client.post("/api/auth/login", json={
            "email": "t@example.com",
            "password": "Str0ng!Password1",
        })
        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("requires_enrollment") is True
        assert "enrollment_token" in body

    def test_required_role_unenrolled_with_enforcement_off_logs_in(self, app, client, db_session):
        """With kill switch off, unenrolled treasurers can still log in."""
        app.config["MFA_ENFORCEMENT_ENABLED"] = False
        u = make_user(email="t2@example.com", password="Str0ng!Password1")
        org = make_organization()
        ch = make_chapter(org)
        make_membership(u, ch, role="treasurer")
        db_session.commit()
        resp = client.post("/api/auth/login", json={
            "email": "t2@example.com",
            "password": "Str0ng!Password1",
        })
        assert resp.status_code == 200
        body = resp.get_json()
        assert body.get("success") is True
        assert body.get("requires_enrollment") is None

    def test_wrong_password_still_returns_401(self, client, db_session):
        make_user(email="wp@example.com", password="Str0ng!Password1")
        db_session.commit()
        resp = client.post("/api/auth/login", json={
            "email": "wp@example.com",
            "password": "WrongPassword!",
        })
        assert resp.status_code == 401
