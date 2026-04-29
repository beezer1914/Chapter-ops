"""KPI aggregation helpers shared by IHQ and Regional dashboards.

Centralizes the math that was previously inlined in routes/ihq.py so the
two dashboards always produce identical numbers for the same input.
"""

from datetime import datetime, timezone

from sqlalchemy import func

from app.extensions import db
from app.models import Chapter, ChapterMembership, Payment


def year_start():
    return datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)


def compute_chapter_kpis(chapter_id: str) -> dict:
    """Return {member_count, financial_rate, dues_ytd} for one chapter."""
    total = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id == chapter_id,
        ChapterMembership.active == True,
    ).scalar() or 0

    financial = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id == chapter_id,
        ChapterMembership.active == True,
        ChapterMembership.financial_status == "financial",
    ).scalar() or 0

    dues = float(
        db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.chapter_id == chapter_id,
            Payment.created_at >= year_start(),
        ).scalar() or 0
    )

    return {
        "member_count": total,
        "financial_rate": round((financial / total * 100) if total else 0, 1),
        "dues_ytd": dues,
    }


def compute_region_kpis(region_id: str) -> dict:
    """Return aggregate KPIs across all active chapters in a region."""
    chapters = Chapter.query.filter_by(region_id=region_id, active=True).all()
    chapter_ids = [c.id for c in chapters]

    chapter_count = len(chapters)
    chapter_count_suspended = sum(1 for c in chapters if c.suspended)
    chapter_count_active = chapter_count - chapter_count_suspended

    if not chapter_ids:
        return {
            "chapter_count": 0,
            "chapter_count_active": 0,
            "chapter_count_suspended": 0,
            "member_count": 0,
            "financial_rate": 0.0,
            "dues_ytd": 0.0,
        }

    total = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id.in_(chapter_ids),
        ChapterMembership.active == True,
    ).scalar() or 0

    financial = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id.in_(chapter_ids),
        ChapterMembership.active == True,
        ChapterMembership.financial_status == "financial",
    ).scalar() or 0

    dues = float(
        db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.chapter_id.in_(chapter_ids),
            Payment.created_at >= year_start(),
        ).scalar() or 0
    )

    return {
        "chapter_count": chapter_count,
        "chapter_count_active": chapter_count_active,
        "chapter_count_suspended": chapter_count_suspended,
        "member_count": total,
        "financial_rate": round((financial / total * 100) if total else 0, 1),
        "dues_ytd": dues,
    }
