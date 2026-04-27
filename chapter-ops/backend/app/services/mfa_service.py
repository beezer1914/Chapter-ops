"""
MFA Service — all business logic for TOTP enrollment, verification, backup
codes, and admin reset.

Designed so the route layer (routes/mfa.py) is thin — it parses requests,
calls these functions, and shapes responses.
"""

import base64
import io
import logging
import secrets
from typing import Optional

import pyotp
import qrcode
from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

logger = logging.getLogger(__name__)


# ── Fernet (symmetric encryption of TOTP secrets at rest) ─────────────────


def _fernet() -> Fernet:
    """Get a Fernet instance using the MFA_SECRET_KEY config value.

    Raises RuntimeError if the key is not configured — surfaces clearly in
    Sentry rather than failing silently with a confusing decryption error.
    """
    key = current_app.config.get("MFA_SECRET_KEY")
    if not key:
        raise RuntimeError(
            "MFA_SECRET_KEY is not configured. Generate one with "
            "Fernet.generate_key().decode() and set it in the environment."
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext_secret: str) -> str:
    """Encrypt a base32 TOTP secret for at-rest storage. Returns ciphertext (utf-8)."""
    return _fernet().encrypt(plaintext_secret.encode()).decode()


def decrypt_secret(encrypted_secret: str) -> str:
    """Decrypt an at-rest TOTP secret. Raises InvalidToken on tamper/wrong key."""
    return _fernet().decrypt(encrypted_secret.encode()).decode()


# ── TOTP secret generation + QR rendering ─────────────────────────────────


def generate_secret() -> str:
    """Generate a fresh base32 TOTP secret (compatible with all authenticator apps)."""
    return pyotp.random_base32()


def build_otpauth_uri(secret: str, user_email: str, issuer: str = "ChapterOps") -> str:
    """Build the otpauth:// URI an authenticator app uses to add an account."""
    return pyotp.TOTP(secret).provisioning_uri(name=user_email, issuer_name=issuer)


def generate_qr_data_uri(otpauth_uri: str) -> str:
    """Render an otpauth URI as a base64 PNG data URI suitable for <img src>."""
    img = qrcode.make(otpauth_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"
