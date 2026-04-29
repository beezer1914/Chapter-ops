import pytest

from app.extensions import db
from app.models import (
    Chapter, ChapterMembership, Organization,
    OrganizationMembership, Region, RegionMembership,
)
from app.utils.region_permissions import (
    REGIONAL_OFFICER_ROLES, can_view_region_dashboard,
)
from tests.conftest import make_user


@pytest.fixture()
def org_and_region(db_session):
    org = Organization(name="Test Org", abbreviation="TST", org_type="fraternity")
    db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="Southern Region", active=True)
    db_session.add(region); db_session.flush()
    return org, region


def _make_region_member(db_session, region, user, role):
    rm = RegionMembership(
        user_id=user.id, region_id=region.id, role=role, active=True,
    )
    db_session.add(rm); db_session.flush()
    return rm


def test_each_officer_role_grants_access(app, db_session, org_and_region):
    _, region = org_and_region
    with app.test_request_context():
        for role in REGIONAL_OFFICER_ROLES:
            user = make_user(email=f"{role}@example.com")
            _make_region_member(db_session, region, user, role)
            assert can_view_region_dashboard(user, region) is True, role


def test_member_role_does_not_grant_access(app, db_session, org_and_region):
    _, region = org_and_region
    with app.test_request_context():
        user = make_user(email="member@example.com")
        _make_region_member(db_session, region, user, "member")
        assert can_view_region_dashboard(user, region) is False


def test_org_admin_grants_access(app, db_session, org_and_region):
    org, region = org_and_region
    with app.test_request_context():
        user = make_user(email="admin@example.com")
        db_session.add(OrganizationMembership(
            user_id=user.id, organization_id=org.id, role="admin", active=True,
        ))
        db_session.flush()
        assert can_view_region_dashboard(user, region) is True


def test_unaffiliated_user_denied(app, db_session, org_and_region):
    _, region = org_and_region
    with app.test_request_context():
        user = make_user(email="random@example.com")
        assert can_view_region_dashboard(user, region) is False


def test_platform_admin_grants_access(app, db_session, org_and_region, monkeypatch):
    _, region = org_and_region
    monkeypatch.setitem(app.config, "PLATFORM_ADMIN_EMAIL", "platform-admin@example.com")
    user = make_user(email="platform-admin@example.com")
    with app.test_request_context():
        assert can_view_region_dashboard(user, region) is True


def test_platform_admin_email_mismatch_denied(app, db_session, org_and_region, monkeypatch):
    _, region = org_and_region
    monkeypatch.setitem(app.config, "PLATFORM_ADMIN_EMAIL", "platform-admin@example.com")
    user = make_user(email="someone-else@example.com")
    with app.test_request_context():
        assert can_view_region_dashboard(user, region) is False
