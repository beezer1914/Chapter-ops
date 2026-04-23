"""
Chapter request routes.

Requester-facing (mounted under /api/onboarding/chapter-requests/*):
  POST   /                — submit a new chapter request
  GET    /mine            — the current user's latest request (for the pending screen)
  DELETE /<id>            — cancel own pending request

Approver-facing (mounted under /api/chapter-requests/*):
  GET    /pending         — list requests the current user is authorized to review
  POST   /<id>/approve    — create the chapter + period + founder membership
  POST   /<id>/reject     — reject with reason

Approver authority:
  approver_scope == "org_admin"      → user must have OrganizationMembership(role="admin") for the request's org
  approver_scope == "platform_admin" → user must match FOUNDER_EMAIL (via is_founder())
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import text as sa_text
from flask_login import current_user, login_required

from app.extensions import db
from app.models import (
    Chapter, ChapterRequest, Organization, OrganizationMembership, Region, User,
)
from app.utils.naming import normalize_chapter_name
from app.utils.platform_admin import is_founder

chapter_requests_bp = Blueprint("chapter_requests", __name__)
logger = logging.getLogger(__name__)


VALID_FOUNDER_ROLES = {"member", "secretary", "treasurer", "vice_president", "president"}
VALID_CHAPTER_TYPES = {"undergraduate", "graduate"}


def _resolve_approver_scope(organization_id: str) -> str:
    """Return 'org_admin' if the org has any active admin, else 'platform_admin'."""
    has_admin = db.session.query(OrganizationMembership.id).filter_by(
        organization_id=organization_id, role="admin", active=True
    ).first() is not None
    return "org_admin" if has_admin else "platform_admin"


def _dedup_collides(organization_id: str, region_id: str, name_normalized: str) -> bool:
    """True if an active chapter or pending request already uses this normalized name."""
    # Active chapter in this org+region with a name that normalizes the same?
    existing_chapters = (
        db.session.query(Chapter.id, Chapter.name)
        .filter_by(organization_id=organization_id, region_id=region_id)
        .all()
    )
    for _, existing_name in existing_chapters:
        if normalize_chapter_name(existing_name) == name_normalized:
            return True

    # Pending request for the same (org, region, normalized_name)?
    pending_exists = db.session.query(ChapterRequest.id).filter_by(
        organization_id=organization_id,
        region_id=region_id,
        name_normalized=name_normalized,
        status="pending",
    ).first() is not None
    return pending_exists


# ── Requester endpoints ───────────────────────────────────────────────────────

@chapter_requests_bp.route("/api/onboarding/chapter-requests", methods=["POST"])
@login_required
def submit_chapter_request():
    """Submit a new chapter request."""
    data = request.get_json() or {}

    required = ["organization_id", "region_id", "name", "chapter_type", "founder_role"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if data["chapter_type"] not in VALID_CHAPTER_TYPES:
        return jsonify({"error": "chapter_type must be 'undergraduate' or 'graduate'."}), 400

    if data["founder_role"] not in VALID_FOUNDER_ROLES:
        return jsonify({
            "error": f"founder_role must be one of: {', '.join(sorted(VALID_FOUNDER_ROLES))}."
        }), 400

    org = db.session.get(Organization, data["organization_id"])
    if not org:
        return jsonify({"error": "Organization not found."}), 404

    region = db.session.get(Region, data["region_id"])
    if not region:
        return jsonify({"error": "Region not found."}), 404
    if region.organization_id != org.id:
        return jsonify({"error": "Region does not belong to this organization."}), 400

    name = data["name"].strip()
    name_normalized = normalize_chapter_name(name)
    if not name_normalized:
        return jsonify({"error": "Chapter name cannot be empty."}), 400

    if _dedup_collides(org.id, region.id, name_normalized):
        return jsonify({
            "error": (
                "A chapter with this name already exists in this region. "
                "If this is your chapter, submit a transfer request instead."
            )
        }), 409

    approver_scope = _resolve_approver_scope(org.id)

    req = ChapterRequest(
        requester_user_id=current_user.id,
        organization_id=org.id,
        region_id=region.id,
        name=name,
        name_normalized=name_normalized,
        designation=(data.get("designation") or "").strip() or None,
        chapter_type=data["chapter_type"],
        city=(data.get("city") or "").strip() or None,
        state=(data.get("state") or "").strip() or None,
        country=(data.get("country") or "United States").strip(),
        timezone=(data.get("timezone") or "America/New_York").strip(),
        founder_role=data["founder_role"],
        approver_scope=approver_scope,
        status="pending",
    )
    db.session.add(req)
    db.session.commit()

    try:
        from app.services.chapter_request_notifications import notify_approvers_of_new_request
        notify_approvers_of_new_request(req)
    except Exception:
        logger.exception("Failed to send approver notifications for request %s", req.id)

    return jsonify({"success": True, "request": req.to_dict()}), 201


@chapter_requests_bp.route("/api/onboarding/chapter-requests/mine", methods=["GET"])
@login_required
def my_chapter_request():
    """Return the current user's most recent chapter request, or null if none."""
    req = (
        db.session.query(ChapterRequest)
        .filter_by(requester_user_id=current_user.id)
        .order_by(ChapterRequest.created_at.desc(), sa_text("rowid DESC"))
        .first()
    )
    return jsonify({"request": req.to_dict() if req else None}), 200


@chapter_requests_bp.route("/api/onboarding/chapter-requests/<request_id>", methods=["DELETE"])
@login_required
def cancel_chapter_request(request_id: str):
    """Requester cancels their own pending request."""
    req = db.session.get(ChapterRequest, request_id)
    if not req:
        return jsonify({"error": "Request not found."}), 404

    if req.requester_user_id != current_user.id:
        return jsonify({"error": "You cannot cancel another user's request."}), 403

    if req.status != "pending":
        return jsonify({"error": f"Cannot cancel a {req.status} request."}), 409

    req.status = "cancelled"
    req.acted_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({"success": True, "request": req.to_dict()}), 200
