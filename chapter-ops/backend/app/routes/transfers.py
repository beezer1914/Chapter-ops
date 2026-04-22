"""
Chapter Transfer Request routes — /api/transfers/*

Allows members to request a chapter transfer. Both chapter presidents
(from and to) must approve before the transfer is executed.

Status flow:
  pending
    → approved_by_from  (from-chapter president approved)
      → approved        (to-chapter president also approved → transfer executes)
      → denied
    → denied            (either president can deny at any stage)
"""

from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import Chapter, ChapterMembership, ChapterTransferRequest
from app.services import notification_service
from app.utils.decorators import chapter_required, role_required

transfers_bp = Blueprint("transfers", __name__, url_prefix="/api/transfers")


def _execute_transfer(transfer: ChapterTransferRequest) -> None:
    """
    Execute an approved transfer: deactivate old membership,
    create new membership in target chapter, update active_chapter_id.
    """
    # Deactivate old membership
    old_membership = ChapterMembership.query.filter_by(
        user_id=transfer.requesting_user_id,
        chapter_id=transfer.from_chapter_id,
        active=True,
    ).first()
    if old_membership:
        old_membership.active = False

    # Create new membership in target chapter (default role: member)
    to_chapter = db.session.get(Chapter, transfer.to_chapter_id)
    new_membership = ChapterMembership(
        user_id=transfer.requesting_user_id,
        chapter_id=transfer.to_chapter_id,
        role="member",
        member_type=ChapterMembership.default_member_type_for(to_chapter),
        active=True,
    )
    db.session.add(new_membership)

    # Update user's active chapter
    transfer.requesting_user.active_chapter_id = transfer.to_chapter_id
    db.session.flush()


@transfers_bp.route("/available-chapters", methods=["GET"])
@login_required
@chapter_required
def get_available_chapters():
    """Return active chapters in the same organization (excluding current)."""
    from app.models import Chapter as ChapterModel
    chapters = ChapterModel.query.filter(
        ChapterModel.organization_id == g.current_chapter.organization_id,
        ChapterModel.id != g.current_chapter.id,
        ChapterModel.active == True,
    ).order_by(ChapterModel.name).all()
    return jsonify({"chapters": [
        {"id": c.id, "name": c.name, "designation": c.designation, "city": c.city, "state": c.state}
        for c in chapters
    ]}), 200


@transfers_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def create_transfer_request():
    """Member submits a chapter transfer request."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required."}), 400

    to_chapter_id = data.get("to_chapter_id", "").strip()
    reason = data.get("reason", "").strip() or None

    if not to_chapter_id:
        return jsonify({"error": "to_chapter_id is required."}), 400

    from_chapter = g.current_chapter

    if to_chapter_id == from_chapter.id:
        return jsonify({"error": "Cannot transfer to your current chapter."}), 400

    to_chapter = db.session.get(Chapter, to_chapter_id)
    if not to_chapter or not to_chapter.active:
        return jsonify({"error": "Target chapter not found or inactive."}), 404

    # Must belong to same organization
    if to_chapter.organization_id != from_chapter.organization_id:
        return jsonify({"error": "Cannot transfer to a chapter outside your organization."}), 400

    # No pending/in-progress request already
    existing = ChapterTransferRequest.query.filter(
        ChapterTransferRequest.requesting_user_id == current_user.id,
        ChapterTransferRequest.status.in_(["pending", "approved_by_from"]),
    ).first()
    if existing:
        return jsonify({"error": "You already have a pending transfer request."}), 409

    transfer = ChapterTransferRequest(
        requesting_user_id=current_user.id,
        from_chapter_id=from_chapter.id,
        to_chapter_id=to_chapter_id,
        reason=reason,
        status="pending",
    )
    db.session.add(transfer)
    db.session.flush()

    # Notify presidents of both chapters
    for chapter_id in [from_chapter.id, to_chapter_id]:
        presidents = ChapterMembership.query.filter(
            ChapterMembership.chapter_id == chapter_id,
            ChapterMembership.role.in_(["president", "vice_president"]),
            ChapterMembership.active == True,
        ).all()
        for p in presidents:
            notification_service.create_notification(
                chapter_id=chapter_id,
                recipient_id=p.user_id,
                notification_type="member",
                title="Chapter Transfer Request",
                message=f"{current_user.full_name} has requested to transfer "
                        f"from {from_chapter.name} to {to_chapter.name}.",
            )

    db.session.commit()
    return jsonify({"transfer_request": transfer.to_dict()}), 201


@transfers_bp.route("/mine", methods=["GET"])
@login_required
def get_my_transfers():
    """Get all transfer requests for the current user."""
    transfers = ChapterTransferRequest.query.filter_by(
        requesting_user_id=current_user.id
    ).order_by(ChapterTransferRequest.created_at.desc()).all()
    return jsonify({"transfer_requests": [t.to_dict() for t in transfers]}), 200


@transfers_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("secretary")
def list_transfers():
    """List all transfer requests involving the current chapter (as officer)."""
    chapter_id = g.current_chapter.id
    transfers = ChapterTransferRequest.query.filter(
        db.or_(
            ChapterTransferRequest.from_chapter_id == chapter_id,
            ChapterTransferRequest.to_chapter_id == chapter_id,
        )
    ).order_by(ChapterTransferRequest.created_at.desc()).all()
    return jsonify({"transfer_requests": [t.to_dict() for t in transfers]}), 200


@transfers_bp.route("/<transfer_id>/approve", methods=["POST"])
@login_required
@chapter_required
@role_required("president")
def approve_transfer(transfer_id):
    """President approves a transfer request on behalf of their chapter."""
    transfer = db.session.get(ChapterTransferRequest, transfer_id)
    if not transfer:
        return jsonify({"error": "Transfer request not found."}), 404

    chapter_id = g.current_chapter.id

    # Must be a chapter involved in this transfer
    if chapter_id not in (transfer.from_chapter_id, transfer.to_chapter_id):
        return jsonify({"error": "This transfer does not involve your chapter."}), 403

    if transfer.status not in ("pending", "approved_by_from"):
        return jsonify({"error": f"Transfer cannot be approved in status '{transfer.status}'."}), 400

    now = datetime.now(timezone.utc)

    if chapter_id == transfer.from_chapter_id:
        if transfer.from_chapter_approved_by:
            return jsonify({"error": "Your chapter has already approved this transfer."}), 400
        transfer.from_chapter_approved_by = current_user.id
        transfer.from_chapter_approved_at = now
        # Advance status if not already waiting on to-chapter
        if transfer.status == "pending":
            transfer.status = "approved_by_from"

    elif chapter_id == transfer.to_chapter_id:
        if transfer.to_chapter_approved_by:
            return jsonify({"error": "Your chapter has already approved this transfer."}), 400
        transfer.to_chapter_approved_by = current_user.id
        transfer.to_chapter_approved_at = now

    # Both sides approved → execute transfer
    if transfer.from_chapter_approved_by and transfer.to_chapter_approved_by:
        transfer.status = "approved"
        _execute_transfer(transfer)

        # Notify the member
        notification_service.create_notification(
            chapter_id=transfer.to_chapter_id,
            recipient_id=transfer.requesting_user_id,
            notification_type="member",
            title="Transfer Approved",
            message=f"Your transfer to {transfer.to_chapter.name} has been approved. Welcome!",
        )

    db.session.commit()
    return jsonify({"transfer_request": transfer.to_dict()}), 200


@transfers_bp.route("/<transfer_id>/deny", methods=["POST"])
@login_required
@chapter_required
@role_required("president")
def deny_transfer(transfer_id):
    """President denies a transfer request."""
    transfer = db.session.get(ChapterTransferRequest, transfer_id)
    if not transfer:
        return jsonify({"error": "Transfer request not found."}), 404

    chapter_id = g.current_chapter.id
    if chapter_id not in (transfer.from_chapter_id, transfer.to_chapter_id):
        return jsonify({"error": "This transfer does not involve your chapter."}), 403

    if transfer.status not in ("pending", "approved_by_from"):
        return jsonify({"error": f"Transfer cannot be denied in status '{transfer.status}'."}), 400

    data = request.get_json() or {}
    denial_reason = data.get("reason", "").strip() or None

    transfer.status = "denied"
    transfer.denied_by = current_user.id
    transfer.denied_at = datetime.now(timezone.utc)
    transfer.denial_reason = denial_reason

    # Notify the member
    notification_service.create_notification(
        chapter_id=transfer.from_chapter_id,
        recipient_id=transfer.requesting_user_id,
        notification_type="member",
        title="Transfer Request Denied",
        message=f"Your transfer request to {transfer.to_chapter.name} was denied."
                + (f" Reason: {denial_reason}" if denial_reason else ""),
    )

    db.session.commit()
    return jsonify({"transfer_request": transfer.to_dict()}), 200
