"""Tests for chapter_service.create_chapter_with_founder."""

from app.extensions import db
from app.models import Chapter, ChapterMembership
from app.models.chapter_period import ChapterPeriod
from app.services.chapter_service import create_chapter_with_founder
from tests.conftest import make_user, make_organization, make_region


class TestCreateChapterWithFounder:
    def test_creates_chapter_period_and_membership(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        chapter, period, membership = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="Alpha Gamma Chapter",
            designation=None,
            chapter_type="undergraduate",
            city="Atlanta",
            state="Georgia",
            country="United States",
            timezone="America/New_York",
            founder_role="president",
        )
        db_session.commit()

        assert chapter.id is not None
        assert chapter.organization_id == org.id
        assert chapter.region_id == region.id
        assert chapter.name == "Alpha Gamma Chapter"

        assert period.chapter_id == chapter.id
        assert period.is_active is True

        assert membership.user_id == user.id
        assert membership.chapter_id == chapter.id
        assert membership.role == "president"

    def test_sets_active_chapter_on_founder(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        chapter, _, _ = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="New Chapter",
            designation=None,
            chapter_type="graduate",
            city=None, state=None, country="United States",
            timezone="America/New_York",
            founder_role="treasurer",
        )
        db_session.commit()

        db_session.expire_all()
        from app.models import User
        refreshed = db_session.get(User, user.id)
        assert refreshed.active_chapter_id == chapter.id

    def test_undergraduate_gets_semester_period(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        _, period, _ = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="Undergrad Chapter",
            designation=None,
            chapter_type="undergraduate",
            city=None, state=None, country="United States",
            timezone="America/New_York",
            founder_role="president",
        )
        db_session.commit()
        assert period.period_type == "semester"

    def test_graduate_gets_annual_period(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        _, period, _ = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="Graduate Chapter",
            designation=None,
            chapter_type="graduate",
            city=None, state=None, country="United States",
            timezone="America/New_York",
            founder_role="president",
        )
        db_session.commit()
        assert period.period_type == "annual"
