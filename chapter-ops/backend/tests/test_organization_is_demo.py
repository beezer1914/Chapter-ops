"""Verify the is_demo flag on Organization defaults to False and is settable."""

from tests.conftest import make_organization
from app.extensions import db


class TestOrganizationIsDemo:
    def test_default_is_false(self, db_session):
        org = make_organization(name="Real Org", abbreviation="RO")
        db_session.commit()
        assert org.is_demo is False

    def test_can_be_set_to_true(self, db_session):
        org = make_organization(name="Demo Org", abbreviation="DGLO", is_demo=True)
        db_session.commit()
        assert org.is_demo is True

    def test_existing_rows_default_to_false_after_migration(self, db_session):
        # Simulating: row created via the model with no is_demo arg should be False
        from app.models import Organization
        org = Organization(name="Bare Org", abbreviation="BO", org_type="fraternity")
        db_session.add(org)
        db_session.commit()
        assert org.is_demo is False
