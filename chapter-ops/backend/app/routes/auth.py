"""
Authentication routes — /api/auth/*

Handles login, registration (with invite codes), logout, and current user.
These routes are tenant-exempt (no chapter context needed).
"""

import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request, session
from flask_wtf.csrf import generate_csrf
from flask_login import current_user, login_required, login_user, logout_user

from app.extensions import bcrypt, db, limiter
from app.models import User, InviteCode, ChapterMembership, Chapter
from app.models.workflow import WorkflowTemplate
from app.models.auth_event import AuthEvent
from app.services import notification_service, workflow_engine
from app.utils.password import validate_password
from app.utils.email import (
    send_password_reset_email,
    send_email_change_confirm,
    send_email_change_notice,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _hash_token(token: str) -> str:
    """Return a sha256 hex digest. Reset/confirmation tokens are stored hashed
    so a DB leak doesn't hand out active tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _log_auth_event(event_type: str, user_id: str | None = None) -> None:
    """Record an AuthEvent. Silently swallowed on failure — never breaks the request."""
    try:
        event = AuthEvent(
            user_id=user_id,
            ip_address=request.remote_addr or "unknown",
            event_type=event_type,
            user_agent=(request.user_agent.string or "")[:512],
        )
        db.session.add(event)
        db.session.commit()
    except Exception:
        db.session.rollback()


@auth_bp.route("/csrf", methods=["GET"])
def get_csrf_token():
    """Return a CSRF token. Call this once after page load and on every login."""
    return jsonify({"csrf_token": generate_csrf()}), 200


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per 15 minutes")
def login():
    """Authenticate a user and create a session."""
    data = request.get_json()

    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password are required."}), 400

    user = User.query.filter_by(email=data["email"].lower().strip()).first()

    if not user or not user.check_password(data["password"]):
        _log_auth_event("login_failure", user_id=user.id if user else None)
        return jsonify({"error": "Invalid email or password."}), 401

    if not user.active:
        _log_auth_event("login_failure", user_id=user.id)
        return jsonify({"error": "This account has been deactivated."}), 403

    # Regenerate session to prevent session fixation
    session.clear()
    login_user(user, remember=data.get("remember", False))
    _log_auth_event("login_success", user_id=user.id)

    return jsonify({
        "success": True,
        "user": user.to_dict(),
    }), 200


@auth_bp.route("/register", methods=["POST"])
@limiter.limit("10 per hour")
def register():
    """
    Register a new user, optionally with an invite code.

    If an invite code is provided, the user joins that chapter with the invite's role.
    If no invite code, the user is created without a chapter and should complete onboarding.
    """
    data = request.get_json()

    required_fields = ["email", "password", "first_name", "last_name"]
    missing = [f for f in required_fields if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Validate password strength
    is_valid, error_msg = validate_password(data["password"])
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    # Check if email already exists
    email = data["email"].lower().strip()
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 409

    # Validate invite code if provided
    invite_code = data.get("invite_code", "").strip()
    invite = None

    if invite_code:
        invite = InviteCode.query.filter_by(code=invite_code).first()
        if not invite:
            return jsonify({"error": "Invalid invite code."}), 400
        if not invite.is_valid:
            return jsonify({"error": "This invite code has expired or already been used."}), 400

    try:
        # Create user
        user = User(
            email=email,
            first_name=data["first_name"].strip(),
            last_name=data["last_name"].strip(),
            phone=data.get("phone", "").strip() or None,
        )
        user.set_password(data["password"])
        db.session.add(user)
        db.session.flush()  # Get user.id before creating membership

        membership = None

        if invite:
            # Invited path: create membership and set active chapter.
            # If an active member_application workflow template exists, membership
            # starts as inactive (active=False) pending workflow approval.
            from flask import current_app
            chapter = db.session.get(Chapter, invite.chapter_id)
            member_app_template = (
                WorkflowTemplate.query
                .filter_by(chapter_id=invite.chapter_id, trigger_type="member_application", is_active=True)
                .first()
            ) or (
                WorkflowTemplate.query
                .filter_by(organization_id=chapter.organization_id, chapter_id=None, trigger_type="member_application", is_active=True)
                .first()
            )
            membership_active = not bool(member_app_template)

            # Determine financial status based on initiation date
            initiation_date = None
            raw_date = data.get("initiation_date")
            if raw_date:
                try:
                    initiation_date = date.fromisoformat(raw_date)
                except (ValueError, TypeError):
                    pass

            if initiation_date:
                days_since = (date.today() - initiation_date).days
                financial_status = "neophyte" if days_since < 365 else "not_financial"
            else:
                financial_status = "not_financial"

            membership = ChapterMembership(
                user_id=user.id,
                chapter_id=invite.chapter_id,
                role=invite.role,
                financial_status=financial_status,
                initiation_date=initiation_date,
                active=membership_active,
            )
            db.session.add(membership)

            user.active_chapter_id = invite.chapter_id

            invite.used = True
            invite.used_by = user.id
            invite.used_at = datetime.now(timezone.utc)
        # else: founder path — no membership yet, user goes through onboarding

        db.session.commit()

        # Seed dues for the new member if the chapter has an active period + fee types
        if membership:
            try:
                from app.services.dues_service import seed_member_dues
                joined_chapter = db.session.get(Chapter, invite.chapter_id)
                if joined_chapter:
                    seed_member_dues(joined_chapter, user.id)
                    db.session.commit()
            except Exception:
                pass  # Non-fatal — dues can be reconciled later

        # If this invite was generated by the intake pipeline, sync line data to membership
        if invite:
            try:
                from app.models.intake import IntakeCandidate
                candidate = IntakeCandidate.query.filter_by(
                    invite_code_id=invite.id
                ).first()
                if candidate and membership:
                    membership.line_season = candidate.semester
                    membership.line_number = candidate.line_number
                    membership.line_name = candidate.line_name
                    candidate.user_id = user.id
                    db.session.commit()
            except Exception:
                pass

        # Notify chapter officers (president, secretary) when an invite is accepted
        if invite:
            try:
                officers = ChapterMembership.query.filter(
                    ChapterMembership.chapter_id == invite.chapter_id,
                    ChapterMembership.role.in_(["president", "secretary", "admin"]),
                    ChapterMembership.active == True,
                ).all()
                for officer in officers:
                    notification_service.create_invite_notification(
                        chapter_id=invite.chapter_id,
                        email=user.email,
                        action="accepted",
                        recipient_id=officer.user_id,
                    )
            except Exception:
                pass

        # Auto-start any active member_application workflow template for this chapter
        if invite and member_app_template:
            try:
                workflow_engine.start_workflow(
                    template=member_app_template,
                    trigger_type="member_application",
                    trigger_id=user.id,
                    trigger_metadata={
                        "title": f"{user.full_name} — Member Application",
                        "email": user.email,
                        "role": invite.role,
                        "invited_by": invite.created_by_user.full_name if invite.created_by_user else "unknown",
                    },
                    initiated_by_user=user,
                    chapter=chapter,
                )
            except Exception as exc:
                current_app.logger.error(f"Failed to auto-start member_application workflow for {user.id}: {exc}")

        # Log the user in
        login_user(user)

        return jsonify({
            "success": True,
            "user": user.to_dict(),
        }), 201

    except Exception as e:
        db.session.rollback()
        from flask import current_app
        current_app.logger.exception("Registration failed: %s", e)
        return jsonify({"error": "Registration failed. Please try again."}), 500


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    """End the user's session."""
    user_id = current_user.id
    logout_user()
    session.clear()
    _log_auth_event("logout", user_id=user_id)
    return jsonify({"success": True}), 200


@auth_bp.route("/user", methods=["GET"])
@login_required
def get_current_user():
    """Get the currently authenticated user with their chapter memberships."""
    memberships = current_user.memberships.filter_by(active=True).all()

    return jsonify({
        "user": current_user.to_dict(),
        "memberships": [m.to_dict() for m in memberships],
    }), 200


@auth_bp.route("/profile", methods=["PUT"])
@login_required
def update_profile():
    """Update the current user's name and/or email.

    Email changes don't take effect immediately: the new address must click a
    confirmation link, and the request requires the current password. This
    prevents a stolen session from silently hijacking the account via email
    swap → forgot-password.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required."}), 400

    if "first_name" in data:
        val = data["first_name"].strip()
        if not val:
            return jsonify({"error": "first_name cannot be empty."}), 400
        current_user.first_name = val

    if "last_name" in data:
        val = data["last_name"].strip()
        if not val:
            return jsonify({"error": "last_name cannot be empty."}), 400
        current_user.last_name = val

    email_change_pending = False
    new_email_value: str | None = None

    if "email" in data:
        val = data["email"].strip().lower()
        if not val or "@" not in val:
            return jsonify({"error": "A valid email is required."}), 400

        if val != current_user.email:
            current_password = data.get("current_password", "")
            if not current_password or not current_user.check_password(current_password):
                return jsonify({"error": "Current password is required to change your email."}), 400

            existing = User.query.filter_by(email=val).first()
            if existing and existing.id != current_user.id:
                return jsonify({"error": "That email is already in use."}), 409

            token = secrets.token_urlsafe(32)
            current_user.pending_email = val
            current_user.pending_email_token = _hash_token(token)
            current_user.pending_email_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
            email_change_pending = True
            new_email_value = val
            # The plaintext token is only held in memory for the duration of this
            # request — sent to the new address, then discarded.
            pending_token_plaintext = token

    db.session.commit()

    if email_change_pending and new_email_value:
        send_email_change_confirm(
            to=new_email_value,
            token=pending_token_plaintext,
            user_name=current_user.first_name,
            new_email=new_email_value,
        )
        send_email_change_notice(
            to=current_user.email,
            user_name=current_user.first_name,
            new_email=new_email_value,
        )

    return jsonify({
        "user": current_user.to_dict(),
        "pending_email": current_user.pending_email,
    }), 200


@auth_bp.route("/confirm-email-change", methods=["POST"])
@limiter.limit("10 per hour")
def confirm_email_change():
    """Apply a pending email change after the new address clicks the confirm link."""
    data = request.get_json() or {}
    token = data.get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required."}), 400

    user = User.query.filter_by(pending_email_token=_hash_token(token)).first()
    if not user or not user.pending_email or not user.pending_email_expires_at:
        return jsonify({"error": "Invalid or expired confirmation link."}), 400

    expires = user.pending_email_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        user.pending_email = None
        user.pending_email_token = None
        user.pending_email_expires_at = None
        db.session.commit()
        return jsonify({"error": "Invalid or expired confirmation link."}), 400

    # Guard against a race where the new address was claimed between request
    # and confirmation.
    conflict = User.query.filter_by(email=user.pending_email).first()
    if conflict and conflict.id != user.id:
        user.pending_email = None
        user.pending_email_token = None
        user.pending_email_expires_at = None
        db.session.commit()
        return jsonify({"error": "That email is no longer available."}), 409

    user.email = user.pending_email
    user.pending_email = None
    user.pending_email_token = None
    user.pending_email_expires_at = None
    db.session.commit()
    _log_auth_event("email_change", user_id=user.id)

    return jsonify({"success": True, "email": user.email}), 200


@auth_bp.route("/change-password", methods=["PUT"])
@login_required
def change_password():
    """Change the current user's password."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required."}), 400

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_user.check_password(current_password):
        return jsonify({"error": "Current password is incorrect."}), 400

    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    current_user.set_password(new_password)
    db.session.commit()
    _log_auth_event("password_change", user_id=current_user.id)
    return jsonify({"success": True}), 200


@auth_bp.route("/forgot-password", methods=["POST"])
@limiter.limit("5 per hour")
def forgot_password():
    """
    Request a password reset link.

    Always returns 200 to avoid leaking whether an email is registered.
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    if not email:
        return jsonify({"success": True}), 200

    user = User.query.filter_by(email=email).first()
    if user and user.active:
        token = secrets.token_urlsafe(32)
        # Store only the hash — a DB leak must not expose live reset tokens.
        user.password_reset_token = _hash_token(token)
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.session.commit()
        send_password_reset_email(to=user.email, reset_token=token, user_name=user.first_name)

    # Always return success to avoid email enumeration
    return jsonify({"success": True}), 200


@auth_bp.route("/reset-password", methods=["POST"])
@limiter.limit("10 per hour")
def reset_password():
    """Reset a user's password using a valid reset token."""
    data = request.get_json() or {}
    token = data.get("token", "").strip()
    new_password = data.get("password", "")

    if not token or not new_password:
        return jsonify({"error": "Token and password are required."}), 400

    user = User.query.filter_by(password_reset_token=_hash_token(token)).first()
    if not user or not user.password_reset_expires_at:
        return jsonify({"error": "Invalid or expired reset link."}), 400

    expires = user.password_reset_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        return jsonify({"error": "Invalid or expired reset link."}), 400

    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    user.set_password(new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.session.commit()
    _log_auth_event("password_change", user_id=user.id)

    return jsonify({"success": True}), 200


@auth_bp.route("/account", methods=["DELETE"])
@login_required
@limiter.limit("3 per hour")
def delete_account():
    """
    Self-service account deletion.

    Anonymizes the user's PII so they cannot log in and are no longer
    identifiable, but preserves FK references on financial records for
    the 7-year retention requirement. Requires password confirmation.
    """
    data = request.get_json() or {}
    password = data.get("password", "")

    if not password or not current_user.check_password(password):
        return jsonify({"error": "Incorrect password."}), 400

    user_id = current_user.id

    # Deactivate all chapter memberships
    ChapterMembership.query.filter_by(user_id=user_id).update({"active": False})

    # Anonymize PII — preserve the row for FK integrity on financial records
    current_user.email = f"deleted_{user_id}@deleted.invalid"
    current_user.first_name = "Deleted"
    current_user.last_name = "User"
    current_user.phone = None
    current_user.profile_picture_url = None
    current_user.active = False
    current_user.active_chapter_id = None
    current_user.password_hash = ""
    current_user.password_reset_token = None
    current_user.password_reset_expires_at = None

    db.session.commit()

    _log_auth_event("account_deleted", user_id=user_id)
    logout_user()
    session.clear()

    return jsonify({"success": True}), 200


@auth_bp.route("/switch-chapter", methods=["POST"])
@login_required
def switch_chapter():
    """Switch the user's active chapter context."""
    data = request.get_json()
    chapter_id = data.get("chapter_id")

    if not chapter_id:
        return jsonify({"error": "chapter_id is required."}), 400

    # Verify user belongs to this chapter
    membership = current_user.get_membership(chapter_id)
    if not membership or not membership.active:
        return jsonify({"error": "You are not a member of this chapter."}), 403

    current_user.active_chapter_id = chapter_id
    db.session.commit()

    return jsonify({
        "success": True,
        "active_chapter_id": chapter_id,
    }), 200
