"""
Short-lived signed tokens for the MFA challenge flow.

After a successful password check, the user gets a token that authorizes
EITHER the verify endpoint (mfa_token) OR the enroll endpoints
(enrollment_token) — but not both. No real Flask-Login session exists
during this window. Tokens expire after 5 minutes.

Tokens are scoped by purpose (mfa | enrollment) so a token issued for one
flow cannot be replayed against the other.
"""

from flask import current_app
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

MFA_TOKEN_TTL_SECONDS = 300  # 5 minutes
SALT_MFA = "mfa-verify-v1"
SALT_ENROLLMENT = "mfa-enrollment-v1"


class MFATokenError(Exception):
    """Raised when token verification fails (invalid signature, expired, wrong scope)."""


def _serializer(salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=salt)


def create_mfa_token(user_id: str) -> str:
    """Create a token authorizing mfa/verify for this user."""
    return _serializer(SALT_MFA).dumps({"user_id": user_id})


def verify_mfa_token(token: str) -> str:
    """Verify a mfa_token; return the user_id. Raises MFATokenError on any failure."""
    try:
        payload = _serializer(SALT_MFA).loads(token, max_age=MFA_TOKEN_TTL_SECONDS)
    except (BadSignature, SignatureExpired) as exc:
        raise MFATokenError(str(exc)) from exc
    if not isinstance(payload, dict) or "user_id" not in payload:
        raise MFATokenError("Malformed token payload")
    return payload["user_id"]


def create_enrollment_token(user_id: str) -> str:
    """Create a token authorizing the enrollment flow for this user."""
    return _serializer(SALT_ENROLLMENT).dumps({"user_id": user_id})


def verify_enrollment_token(token: str) -> str:
    """Verify an enrollment_token; return the user_id. Raises MFATokenError on any failure."""
    try:
        payload = _serializer(SALT_ENROLLMENT).loads(token, max_age=MFA_TOKEN_TTL_SECONDS)
    except (BadSignature, SignatureExpired) as exc:
        raise MFATokenError(str(exc)) from exc
    if not isinstance(payload, dict) or "user_id" not in payload:
        raise MFATokenError("Malformed token payload")
    return payload["user_id"]
