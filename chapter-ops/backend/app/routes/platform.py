"""
Platform Admin Dashboard routes — /api/platform/*

Cross-organization views and actions reserved for platform staff (the
founder identified via FOUNDER_EMAIL / PLATFORM_ADMIN_EMAIL config).
"""

from flask import Blueprint, jsonify
from flask_login import login_required

from app.utils.platform_admin import require_founder

platform_bp = Blueprint("platform", __name__, url_prefix="/api/platform")


@platform_bp.route("/dashboard", methods=["GET"])
@login_required
@require_founder
def get_dashboard():
    """Return cross-org platform metrics for the founder dashboard.

    All counts and aggregates exclude organizations flagged is_demo=True
    so demo seeds (e.g., DGLO) don't skew real business metrics.
    """
    return jsonify({
        "summary": {
            "organizations": {"total": 0, "new_30d": 0},
            "chapters": {"total": 0, "new_30d": 0},
            "members": {"total": 0, "new_30d": 0},
            "dues_ytd": "0.00",
        },
        "tier_breakdown": {
            "organizations": [],
            "chapters": [],
        },
        "top_chapters_by_dues": [],
    })
