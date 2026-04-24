"""Tests for Region Stripe Connect routes."""

from unittest.mock import patch

from app.extensions import db
from tests.conftest import (
    make_user, make_organization, make_region, make_region_membership,
    make_org_membership,
)


def _login(client, user):
    client.post("/api/auth/login", json={
        "email": user.email,
        "password": "Str0ng!Password1",
    })


class TestRegionStripeConnect:
    def test_connect_url_requires_regional_treasurer(self, app, client, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="u1@example.com")
        make_region_membership(user, region, role="member")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/connect")
        assert resp.status_code == 403

    def test_connect_url_returns_oauth_url_for_treasurer(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"
        app.config["STRIPE_CONNECT_REDIRECT_URI"] = "https://example.com/cb"

        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/connect")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["url"].startswith("https://connect.stripe.com/oauth/authorize?")
        assert "client_id=ca_test_123" in body["url"]

    def test_callback_persists_account_id(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"

        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)

        # Prime state token via the connect endpoint
        connect_resp = client.get(f"/api/stripe/region/{region.id}/connect")
        state = connect_resp.get_json()["url"].split("state=")[1].split("&")[0]

        with patch(
            "app.services.stripe_connect_service.exchange_oauth_code",
            return_value="acct_region_xyz",
        ):
            resp = client.get(
                f"/api/stripe/region/{region.id}/callback?code=ac_test&state={state}"
            )

        assert resp.status_code == 200
        assert resp.get_json()["stripe_account_id"] == "acct_region_xyz"

        from app.models import Region
        region_refetched = db.session.get(Region, region.id)
        assert region_refetched.stripe_account_id == "acct_region_xyz"
        assert region_refetched.stripe_onboarding_complete is True

    def test_account_status_not_connected(self, app, client, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/account")
        assert resp.status_code == 200
        assert resp.get_json() == {"connected": False}

    def test_disconnect_clears_account_id(self, app, client, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        region.stripe_account_id = "acct_preexisting"
        region.stripe_onboarding_complete = True
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)

        with patch(
            "app.services.stripe_connect_service.deauthorize_account",
            return_value=None,
        ):
            resp = client.delete(f"/api/stripe/region/{region.id}/disconnect")

        assert resp.status_code == 200

        from app.models import Region
        region_refetched = db.session.get(Region, region.id)
        assert region_refetched.stripe_account_id is None
        assert region_refetched.stripe_onboarding_complete is False

    def test_org_admin_can_connect_any_region_in_org(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"
        app.config["STRIPE_CONNECT_REDIRECT_URI"] = "https://example.com/cb"

        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="orgadmin@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/connect")
        # region_role_required allows org admins through
        assert resp.status_code == 200
