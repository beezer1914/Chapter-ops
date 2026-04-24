"""
Onboarding routes — /api/onboarding/*

Handles the chapter creation flow:
1. User selects or creates an organization
2. User selects or creates a region
3. User creates a chapter under that region
4. User becomes the chapter's first admin/president
"""

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import Organization, OrganizationMembership, Region
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

