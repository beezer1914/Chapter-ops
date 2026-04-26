"""
Platform Admin Dashboard routes — /api/platform/*

Cross-organization views and actions reserved for platform staff (the
founder identified via FOUNDER_EMAIL / PLATFORM_ADMIN_EMAIL config).
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, jsonify
from flask_login import login_required
from sqlalchemy import distinct, extract, func

from app.extensions import db
from app.models import (
    Chapter,
    ChapterMembership,
    Organization,
    Payment,
    User,
)
from app.utils.platform_admin import require_founder

platform_bp = Blueprint("platform", __name__, url_prefix="/api/platform")

ORG_PLAN_TIERS = ["beta", "starter", "pro", "elite", "organization"]
CHAPTER_TIERS = ["starter", "pro", "elite", "organization"]


def _tier_breakdown_block():
    """Return tier counts for orgs and chapters. Always includes all tiers
    (zero-fills missing ones) so the UI doesn't have to."""
    org_rows = (
        db.session.query(Organization.plan, func.count(Organization.id))
        .filter(Organization.is_demo.is_(False), Organization.active.is_(True))
        .group_by(Organization.plan)
        .all()
    )
    org_counts = dict(org_rows)
    org_breakdown = [
        {"tier": tier, "count": int(org_counts.get(tier, 0))}
        for tier in ORG_PLAN_TIERS
    ]

    chapter_rows = (
        db.session.query(Chapter.subscription_tier, func.count(Chapter.id))
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(
            Organization.is_demo.is_(False),
            Chapter.active.is_(True),
        )
        .group_by(Chapter.subscription_tier)
        .all()
    )
    chapter_counts = dict(chapter_rows)
    chapter_breakdown = [
        {"tier": tier, "count": int(chapter_counts.get(tier, 0))}
        for tier in CHAPTER_TIERS
    ]

    return {"organizations": org_breakdown, "chapters": chapter_breakdown}


def _summary_block():
    """Compute the summary tile values."""
    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=30)
    current_year = now.year

    # Organizations (real, active, non-demo)
    org_base = Organization.query.filter_by(is_demo=False, active=True)
    orgs_total = org_base.count()
    orgs_new_30d = org_base.filter(Organization.created_at >= cutoff_30d).count()

    # Chapters (active, in real orgs)
    chap_base = (
        Chapter.query
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(Organization.is_demo.is_(False), Chapter.active.is_(True))
    )
    chapters_total = chap_base.count()
    chapters_new_30d = chap_base.filter(Chapter.created_at >= cutoff_30d).count()

    # Members — distinct users with at least one active membership in a real, active chapter
    members_total = (
        db.session.query(func.count(distinct(ChapterMembership.user_id)))
        .join(Chapter, ChapterMembership.chapter_id == Chapter.id)
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(
            Organization.is_demo.is_(False),
            Chapter.active.is_(True),
            ChapterMembership.active.is_(True),
        )
        .scalar()
    ) or 0

    # New members (new accounts in last 30d, with at least one real membership)
    members_new_30d = (
        db.session.query(func.count(distinct(ChapterMembership.user_id)))
        .join(Chapter, ChapterMembership.chapter_id == Chapter.id)
        .join(Organization, Chapter.organization_id == Organization.id)
        .join(User, ChapterMembership.user_id == User.id)
        .filter(
            Organization.is_demo.is_(False),
            Chapter.active.is_(True),
            ChapterMembership.active.is_(True),
            User.created_at >= cutoff_30d,
        )
        .scalar()
    ) or 0

    # Dues YTD — sum of Payment.amount for current year, real chapters only
    dues_ytd = (
        db.session.query(func.coalesce(func.sum(Payment.amount), Decimal("0")))
        .join(Chapter, Payment.chapter_id == Chapter.id)
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(
            Organization.is_demo.is_(False),
            extract("year", Payment.created_at) == current_year,
        )
        .scalar()
    )

    return {
        "organizations": {"total": orgs_total, "new_30d": orgs_new_30d},
        "chapters": {"total": chapters_total, "new_30d": chapters_new_30d},
        "members": {"total": members_total, "new_30d": members_new_30d},
        "dues_ytd": f"{Decimal(dues_ytd):.2f}",
    }


@platform_bp.route("/dashboard", methods=["GET"])
@login_required
@require_founder
def get_dashboard():
    """Return cross-org platform metrics for the founder dashboard.

    All counts and aggregates exclude organizations flagged is_demo=True
    so demo seeds (e.g., DGLO) don't skew real business metrics.
    """
    return jsonify({
        "summary": _summary_block(),
        "tier_breakdown": _tier_breakdown_block(),
        "top_chapters_by_dues": [],
    })
