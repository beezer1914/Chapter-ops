import pytest
from unittest.mock import patch

from app.extensions import db
from app.models import (
    Chapter, ChapterMembership, Invoice, Organization,
    OrganizationMembership, Region, RegionMembership,
)
from app.utils.region_permissions import REGIONAL_OFFICER_ROLES
from tests.conftest import make_user


@pytest.fixture()
def org_region_chapter(db_session):
    org = Organization(name="Org", abbreviation="ORG", org_type="fraternity")
    db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="South", active=True)
    db_session.add(region); db_session.flush()
    chapter = Chapter(
        organization_id=org.id, region_id=region.id, name="Alpha",
        chapter_type="undergraduate", active=True,
    )
    db_session.add(chapter); db_session.flush()
    return org, region, chapter


def _login(client, user):
    with client.session_transaction() as sess:
        sess["_user_id"] = user.id


def test_endpoint_404_when_region_missing(client, db_session):
    user = make_user(email="x@x.com")
    _login(client, user)
    resp = client.get("/api/regions/nonexistent-id/dashboard")
    assert resp.status_code == 404


def test_endpoint_403_for_unauthorized_user(client, db_session, org_region_chapter):
    _, region, _ = org_region_chapter
    user = make_user(email="random@example.com")
    _login(client, user)
    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 403


def test_endpoint_200_for_each_officer_role(client, db_session, org_region_chapter):
    _, region, _ = org_region_chapter
    for role in REGIONAL_OFFICER_ROLES:
        user = make_user(email=f"{role}@x.com")
        db_session.add(RegionMembership(
            user_id=user.id, region_id=region.id, role=role, active=True,
        )); db_session.flush()
        _login(client, user)
        resp = client.get(f"/api/regions/{region.id}/dashboard")
        assert resp.status_code == 200, role
        data = resp.get_json()
        assert "kpis" in data
        assert "chapters" in data
        assert "invoice_snapshot" in data
        assert "officer_summary" in data
        assert data["agent_findings"] == []


def test_endpoint_403_for_region_member_role(client, db_session, org_region_chapter):
    _, region, _ = org_region_chapter
    user = make_user(email="rm@x.com")
    db_session.add(RegionMembership(
        user_id=user.id, region_id=region.id, role="member", active=True,
    )); db_session.flush()
    _login(client, user)
    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 403


def test_endpoint_200_for_org_admin(client, db_session, org_region_chapter):
    org, region, _ = org_region_chapter
    user = make_user(email="oa@x.com")
    db_session.add(OrganizationMembership(
        user_id=user.id, organization_id=org.id, role="admin", active=True,
    )); db_session.flush()
    _login(client, user)
    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 200


def test_empty_region_returns_zero_kpis(client, db_session):
    org = Organization(name="O", abbreviation="O", org_type="fraternity")
    db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="Empty", active=True)
    db_session.add(region); db_session.flush()
    user = make_user(email="ea@x.com")
    db_session.add(OrganizationMembership(
        user_id=user.id, organization_id=org.id, role="admin", active=True,
    )); db_session.flush()
    _login(client, user)

    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["kpis"]["chapter_count"] == 0
    assert data["kpis"]["member_count"] == 0
    assert data["kpis"]["financial_rate"] == 0.0
    assert data["chapters"] == []
    assert data["officer_summary"] == []


def test_endpoint_handles_bad_chapter_gracefully(client, db_session, org_region_chapter):
    org, region, chapter = org_region_chapter
    user = make_user(email="ar@x.com")
    db_session.add(OrganizationMembership(
        user_id=user.id, organization_id=org.id, role="admin", active=True,
    )); db_session.flush()
    _login(client, user)

    def boom(chapter_id):
        raise RuntimeError("synthetic chapter failure")

    with patch(
        "app.routes.regions.compute_chapter_kpis",
        side_effect=boom,
    ):
        resp = client.get(f"/api/regions/{region.id}/dashboard")

    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["chapters"]) == 1
    bad_row = data["chapters"][0]
    assert bad_row["id"] == chapter.id
    assert bad_row["member_count"] is None
    assert bad_row["financial_rate"] is None
    assert bad_row["dues_ytd"] is None


def test_endpoint_404_when_region_inactive(client, db_session):
    org = Organization(name="O", abbreviation="O", org_type="fraternity")
    db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="Inactive", active=False)
    db_session.add(region); db_session.flush()

    user = make_user(email="ai@x.com")
    db_session.add(OrganizationMembership(
        user_id=user.id, organization_id=org.id, role="admin", active=True,
    )); db_session.flush()
    _login(client, user)

    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 404
