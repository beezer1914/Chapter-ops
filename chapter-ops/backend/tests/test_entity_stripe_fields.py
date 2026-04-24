"""Tests for Stripe Connect fields on Organization and Region."""

from app.extensions import db
from app.models import Organization, Region
from tests.conftest import make_organization, make_region


class TestOrganizationStripeFields:
    def test_defaults(self, app, db_session):
        org = make_organization()
        db.session.commit()
        fetched = db.session.get(Organization, org.id)
        assert fetched.stripe_account_id is None
        assert fetched.stripe_onboarding_complete is False

    def test_can_set_stripe_account_id(self, app, db_session):
        org = make_organization()
        org.stripe_account_id = "acct_test_org_123"
        org.stripe_onboarding_complete = True
        db.session.commit()
        fetched = db.session.get(Organization, org.id)
        assert fetched.stripe_account_id == "acct_test_org_123"
        assert fetched.stripe_onboarding_complete is True

    def test_to_dict_includes_stripe_fields(self, app, db_session):
        org = make_organization()
        org.stripe_account_id = "acct_abc"
        org.stripe_onboarding_complete = True
        db.session.commit()
        d = org.to_dict()
        assert d["stripe_account_id"] == "acct_abc"
        assert d["stripe_onboarding_complete"] is True


class TestRegionStripeFields:
    def test_defaults(self, app, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        db.session.commit()
        fetched = db.session.get(Region, region.id)
        assert fetched.stripe_account_id is None
        assert fetched.stripe_onboarding_complete is False

    def test_can_set_stripe_account_id(self, app, db_session):
        org = make_organization()
        region = make_region(org, name="West")
        region.stripe_account_id = "acct_test_region_456"
        region.stripe_onboarding_complete = True
        db.session.commit()
        fetched = db.session.get(Region, region.id)
        assert fetched.stripe_account_id == "acct_test_region_456"
        assert fetched.stripe_onboarding_complete is True

    def test_to_dict_includes_stripe_fields(self, app, db_session):
        org = make_organization()
        region = make_region(org, name="Southern")
        region.stripe_account_id = "acct_xyz"
        region.stripe_onboarding_complete = True
        db.session.commit()
        d = region.to_dict()
        assert d["stripe_account_id"] == "acct_xyz"
        assert d["stripe_onboarding_complete"] is True
