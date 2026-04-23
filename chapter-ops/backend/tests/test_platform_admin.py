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
