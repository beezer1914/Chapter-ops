"""
Shared test fixtures for the ChapterOps backend test suite.
"""

import uuid
from datetime import datetime, timezone, timedelta

import pytest

from app import create_app
from app.config import TestingConfig
from app.extensions import db as _db
from app.models import (
    User,
    Organization,
    OrganizationMembership,
    Region,
    RegionMembership,
    Chapter,
    ChapterMembership,
    WorkflowTemplate,
    WorkflowStep,
    InviteCode,
)


@pytest.fixture(scope="session")
def app():
    """Create the Flask application for the test session."""
    app = create_app(config_class=TestingConfig)
    yield app


@pytest.fixture(autouse=True)
def setup_db(app):
    """Create all tables before each test and drop them after."""
    with app.app_context():
        _db.create_all()
        yield
        _db.session.rollback()
        _db.drop_all()


@pytest.fixture()
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture()
def db_session(app):
    """Provide the SQLAlchemy session within app context."""
    with app.app_context():
        yield _db.session


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------

def make_user(
    email="testuser@example.com",
    password="Str0ng!Password1",
    first_name="Test",
    last_name="User",
    active=True,
    active_chapter_id=None,
):
    """Create and persist a User."""
    user = User(
        email=email,
        first_name=first_name,
        last_name=last_name,
        active=active,
        active_chapter_id=active_chapter_id,
    )
    user.set_password(password)
    _db.session.add(user)
    _db.session.flush()
    return user


def make_organization(
    name="Phi Beta Sigma Fraternity, Inc.",
    abbreviation="PBS",
    org_type="fraternity",
):
    """Create and persist an Organization."""
    org = Organization(
        name=name,
        abbreviation=abbreviation,
        org_type=org_type,
    )
    _db.session.add(org)
    _db.session.flush()
    return org


def make_region(organization, name="Default Region"):
    """Create and persist a Region."""
    region = Region(
        organization_id=organization.id,
        name=name,
        config={},
    )
    _db.session.add(region)
    _db.session.flush()
    return region


def make_chapter(organization, name="Sigma Delta Sigma Chapter", chapter_type="graduate", region=None):
    """Create and persist a Chapter. Auto-creates or reuses a region if not provided."""
    if region is None:
        # Reuse existing region for this org to avoid unique constraint violations
        region = Region.query.filter_by(
            organization_id=organization.id, name="Default Region"
        ).first()
        if not region:
            region = make_region(organization)
    chapter = Chapter(
        organization_id=organization.id,
        region_id=region.id,
        name=name,
        chapter_type=chapter_type,
    )
    _db.session.add(chapter)
    _db.session.flush()
    return chapter


def make_membership(user, chapter, role="member", financial_status="financial"):
    """Create and persist a ChapterMembership."""
    membership = ChapterMembership(
        user_id=user.id,
        chapter_id=chapter.id,
        role=role,
        financial_status=financial_status,
    )
    _db.session.add(membership)
    _db.session.flush()
    return membership


def make_org_membership(user, organization, role="member"):
    """Create and persist an OrganizationMembership."""
    membership = OrganizationMembership(
        user_id=user.id,
        organization_id=organization.id,
        role=role,
    )
    _db.session.add(membership)
    _db.session.flush()
    return membership


def make_region_membership(user, region, role="member"):
    """Create and persist a RegionMembership."""
    membership = RegionMembership(
        user_id=user.id,
        region_id=region.id,
        role=role,
    )
    _db.session.add(membership)
    _db.session.flush()
    return membership


_SENTINEL = object()


def make_workflow_template(
    chapter,
    user,
    org,
    name="Test Template",
    trigger_type="document",
    chapter_id=_SENTINEL,
    completion_actions=None,
):
    """Create and persist a WorkflowTemplate. Pass chapter_id=None for org-wide."""
    if chapter_id is _SENTINEL:
        chapter_id = chapter.id
    template = WorkflowTemplate(
        organization_id=org.id,
        chapter_id=chapter_id,
        created_by=user.id,
        name=name,
        trigger_type=trigger_type,
        completion_actions=completion_actions or [],
    )
    _db.session.add(template)
    _db.session.flush()
    return template


def make_workflow_step(
    template,
    order=1,
    name=None,
    role="treasurer",
    parallel_group=None,
    condition=None,
    approver_type="role",
):
    """Create and persist a WorkflowStep."""
    step = WorkflowStep(
        template_id=template.id,
        step_order=order,
        name=name or f"Step {order}",
        approver_type=approver_type,
        approver_role=role if approver_type == "role" else None,
        parallel_group=parallel_group,
        condition_json=condition,
    )
    _db.session.add(step)
    _db.session.flush()
    return step


def make_invite(chapter, created_by, role="member", code=None, expires_at=None):
    """Create and persist an InviteCode."""
    invite = InviteCode(
        chapter_id=chapter.id,
        code=code or uuid.uuid4().hex[:12],
        role=role,
        created_by=created_by,
        expires_at=expires_at,
    )
    _db.session.add(invite)
    _db.session.flush()
    return invite
