"""Tests for POST /api/onboarding/chapter-requests (submit)."""

from app.extensions import db
from app.models import Chapter, ChapterRequest, OrganizationMembership
from tests.conftest import (
    make_user, make_organization, make_region, make_chapter,
    make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestSubmitChapterRequest:
    def _submit_payload(self, org, region, overrides=None):
        base = {
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Alpha Chapter",
            "chapter_type": "undergraduate",
            "city": "Atlanta",
            "state": "Georgia",
            "founder_role": "president",
        }
        if overrides:
            base.update(overrides)
        return base

    def test_submit_claimed_org_routes_to_org_admin(self, app, client, db_session):
        """If the org has an admin, approver_scope is org_admin."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="newpres@example.com", password=VALID_PASSWORD)
        org = make_organization(name="Alpha Kappa Alpha", abbreviation="AKA", org_type="sorority")
        region = make_region(org, name="Eastern Region")
        make_org_membership(admin, org, role="admin")
        db_session.commit()

        login(client, "newpres@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region),
        )
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert data["request"]["status"] == "pending"
        assert data["request"]["approver_scope"] == "org_admin"

    def test_submit_unclaimed_org_routes_to_platform_admin(self, app, client, db_session):
        """If the org has no admins, approver_scope is platform_admin."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        requester = make_user(email="newpres@example.com", password=VALID_PASSWORD)
        org = make_organization(name="Zeta Phi Beta", abbreviation="ZPhiB", org_type="sorority")
        region = make_region(org, name="Unaffiliated")
        db_session.commit()

        login(client, "newpres@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region),
        )
        assert resp.status_code == 201
        assert resp.get_json()["request"]["approver_scope"] == "platform_admin"

    def test_submit_blocks_on_existing_active_chapter(self, app, client, db_session):
        """Dedup against the live Chapter table."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        requester = make_user(email="bob@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_chapter(org, name="Alpha Chapter", region=region)
        db_session.commit()

        login(client, "bob@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"name": "ALPHA chapter"}),
        )
        assert resp.status_code == 409
        assert "already exists" in resp.get_json()["error"].lower()

    def test_submit_blocks_on_existing_pending_request(self, app, client, db_session):
        """Dedup against pending ChapterRequest rows."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="first@example.com", password=VALID_PASSWORD)
        second = make_user(email="second@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "first@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"name": "Alpha Chapter"}),
        )
        assert resp.status_code == 201

        client.post("/api/auth/logout")
        login(client, "second@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"name": "Alpha-Chapter"}),
        )
        assert resp.status_code == 409

    def test_submit_rejects_invalid_founder_role(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="user@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "user@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"founder_role": "overlord"}),
        )
        assert resp.status_code == 400

    def test_submit_rejects_invalid_chapter_type(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="user@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "user@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"chapter_type": "interstellar"}),
        )
        assert resp.status_code == 400

    def test_submit_rejects_region_org_mismatch(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="user@example.com", password=VALID_PASSWORD)
        org_a = make_organization(name="Org A", abbreviation="ORGA")
        org_b = make_organization(name="Org B", abbreviation="ORGB")
        region_b = make_region(org_b, name="Other Region")
        db_session.commit()

        login(client, "user@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json={
                "organization_id": org_a.id,
                "region_id": region_b.id,
                "name": "Mismatch Chapter",
                "chapter_type": "undergraduate",
                "founder_role": "president",
            },
        )
        assert resp.status_code == 400

    def test_submit_requires_auth(self, client):
        resp = client.post("/api/onboarding/chapter-requests", json={})
        assert resp.status_code == 401
