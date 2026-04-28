"""Tests for /api/auth/mfa/verify, /backup-codes/regenerate, /disable."""

import pyotp

from tests.conftest import make_user
from app.models import UserMFA
from app.services.mfa_service import (
    encrypt_secret, generate_secret, generate_backup_codes, hash_backup_codes,
)
from app.utils.mfa_token import create_mfa_token
from app.extensions import db


def _login(client, email, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _enroll(db_session, user, enabled=True):
    """Helper: directly enroll a user in MFA for test setup."""
    secret_plain = generate_secret()
    codes = generate_backup_codes()
    record = UserMFA(
        user_id=user.id,
        secret=encrypt_secret(secret_plain),
        enabled=enabled,
        backup_codes_hashed=hash_backup_codes(codes),
    )
    db_session.add(record)
    db_session.commit()
    return secret_plain, codes


class TestMFAVerify:
    def test_correct_totp_with_valid_token_succeeds(self, app, client, db_session):
        u = make_user(email="v@example.com", password="Str0ng!Password1")
        db_session.commit()
        secret, _ = _enroll(db_session, u)
        with app.app_context():
            token = create_mfa_token(user_id=u.id)
        code = pyotp.TOTP(secret).now()
        resp = client.post("/api/auth/mfa/verify", json={"mfa_token": token, "code": code})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["success"] is True
        assert "user" in body

    def test_correct_backup_code_succeeds_and_consumes_slot(self, app, client, db_session):
        u = make_user(email="v2@example.com", password="Str0ng!Password1")
        db_session.commit()
        _, codes = _enroll(db_session, u)
        with app.app_context():
            token = create_mfa_token(user_id=u.id)
        resp = client.post("/api/auth/mfa/verify", json={"mfa_token": token, "backup_code": codes[0]})
        assert resp.status_code == 200
        # That backup code can no longer be used
        with app.app_context():
            token2 = create_mfa_token(user_id=u.id)
        resp2 = client.post("/api/auth/mfa/verify", json={"mfa_token": token2, "backup_code": codes[0]})
        assert resp2.status_code == 401

    def test_wrong_code_returns_401(self, app, client, db_session):
        u = make_user(email="v3@example.com", password="Str0ng!Password1")
        db_session.commit()
        _enroll(db_session, u)
        with app.app_context():
            token = create_mfa_token(user_id=u.id)
        resp = client.post("/api/auth/mfa/verify", json={"mfa_token": token, "code": "000000"})
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, app, client, db_session):
        resp = client.post("/api/auth/mfa/verify", json={"mfa_token": "garbage", "code": "123456"})
        assert resp.status_code == 401


class TestRegenerateBackupCodes:
    def test_returns_10_new_codes_and_replaces_old(self, app, client, db_session):
        import pyotp
        u = make_user(email="r@example.com", password="Str0ng!Password1")
        db_session.commit()
        secret, original_codes = _enroll(db_session, u)
        # Login -> get mfa_token -> verify TOTP -> session established
        login_resp = _login(client, "r@example.com")
        token = login_resp.get_json()["mfa_token"]
        code = pyotp.TOTP(secret).now()
        verify_resp = client.post("/api/auth/mfa/verify", json={"mfa_token": token, "code": code})
        assert verify_resp.status_code == 200
        # Now session has MFA-verified user
        resp = client.post("/api/auth/mfa/backup-codes/regenerate")
        assert resp.status_code == 200
        body = resp.get_json()
        assert len(body["backup_codes"]) == 10
        assert original_codes[0] not in body["backup_codes"]


class TestDisableMFA:
    def test_disable_succeeds_for_opt_in_member(self, app, client, db_session):
        import pyotp
        u = make_user(email="d@example.com", password="Str0ng!Password1")
        db_session.commit()
        secret, _ = _enroll(db_session, u)
        login_resp = _login(client, "d@example.com")
        token = login_resp.get_json()["mfa_token"]
        code = pyotp.TOTP(secret).now()
        verify_resp = client.post("/api/auth/mfa/verify", json={"mfa_token": token, "code": code})
        assert verify_resp.status_code == 200
        resp = client.post("/api/auth/mfa/disable")
        assert resp.status_code == 200
        record = UserMFA.query.filter_by(user_id=u.id).first()
        assert record is None
