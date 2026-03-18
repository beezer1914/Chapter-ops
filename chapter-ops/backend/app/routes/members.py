"""
Member routes — /api/members/*

Handles the chapter member roster:
- List active members with user info
- Update member role/financial status
- Deactivate (soft-delete) a member
"""

from flask import Blueprint, jsonify, request, g
from flask_login import current_user, login_required

from app.extensions import db
from app.models import ChapterMembership, User
from app.services import notification_service
from app.utils.decorators import chapter_required, role_required

members_bp = Blueprint("members", __name__, url_prefix="/api/members")

VALID_ROLES = {"member", "secretary", "treasurer", "vice_president", "president"}
VALID_FINANCIAL_STATUSES = {"financial", "not_financial", "neophyte", "exempt"}


@members_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_members():
    """List all active members of the current chapter with user info."""
    chapter = g.current_chapter

    memberships = (
        ChapterMembership.query
        .filter_by(chapter_id=chapter.id, active=True)
        .all()
    )

    # Build response with user info
    result = []
    for membership in memberships:
        user = db.session.get(User, membership.user_id)
        if not user:
            continue
        result.append({
            **membership.to_dict(),
            "user": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "full_name": user.full_name,
                "phone": user.phone,
                "profile_picture_url": user.profile_picture_url,
            },
        })

    # Sort by role hierarchy (desc), then last name
    role_order = ChapterMembership.ROLE_HIERARCHY
    result.sort(key=lambda m: (-role_order.get(m["role"], 0), m["user"]["last_name"]))

    return jsonify({"members": result}), 200


@members_bp.route("/<membership_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("member")
def update_member(membership_id):
    """
    Update a member's role, financial status, or custom fields.

    - Any member can update their own custom_fields.
    - role and financial_status changes require president role and cannot target self.
    """
    chapter = g.current_chapter
    membership = db.session.get(ChapterMembership, membership_id)

    if not membership or membership.chapter_id != chapter.id or not membership.active:
        return jsonify({"error": "Member not found."}), 404

    data = request.get_json() or {}
    is_self = membership.user_id == current_user.id
    user_membership = current_user.get_membership(chapter.id)

    # Update role if provided — presidents only, cannot change own role
    new_role = data.get("role")
    if new_role is not None:
        if is_self:
            return jsonify({"error": "You cannot change your own role."}), 403
        if not user_membership or not user_membership.has_role("president"):
            return jsonify({"error": "Only presidents can change member roles."}), 403
        if new_role not in VALID_ROLES:
            return jsonify({"error": f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}"}), 400
        if not user_membership.has_role(new_role):
            return jsonify({"error": "Cannot assign a role higher than your own."}), 403
        membership.role = new_role

    # Update financial status if provided — presidents only
    new_status = data.get("financial_status")
    if new_status is not None:
        if is_self:
            return jsonify({"error": "You cannot change your own financial status."}), 403
        if not user_membership or not user_membership.has_role("president"):
            return jsonify({"error": "Only presidents can change financial status."}), 403
        if new_status not in VALID_FINANCIAL_STATUSES:
            return jsonify({
                "error": f"Invalid financial status. Must be one of: {', '.join(sorted(VALID_FINANCIAL_STATUSES))}"
            }), 400
        membership.financial_status = new_status

    # Update custom fields if provided — members can update own; presidents can update anyone's
    new_custom_fields = data.get("custom_fields")
    if new_custom_fields is not None and isinstance(new_custom_fields, dict):
        if not is_self and (not user_membership or not user_membership.has_role("president")):
            return jsonify({"error": "You can only update your own custom fields."}), 403
        current = dict(membership.custom_fields or {})
        current.update(new_custom_fields)
        membership.custom_fields = current

    db.session.commit()

    # Create notification for the member whose profile was updated
    user = db.session.get(User, membership.user_id)
    if user:
        try:
            notification_service.create_member_notification(
                chapter_id=chapter.id,
                user=user,
                action="updated",
                recipient_id=user.id,
            )
        except Exception:
            # Log but don't fail the update if notification creation fails
            pass

    # Return updated membership with user info
    result = {
        **membership.to_dict(),
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
            "phone": user.phone,
            "profile_picture_url": user.profile_picture_url,
        },
    }
    return jsonify({"success": True, "member": result}), 200


@members_bp.route("/<membership_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("president")
def deactivate_member(membership_id):
    """
    Deactivate a member (soft-delete).

    Cannot deactivate yourself.
    """
    chapter = g.current_chapter
    membership = db.session.get(ChapterMembership, membership_id)

    if not membership or membership.chapter_id != chapter.id or not membership.active:
        return jsonify({"error": "Member not found."}), 404

    if membership.user_id == current_user.id:
        return jsonify({"error": "You cannot deactivate yourself."}), 403

    membership.active = False
    db.session.commit()

    return jsonify({"success": True}), 200
