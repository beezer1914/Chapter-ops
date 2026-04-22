"""
Module-level access enforcement.

Mirrors the frontend ``DEFAULT_PERMISSIONS`` map in
``frontend/src/lib/permissions.ts`` — **keep the two in sync**. A chapter
president can override these via Settings → Access Control, persisted to
``chapter.config.permissions``.

Usage — register one ``before_request`` per module-gated blueprint:

    from app.utils.permissions import enforce_module_access

    @payments_bp.before_request
    def _gate():
        return enforce_module_access("payments")

The hook returns ``None`` on pass-through (route runs normally) or a
``(json, status)`` tuple on denial. Org admins always bypass. Requests
without an authenticated user or chapter context pass through so
``@login_required`` / ``@chapter_required`` can handle them.
"""

from flask import g, jsonify
from flask_login import current_user

from app.models import ChapterMembership
from app.utils.decorators import _is_org_admin


DEFAULT_PERMISSIONS: dict[str, str] = {
    "dashboard":      "member",
    "payments":       "member",
    "expenses":       "member",
    "events":         "member",
    "knowledge_base": "member",
    "lineage":        "member",
    "documents":      "member",
    "communications": "member",
    "regions":        "member",
    "members":        "member",
    "invites":        "secretary",
    "intake":         "secretary",
    "workflows":      "member",
    "invoices":       "member",
    "donations":      "member",
}


def enforce_module_access(module: str):
    """Check module permission for the current request.

    Returns ``None`` to pass through, or a ``(response, status)`` tuple
    to short-circuit with a 403.
    """
    if not current_user or not current_user.is_authenticated:
        return None  # @login_required will handle

    chapter = g.get("current_chapter")
    if not chapter:
        return None  # @chapter_required will handle

    if _is_org_admin(current_user, chapter.organization_id):
        return None

    # Intake officers get module access regardless of chapter role
    if module == "intake":
        membership = current_user.get_membership(chapter.id)
        if membership and membership.is_intake_officer:
            return None

    config = chapter.config if isinstance(chapter.config, dict) else {}
    permissions = config.get("permissions") if isinstance(config.get("permissions"), dict) else {}

    min_role = permissions.get(module)
    # Fall back to default if override is missing or not a known role
    if min_role not in ChapterMembership.ROLE_HIERARCHY:
        min_role = DEFAULT_PERMISSIONS.get(module, "member")

    membership = current_user.get_membership(chapter.id)
    if not membership or not membership.has_role(min_role):
        return jsonify({
            "error": f"Insufficient permissions. The '{module}' module requires {min_role} or higher."
        }), 403

    return None
