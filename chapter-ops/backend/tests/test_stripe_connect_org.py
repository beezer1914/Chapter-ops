"""Tests for Organization Stripe Connect routes."""

from unittest.mock import patch

from app.extensions import db
from tests.conftest import make_user, make_organization, make_org_membership


def _login(client, user):
    client.post("/api/auth/login", json={
        "email": user.email,
        "password": "Str0ng!Password1",
    })


class TestOrgStripeConnect:
    def test_connect_url_requires_admin(self, app, client, db_session):
        org = make_organization()
        user = make_user(email="m@example.com")
        make_org_membership(user, org, role="member")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/connect")
        assert resp.status_code == 403

    def test_connect_url_returns_oauth_url_for_admin(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"
        app.config["STRIPE_CONNECT_REDIRECT_URI"] = "https://example.com/cb"

        org = make_organization()
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/connect")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["url"].startswith("https://connect.stripe.com/oauth/authorize?")
        assert "client_id=ca_test_123" in body["url"]

    def test_callback_persists_account_id(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"

        org = make_organization()
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)

        connect_resp = client.get(f"/api/stripe/org/{org.id}/connect")
        state = connect_resp.get_json()["url"].split("state=")[1].split("&")[0]

        with patch(
            "app.services.stripe_connect_service.exchange_oauth_code",
            return_value="acct_org_xyz",
        ):
            resp = client.get(
                f"/api/stripe/org/{org.id}/callback?code=ac_test&state={state}"
            )

        assert resp.status_code == 200
        assert resp.get_json()["stripe_account_id"] == "acct_org_xyz"

        from app.models import Organization
        org_refetched = db.session.get(Organization, org.id)
        assert org_refetched.stripe_account_id == "acct_org_xyz"
        assert org_refetched.stripe_onboarding_complete is True

    def test_account_status_not_connected(self, app, client, db_session):
        org = make_organization()
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/account")
        assert resp.status_code == 200
        assert resp.get_json() == {"connected": False}

    def test_disconnect_clears_account_id(self, app, client, db_session):
        org = make_organization()
        org.stripe_account_id = "acct_preexisting"
        org.stripe_onboarding_complete = True
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)

        with patch(
            "app.services.stripe_connect_service.deauthorize_account",
            return_value=None,
        ):
            resp = client.delete(f"/api/stripe/org/{org.id}/disconnect")

        assert resp.status_code == 200

        from app.models import Organization
        org_refetched = db.session.get(Organization, org.id)
        assert org_refetched.stripe_account_id is None
        assert org_refetched.stripe_onboarding_complete is False

    def test_non_member_returns_403(self, app, client, db_session):
        org = make_organization()
        user = make_user(email="nobody@example.com")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/connect")
        assert resp.status_code == 403
