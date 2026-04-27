"""
MFA routes — /api/auth/mfa/*

Enrollment, verification, recovery, and admin reset for two-factor auth.
Uses the existing @login_required for most endpoints; the enrollment flow
also supports a short-lived enrollment_token for users who haven't
established a session yet (mid-login enrollment).
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app
from flask_login import current_user, login_required
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db, limiter
from app.models import UserMFA, User
from app.services import mfa_service

mfa_bp = Blueprint("mfa", __name__, url_prefix="/api/auth/mfa")


# ── Enrollment ─────────────────────────────────────────────────────────────


@mfa_bp.route("/enroll/start", methods=["POST"])
@login_required
@limiter.limit("5 per hour")
def enroll_start():
    """Generate a fresh TOTP secret + QR for the logged-in user.

    Idempotent: if the user already has an unverified UserMFA row, its secret
    is replaced. Already-enabled MFA is rejected (use disable+re-enroll, or
    /backup-codes/regenerate).
    """
    existing = UserMFA.query.filter_by(user_id=current_user.id).first()
    if existing and existing.enabled:
        return jsonify({"error": "MFA is already enabled. Disable it before re-enrolling."}), 400

    secret = mfa_service.generate_secret()
    encrypted = mfa_service.encrypt_secret(secret)

    if existing:
        existing.secret = encrypted
    else:
        existing = UserMFA(user_id=current_user.id, secret=encrypted, enabled=False)
        db.session.add(existing)

    db.session.commit()

    otpauth_uri = mfa_service.build_otpauth_uri(
        secret=secret,
        user_email=current_user.email,
        issuer="ChapterOps",
    )
    qr_data_uri = mfa_service.generate_qr_data_uri(otpauth_uri)

    return jsonify({
        "secret_base32": secret,
        "qr_code_data_uri": qr_data_uri,
        "otpauth_uri": otpauth_uri,
    }), 200


@mfa_bp.route("/enroll/verify", methods=["POST"])
@login_required
@limiter.limit("5 per 15 minutes")
def enroll_verify():
    """Validate the user's first TOTP code, enable MFA, return backup codes.

    Backup codes are returned plaintext exactly once. They are bcrypt-hashed
    before being stored; the plaintext is never recoverable.
    """
    data = request.get_json() or {}
    code = (data.get("code") or "").strip()

    record = UserMFA.query.filter_by(user_id=current_user.id).first()
    if record is None:
        return jsonify({"error": "No enrollment in progress. Start enrollment first."}), 400

    secret = mfa_service.decrypt_secret(record.secret)
    if not mfa_service.verify_totp(secret, code):
        return jsonify({"error": "Invalid verification code"}), 401

    backup_codes = mfa_service.generate_backup_codes()
    record.backup_codes_hashed = mfa_service.hash_backup_codes(backup_codes)
    record.enabled = True
    record.enrolled_at = datetime.now(timezone.utc)
    db.session.commit()

    # Audit
    from app.models import AuthEvent
    db.session.add(AuthEvent(
        user_id=current_user.id,
        ip_address=request.remote_addr or "unknown",
        event_type="mfa_enrolled",
        user_agent=(request.headers.get("User-Agent") or "")[:512] or None,
    ))
    db.session.commit()

    return jsonify({"backup_codes": backup_codes}), 200
