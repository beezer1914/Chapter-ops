import os
from pathlib import Path
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env", override=True)

# Insecure default keys that must NEVER be used in production
_INSECURE_SECRET_KEYS = {
    "dev-secret-change-me",
    "change-me-to-a-random-secret-key",
    "secret",
    "test-secret-key-not-for-production",
    "",
}


class BaseConfig:
    """Base configuration shared across all environments."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Session
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = 86400  # 24 hours

    # Redis
    REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    # Cache
    CACHE_TYPE = "RedisCache"
    CACHE_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    CACHE_DEFAULT_TIMEOUT = 300

    # Rate Limiting
    RATELIMIT_STORAGE_URI = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    # Stripe
    STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
    STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    STRIPE_CLIENT_ID = os.environ.get("STRIPE_CLIENT_ID", "")  # ca_xxx from Stripe Dashboard
    STRIPE_CONNECT_REDIRECT_URI = os.environ.get(
        "STRIPE_CONNECT_REDIRECT_URI", "http://localhost:5173/stripe/callback"
    )
    STRIPE_PLATFORM_FEE_PERCENT = float(
        os.environ.get("STRIPE_PLATFORM_FEE_PERCENT", "0")
    )

    # SendGrid (Email)
    SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
    SENDGRID_FROM_EMAIL = os.environ.get("SENDGRID_FROM_EMAIL", "noreply@chapterops.com")

    # Twilio
    TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER", "")

    # S3-Compatible Storage
    S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "chapterops-files")
    S3_REGION = os.environ.get("S3_REGION", "auto")
    S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "")  # API endpoint
    S3_PUBLIC_URL = os.environ.get("S3_PUBLIC_URL", "")  # Public R2.dev URL
    S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
    S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")

    # Frontend
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


class LocalConfig(BaseConfig):
    """Local development configuration."""
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql://chapterops:chapterops_dev@localhost:5432/chapterops"
    )
    SESSION_COOKIE_SECURE = False


class ProductionConfig(BaseConfig):
    """
    Production configuration.

    Enforces strict security requirements:
    - SECRET_KEY must be set to a strong, unique value (not a default)
    - DATABASE_URL must be set (no fallback)
    - Stripe keys required for payment processing
    - FRONTEND_URL must not be localhost
    - Session cookies are Secure + Strict SameSite
    """
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "")
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "Strict"

    @classmethod
    def validate(cls):
        """
        Ensure all required production variables are set and secure.

        Raises ValueError if any required variable is missing or if
        insecure defaults are detected.
        """
        # Required environment variables
        required = [
            "SECRET_KEY",
            "DATABASE_URL",
            "REDIS_URL",
            "FRONTEND_URL",
        ]
        missing = [var for var in required if not os.environ.get(var)]
        if missing:
            raise ValueError(
                f"Missing required environment variables for production: {', '.join(missing)}"
            )

        # Reject insecure SECRET_KEY values
        secret_key = os.environ.get("SECRET_KEY", "")
        if secret_key in _INSECURE_SECRET_KEYS:
            raise ValueError(
                "SECRET_KEY is set to an insecure default. "
                "Generate a strong random key: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if len(secret_key) < 32:
            raise ValueError(
                "SECRET_KEY is too short. Use at least 32 characters. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )

        # Reject localhost frontend URL in production
        frontend_url = os.environ.get("FRONTEND_URL", "")
        if "localhost" in frontend_url or "127.0.0.1" in frontend_url:
            raise ValueError(
                "FRONTEND_URL must not be localhost in production. "
                "Set it to your actual domain (e.g., https://app.chapterops.com)."
            )


class TestingConfig(BaseConfig):
    """Testing configuration."""
    TESTING = True
    SECRET_KEY = "test-secret-key-not-for-production"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    CACHE_TYPE = "SimpleCache"
    RATELIMIT_ENABLED = False
