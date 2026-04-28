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


# ── Verify (login-time MFA challenge) ──────────────────────────────────────


@mfa_bp.route("/verify", methods=["POST"])
@limiter.limit("5 per 15 minutes", key_func=lambda: request.json.get("mfa_token", "") if request.is_json else request.remote_addr)
def verify():
    """Verify a TOTP or backup code using a short-lived mfa_token.

    Body: {mfa_token, code} or {mfa_token, backup_code}
    On success: establishes Flask-Login session, returns user payload.
    """
    from app.utils.mfa_token import verify_mfa_token, MFATokenError
    from flask_login import login_user
    from flask import session
    from flask_wtf.csrf import generate_csrf

    data = request.get_json() or {}
    token = data.get("mfa_token")
    if not token:
        return jsonify({"error": "Missing mfa_token"}), 400

    try:
        user_id = verify_mfa_token(token)
    except MFATokenError:
        return jsonify({"error": "Verification session expired. Please log in again."}), 401

    user = User.query.get(user_id)
    if not user or not user.active:
        return jsonify({"error": "Invalid verification session."}), 401

    record = UserMFA.query.filter_by(user_id=user.id, enabled=True).first()
    if record is None:
        return jsonify({"error": "MFA is not enabled for this account."}), 400

    code = (data.get("code") or "").strip()
    backup = (data.get("backup_code") or "").strip()

    matched = False
    if code:
        secret = mfa_service.decrypt_secret(record.secret)
        matched = mfa_service.verify_totp(secret, code)
    elif backup:
        new_hashes, matched = mfa_service.consume_backup_code(record.backup_codes_hashed, backup)
        if matched:
            record.backup_codes_hashed = new_hashes

    from app.models import AuthEvent
    if not matched:
        db.session.add(AuthEvent(
            user_id=user.id,
            ip_address=request.remote_addr or "unknown",
            event_type="mfa_failed",
            user_agent=(request.headers.get("User-Agent") or "")[:512] or None,
        ))
        db.session.commit()
        return jsonify({"error": "Invalid verification code"}), 401

    record.last_used_at = datetime.now(timezone.utc)
    db.session.add(AuthEvent(
        user_id=user.id,
        ip_address=request.remote_addr or "unknown",
        event_type="mfa_backup_used" if backup else "mfa_verified",
        user_agent=(request.headers.get("User-Agent") or "")[:512] or None,
    ))
    db.session.commit()

    # Establish session
    session.clear()
    login_user(user, remember=False)
    session["mfa_verified"] = True

    from app.utils.platform_admin import is_founder
    return jsonify({
        "success": True,
        "user": user.to_dict(),
        "is_platform_admin": is_founder(),
        "csrf_token": generate_csrf(),
    }), 200


# ── Backup code regeneration ───────────────────────────────────────────────


@mfa_bp.route("/backup-codes/regenerate", methods=["POST"])
@login_required
@limiter.limit("3 per hour")
def regenerate_backup_codes():
    """Generate fresh backup codes, replacing any existing ones.

    Returns plaintext codes ONCE (one-time display).
    """
    record = UserMFA.query.filter_by(user_id=current_user.id, enabled=True).first()
    if record is None:
        return jsonify({"error": "MFA is not enabled."}), 400

    codes = mfa_service.generate_backup_codes()
    record.backup_codes_hashed = mfa_service.hash_backup_codes(codes)
    db.session.commit()

    return jsonify({"backup_codes": codes}), 200


# ── Disable MFA (opt-in users only) ────────────────────────────────────────


@mfa_bp.route("/disable", methods=["POST"])
@login_required
@limiter.limit("3 per hour")
def disable_mfa():
    """Self-service disable. Forbidden for users in MFA-required roles."""
    if mfa_service.user_role_requires_mfa(current_user):
        return jsonify({"error": "MFA is required for your role and cannot be disabled."}), 403

    record = UserMFA.query.filter_by(user_id=current_user.id).first()
    if record is None:
        return jsonify({"error": "MFA is not enabled."}), 400

    db.session.delete(record)

    from app.models import AuthEvent
    db.session.add(AuthEvent(
        user_id=current_user.id,
        ip_address=request.remote_addr or "unknown",
        event_type="mfa_disabled",
        user_agent=(request.headers.get("User-Agent") or "")[:512] or None,
    ))
    db.session.commit()

    return jsonify({"success": True}), 200
