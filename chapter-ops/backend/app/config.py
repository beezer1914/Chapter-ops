import os
from pathlib import Path
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env", override=True)


def _normalize_db_url(url: str) -> str:
    # Render (and Heroku) hand out postgres:// URLs, but SQLAlchemy 2.x only accepts postgresql://.
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url

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

    # Limit incoming request bodies to 32 MB (file uploads have their own per-route limits)
    MAX_CONTENT_LENGTH = 32 * 1024 * 1024

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

    # Resend (Email)
    RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "noreply@chapterops.com")
    RESEND_REPLY_TO = os.environ.get("RESEND_REPLY_TO", "")

    # S3-Compatible Storage
    S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "chapterops-files")
    S3_REGION = os.environ.get("S3_REGION", "auto")
    S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "")  # API endpoint
    S3_PUBLIC_URL = os.environ.get("S3_PUBLIC_URL", "")  # Public R2.dev URL
    S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
    S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")

    # CSRF — SPA double-submit pattern via X-CSRFToken header
    WTF_CSRF_HEADERS = ["X-CSRFToken"]
    WTF_CSRF_TIME_LIMIT = None  # Token lives as long as the session
    # Disable the Referer/Host match check. The token itself (X-CSRFToken)
    # is the real protection; the referer check breaks behind reverse proxies
    # (e.g. Netlify → Render) where request.host and Referer differ.
    WTF_CSRF_SSL_STRICT = False

    # Frontend
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    # Google reCAPTCHA v3 — gates /auth/login and /auth/register. If
    # RECAPTCHA_SECRET_KEY is blank, verification is skipped (dev/CI).
    RECAPTCHA_SECRET_KEY = os.environ.get("RECAPTCHA_SECRET_KEY", "")
    RECAPTCHA_MIN_SCORE = float(os.environ.get("RECAPTCHA_MIN_SCORE", "0.5"))

    # Ops Agent
    FOUNDER_EMAIL = os.environ.get("FOUNDER_EMAIL", "")
    AGENT_ENABLED = os.environ.get("AGENT_ENABLED", "true").lower() not in ("false", "0", "no")
    AGENT_DIGEST_HOUR = int(os.environ.get("AGENT_DIGEST_HOUR", "7"))
    STATUSPAGE_API_KEY = os.environ.get("STATUSPAGE_API_KEY", "")
    STATUSPAGE_PAGE_ID = os.environ.get("STATUSPAGE_PAGE_ID", "")
    BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5000")


class LocalConfig(BaseConfig):
    """Local development configuration."""
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(os.environ.get(
        "DATABASE_URL",
        "postgresql://chapterops:chapterops_dev@localhost:5432/chapterops"
    ))
    SESSION_COOKIE_SECURE = False


class ProductionConfig(BaseConfig):
    """
    Production configuration.

    Enforces strict security requirements:
    - SECRET_KEY must be set to a strong, unique value (not a default)
    - DATABASE_URL must be set (no fallback)
    - Stripe keys required for payment processing
    - FRONTEND_URL must not be localhost
    - Session cookies are Secure + Lax SameSite (Lax is required for OAuth
      callback flows; CSRF is enforced via the X-CSRFToken header).
    """
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(os.environ.get("DATABASE_URL", ""))
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "Lax"

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
