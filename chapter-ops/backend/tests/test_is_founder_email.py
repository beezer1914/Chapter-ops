"""Tests for is_founder_email() helper."""

import pytest
from app.utils.platform_admin import is_founder_email


class TestIsFounderEmail:
    @pytest.fixture(autouse=True)
    def _cleanup_config(self, app):
        """Clean up config after each test to avoid cross-test pollution."""
        yield
        # Restore defaults after each test
        app.config["FOUNDER_EMAIL"] = ""
        app.config["PLATFORM_ADMIN_EMAIL"] = ""
    def test_returns_true_when_email_matches_founder(self, app):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        assert is_founder_email("brandon@example.com") is True

    def test_case_insensitive(self, app):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        assert is_founder_email("BRANDON@EXAMPLE.COM") is True

    def test_returns_false_when_no_match(self, app):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        assert is_founder_email("someone@example.com") is False

    def test_returns_false_when_config_empty(self, app):
        app.config["FOUNDER_EMAIL"] = ""
        assert is_founder_email("brandon@example.com") is False

    def test_returns_false_when_email_empty(self, app):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        assert is_founder_email("") is False
        assert is_founder_email(None) is False

    def test_prefers_platform_admin_email_over_founder_email(self, app):
        app.config["FOUNDER_EMAIL"] = "delivery@example.com"
        app.config["PLATFORM_ADMIN_EMAIL"] = "identity@example.com"
        assert is_founder_email("identity@example.com") is True
        assert is_founder_email("delivery@example.com") is False
