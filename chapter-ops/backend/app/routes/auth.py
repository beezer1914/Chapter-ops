"""
Authentication routes — /api/auth/*

Handles login, registration (with invite codes), logout, and current user.
These routes are tenant-exempt (no chapter context needed).
"""

from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request, session
from flask_login import current_user, login_required, login_user, logout_user

from app.extensions import bcrypt, db, limiter
from app.models import User, InviteCode, ChapterMembership, Chapter
from app.models.workflow import WorkflowTemplate
from app.services import notification_service, workflow_engine
from app.utils.password import validate_password

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per 15 minutes")
def login():
    """Authenticate a user and create a session."""
    data = request.get_json()

    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password are required."}), 400

    user = User.query.filter_by(email=data["email"].lower().strip()).first()

    if not user or not user.check_password(data["password"]):
        return jsonify({"error": "Invalid email or password."}), 401

    if not user.active:
        return jsonify({"error": "This account has been deactivated."}), 403

    # Regenerate session to prevent session fixation
    session.clear()
    login_user(user, remember=data.get("remember", False))

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
    logout_user()
    session.clear()
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
    """Update the current user's name and/or email."""
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

    if "email" in data:
        val = data["email"].strip().lower()
        if not val or "@" not in val:
            return jsonify({"error": "A valid email is required."}), 400
        existing = User.query.filter_by(email=val).first()
        if existing and existing.id != current_user.id:
            return jsonify({"error": "That email is already in use."}), 409
        current_user.email = val

    db.session.commit()
    return jsonify({"user": current_user.to_dict()}), 200


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
