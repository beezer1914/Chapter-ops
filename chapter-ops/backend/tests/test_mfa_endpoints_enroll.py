"""Tests for /api/auth/mfa/enroll/start and /api/auth/mfa/enroll/verify."""

import pyotp

from tests.conftest import make_user
from app.models import UserMFA
from app.services.mfa_service import decrypt_secret


def _login(client, email, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestEnrollStart:
    def test_returns_qr_and_secret_when_logged_in(self, app, client, db_session):
        make_user(email="u@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "u@example.com")

        resp = client.post("/api/auth/mfa/enroll/start")
        assert resp.status_code == 200
        body = resp.get_json()
        assert "secret_base32" in body
        assert "qr_code_data_uri" in body
        assert "otpauth_uri" in body
        assert body["qr_code_data_uri"].startswith("data:image/png;base64,")

    def test_creates_user_mfa_row_with_enabled_false(self, app, client, db_session):
        u = make_user(email="u2@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "u2@example.com")
        client.post("/api/auth/mfa/enroll/start")
        record = UserMFA.query.filter_by(user_id=u.id).first()
        assert record is not None
        assert record.enabled is False

    def test_idempotent_replaces_unverified_secret(self, app, client, db_session):
        u = make_user(email="u3@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "u3@example.com")
        r1 = client.post("/api/auth/mfa/enroll/start").get_json()
        r2 = client.post("/api/auth/mfa/enroll/start").get_json()
        assert r1["secret_base32"] != r2["secret_base32"]

    def test_unauthenticated_returns_401(self, client):
        resp = client.post("/api/auth/mfa/enroll/start")
        assert resp.status_code in (401, 403)


class TestEnrollVerify:
    def test_correct_code_enables_mfa_and_returns_backup_codes(self, app, client, db_session):
        u = make_user(email="ev@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "ev@example.com")

        start = client.post("/api/auth/mfa/enroll/start").get_json()
        secret = start["secret_base32"]
        current_code = pyotp.TOTP(secret).now()

        resp = client.post("/api/auth/mfa/enroll/verify", json={"code": current_code})
        assert resp.status_code == 200
        body = resp.get_json()
        assert "backup_codes" in body
        assert len(body["backup_codes"]) == 10
        record = UserMFA.query.filter_by(user_id=u.id).first()
        assert record.enabled is True
        assert record.enrolled_at is not None

    def test_wrong_code_returns_401_and_does_not_enable(self, app, client, db_session):
        u = make_user(email="ev2@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "ev2@example.com")
        client.post("/api/auth/mfa/enroll/start")

        resp = client.post("/api/auth/mfa/enroll/verify", json={"code": "000000"})
        assert resp.status_code == 401
        record = UserMFA.query.filter_by(user_id=u.id).first()
        assert record.enabled is False

    def test_verify_without_enroll_returns_400(self, app, client, db_session):
        make_user(email="ev3@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "ev3@example.com")

        resp = client.post("/api/auth/mfa/enroll/verify", json={"code": "123456"})
        assert resp.status_code == 400
