"""Tests for POST /api/chapter-requests/<id>/reject."""

from app.extensions import db
from app.models import ChapterRequest
from tests.conftest import (
    make_user, make_organization, make_region, make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _insert_request(db_session, user, org, region, approver_scope="org_admin"):
    req = ChapterRequest(
        requester_user_id=user.id,
        organization_id=org.id,
        region_id=region.id,
        name="Alpha Chapter",
        name_normalized="alphachapter",
        chapter_type="undergraduate",
        founder_role="president",
        status="pending",
        approver_scope=approver_scope,
    )
    db_session.add(req)
    db_session.flush()
    return req


class TestRejectEndpoint:
    def test_org_admin_can_reject_with_reason(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(
            f"/api/chapter-requests/{req.id}/reject",
            json={"reason": "Not a recognized chapter — please verify with IHQ."},
        )
        assert resp.status_code == 200
        db_session.expire_all()
        refreshed = db_session.get(ChapterRequest, req.id)
        assert refreshed.status == "rejected"
        assert "IHQ" in refreshed.rejected_reason
        assert refreshed.approved_by_user_id == admin.id

    def test_reject_requires_reason(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/reject", json={})
        assert resp.status_code == 400
        resp = client.post(f"/api/chapter-requests/{req.id}/reject", json={"reason": "   "})
        assert resp.status_code == 400

    def test_reject_authority_check(self, app, client, db_session):
        """Random users can't reject."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="random@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "random@example.com")
        resp = client.post(
            f"/api/chapter-requests/{req.id}/reject",
            json={"reason": "nope"},
        )
        assert resp.status_code == 403

    def test_reject_non_pending_returns_409(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        req.status = "rejected"
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(
            f"/api/chapter-requests/{req.id}/reject",
            json={"reason": "second attempt"},
        )
        assert resp.status_code == 409

    def test_requester_can_submit_new_request_after_rejection(self, app, client, db_session):
        """After rejection, dedup for the same normalized name is cleared (old row no longer pending)."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        client.post(f"/api/chapter-requests/{req.id}/reject", json={"reason": "try again"})
        client.post("/api/auth/logout")

        login(client, "new@example.com")
        resp = client.post("/api/onboarding/chapter-requests", json={
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Alpha Chapter",
            "chapter_type": "undergraduate",
            "founder_role": "president",
        })
        assert resp.status_code == 201
