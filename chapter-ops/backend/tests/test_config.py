"""Tests for configuration security validation."""

import os

import pytest


class TestProductionConfigValidation:
    """Verify that production config rejects insecure settings."""

    def test_rejects_missing_secret_key(self, monkeypatch):
        monkeypatch.delenv("SECRET_KEY", raising=False)
        monkeypatch.delenv("DATABASE_URL", raising=False)

        from app.config import ProductionConfig
        with pytest.raises(ValueError, match="Missing required environment variables"):
            ProductionConfig.validate()

    def test_rejects_default_secret_key(self, monkeypatch):
        monkeypatch.setenv("SECRET_KEY", "dev-secret-change-me")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@db:5432/prod")
        monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
        monkeypatch.setenv("FRONTEND_URL", "https://app.chapterops.com")

        from app.config import ProductionConfig
        with pytest.raises(ValueError, match="insecure default"):
            ProductionConfig.validate()

    def test_rejects_short_secret_key(self, monkeypatch):
        monkeypatch.setenv("SECRET_KEY", "tooshort")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@db:5432/prod")
        monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
        monkeypatch.setenv("FRONTEND_URL", "https://app.chapterops.com")

        from app.config import ProductionConfig
        with pytest.raises(ValueError, match="too short"):
            ProductionConfig.validate()

    def test_rejects_localhost_frontend_url(self, monkeypatch):
        monkeypatch.setenv("SECRET_KEY", "a" * 64)
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@db:5432/prod")
        monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
        monkeypatch.setenv("FRONTEND_URL", "http://localhost:5173")

        from app.config import ProductionConfig
        with pytest.raises(ValueError, match="must not be localhost"):
            ProductionConfig.validate()

    def test_accepts_valid_production_config(self, monkeypatch):
        monkeypatch.setenv("SECRET_KEY", "a" * 64)
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@db:5432/prod")
        monkeypatch.setenv("REDIS_URL", "redis://:password@redis:6379/0")
        monkeypatch.setenv("FRONTEND_URL", "https://app.chapterops.com")

        from app.config import ProductionConfig
        # Should not raise
        ProductionConfig.validate()


class TestTestingConfig:
    """Verify test config is safe to use."""

    def test_uses_in_memory_database(self):
        from app.config import TestingConfig
        assert "memory" in TestingConfig.SQLALCHEMY_DATABASE_URI

    def test_csrf_disabled(self):
        from app.config import TestingConfig
        assert TestingConfig.WTF_CSRF_ENABLED is False

    def test_rate_limiting_disabled(self):
        from app.config import TestingConfig
        assert TestingConfig.RATELIMIT_ENABLED is False
