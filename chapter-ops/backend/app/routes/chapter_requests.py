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


def _dedup_collides(
    organization_id: str,
    region_id: str,
    name_normalized: str,
    exclude_request_id: str | None = None,
) -> bool:
    """True if an active chapter or pending request already uses this normalized name.

    Pass *exclude_request_id* when calling from the approve endpoint so the
    request being approved does not match itself in the pending-request check.
    """
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
    q = db.session.query(ChapterRequest.id).filter_by(
        organization_id=organization_id,
        region_id=region_id,
        name_normalized=name_normalized,
        status="pending",
    )
    if exclude_request_id is not None:
        q = q.filter(ChapterRequest.id != exclude_request_id)
    return q.first() is not None


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
        .order_by(ChapterRequest.created_at.desc())
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


# ── Approver endpoints ────────────────────────────────────────────────────────

def _orgs_user_admins(user_id: str) -> list[str]:
    """Return list of organization_ids where the user is an active admin."""
    rows = db.session.query(OrganizationMembership.organization_id).filter_by(
        user_id=user_id, role="admin", active=True
    ).all()
    return [r[0] for r in rows]


@chapter_requests_bp.route("/api/chapter-requests/pending", methods=["GET"])
@login_required
def list_pending_chapter_requests():
    """
    List chapter requests the caller is authorized to act on.

    - If the caller is an org admin of any org, they see pending `org_admin`-scoped
      requests for THOSE orgs.
    - If the caller is the platform founder, they additionally see pending
      `platform_admin`-scoped requests.
    - Everyone else sees an empty list (no 403 — approvers don't need to know
      this endpoint exists).
    """
    admin_org_ids = _orgs_user_admins(current_user.id)
    results: list[ChapterRequest] = []

    if admin_org_ids:
        results.extend(
            db.session.query(ChapterRequest)
            .filter(
                ChapterRequest.status == "pending",
                ChapterRequest.approver_scope == "org_admin",
                ChapterRequest.organization_id.in_(admin_org_ids),
            )
            .order_by(ChapterRequest.created_at.asc())
            .all()
        )

    if is_founder():
        results.extend(
            db.session.query(ChapterRequest)
            .filter(
                ChapterRequest.status == "pending",
                ChapterRequest.approver_scope == "platform_admin",
            )
            .order_by(ChapterRequest.created_at.asc())
            .all()
        )

    return jsonify({"requests": [r.to_dict() for r in results]}), 200


def _caller_can_act_on(req: ChapterRequest) -> bool:
    """True if the current user is authorized to approve/reject this request."""
    if req.approver_scope == "platform_admin":
        return is_founder()
    # org_admin scope — requires an admin OrganizationMembership for this specific org
    return db.session.query(OrganizationMembership.id).filter_by(
        user_id=current_user.id,
        organization_id=req.organization_id,
        role="admin",
        active=True,
    ).first() is not None


@chapter_requests_bp.route("/api/chapter-requests/<request_id>/approve", methods=["POST"])
@login_required
def approve_chapter_request(request_id: str):
    """Approve a pending chapter request: create the Chapter + period + membership."""
    # Lock the row for the duration of this transaction to prevent double-approve races.
    # SQLite is a no-op for with_for_update; the status-check below is the real guard there.
    req = (
        db.session.query(ChapterRequest)
        .filter_by(id=request_id)
        .with_for_update()
        .first()
    )
    if not req:
        return jsonify({"error": "Request not found."}), 404

    if req.status != "pending":
        return jsonify({"error": f"Request is already {req.status}."}), 409

    if not _caller_can_act_on(req):
        return jsonify({"error": "You are not authorized to approve this request."}), 403

    # Re-check dedup against live chapters — state may have changed since submit.
    # Exclude the request itself from the pending-request half of the check.
    if _dedup_collides(req.organization_id, req.region_id, req.name_normalized, exclude_request_id=req.id):
        return jsonify({
            "error": (
                "A chapter with this name already exists in this region. "
                "Reject this request or ask the founder to choose a different name."
            )
        }), 409

    requester = db.session.get(User, req.requester_user_id)
    org = db.session.get(Organization, req.organization_id)
    region = db.session.get(Region, req.region_id)

    from app.services.chapter_service import create_chapter_with_founder

    try:
        chapter, _period, _membership = create_chapter_with_founder(
            requester=requester,
            organization=org,
            region=region,
            name=req.name,
            designation=req.designation,
            chapter_type=req.chapter_type,
            city=req.city,
            state=req.state,
            country=req.country,
            timezone=req.timezone,
            founder_role=req.founder_role,
        )

        req.status = "approved"
        req.approved_by_user_id = current_user.id
        req.resulting_chapter_id = chapter.id
        req.acted_at = datetime.now(timezone.utc)

        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to approve chapter request %s", req.id)
        return jsonify({"error": "Failed to approve request. Please try again."}), 500

    try:
        from app.services.chapter_request_notifications import notify_requester_approved
        notify_requester_approved(req)
    except Exception:
        logger.exception("Failed to send approval notification for %s", req.id)

    return jsonify({
        "success": True,
        "chapter": chapter.to_dict(),
        "request": req.to_dict(),
    }), 200
