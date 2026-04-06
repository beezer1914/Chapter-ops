"""
Multi-tenant middleware.

Sets g.current_chapter on every request based on the authenticated user's
active chapter. All tenant-scoped queries should reference g.current_chapter.
"""

from flask import g, request
from flask_login import current_user

from app.extensions import db
from app.models.chapter import Chapter


# Routes that don't require a chapter context
TENANT_EXEMPT_PREFIXES = (
    "/api/auth/",
    "/api/onboarding/",
    "/api/organizations",
    "/api/regions",
    "/api/events/public/",
    "/webhook",
    "/static",
    "/health",
)


def init_tenant_middleware(app):
    """Register the tenant resolution middleware with the Flask app."""

    @app.before_request
    def resolve_tenant():
        """
        Before each request, resolve the current chapter (tenant) context.

        Flow:
        1. Skip if the route is tenant-exempt (auth, onboarding, webhooks)
        2. Skip if user is not authenticated
        3. Read the user's active_chapter_id
        4. Load the chapter and store it in g.current_chapter
        5. If no active chapter is set, check if user has exactly one membership
           and auto-set it
        """
        g.current_chapter = None

        # Skip tenant resolution for exempt routes
        if any(request.path.startswith(prefix) for prefix in TENANT_EXEMPT_PREFIXES):
            return

        # Skip if not authenticated
        if not current_user or not current_user.is_authenticated:
            return

        # Resolve active chapter
        active_chapter_id = current_user.active_chapter_id

        if active_chapter_id:
            chapter = db.session.get(Chapter, active_chapter_id)
            if chapter and chapter.active:
                # Block access if chapter is suspended (org admin can still access IHQ routes)
                if chapter.suspended:
                    from flask import jsonify as _jsonify
                    from app.utils.decorators import _is_org_admin
                    if not _is_org_admin(current_user, chapter.organization_id):
                        g.current_chapter = None
                        return _jsonify({
                            "error": "This chapter has been suspended.",
                            "suspension_reason": chapter.suspension_reason,
                            "suspended": True,
                        }), 403

                # Verify user actually belongs to this chapter
                membership = current_user.get_membership(chapter.id)
                if membership and membership.active:
                    # Block suspended members
                    if membership.suspended:
                        from flask import jsonify as _jsonify
                        g.current_chapter = None
                        return _jsonify({
                            "error": "Your membership has been suspended.",
                            "suspension_reason": membership.suspension_reason,
                            "suspended": True,
                        }), 403
                    g.current_chapter = chapter
                    return

        # Fallback: if user has exactly one active membership, auto-select it
        active_memberships = current_user.memberships.filter_by(active=True, suspended=False).all()
        if len(active_memberships) == 1:
            chapter = db.session.get(Chapter, active_memberships[0].chapter_id)
            if chapter and chapter.active and not chapter.suspended:
                g.current_chapter = chapter
                # Persist the auto-selection
                current_user.active_chapter_id = chapter.id
                db.session.commit()
