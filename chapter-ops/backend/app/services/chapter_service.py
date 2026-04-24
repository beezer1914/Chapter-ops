"""
Chapter creation service.

Single source of truth for creating a new Chapter + initial ChapterPeriod +
founder ChapterMembership. Called by the chapter-request approve endpoint
and (transitionally) by the legacy onboarding.create_chapter endpoint.

Caller is responsible for db.session.commit() — this function only flushes.
"""

from datetime import date

from app.extensions import db
from app.models import Chapter, ChapterMembership, Organization, Region, User
from app.models.chapter_period import ChapterPeriod


def _build_first_period(chapter_id: str, chapter_type: str) -> ChapterPeriod:
    """Mirror the auto-period logic previously inlined in onboarding.create_chapter."""
    today = date.today()
    year = today.year
    month = today.month

    if chapter_type == "undergraduate":
        if month <= 5:
            period_name, p_start, p_end = f"Spring {year}", date(year, 1, 1), date(year, 5, 31)
        elif month <= 7:
            period_name, p_start, p_end = f"Summer {year}", date(year, 6, 1), date(year, 7, 31)
        else:
            period_name, p_start, p_end = f"Fall {year}", date(year, 8, 1), date(year, 12, 31)
        period_type = "semester"
    else:
        period_name = f"FY {year}"
        p_start, p_end = date(year, 1, 1), date(year, 12, 31)
        period_type = "annual"

    return ChapterPeriod(
        chapter_id=chapter_id,
        name=period_name,
        period_type=period_type,
        start_date=p_start,
        end_date=p_end,
        is_active=True,
    )


def create_chapter_with_founder(
    *,
    requester: User,
    organization: Organization,
    region: Region,
    name: str,
    designation: str | None,
    chapter_type: str,
    city: str | None,
    state: str | None,
    country: str,
    timezone: str,
    founder_role: str,
) -> tuple[Chapter, ChapterPeriod, ChapterMembership]:
    """
    Atomically create a Chapter, initial ChapterPeriod, and founder ChapterMembership.

    Also flips the requester's active_chapter_id to the new chapter.
    Caller commits.
    """
    chapter = Chapter(
        organization_id=organization.id,
        region_id=region.id,
        name=name,
        designation=designation,
        chapter_type=chapter_type,
        city=city,
        state=state,
        country=country,
        timezone=timezone,
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
    db.session.flush()  # obtain chapter.id

    period = _build_first_period(chapter.id, chapter_type)
    db.session.add(period)

    membership = ChapterMembership(
        user_id=requester.id,
        chapter_id=chapter.id,
        role=founder_role,
        member_type=ChapterMembership.default_member_type_for(chapter),
    )
    db.session.add(membership)

    requester.active_chapter_id = chapter.id

    return chapter, period, membership
