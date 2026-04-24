"""Tests for the platform-admin (founder) helper + gating."""

import pytest
from flask import Flask

from app.utils.platform_admin import is_founder
from tests.conftest import make_user


class TestIsFounder:
    def test_is_founder_when_email_matches(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password="Str0ng!Password1")
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "brandon@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")  # establish session context
            assert is_founder() is True

    def test_not_founder_when_email_mismatch(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="someone@example.com", password="Str0ng!Password1")
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "someone@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is False

    def test_not_founder_when_unauthenticated(self, app, client):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        with client:
            assert is_founder() is False

    def test_not_founder_when_config_empty(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = ""
        make_user(email="brandon@example.com", password="Str0ng!Password1")
        db_session.commit()
        client.post("/api/auth/login", json={
            "email": "brandon@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is False

    def test_email_comparison_is_case_insensitive(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "Brandon@Example.COM"
        make_user(email="brandon@example.com", password="Str0ng!Password1")
        db_session.commit()
        client.post("/api/auth/login", json={
            "email": "brandon@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is True

    def test_platform_admin_email_overrides_founder_email(self, app, client, db_session):
        """When PLATFORM_ADMIN_EMAIL is set, it's used for identity — not FOUNDER_EMAIL."""
        # Delivery address is different from login address
        app.config["FOUNDER_EMAIL"] = "digest@example.com"
        app.config["PLATFORM_ADMIN_EMAIL"] = "login@example.com"
        make_user(email="login@example.com", password="Str0ng!Password1")
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "login@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is True

    def test_founder_email_used_when_platform_admin_email_unset(self, app, client, db_session):
        """With PLATFORM_ADMIN_EMAIL unset, FOUNDER_EMAIL remains the identity (back-compat)."""
        app.config["PLATFORM_ADMIN_EMAIL"] = ""
        app.config["FOUNDER_EMAIL"] = "single@example.com"
        make_user(email="single@example.com", password="Str0ng!Password1")
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "single@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is True

    def test_auth_user_exposes_is_platform_admin_true_for_founder(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password="Str0ng!Password1")
        db_session.commit()
        client.post("/api/auth/login", json={
            "email": "brandon@example.com",
            "password": "Str0ng!Password1",
        })
        resp = client.get("/api/auth/user")
        assert resp.status_code == 200
        assert resp.get_json()["is_platform_admin"] is True

    def test_auth_user_exposes_is_platform_admin_false_for_others(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="someone@example.com", password="Str0ng!Password1")
        db_session.commit()
        client.post("/api/auth/login", json={
            "email": "someone@example.com",
            "password": "Str0ng!Password1",
        })
        resp = client.get("/api/auth/user")
        assert resp.get_json()["is_platform_admin"] is False
