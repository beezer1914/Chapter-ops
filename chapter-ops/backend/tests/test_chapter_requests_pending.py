"""Tests for GET /api/chapter-requests/pending (approver queue)."""

from app.extensions import db
from app.models import ChapterRequest
from tests.conftest import (
    make_user, make_organization, make_region, make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _insert_request(db_session, user, org, region, status="pending", approver_scope="org_admin", name="Alpha"):
    req = ChapterRequest(
        requester_user_id=user.id,
        organization_id=org.id,
        region_id=region.id,
        name=name,
        name_normalized=name.lower().replace(" ", ""),
        chapter_type="undergraduate",
        founder_role="president",
        status=status,
        approver_scope=approver_scope,
    )
    db_session.add(req)
    db_session.flush()
    return req


class TestPendingEndpoint:
    def test_org_admin_sees_their_orgs_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization(abbreviation="AKA")
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        _insert_request(db_session, requester, org, region, approver_scope="org_admin")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["requests"]) == 1
        assert data["requests"][0]["approver_scope"] == "org_admin"

    def test_org_admin_does_not_see_other_orgs(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        aka_admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        aka = make_organization(name="AKA", abbreviation="AKA")
        dst = make_organization(name="DST", abbreviation="DST")
        dst_region = make_region(dst, name="East")
        make_org_membership(aka_admin, aka, role="admin")
        _insert_request(db_session, requester, dst, dst_region, approver_scope="org_admin")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        assert resp.get_json()["requests"] == []

    def test_platform_admin_sees_platform_queue(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization(abbreviation="ZPhiB")
        region = make_region(org, name="Unaffiliated")
        _insert_request(db_session, requester, org, region, approver_scope="platform_admin")
        db_session.commit()

        login(client, "brandon@example.com")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["requests"]) == 1
        assert data["requests"][0]["approver_scope"] == "platform_admin"

    def test_random_user_gets_empty_list(self, app, client, db_session):
        """Users with no approval authority see an empty queue (not 403)."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="nobody@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "nobody@example.com")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        assert resp.get_json()["requests"] == []

    def test_non_pending_requests_excluded(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        _insert_request(db_session, requester, org, region, status="approved")
        _insert_request(db_session, requester, org, region, status="rejected", name="Beta")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.get_json()["requests"] == []
