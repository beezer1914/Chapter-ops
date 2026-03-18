"""
Invite routes — /api/invites/*

Handles invite code management for chapter registration:
- List invites for the current chapter
- Create new invite codes
- Revoke unused invite codes
"""

import secrets
import string
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, g
from flask_login import current_user, login_required

from app.extensions import db
from app.models import InviteCode, User
from app.utils.decorators import chapter_required, role_required

invites_bp = Blueprint("invites", __name__, url_prefix="/api/invites")

VALID_ROLES = {"member", "secretary", "treasurer", "vice_president", "president"}


def _generate_code(length: int = 8) -> str:
    """Generate a random uppercase alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@invites_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("secretary")
def list_invites():
    """List all invites for the current chapter."""
    chapter = g.current_chapter
    invites = (
        InviteCode.query
        .filter_by(chapter_id=chapter.id)
        .order_by(InviteCode.created_at.desc())
        .all()
    )

    # Enrich with issuer name
    result = []
    for invite in invites:
        data = invite.to_dict()
        issuer = db.session.get(User, invite.created_by)
        data["created_by_name"] = issuer.full_name if issuer else "Unknown"
        if invite.used_by:
            redeemer = db.session.get(User, invite.used_by)
            data["used_by_name"] = redeemer.full_name if redeemer else "Unknown"
        result.append(data)

    return jsonify({"invites": result}), 200


@invites_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def create_invite():
    """
    Create a new invite code for the current chapter.

    Body:
        role (str): Role to assign on redemption (default: "member")
        expires_in_days (int): Days until expiry (default: 7)
    """
    data = request.get_json() or {}
    chapter = g.current_chapter

    role = data.get("role", "member")
    if role not in VALID_ROLES:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}"}), 400

    # Cannot create invites for roles above your own
    user_membership = current_user.get_membership(chapter.id)
    if not user_membership.has_role(role):
        return jsonify({"error": "Cannot create invites for a role higher than your own."}), 403

    expires_in_days = data.get("expires_in_days", 7)
    if not isinstance(expires_in_days, int) or expires_in_days < 1 or expires_in_days > 90:
        return jsonify({"error": "expires_in_days must be an integer between 1 and 90."}), 400

    # Generate a unique code
    for _ in range(10):
        code = _generate_code()
        if not InviteCode.query.filter_by(code=code).first():
            break
    else:
        return jsonify({"error": "Failed to generate unique code. Please try again."}), 500

    invite = InviteCode(
        chapter_id=chapter.id,
        code=code,
        role=role,
        created_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=expires_in_days),
    )
    db.session.add(invite)
    db.session.commit()

    result = invite.to_dict()
    result["created_by_name"] = current_user.full_name
    return jsonify({"success": True, "invite": result}), 201


@invites_bp.route("/<invite_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("treasurer")
def revoke_invite(invite_id):
    """Revoke an unused invite code."""
    chapter = g.current_chapter
    invite = db.session.get(InviteCode, invite_id)

    if not invite or invite.chapter_id != chapter.id:
        return jsonify({"error": "Invite not found."}), 404

    if invite.used:
        return jsonify({"error": "Cannot revoke an invite that has already been used."}), 400

    db.session.delete(invite)
    db.session.commit()

    return jsonify({"success": True}), 200
