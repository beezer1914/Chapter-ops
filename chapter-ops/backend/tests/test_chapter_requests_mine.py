"""Tests for GET /mine and DELETE /<id>."""

from datetime import datetime, timezone, timedelta

from app.extensions import db
from app.models import ChapterRequest
from tests.conftest import make_user, make_organization, make_region

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _submit(client, org, region, name="Alpha Chapter"):
    return client.post("/api/onboarding/chapter-requests", json={
        "organization_id": org.id,
        "region_id": region.id,
        "name": name,
        "chapter_type": "undergraduate",
        "founder_role": "president",
    })


class TestMineEndpoint:
    def test_returns_current_users_pending_request(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        submit_resp = _submit(client, org, region)
        req_id = submit_resp.get_json()["request"]["id"]

        resp = client.get("/api/onboarding/chapter-requests/mine")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["request"]["id"] == req_id
        assert data["request"]["status"] == "pending"

    def test_returns_null_when_no_request(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="nobody@example.com", password=VALID_PASSWORD)
        db_session.commit()

        login(client, "nobody@example.com")
        resp = client.get("/api/onboarding/chapter-requests/mine")
        assert resp.status_code == 200
        assert resp.get_json()["request"] is None

    def test_returns_most_recent_when_multiple(self, app, client, db_session):
        """After a rejection, a new submit overrides the old one as 'mine'."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        first = _submit(client, org, region, "First Name")
        # Reject the first one manually and backdate it so the second submit is
        # definitively more recent regardless of same-second SQLite precision.
        req = db_session.get(ChapterRequest, first.get_json()["request"]["id"])
        req.status = "rejected"
        req.rejected_reason = "testing"
        req.created_at = datetime.now(timezone.utc) - timedelta(seconds=2)
        db_session.commit()

        second = _submit(client, org, region, "Second Name")
        second_id = second.get_json()["request"]["id"]

        resp = client.get("/api/onboarding/chapter-requests/mine")
        assert resp.get_json()["request"]["id"] == second_id


class TestCancelEndpoint:
    def test_requester_can_cancel_own_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        submit_resp = _submit(client, org, region)
        req_id = submit_resp.get_json()["request"]["id"]

        resp = client.delete(f"/api/onboarding/chapter-requests/{req_id}")
        assert resp.status_code == 200

        req = db_session.get(ChapterRequest, req_id)
        assert req.status == "cancelled"

    def test_cannot_cancel_others_request(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        alice = make_user(email="alice@example.com", password=VALID_PASSWORD)
        make_user(email="bob@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        req_id = _submit(client, org, region).get_json()["request"]["id"]
        client.post("/api/auth/logout")

        login(client, "bob@example.com")
        resp = client.delete(f"/api/onboarding/chapter-requests/{req_id}")
        assert resp.status_code == 403

    def test_cannot_cancel_non_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        req_id = _submit(client, org, region).get_json()["request"]["id"]
        req = db_session.get(ChapterRequest, req_id)
        req.status = "approved"
        db_session.commit()

        resp = client.delete(f"/api/onboarding/chapter-requests/{req_id}")
        assert resp.status_code == 409
