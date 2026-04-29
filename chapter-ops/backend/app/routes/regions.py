"""
Region management routes — /api/regions/*

Cross-chapter routes for managing regions and regional officers.
Tenant-exempt — these operate outside the chapter tenant boundary.
"""

import logging
from decimal import Decimal

from flask import Blueprint, jsonify, request, g
from flask_login import current_user, login_required

from app.extensions import db
from app.models import (
    Invoice,
    Organization,
    OrganizationMembership,
    Region,
    RegionMembership,
    Chapter,
    ChapterMembership,
    User,
)
from app.utils.decorators import region_role_required, _is_org_admin
from app.services.dashboard_aggregations import (
    compute_chapter_kpis, compute_region_kpis,
)
from app.utils.region_permissions import (
    REGIONAL_OFFICER_ROLES, can_view_region_dashboard,
)

logger = logging.getLogger(__name__)

# Mirrors Invoice.status enum; keep in sync with Invoice model
REGIONAL_INVOICE_STATUSES = ("draft", "sent", "paid", "overdue", "cancelled")

regions_bp = Blueprint("regions", __name__, url_prefix="/api/regions")


# ── List regions ─────────────────────────────────────────────────────────


@regions_bp.route("", methods=["GET"])
@login_required
def list_regions():
    """List regions the current user has access to.

    Org admins see all regions for their organization.
    Regional directors/members see only regions they belong to.
    """
    # Determine org from query param or user's active chapter
    org_id = request.args.get("organization_id")

    if not org_id:
        if current_user.active_chapter:
            org_id = current_user.active_chapter.organization_id
        else:
            first = current_user.memberships.filter_by(active=True).first()
            if first:
                chapter = db.session.get(Chapter, first.chapter_id)
                org_id = chapter.organization_id if chapter else None

    if not org_id:
        return jsonify({"regions": [], "is_org_admin": False, "is_regional_director": False, "regions_with_dashboard_access": []}), 200

    is_admin = _is_org_admin(current_user, org_id)

    # Verify user belongs to this org (via any active chapter membership)
    is_org_member = db.session.query(ChapterMembership).join(
        Chapter, Chapter.id == ChapterMembership.chapter_id
    ).filter(
        Chapter.organization_id == org_id,
        Chapter.active == True,
        ChapterMembership.user_id == current_user.id,
        ChapterMembership.active == True,
    ).first() is not None

    if not is_admin and not is_org_member:
        return jsonify({"regions": [], "is_org_admin": False, "is_regional_director": False, "regions_with_dashboard_access": []}), 200

    # All org members see all active regions (read-only access is enforced per route)
    regions = Region.query.filter_by(
        organization_id=org_id, active=True
    ).order_by(Region.name).all()

    # Check if current user is a regional director in any region for this org
    is_regional_director = db.session.query(RegionMembership).join(
        Region, Region.id == RegionMembership.region_id
    ).filter(
        Region.organization_id == org_id,
        Region.active == True,
        RegionMembership.user_id == current_user.id,
        RegionMembership.role == "regional_director",
        RegionMembership.active == True,
    ).first() is not None

    regions_with_dashboard_access = [
        r.id for r in regions if can_view_region_dashboard(current_user, r)
    ]

    result = []
    for r in regions:
        data = r.to_dict()
        data["chapter_count"] = r.chapters.filter_by(active=True).count()
        data["member_count"] = r.memberships.filter_by(active=True).count()
        result.append(data)

    return jsonify({
        "regions": result,
        "is_org_admin": is_admin,
        "is_regional_director": is_regional_director,
        "regions_with_dashboard_access": regions_with_dashboard_access,
    }), 200


# ── Region detail ────────────────────────────────────────────────────────


@regions_bp.route("/<region_id>", methods=["GET"])
@login_required
@region_role_required("member")
def get_region(region_id):
    """Get region detail with chapters and regional officers."""
    region = g.current_region

    # Chapters in this region
    chapters = region.chapters.filter_by(active=True).order_by(Chapter.name).all()
    chapter_data = []
    for ch in chapters:
        member_count = ch.memberships.filter_by(active=True).count()
        d = ch.to_dict()
        d["member_count"] = member_count
        chapter_data.append(d)

    # Regional officers/members
    memberships = region.memberships.filter_by(active=True).all()
    members_data = []
    for rm in memberships:
        user = db.session.get(User, rm.user_id)
        if user:
            entry = rm.to_dict()
            entry["user"] = {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "full_name": user.full_name,
            }
            members_data.append(entry)

    # Current user's role in this specific region (None if not a regional officer)
    user_region_membership = current_user.get_region_membership(region.id)
    current_user_role = (
        user_region_membership.role
        if user_region_membership and user_region_membership.active
        else None
    )

    return jsonify({
        "region": region.to_dict(),
        "chapters": chapter_data,
        "members": members_data,
        "is_org_admin": g.is_org_admin,
        "current_user_region_role": current_user_role,
    }), 200


# ── Per-region dashboard ─────────────────────────────────────────────────


@regions_bp.route("/<region_id>/dashboard", methods=["GET"])
@login_required
def region_dashboard(region_id: str):
    """Per-region dashboard payload for regional officers and admins."""
    region = db.session.get(Region, region_id)
    if region is None or not region.active:
        return jsonify({"error": "Region not found."}), 404

    if not can_view_region_dashboard(current_user, region):
        return jsonify({"error": "You do not have access to this region."}), 403

    region_kpis = compute_region_kpis(region.id)

    chapters = Chapter.query.filter_by(
        region_id=region.id, active=True,
    ).order_by(Chapter.name).all()

    chapter_rows = []
    for chapter in chapters:
        try:
            kpis = compute_chapter_kpis(chapter.id)
            chapter_rows.append({
                "id": chapter.id,
                "name": chapter.name,
                "designation": chapter.designation,
                "chapter_type": chapter.chapter_type,
                "city": chapter.city,
                "state": chapter.state,
                "member_count": kpis["member_count"],
                "financial_rate": kpis["financial_rate"],
                "dues_ytd": f"{kpis['dues_ytd']:.2f}",
                "subscription_tier": chapter.subscription_tier,
                "suspended": chapter.suspended,
                "deletion_scheduled_at": (
                    chapter.deletion_scheduled_at.isoformat()
                    if chapter.deletion_scheduled_at else None
                ),
            })
        except Exception:
            logger.exception("Failed to compute KPIs for chapter %s", chapter.id)
            chapter_rows.append({
                "id": chapter.id,
                "name": chapter.name,
                "designation": chapter.designation,
                "chapter_type": chapter.chapter_type,
                "city": chapter.city,
                "state": chapter.state,
                "member_count": None,
                "financial_rate": None,
                "dues_ytd": None,
                "subscription_tier": chapter.subscription_tier,
                "suspended": chapter.suspended,
                "deletion_scheduled_at": (
                    chapter.deletion_scheduled_at.isoformat()
                    if chapter.deletion_scheduled_at else None
                ),
            })

    # Invoice snapshot — counts by status, total outstanding
    invoice_counts = {s: 0 for s in REGIONAL_INVOICE_STATUSES}
    outstanding_total = Decimal("0")
    invoices = Invoice.query.filter_by(region_id=region.id).all()
    for inv in invoices:
        if inv.status in invoice_counts:
            invoice_counts[inv.status] += 1
        if inv.status in ("sent", "overdue"):
            outstanding_total += Decimal(str(inv.amount or 0))

    # Officer summary — top 5 active officers, formal roles only
    officer_memberships = (
        db.session.query(RegionMembership)
        .filter(
            RegionMembership.region_id == region.id,
            RegionMembership.active == True,
            RegionMembership.role.in_(list(REGIONAL_OFFICER_ROLES)),
        )
        .limit(5)
        .all()
    )
    officer_summary = []
    for m in officer_memberships:
        user = db.session.get(User, m.user_id)
        if user is None:
            continue
        officer_summary.append({
            "user_id": user.id,
            "full_name": user.full_name,
            "role": m.role,
        })

    return jsonify({
        "region": {
            "id": region.id,
            "name": region.name,
            "abbreviation": region.abbreviation,
            "description": region.description,
        },
        "kpis": {
            **{k: v for k, v in region_kpis.items() if k != "dues_ytd"},
            "dues_ytd": f"{region_kpis['dues_ytd']:.2f}",
            "invoices_outstanding_total": f"{outstanding_total:.2f}",
        },
        "chapters": chapter_rows,
        "invoice_snapshot": {
            **invoice_counts,
            "outstanding_total": f"{outstanding_total:.2f}",
        },
        "officer_summary": officer_summary,
        "agent_findings": [],
    }), 200


# ── Update region ────────────────────────────────────────────────────────


@regions_bp.route("/<region_id>", methods=["PUT"])
@login_required
@region_role_required("regional_director")
def update_region(region_id):
    """Update region name, abbreviation, or description."""
    region = g.current_region
    data = request.get_json()

    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            return jsonify({"error": "Region name cannot be empty."}), 400
        # Check uniqueness within org
        existing = Region.query.filter(
            Region.organization_id == region.organization_id,
            Region.name == new_name,
            Region.id != region.id,
        ).first()
        if existing:
            return jsonify({"error": "A region with this name already exists."}), 409
        region.name = new_name

    if "abbreviation" in data:
        region.abbreviation = data["abbreviation"].strip() or None

    if "description" in data:
        region.description = data["description"].strip() or None

    db.session.commit()
    return jsonify({"region": region.to_dict()}), 200


# ── Chapter reassignment ─────────────────────────────────────────────────


@regions_bp.route("/<region_id>/chapters/<chapter_id>", methods=["PATCH"])
@login_required
@region_role_required("member")
def reassign_chapter(region_id, chapter_id):
    """Move a chapter into this region. Org admin only."""
    if not g.is_org_admin:
        return jsonify({"error": "Only organization admins can reassign chapters."}), 403

    region = g.current_region
    chapter = db.session.get(Chapter, chapter_id)
    if not chapter or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    if chapter.organization_id != region.organization_id:
        return jsonify({"error": "Chapter does not belong to this organization."}), 400

    if chapter.region_id == region.id:
        return jsonify({"error": "Chapter is already in this region."}), 400

    chapter.region_id = region.id
    db.session.commit()

    return jsonify({
        "success": True,
        "chapter": chapter.to_dict(),
    }), 200


# ── Regional members ─────────────────────────────────────────────────────


@regions_bp.route("/<region_id>/members", methods=["GET"])
@login_required
@region_role_required("member")
def list_region_members(region_id):
    """List regional memberships with user info."""
    region = g.current_region
    memberships = region.memberships.filter_by(active=True).all()

    result = []
    for rm in memberships:
        user = db.session.get(User, rm.user_id)
        if user:
            entry = rm.to_dict()
            entry["user"] = {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "full_name": user.full_name,
            }
            result.append(entry)

    return jsonify({"members": result}), 200


@regions_bp.route("/<region_id>/members", methods=["POST"])
@login_required
@region_role_required("member")
def assign_region_member(region_id):
    """Assign a user to a region. Org admin only."""
    if not g.is_org_admin:
        return jsonify({"error": "Only organization admins can assign regional members."}), 403

    region = g.current_region
    data = request.get_json()

    user_id = data.get("user_id")
    role = data.get("role", "member")

    if not user_id:
        return jsonify({"error": "user_id is required."}), 400

    if role not in RegionMembership.ROLE_HIERARCHY:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(RegionMembership.ROLE_HIERARCHY.keys())}"}), 400

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found."}), 404

    # Check for existing membership (including inactive)
    existing = RegionMembership.query.filter_by(
        user_id=user_id, region_id=region.id
    ).first()

    if existing and existing.active:
        return jsonify({"error": "User already has an active membership in this region."}), 409

    if existing:
        # Reactivate
        existing.active = True
        existing.role = role
        membership = existing
    else:
        membership = RegionMembership(
            user_id=user_id,
            region_id=region.id,
            role=role,
        )
        db.session.add(membership)

    db.session.commit()

    entry = membership.to_dict()
    entry["user"] = {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.full_name,
    }

    return jsonify({"membership": entry}), 201


@regions_bp.route("/<region_id>/members/<membership_id>", methods=["PATCH"])
@login_required
@region_role_required("member")
def update_region_member(region_id, membership_id):
    """Update a regional membership role. Org admin only."""
    if not g.is_org_admin:
        return jsonify({"error": "Only organization admins can update regional roles."}), 403

    membership = db.session.get(RegionMembership, membership_id)
    if not membership or membership.region_id != region_id:
        return jsonify({"error": "Regional membership not found."}), 404

    data = request.get_json()
    role = data.get("role")

    if not role or role not in RegionMembership.ROLE_HIERARCHY:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(RegionMembership.ROLE_HIERARCHY.keys())}"}), 400

    membership.role = role
    db.session.commit()

    user = db.session.get(User, membership.user_id)
    entry = membership.to_dict()
    if user:
        entry["user"] = {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
        }

    return jsonify({"membership": entry}), 200


@regions_bp.route("/<region_id>/members/<membership_id>", methods=["DELETE"])
@login_required
@region_role_required("member")
def remove_region_member(region_id, membership_id):
    """Remove (deactivate) a regional membership. Org admin only."""
    if not g.is_org_admin:
        return jsonify({"error": "Only organization admins can remove regional members."}), 403

    membership = db.session.get(RegionMembership, membership_id)
    if not membership or membership.region_id != region_id:
        return jsonify({"error": "Regional membership not found."}), 404

    membership.active = False
    db.session.commit()

    return jsonify({"success": True}), 200


# ── User search for assignment ───────────────────────────────────────────


@regions_bp.route("/<region_id>/users", methods=["GET"])
@login_required
@region_role_required("member")
def search_eligible_users(region_id):
    """Search users in the organization eligible for regional assignment.

    Returns users who are members of any chapter in the same organization
    and do NOT already have an active membership in this region.
    """
    if not g.is_org_admin:
        return jsonify({"error": "Only organization admins can search users."}), 403

    region = g.current_region
    q = request.args.get("q", "").strip()

    # Users in this org's chapters
    org_user_ids = (
        db.session.query(ChapterMembership.user_id)
        .join(Chapter)
        .filter(
            Chapter.organization_id == region.organization_id,
            Chapter.active == True,
            ChapterMembership.active == True,
        )
        .distinct()
    )

    # Exclude users already in this region
    existing_region_user_ids = (
        db.session.query(RegionMembership.user_id)
        .filter(
            RegionMembership.region_id == region.id,
            RegionMembership.active == True,
        )
    )

    query = User.query.filter(
        User.id.in_(org_user_ids),
        ~User.id.in_(existing_region_user_ids),
        User.active == True,
    )

    if q:
        search = f"%{q}%"
        query = query.filter(
            db.or_(
                User.first_name.ilike(search),
                User.last_name.ilike(search),
                User.email.ilike(search),
            )
        )

    users = query.order_by(User.last_name, User.first_name).limit(25).all()

    return jsonify({
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "full_name": u.full_name,
            }
            for u in users
        ]
    }), 200


# ── Org directory (cross-chapter search) ─────────────────────────────────


@regions_bp.route("/directory", methods=["GET"])
@login_required
def org_directory():
    """
    Search chapters and members across the user's organization.

    Any active org member can call this. Returns matching chapters (with
    member count) and members (with their chapter name and role).

    Query params:
        q: search string (matches chapter name, or member name/email)
    """
    # Resolve org from user's active chapter
    org_id = None
    if current_user.active_chapter:
        org_id = current_user.active_chapter.organization_id
    if not org_id:
        first = current_user.memberships.filter_by(active=True).first()
        if first:
            chapter = db.session.get(Chapter, first.chapter_id)
            org_id = chapter.organization_id if chapter else None

    if not org_id:
        return jsonify({"chapters": [], "members": []}), 200

    # Verify user belongs to this org
    is_member = db.session.query(ChapterMembership).join(
        Chapter, Chapter.id == ChapterMembership.chapter_id
    ).filter(
        Chapter.organization_id == org_id,
        Chapter.active == True,
        ChapterMembership.user_id == current_user.id,
        ChapterMembership.active == True,
    ).first() is not None

    if not is_member and not _is_org_admin(current_user, org_id):
        return jsonify({"chapters": [], "members": []}), 200

    q = request.args.get("q", "").strip()
    search = f"%{q}%" if q else "%"

    # Chapter search
    chapter_query = Chapter.query.filter(
        Chapter.organization_id == org_id,
        Chapter.active == True,
        Chapter.name.ilike(search),
    ).order_by(Chapter.name).limit(20)

    chapters_result = []
    for ch in chapter_query:
        d = ch.to_dict()
        d["member_count"] = ch.memberships.filter_by(active=True).count()
        chapters_result.append(d)

    # Member search across all org chapters
    member_query = (
        db.session.query(User, ChapterMembership, Chapter)
        .join(ChapterMembership, ChapterMembership.user_id == User.id)
        .join(Chapter, Chapter.id == ChapterMembership.chapter_id)
        .filter(
            Chapter.organization_id == org_id,
            Chapter.active == True,
            ChapterMembership.active == True,
            User.active == True,
            db.or_(
                User.first_name.ilike(search),
                User.last_name.ilike(search),
                User.email.ilike(search),
            ),
        )
        .order_by(User.last_name, User.first_name)
        .limit(30)
    )

    members_result = []
    seen_user_chapter = set()
    for user, membership, chapter in member_query:
        key = (user.id, chapter.id)
        if key in seen_user_chapter:
            continue
        seen_user_chapter.add(key)
        members_result.append({
            "id": user.id,
            "full_name": user.full_name,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "profile_picture_url": user.profile_picture_url,
            "chapter_name": chapter.name,
            "chapter_id": chapter.id,
            "role": membership.role,
            "financial_status": membership.financial_status,
        })

    return jsonify({"chapters": chapters_result, "members": members_result}), 200


@regions_bp.route("/directory/members/<user_id>", methods=["GET"])
@login_required
def directory_member_detail(user_id):
    """
    Return detailed info for a single member in the org directory.

    Query params:
        chapter_id: the chapter context for this member's membership
    """
    chapter_id = request.args.get("chapter_id")
    if not chapter_id:
        return jsonify({"error": "chapter_id query param is required."}), 400

    # Resolve the caller's org
    org_id = None
    if current_user.active_chapter:
        org_id = current_user.active_chapter.organization_id
    if not org_id:
        first = current_user.memberships.filter_by(active=True).first()
        if first:
            ch = db.session.get(Chapter, first.chapter_id)
            org_id = ch.organization_id if ch else None

    if not org_id:
        return jsonify({"error": "Could not determine your organization."}), 403

    # Verify the caller belongs to this org
    is_member = db.session.query(ChapterMembership).join(
        Chapter, Chapter.id == ChapterMembership.chapter_id
    ).filter(
        Chapter.organization_id == org_id,
        Chapter.active == True,
        ChapterMembership.user_id == current_user.id,
        ChapterMembership.active == True,
    ).first() is not None

    if not is_member and not _is_org_admin(current_user, org_id):
        return jsonify({"error": "Not authorized."}), 403

    # Load the target user + membership in the specified chapter
    user = db.session.get(User, user_id)
    if not user or not user.active:
        return jsonify({"error": "Member not found."}), 404

    chapter = db.session.get(Chapter, chapter_id)
    if not chapter or chapter.organization_id != org_id or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    membership = ChapterMembership.query.filter_by(
        user_id=user_id, chapter_id=chapter_id, active=True
    ).first()
    if not membership:
        return jsonify({"error": "Member not found in this chapter."}), 404

    # Resolve custom field definitions from org config
    org = db.session.get(Organization, org_id)
    field_defs = (org.config or {}).get("custom_member_fields", []) if org else []

    return jsonify({
        "member": {
            "id": user.id,
            "full_name": user.full_name,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "phone": user.phone,
            "profile_picture_url": user.profile_picture_url,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "chapter_name": chapter.name,
            "chapter_id": chapter.id,
            "chapter_designation": chapter.designation,
            "chapter_city": chapter.city,
            "chapter_state": chapter.state,
            "role": membership.role,
            "financial_status": membership.financial_status,
            "initiation_date": membership.initiation_date.isoformat() if membership.initiation_date else None,
            "join_date": membership.join_date.isoformat() if membership.join_date else None,
            "custom_fields": membership.custom_fields,
            "custom_field_definitions": field_defs,
        }
    }), 200
