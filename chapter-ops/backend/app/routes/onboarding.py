"""
Onboarding routes — /api/onboarding/*

Handles the chapter creation flow:
1. User selects or creates an organization
2. User selects or creates a region
3. User creates a chapter under that region
4. User becomes the chapter's first admin/president
"""

from datetime import date

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import Organization, OrganizationMembership, Region, Chapter, ChapterMembership
from app.models.chapter_period import ChapterPeriod
from app.utils.platform_admin import require_founder

onboarding_bp = Blueprint("onboarding", __name__, url_prefix="/api/onboarding")


@onboarding_bp.route("/organizations", methods=["GET"])
@login_required
def list_organizations():
    """List all available organizations for chapter creation."""
    orgs = Organization.query.filter_by(active=True).order_by(Organization.name).all()
    return jsonify({
        "organizations": [org.to_dict() for org in orgs],
    }), 200


@onboarding_bp.route("/organizations", methods=["POST"])
@login_required
@require_founder
def create_organization():
    """
    Create a new organization.

    Platform-admin only. General users pick from the pre-seeded NPHC
    organization list instead of creating their own. Kept as an endpoint
    so the founder can add non-NPHC orgs once the platform broadens.
    """
    data = request.get_json()

    required = ["name", "abbreviation", "org_type"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if data["org_type"] not in ("fraternity", "sorority"):
        return jsonify({"error": "org_type must be 'fraternity' or 'sorority'."}), 400

    # Check for duplicate abbreviation
    existing = Organization.query.filter_by(abbreviation=data["abbreviation"].upper().strip()).first()
    if existing:
        return jsonify({"error": "An organization with this abbreviation already exists."}), 409

    org = Organization(
        name=data["name"].strip(),
        abbreviation=data["abbreviation"].upper().strip(),
        greek_letters=data.get("greek_letters", "").strip() or None,
        org_type=data["org_type"],
        council=data.get("council", "").strip() or None,
        founded_year=data.get("founded_year"),
        motto=data.get("motto", "").strip() or None,
        website=data.get("website", "").strip() or None,
        config={
            "role_titles": {
                "president": "President",
                "vice_president": "Vice President",
                "treasurer": "Treasurer",
                "secretary": "Secretary",
                "member": "Member",
            },
            "custom_member_fields": [],
        },
    )
    db.session.add(org)
    db.session.flush()

    # Make the creator an org-level admin
    org_membership = OrganizationMembership(
        user_id=current_user.id,
        organization_id=org.id,
        role="admin",
    )
    db.session.add(org_membership)
    db.session.commit()

    return jsonify({
        "success": True,
        "organization": org.to_dict(),
    }), 201


# ── Region endpoints ──────────────────────────────────────────────────


@onboarding_bp.route("/regions", methods=["GET"])
@login_required
def list_regions():
    """List active regions for a given organization."""
    org_id = request.args.get("organization_id")
    if not org_id:
        return jsonify({"error": "organization_id query parameter is required."}), 400

    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({"error": "Organization not found."}), 404

    regions = Region.query.filter_by(
        organization_id=org_id, active=True
    ).order_by(Region.name).all()

    return jsonify({"regions": [r.to_dict() for r in regions]}), 200


@onboarding_bp.route("/regions", methods=["POST"])
@login_required
def create_region():
    """Create a new region under an organization."""
    data = request.get_json()

    required = ["organization_id", "name"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    org = db.session.get(Organization, data["organization_id"])
    if not org:
        return jsonify({"error": "Organization not found."}), 404

    # Check for duplicate name within the org
    existing = Region.query.filter_by(
        organization_id=org.id, name=data["name"].strip()
    ).first()
    if existing:
        return jsonify({"error": "A region with this name already exists for this organization."}), 409

    region = Region(
        organization_id=org.id,
        name=data["name"].strip(),
        abbreviation=data.get("abbreviation", "").strip() or None,
        description=data.get("description", "").strip() or None,
        config={},
    )
    db.session.add(region)
    db.session.commit()

    return jsonify({"success": True, "region": region.to_dict()}), 201


# ── Chapter endpoint ──────────────────────────────────────────────────


@onboarding_bp.route("/chapters", methods=["POST"])
@login_required
def create_chapter():
    """
    Create a new chapter and grant the current user a membership.

    The founder declares their actual chapter role via `founder_role`
    (default "president" for backward compat). Org-level admin access is
    already granted separately when the organization is created.
    """
    data = request.get_json()

    required = ["organization_id", "region_id", "name", "chapter_type"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if data["chapter_type"] not in ("undergraduate", "graduate"):
        return jsonify({"error": "chapter_type must be 'undergraduate' or 'graduate'."}), 400

    # The founder can declare their actual chapter role. They're already the
    # org admin (granted when the organization was created), so org-level
    # settings stay accessible even if they choose "member" here.
    valid_founder_roles = {"member", "secretary", "treasurer", "vice_president", "president"}
    founder_role = (data.get("founder_role") or "president").strip()
    if founder_role not in valid_founder_roles:
        return jsonify({"error": f"founder_role must be one of: {', '.join(sorted(valid_founder_roles))}."}), 400

    # Verify organization exists
    org = db.session.get(Organization, data["organization_id"])
    if not org:
        return jsonify({"error": "Organization not found."}), 404

    # Verify region exists and belongs to this organization
    region = db.session.get(Region, data["region_id"])
    if not region:
        return jsonify({"error": "Region not found."}), 404
    if region.organization_id != org.id:
        return jsonify({"error": "Region does not belong to this organization."}), 400

    try:
        # Create the chapter
        chapter = Chapter(
            organization_id=org.id,
            region_id=region.id,
            name=data["name"].strip(),
            designation=data.get("designation", "").strip() or None,
            chapter_type=data["chapter_type"],
            city=data.get("city", "").strip() or None,
            state=data.get("state", "").strip() or None,
            country=data.get("country", "United States").strip(),
            timezone=data.get("timezone", "America/New_York").strip(),
            config={
                "fee_types": [
                    {"id": "dues", "label": "Dues", "default_amount": 0.00},
                ],
                "settings": {
                    "allow_payment_plans": True,
                },
            },
        )
        db.session.add(chapter)
        db.session.flush()  # Get chapter.id

        # Auto-create the first billing period based on chapter type
        today = date.today()
        year = today.year
        month = today.month
        if data["chapter_type"] == "undergraduate":
            # Semester-based: Spring = Jan–May, Fall = Aug–Dec, Summer = Jun–Jul
            if month <= 5:
                period_name = f"Spring {year}"
                p_start, p_end = date(year, 1, 1), date(year, 5, 31)
            elif month <= 7:
                period_name = f"Summer {year}"
                p_start, p_end = date(year, 6, 1), date(year, 7, 31)
            else:
                period_name = f"Fall {year}"
                p_start, p_end = date(year, 8, 1), date(year, 12, 31)
            period_type = "semester"
        else:
            # Annual (graduate/alumni)
            period_name = f"FY {year}"
            p_start, p_end = date(year, 1, 1), date(year, 12, 31)
            period_type = "annual"

        first_period = ChapterPeriod(
            chapter_id=chapter.id,
            name=period_name,
            period_type=period_type,
            start_date=p_start,
            end_date=p_end,
            is_active=True,
        )
        db.session.add(first_period)

        # Create the creator's chapter membership with their declared role.
        # financial_status falls back to the DB default ("not_financial") and is
        # derived from dues rows by recompute_financial_status after seeding.
        membership = ChapterMembership(
            user_id=current_user.id,
            chapter_id=chapter.id,
            role=founder_role,
            member_type=ChapterMembership.default_member_type_for(chapter),
        )
        db.session.add(membership)

        # Set this as the user's active chapter
        current_user.active_chapter_id = chapter.id

        db.session.commit()

        return jsonify({
            "success": True,
            "chapter": chapter.to_dict(),
            "membership": membership.to_dict(),
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to create chapter. Please try again."}), 500
