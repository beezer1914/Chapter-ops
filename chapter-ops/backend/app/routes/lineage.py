"""
Lineage routes — /api/lineage/*

Big/little family trees, line history, and chapter milestone timeline.
All endpoints are scoped to g.current_chapter.
"""

from datetime import date

from flask import Blueprint, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import ChapterMembership, User
from app.models.milestone import ChapterMilestone, MILESTONE_TYPES
from app.utils.decorators import chapter_required, role_required

lineage_bp = Blueprint("lineage", __name__, url_prefix="/api/lineage")


# ── Helper ─────────────────────────────────────────────────────────────────────


def _is_president(chapter_id: str) -> bool:
    m = current_user.get_membership(chapter_id)
    return m is not None and m.has_role("president")


def _is_secretary_plus(chapter_id: str) -> bool:
    m = current_user.get_membership(chapter_id)
    return m is not None and m.has_role("secretary")


def _member_lineage_dict(membership: ChapterMembership) -> dict:
    """Serialize a membership with user + lineage fields for the lineage endpoints."""
    u = membership.user
    return {
        "membership_id": membership.id,
        "user_id": membership.user_id,
        "full_name": u.full_name if u else "",
        "first_name": u.first_name if u else "",
        "last_name": u.last_name if u else "",
        "profile_picture_url": u.profile_picture_url if u else None,
        "role": membership.role,
        "member_type": membership.member_type,
        "initiation_date": membership.initiation_date.isoformat() if membership.initiation_date else None,
        "big_id": membership.big_id,
        "line_season": membership.line_season,
        "line_number": membership.line_number,
        "line_name": membership.line_name,
    }


# ── Get lineage data ────────────────────────────────────────────────────────────

@lineage_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_lineage():
    """
    Return all active chapter members with lineage fields, grouped by line season.
    """
    chapter = g.current_chapter

    memberships = (
        ChapterMembership.query
        .filter_by(chapter_id=chapter.id, active=True)
        .join(User, User.id == ChapterMembership.user_id)
        .order_by(ChapterMembership.line_season.asc(), ChapterMembership.line_number.asc())
        .all()
    )

    members = [_member_lineage_dict(m) for m in memberships]

    # Group by line season
    lines: dict[str, list] = {}
    for m in members:
        season = m["line_season"] or "Unknown"
        lines.setdefault(season, [])
        lines[season].append(m)

    # Sort lines: named seasons before "Unknown", otherwise alphabetical desc
    def sort_key(k):
        return (k == "Unknown", k)

    sorted_lines = {k: lines[k] for k in sorted(lines.keys(), key=sort_key, reverse=True)}

    return jsonify({"members": members, "lines": sorted_lines}), 200


# ── Update member lineage info ──────────────────────────────────────────────────

@lineage_bp.route("/members/<membership_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("secretary")
def update_member_lineage(membership_id):
    """
    Set big_id, line_season, line_number, and/or line_name on a membership.
    Accessible to secretary+ (secretary can edit records, president can do everything).
    """
    chapter = g.current_chapter
    membership = db.session.get(ChapterMembership, membership_id)

    if not membership or membership.chapter_id != chapter.id:
        return jsonify({"error": "Membership not found."}), 404

    data = request.get_json() or {}

    if "big_id" in data:
        big_id = data["big_id"]
        if big_id:
            # Validate the big is an active member of this chapter
            big_membership = ChapterMembership.query.filter_by(
                user_id=big_id, chapter_id=chapter.id, active=True
            ).first()
            if not big_membership:
                return jsonify({"error": "Big brother/sister must be an active member of this chapter."}), 400
            if big_id == membership.user_id:
                return jsonify({"error": "A member cannot be their own big."}), 400
        membership.big_id = big_id or None

    if "line_season" in data:
        membership.line_season = (data["line_season"] or "").strip() or None

    if "line_number" in data:
        val = data["line_number"]
        if val is not None:
            try:
                membership.line_number = int(val)
            except (ValueError, TypeError):
                return jsonify({"error": "line_number must be an integer."}), 400
        else:
            membership.line_number = None

    if "line_name" in data:
        membership.line_name = (data["line_name"] or "").strip() or None

    db.session.commit()
    return jsonify(_member_lineage_dict(membership)), 200


# ── Milestones ─────────────────────────────────────────────────────────────────

@lineage_bp.route("/milestones", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_milestones():
    """List chapter milestones sorted by date desc."""
    chapter = g.current_chapter

    milestones = (
        ChapterMilestone.query
        .filter_by(chapter_id=chapter.id)
        .order_by(ChapterMilestone.date.asc())
        .all()
    )
    return jsonify({"milestones": [m.to_dict() for m in milestones]}), 200


@lineage_bp.route("/milestones", methods=["POST"])
@login_required
@chapter_required
@role_required("secretary")
def create_milestone():
    """Create a chapter history milestone."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    required = ["title", "date", "milestone_type"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if data["milestone_type"] not in MILESTONE_TYPES:
        return jsonify({"error": f"Invalid milestone_type. Must be one of: {', '.join(MILESTONE_TYPES)}"}), 400

    try:
        milestone_date = date.fromisoformat(data["date"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid date. Use YYYY-MM-DD format."}), 400

    milestone = ChapterMilestone(
        chapter_id=chapter.id,
        created_by_id=current_user.id,
        title=data["title"].strip(),
        description=data.get("description", "").strip() or None,
        milestone_type=data["milestone_type"],
        date=milestone_date,
        is_public=data.get("is_public", True),
    )
    db.session.add(milestone)
    db.session.commit()
    return jsonify(milestone.to_dict()), 201


@lineage_bp.route("/milestones/<milestone_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("secretary")
def update_milestone(milestone_id):
    """Update a chapter history milestone."""
    chapter = g.current_chapter
    milestone = db.session.get(ChapterMilestone, milestone_id)

    if not milestone or milestone.chapter_id != chapter.id:
        return jsonify({"error": "Milestone not found."}), 404

    data = request.get_json() or {}

    if "title" in data:
        milestone.title = data["title"].strip()
    if "description" in data:
        milestone.description = data["description"].strip() or None
    if "milestone_type" in data:
        if data["milestone_type"] not in MILESTONE_TYPES:
            return jsonify({"error": "Invalid milestone_type."}), 400
        milestone.milestone_type = data["milestone_type"]
    if "date" in data:
        try:
            milestone.date = date.fromisoformat(data["date"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid date."}), 400
    if "is_public" in data:
        milestone.is_public = bool(data["is_public"])

    db.session.commit()
    return jsonify(milestone.to_dict()), 200


@lineage_bp.route("/milestones/<milestone_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("secretary")
def delete_milestone(milestone_id):
    """Delete a chapter history milestone."""
    chapter = g.current_chapter
    milestone = db.session.get(ChapterMilestone, milestone_id)

    if not milestone or milestone.chapter_id != chapter.id:
        return jsonify({"error": "Milestone not found."}), 404

    db.session.delete(milestone)
    db.session.commit()
    return jsonify({"success": True}), 200
