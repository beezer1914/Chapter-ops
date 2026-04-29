"""Tests asserting AuditEvent rows are written on Stripe Connect mutations."""

from unittest.mock import patch

from app.extensions import db
from app.models import AuditEvent
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_region,
)


def _login(client, user, password="Str0ng!Password1"):
    return client.post(
        "/api/auth/login",
        json={"email": user.email, "password": password},
    )


class TestStripeConnectAudit:
    def test_chapter_connect_writes_audit_event(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        president = make_user(email="p@example.com")
        make_membership(president, chapter, role="president")
        president.active_chapter_id = chapter.id
        db.session.commit()

        _login(client, president)
        with client.session_transaction() as sess:
            sess["stripe_oauth_state"] = "test-state-token"
        with patch(
            "app.services.stripe_connect_service.exchange_oauth_code",
            return_value="acct_test_aaa",
        ):
            client.get(
                "/api/stripe/callback?code=ac_test&state=test-state-token"
            )

        events = AuditEvent.query.filter_by(
            event_type="stripe_connect.chapter.connect",
            target_id=chapter.id,
        ).all()
        assert len(events) == 1
        assert events[0].actor_user_id == president.id
        assert events[0].target_type == "chapter"
        assert events[0].details.get("stripe_account_id") == "acct_test_aaa"

    def test_region_connect_by_org_admin_writes_audit_event(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        admin = make_user(email="a@example.com")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(
            user_id=admin.id, organization_id=org.id, role="admin",
        ))
        db.session.commit()

        _login(client, admin)
        with client.session_transaction() as sess:
            sess[f"stripe_oauth_state_region_{region.id}"] = "test-state-token"
        with patch(
            "app.services.stripe_connect_service.exchange_oauth_code",
            return_value="acct_test_region_1",
        ):
            client.get(
                f"/api/stripe/region/{region.id}/callback"
                "?code=ac_test&state=test-state-token"
            )

        events = AuditEvent.query.filter_by(
            event_type="stripe_connect.region.connect",
            target_id=region.id,
        ).all()
        assert len(events) == 1
        assert events[0].actor_user_id == admin.id
        assert events[0].target_type == "region"

    def test_org_connect_writes_audit_event(self, client, db_session):
        org = make_organization()
        admin = make_user(email="a@example.com")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(
            user_id=admin.id, organization_id=org.id, role="admin",
        ))
        db.session.commit()

        _login(client, admin)
        with client.session_transaction() as sess:
            sess[f"stripe_oauth_state_org_{org.id}"] = "test-state-token"
        with patch(
            "app.services.stripe_connect_service.exchange_oauth_code",
            return_value="acct_test_org_1",
        ):
            client.get(
                f"/api/stripe/org/{org.id}/callback"
                "?code=ac_test&state=test-state-token"
            )

        events = AuditEvent.query.filter_by(
            event_type="stripe_connect.organization.connect",
            target_id=org.id,
        ).all()
        assert len(events) == 1
        assert events[0].actor_user_id == admin.id
        assert events[0].target_type == "organization"
