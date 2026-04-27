"""Tests for the short-lived MFA token utilities."""

import time

import pytest

from app.utils.mfa_token import (
    create_mfa_token, verify_mfa_token,
    create_enrollment_token, verify_enrollment_token,
    MFATokenError,
)


class TestMFAToken:
    def test_round_trip(self, app):
        with app.app_context():
            token = create_mfa_token(user_id="user-123")
            assert verify_mfa_token(token) == "user-123"

    def test_enrollment_round_trip(self, app):
        with app.app_context():
            token = create_enrollment_token(user_id="user-456")
            assert verify_enrollment_token(token) == "user-456"

    def test_mfa_token_rejects_enrollment_token(self, app):
        """Tokens are scoped — an enrollment token can't be used for verify."""
        with app.app_context():
            ev = create_enrollment_token(user_id="user-789")
            with pytest.raises(MFATokenError):
                verify_mfa_token(ev)

    def test_invalid_token_raises(self, app):
        with app.app_context():
            with pytest.raises(MFATokenError):
                verify_mfa_token("not-a-real-token")

    def test_expired_token_raises(self, app, monkeypatch):
        # Force a 1-second expiry by monkeypatching the TTL constant
        from app.utils import mfa_token
        monkeypatch.setattr(mfa_token, "MFA_TOKEN_TTL_SECONDS", 1)
        with app.app_context():
            token = create_mfa_token(user_id="user-x")
            time.sleep(2)
            with pytest.raises(MFATokenError):
                verify_mfa_token(token)
