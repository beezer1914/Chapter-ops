"""Tests for GET /api/platform/dashboard."""

import pytest

from tests.conftest import make_user, make_organization
from app.extensions import db


def _login(client, email, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestPlatformDashboardAuth:
    def test_returns_403_when_not_authenticated(self, client):
        resp = client.get("/api/platform/dashboard")
        assert resp.status_code in (401, 403)

    def test_returns_403_when_not_platform_admin(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        make_user(email="someone@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "someone@example.com")
        resp = client.get("/api/platform/dashboard")
        assert resp.status_code == 403

    def test_returns_200_when_platform_admin(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        make_user(email="founder@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "founder@example.com")
        resp = client.get("/api/platform/dashboard")
        assert resp.status_code == 200
        body = resp.get_json()
        assert "summary" in body
        assert "tier_breakdown" in body
        assert "top_chapters_by_dues" in body


from datetime import datetime, timedelta, timezone
from decimal import Decimal

from tests.conftest import (
    make_organization, make_chapter, make_user, make_membership
)
from app.models import Payment


def _make_founder_session(app, client, db_session):
    """Helper: create the founder, log in, return None."""
    app.config["FOUNDER_EMAIL"] = "founder@example.com"
    make_user(email="founder@example.com", password="Str0ng!Password1")
    db_session.commit()
    _login(client, "founder@example.com")


class TestPlatformDashboardSummary:
    def test_excludes_demo_orgs_from_org_count(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        make_organization(name="Real", abbreviation="REAL")
        make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["organizations"]["total"] == 1

    def test_excludes_inactive_orgs_from_org_count(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        make_organization(name="Active", abbreviation="ACT")
        inactive = make_organization(name="Gone", abbreviation="GONE")
        inactive.active = False
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["organizations"]["total"] == 1

    def test_chapters_count_excludes_demo_org_chapters(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        make_chapter(real, name="Real Chapter")
        make_chapter(demo, name="Demo Chapter")
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["chapters"]["total"] == 1

    def test_members_count_dedupes_and_excludes_demo(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        c1 = make_chapter(real, name="C1")
        c2 = make_chapter(real, name="C2", region=c1.region)
        cdemo = make_chapter(demo, name="DemoC")
        u1 = make_user(email="u1@example.com")
        u2 = make_user(email="u2@example.com")
        u_in_demo = make_user(email="u3@example.com")
        # u1 has memberships in BOTH real chapters — must count as 1
        make_membership(u1, c1)
        make_membership(u1, c2)
        make_membership(u2, c1)
        make_membership(u_in_demo, cdemo)
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        # u1 + u2 = 2 distinct real members (u_in_demo excluded, u1 not double-counted)
        assert body["summary"]["members"]["total"] == 2

    def test_dues_ytd_sums_payments_excluding_demo(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        cr = make_chapter(real, name="CR")
        cd = make_chapter(demo, name="CD")
        u = make_user(email="payer@example.com")
        db_session.commit()

        # Real payment counts; demo payment doesn't
        db_session.add(Payment(chapter_id=cr.id, user_id=u.id, amount=Decimal("125.00"), method="manual"))
        db_session.add(Payment(chapter_id=cd.id, user_id=u.id, amount=Decimal("999.00"), method="manual"))
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["dues_ytd"] == "125.00"

    def test_new_30d_orgs_only_counts_recent(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        old_org = make_organization(name="Old", abbreviation="OLD")
        old_org.created_at = datetime.now(timezone.utc) - timedelta(days=60)
        make_organization(name="New", abbreviation="NEW")  # created_at = now
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["organizations"]["total"] == 2
        assert body["summary"]["organizations"]["new_30d"] == 1
