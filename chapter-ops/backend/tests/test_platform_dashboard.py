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
