"""
Tests for the shared KPI aggregation helpers in
app/services/dashboard_aggregations.py.
"""

from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db
from app.models import Chapter, ChapterMembership, Organization, Payment, Region
from app.services.dashboard_aggregations import (
    compute_chapter_kpis,
    compute_region_kpis,
)
from tests.conftest import make_user


def _seed_chapter(db_session, org, region, name, financial_count, non_count, dues_total):
    chapter = Chapter(
        organization_id=org.id,
        region_id=region.id,
        name=name,
        chapter_type="undergraduate",
        active=True,
    )
    db_session.add(chapter)
    db_session.flush()

    for i in range(financial_count):
        u = make_user(email=f"{name}-fin-{i}@x.com")
        db_session.add(ChapterMembership(
            user_id=u.id,
            chapter_id=chapter.id,
            role="member",
            active=True,
            financial_status="financial",
        ))

    for i in range(non_count):
        u = make_user(email=f"{name}-non-{i}@x.com")
        db_session.add(ChapterMembership(
            user_id=u.id,
            chapter_id=chapter.id,
            role="member",
            active=True,
            financial_status="not_financial",
        ))

    if dues_total > 0:
        # Payment requires user_id; use any existing user or create one.
        payer = make_user(email=f"{name}-payer@x.com")
        db_session.add(Payment(
            chapter_id=chapter.id,
            user_id=payer.id,
            amount=Decimal(str(dues_total)),
            created_at=datetime(datetime.now(timezone.utc).year, 6, 1, tzinfo=timezone.utc),
        ))

    db_session.flush()
    return chapter


def test_compute_chapter_kpis(db_session):
    org = Organization(name="O", abbreviation="O", org_type="fraternity")
    db_session.add(org)
    db_session.flush()

    region = Region(organization_id=org.id, name="R", active=True)
    db_session.add(region)
    db_session.flush()

    chapter = _seed_chapter(
        db_session, org, region, "Alpha",
        financial_count=3, non_count=1, dues_total=500,
    )
    result = compute_chapter_kpis(chapter.id)

    assert result["member_count"] == 4
    assert result["financial_rate"] == 75.0
    assert result["dues_ytd"] == 500.0


def test_compute_chapter_kpis_empty_chapter(db_session):
    org = Organization(name="O", abbreviation="O", org_type="fraternity")
    db_session.add(org)
    db_session.flush()

    region = Region(organization_id=org.id, name="R", active=True)
    db_session.add(region)
    db_session.flush()

    empty = _seed_chapter(db_session, org, region, "Empty", 0, 0, 0)

    result = compute_chapter_kpis(empty.id)
    assert result == {"member_count": 0, "financial_rate": 0.0, "dues_ytd": 0.0}


def test_compute_region_kpis_aggregates_active_chapters(db_session):
    org = Organization(name="O", abbreviation="O", org_type="fraternity")
    db_session.add(org)
    db_session.flush()

    region = Region(organization_id=org.id, name="R", active=True)
    db_session.add(region)
    db_session.flush()

    _seed_chapter(db_session, org, region, "A", 4, 0, 200)
    _seed_chapter(db_session, org, region, "B", 1, 1, 100)

    result = compute_region_kpis(region.id)
    assert result["chapter_count"] == 2
    assert result["chapter_count_active"] == 2
    assert result["chapter_count_suspended"] == 0
    assert result["member_count"] == 6
    assert result["financial_rate"] == round(5 / 6 * 100, 1)
    assert result["dues_ytd"] == 300.0
