"""
International Headquarters (IHQ) routes — /api/ihq/*

Org-admin-only endpoints providing cross-chapter, cross-region visibility.
These are tenant-exempt — no chapter context needed, scoped at organization level.
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import func

from app.extensions import db
from app.models import (
    Organization,
    Region,
    Chapter,
    ChapterMembership,
    Payment,
    Announcement,
)
from app.services.dashboard_aggregations import compute_chapter_kpis, compute_region_kpis
from app.utils.decorators import _is_org_admin

ihq_bp = Blueprint("ihq", __name__, url_prefix="/api/ihq")


def _resolve_org_id() -> str | None:
    """Derive org ID from the current user's active chapter or first active membership."""
    if current_user.active_chapter:
        return current_user.active_chapter.organization_id
    first = current_user.memberships.filter_by(active=True).first()
    if first:
        chapter = db.session.get(Chapter, first.chapter_id)
        return chapter.organization_id if chapter else None
    return None


def _require_ihq(org_id_override: str | None = None):
    """
    Resolve org + enforce IHQ admin.

    Returns (org_id, None) on success, (None, error_response) on failure.
    """
    org_id = org_id_override or _resolve_org_id()
    if not org_id:
        return None, (jsonify({"error": "No organization found."}), 400)
    if not _is_org_admin(current_user, org_id):
        return None, (jsonify({"error": "IHQ access requires organization admin role."}), 403)
    return org_id, None


# ── Dashboard ─────────────────────────────────────────────────────────────────


@ihq_bp.route("/dashboard", methods=["GET"])
@login_required
def get_dashboard():
    """
    Org-wide dashboard for IHQ staff.

    Returns:
      - Organization summary KPIs (chapters, members, financial rate, dues YTD)
      - Per-region rollup
      - Per-chapter health stats
    """
    org_id, err = _require_ihq()
    if err:
        return err

    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({"error": "Organization not found."}), 404

    # Active chapters
    active_chapters = Chapter.query.filter_by(organization_id=org_id, active=True).all()
    chapter_ids = [c.id for c in active_chapters]

    # ── Org-level aggregates ──────────────────────────────────────────────────
    total_members = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id.in_(chapter_ids),
        ChapterMembership.active == True,
    ).scalar() or 0

    financial_members = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id.in_(chapter_ids),
        ChapterMembership.active == True,
        ChapterMembership.financial_status == "financial",
    ).scalar() or 0

    financial_rate = round((financial_members / total_members * 100) if total_members else 0, 1)

    total_regions = Region.query.filter_by(organization_id=org_id, active=True).count()

    year_start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
    dues_ytd = float(
        db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.chapter_id.in_(chapter_ids),
            Payment.created_at >= year_start,
        ).scalar() or 0
    )

    # ── Region rollup ─────────────────────────────────────────────────────────
    regions = Region.query.filter_by(organization_id=org_id, active=True).order_by(Region.name).all()
    region_stats = []
    for region in regions:
        kpis = compute_region_kpis(region.id)
        region_stats.append({
            "id": region.id,
            "name": region.name,
            "abbreviation": region.abbreviation,
            "chapter_count": kpis["chapter_count"],
            "member_count": kpis["member_count"],
            "financial_rate": kpis["financial_rate"],
            "dues_ytd": kpis["dues_ytd"],
        })

    # ── Chapter health ────────────────────────────────────────────────────────
    region_by_id = {r.id: r for r in regions}
    chapter_stats = []
    for chapter in sorted(active_chapters, key=lambda c: c.name):
        kpis = compute_chapter_kpis(chapter.id)
        region = region_by_id.get(chapter.region_id) if chapter.region_id else None
        chapter_stats.append({
            "id": chapter.id,
            "name": chapter.name,
            "designation": chapter.designation,
            "region_id": chapter.region_id,
            "region_name": region.name if region else None,
            "chapter_type": chapter.chapter_type,
            "city": chapter.city,
            "state": chapter.state,
            "member_count": kpis["member_count"],
            "financial_rate": kpis["financial_rate"],
            "dues_ytd": kpis["dues_ytd"],
            "subscription_tier": chapter.subscription_tier,
            "suspended": chapter.suspended,
            "suspension_reason": chapter.suspension_reason,
            "deletion_scheduled_at": (
                chapter.deletion_scheduled_at.isoformat()
                if chapter.deletion_scheduled_at else None
            ),
        })

    return jsonify({
        "organization": org.to_dict(),
        "summary": {
            "total_chapters": len(chapter_ids),
            "total_members": total_members,
            "financial_members": financial_members,
            "financial_rate": financial_rate,
            "total_regions": total_regions,
            "dues_ytd": dues_ytd,
        },
        "regions": region_stats,
        "chapters": chapter_stats,
    }), 200


# ── Broadcast ─────────────────────────────────────────────────────────────────


@ihq_bp.route("/broadcast", methods=["POST"])
@login_required
def broadcast_announcement():
    """
    Publish an announcement to every active chapter in the organization simultaneously.

    Creates one Announcement record per chapter. Members see it in their
    chapter's Communications feed the next time they load the page.
    """
    org_id, err = _require_ihq()
    if err:
        return err

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    is_pinned = bool(data.get("is_pinned", False))
    expires_at_raw = data.get("expires_at")

    if not title:
        return jsonify({"error": "title is required."}), 400
    if not body:
        return jsonify({"error": "body is required."}), 400
    if len(title) > 255:
        return jsonify({"error": "title must be 255 characters or fewer."}), 400

    expires_at = None
    if expires_at_raw:
        try:
            expires_at = datetime.fromisoformat(
                expires_at_raw.replace("Z", "+00:00")
            )
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid expires_at. Use ISO 8601 format."}), 400

    active_chapters = Chapter.query.filter_by(organization_id=org_id, active=True).all()
    if not active_chapters:
        return jsonify({"error": "No active chapters found in this organization."}), 400

    for chapter in active_chapters:
        db.session.add(Announcement(
            chapter_id=chapter.id,
            created_by_id=current_user.id,
            title=title,
            body=body,
            is_pinned=is_pinned,
            expires_at=expires_at,
        ))

    db.session.commit()

    return jsonify({
        "success": True,
        "chapters_targeted": len(active_chapters),
    }), 201


# ── Chapter suspension ─────────────────────────────────────────────────────────


@ihq_bp.route("/chapters/<chapter_id>/suspend", methods=["POST"])
@login_required
def suspend_chapter(chapter_id):
    """
    Suspend a chapter (IHQ/org-admin only).

    Blocks all chapter members from accessing the platform until lifted.
    Org admins retain access to manage the chapter.
    """
    org_id, err = _require_ihq()
    if err:
        return err

    chapter = db.session.get(Chapter, chapter_id)
    if not chapter or chapter.organization_id != org_id or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    data = request.get_json() or {}
    reason = (data.get("reason") or "").strip() or None

    chapter.suspended = True
    chapter.suspension_reason = reason
    db.session.commit()

    return jsonify({"success": True, "chapter": chapter.to_dict()}), 200


@ihq_bp.route("/chapters/<chapter_id>/unsuspend", methods=["POST"])
@login_required
def unsuspend_chapter(chapter_id):
    """Lift a chapter suspension and restore access for all members."""
    org_id, err = _require_ihq()
    if err:
        return err

    chapter = db.session.get(Chapter, chapter_id)
    if not chapter or chapter.organization_id != org_id or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    chapter.suspended = False
    chapter.suspension_reason = None
    db.session.commit()

    return jsonify({"success": True, "chapter": chapter.to_dict()}), 200
