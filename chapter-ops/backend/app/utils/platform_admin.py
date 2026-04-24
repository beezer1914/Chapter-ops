"""Platform-admin (founder) authorization helper.

The "platform admin" / "founder" is a single user identified by the
FOUNDER_EMAIL config value. This is distinct from org admins — an org admin
is scoped to a single Organization (via OrganizationMembership), while the
founder has platform-wide authority for actions like approving chapter
requests under unclaimed organizations.
"""

from functools import wraps

from flask import current_app, jsonify
from flask_login import current_user


def _platform_admin_email() -> str:
    """Return the normalized email of the platform admin (identity).

    Prefers PLATFORM_ADMIN_EMAIL so identity can be separated from the
    delivery address in FOUNDER_EMAIL. Falls back to FOUNDER_EMAIL for
    backward compatibility (common case where login and delivery match).
    """
    explicit = (current_app.config.get("PLATFORM_ADMIN_EMAIL") or "").strip().lower()
    if explicit:
        return explicit
    return (current_app.config.get("FOUNDER_EMAIL") or "").strip().lower()


def is_founder() -> bool:
    """Return True if the current user's email matches the platform admin identity.

    Safe to call outside a Flask request context — returns False in that case
    rather than raising.
    """
    try:
        authenticated = current_user.is_authenticated
    except (RuntimeError, AttributeError):
        # No active request context (e.g. called from a CLI command or a
        # unit test without an active request) — treat as unauthenticated.
        # Flask-Login 0.6.x raises AttributeError on the proxy when there is
        # no current request; older versions raise RuntimeError.
        return False
    if not authenticated:
        return False
    admin_email = _platform_admin_email()
    if not admin_email:
        return False
    return (current_user.email or "").strip().lower() == admin_email


def require_founder(f):
    """Decorator: return 403 JSON if the caller is not the platform founder."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        if not is_founder():
            return jsonify({"error": "Platform admin access required."}), 403
        return f(*args, **kwargs)

    return wrapper
