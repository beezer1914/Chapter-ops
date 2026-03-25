"""
Custom decorators for route protection.
"""

from functools import wraps

from flask import g, jsonify
from flask_login import current_user, login_required

from app.extensions import db


def chapter_required(f):
    """
    Decorator that ensures a chapter context is active.

    Use on any route that accesses tenant-scoped data.
    Must be used AFTER @login_required.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not g.get("current_chapter"):
            return jsonify({
                "error": "No chapter selected. Please select a chapter first."
            }), 400
        return f(*args, **kwargs)
    return decorated_function


def role_required(minimum_role: str):
    """
    Decorator that checks the user's role in the current chapter.

    Usage:
        @app.route("/api/members")
        @login_required
        @chapter_required
        @role_required("treasurer")
        def manage_members():
            ...

    Args:
        minimum_role: The minimum role level required (member, secretary,
                      treasurer, vice_president, president, admin)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            chapter = g.get("current_chapter")
            if not chapter:
                return jsonify({"error": "No chapter selected."}), 400

            membership = current_user.get_membership(chapter.id)
            if not membership:
                return jsonify({"error": "You are not a member of this chapter."}), 403

            if not membership.has_role(minimum_role):
                return jsonify({
                    "error": f"Insufficient permissions. Requires {minimum_role} or higher."
                }), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def intake_access_required(f):
    """
    Decorator for intake pipeline routes.

    Allows access to users who are either:
    - Designated intake officers (is_intake_officer=True), OR
    - Have secretary role or higher

    Must be used AFTER @login_required and @chapter_required.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        chapter = g.get("current_chapter")
        if not chapter:
            return jsonify({"error": "No chapter selected."}), 400

        membership = current_user.get_membership(chapter.id)
        if not membership or not membership.active:
            return jsonify({"error": "You are not a member of this chapter."}), 403

        if not (membership.is_intake_officer or membership.has_role("secretary")):
            return jsonify({
                "error": "Intake pipeline access requires intake officer designation or secretary role."
            }), 403

        return f(*args, **kwargs)
    return decorated_function


def _is_org_admin(user, organization_id: str) -> bool:
    """Check if user has admin role in the organization via OrganizationMembership."""
    from app.models import OrganizationMembership

    return db.session.query(OrganizationMembership).filter(
        OrganizationMembership.user_id == user.id,
        OrganizationMembership.organization_id == organization_id,
        OrganizationMembership.role == "admin",
        OrganizationMembership.active == True,
    ).first() is not None


def region_role_required(minimum_role: str):
    """
    Decorator that checks the user's role in a region.

    Extracts ``region_id`` from the URL kwargs. Grants full access to
    organization-level admins (via OrganizationMembership). Otherwise
    checks the user's RegionMembership role.

    Sets ``g.current_region`` and ``g.is_org_admin`` for use in handlers.

    Usage:
        @regions_bp.route("/<region_id>")
        @login_required
        @region_role_required("member")
        def get_region(region_id):
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from app.models import Region

            region_id = kwargs.get("region_id")
            if not region_id:
                return jsonify({"error": "Region ID required."}), 400

            region = db.session.get(Region, region_id)
            if not region:
                return jsonify({"error": "Region not found."}), 404

            # Org admins get full access
            if _is_org_admin(current_user, region.organization_id):
                g.current_region = region
                g.is_org_admin = True
                return f(*args, **kwargs)

            # Check RegionMembership (regional officer/director path)
            membership = current_user.get_region_membership(region_id)
            if membership and membership.active and membership.has_role(minimum_role):
                g.current_region = region
                g.is_org_admin = False
                return f(*args, **kwargs)

            # Any active chapter member of this org gets read-only ("member") access
            if minimum_role == "member":
                from app.models import ChapterMembership, Chapter
                is_org_member = db.session.query(ChapterMembership).join(
                    Chapter, Chapter.id == ChapterMembership.chapter_id
                ).filter(
                    Chapter.organization_id == region.organization_id,
                    Chapter.active == True,
                    ChapterMembership.user_id == current_user.id,
                    ChapterMembership.active == True,
                ).first() is not None

                if is_org_member:
                    g.current_region = region
                    g.is_org_admin = False
                    return f(*args, **kwargs)

            return jsonify({"error": "You do not have access to this region."}), 403
        return decorated_function
    return decorator
