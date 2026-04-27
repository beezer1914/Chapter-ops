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


# ── Backup codes ───────────────────────────────────────────────────────────

# Base32 alphabet minus ambiguous characters (no 0, O, 1, I, L)
BACKUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
BACKUP_CODE_COUNT = 10


def generate_backup_codes() -> list[str]:
    """Generate 10 fresh backup codes in XXXX-XXXX format."""
    codes = []
    for _ in range(BACKUP_CODE_COUNT):
        chars = "".join(secrets.choice(BACKUP_CODE_ALPHABET) for _ in range(8))
        codes.append(f"{chars[:4]}-{chars[4:]}")
    return codes


def hash_backup_codes(codes: list[str]) -> list[str]:
    """Hash each code with bcrypt. Returns list of hash strings (same order as input)."""
    from app.extensions import bcrypt
    return [bcrypt.generate_password_hash(c.upper()).decode("utf-8") for c in codes]


def consume_backup_code(hashes: list, submitted_code: str) -> tuple[list, bool]:
    """
    Try to consume `submitted_code` against the list of hashes.

    Returns (updated_hashes, matched_bool). If matched, the matching slot in
    the returned list is set to None. If not matched, the returned list is
    unchanged. Comparison is case-insensitive (codes are normalized to upper).
    """
    from app.extensions import bcrypt
    normalized = submitted_code.strip().upper()
    new_hashes = list(hashes)
    for i, h in enumerate(new_hashes):
        if h is None:
            continue
        if bcrypt.check_password_hash(h, normalized):
            new_hashes[i] = None
            return new_hashes, True
    return new_hashes, False
