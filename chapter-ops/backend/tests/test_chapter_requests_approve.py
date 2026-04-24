"""Tests for POST /api/chapter-requests/<id>/approve."""

from app.extensions import db
from app.models import Chapter, ChapterMembership, ChapterRequest
from tests.conftest import (
    make_user, make_organization, make_region, make_chapter,
    make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _insert_request(db_session, user, org, region, approver_scope="org_admin", name="Alpha Chapter"):
    req = ChapterRequest(
        requester_user_id=user.id,
        organization_id=org.id,
        region_id=region.id,
        name=name,
        name_normalized=name.lower().replace(" ", ""),
        chapter_type="undergraduate",
        founder_role="president",
        status="pending",
        approver_scope=approver_scope,
    )
    db_session.add(req)
    db_session.flush()
    return req


class TestApproveEndpoint:
    def test_org_admin_can_approve(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data["chapter"]["name"] == "Alpha Chapter"

        db_session.expire_all()
        refreshed = db_session.get(ChapterRequest, req.id)
        assert refreshed.status == "approved"
        assert refreshed.resulting_chapter_id == data["chapter"]["id"]
        assert refreshed.approved_by_user_id == admin.id
        assert refreshed.acted_at is not None

        chapter = db_session.get(Chapter, data["chapter"]["id"])
        assert chapter is not None
        membership = db.session.query(ChapterMembership).filter_by(
            user_id=requester.id, chapter_id=chapter.id
        ).first()
        assert membership is not None
        assert membership.role == "president"

    def test_platform_admin_approves_platform_scope(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization(abbreviation="ZPhiB")
        region = make_region(org, name="Unaffiliated")
        req = _insert_request(db_session, requester, org, region, approver_scope="platform_admin")
        db_session.commit()

        login(client, "brandon@example.com")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 200

    def test_org_admin_cannot_approve_platform_scope(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region, approver_scope="platform_admin")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 403

    def test_random_user_cannot_approve(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="random@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "random@example.com")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 403

    def test_cannot_approve_non_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        req.status = "approved"
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 409

    def test_approve_rechecks_dedup_against_live_chapters(self, app, client, db_session):
        """If a chapter with the same name was created between submit and approve, 409."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region, name="Alpha Chapter")
        make_chapter(org, name="Alpha Chapter", region=region)
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 409
        assert "already" in resp.get_json()["error"].lower()
        db_session.expire_all()
        assert db_session.get(ChapterRequest, req.id).status == "pending"  # not flipped
