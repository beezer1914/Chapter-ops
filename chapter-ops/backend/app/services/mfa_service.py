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

from app.extensions import db

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


# ── TOTP verification ──────────────────────────────────────────────────────


def verify_totp(secret: str, submitted_code: str) -> bool:
    """Verify a 6-digit TOTP code against the secret. Allows ±30 sec drift."""
    if not submitted_code or not submitted_code.isdigit() or len(submitted_code) != 6:
        return False
    return pyotp.TOTP(secret).verify(submitted_code, valid_window=1)


# ── Role-based enforcement ────────────────────────────────────────────────


def user_role_requires_mfa(user) -> bool:
    """True if `user` holds any role that mandates MFA enrollment.

    Always returns False when MFA_ENFORCEMENT_ENABLED is unset/false. This is
    the master kill-switch for the rollout.
    """
    if not current_app.config.get("MFA_ENFORCEMENT_ENABLED", False):
        return False

    from app.models import (
        ChapterMembership, RegionMembership, OrganizationMembership,
    )
    from app.utils.platform_admin import is_founder_email

    # Treasurer+ in any active chapter
    if ChapterMembership.query.filter(
        ChapterMembership.user_id == user.id,
        ChapterMembership.active.is_(True),
        ChapterMembership.role.in_(["treasurer", "vice_president", "president", "admin"]),
    ).first() is not None:
        return True

    # Any active regional officer (anything other than plain "member")
    if RegionMembership.query.filter(
        RegionMembership.user_id == user.id,
        RegionMembership.active.is_(True),
        RegionMembership.role != "member",
    ).first() is not None:
        return True

    # Org admin
    if OrganizationMembership.query.filter(
        OrganizationMembership.user_id == user.id,
        OrganizationMembership.active.is_(True),
        OrganizationMembership.role == "admin",
    ).first() is not None:
        return True

    # Platform admin
    return is_founder_email(user.email)


# ── Admin reset authorization ─────────────────────────────────────────────


def can_reset_mfa(actor, target) -> bool:
    """True if `actor` is permitted to reset `target`'s MFA.

    Rules:
      - Actor MUST themselves be MFA-enrolled (downgrade-attack guard).
      - Platform Admin (founder) can reset anyone.
      - Org Admin can reset any user with at least one membership in their org.
      - President can reset Treasurer/VP/Secretary in their own chapter.
    """
    from app.models import (
        ChapterMembership, OrganizationMembership, UserMFA, Chapter,
    )
    from app.utils.platform_admin import is_founder_email

    # Downgrade-attack guard: actor must have active MFA
    actor_mfa = UserMFA.query.filter_by(user_id=actor.id, enabled=True).first()
    if actor_mfa is None:
        return False

    # Platform admin escape hatch
    if is_founder_email(actor.email):
        return True

    # Org admin can reset anyone in their org
    actor_org_admin_org_ids = [
        om.organization_id for om in OrganizationMembership.query.filter_by(
            user_id=actor.id, role="admin", active=True
        ).all()
    ]
    if actor_org_admin_org_ids:
        # Target must have at least one membership in one of these orgs
        target_chapter_orgs = (
            db.session.query(Chapter.organization_id)
            .join(ChapterMembership, ChapterMembership.chapter_id == Chapter.id)
            .filter(ChapterMembership.user_id == target.id, ChapterMembership.active.is_(True))
            .distinct()
            .all()
        )
        for (org_id,) in target_chapter_orgs:
            if org_id in actor_org_admin_org_ids:
                return True
        # Also check if target is themselves an org admin in actor's org
        target_org_ids = [
            om.organization_id for om in OrganizationMembership.query.filter_by(
                user_id=target.id, active=True
            ).all()
        ]
        for org_id in target_org_ids:
            if org_id in actor_org_admin_org_ids:
                return True
        return False

    # President in same chapter, target is treasurer/vp/secretary
    actor_president_chapter_ids = [
        cm.chapter_id for cm in ChapterMembership.query.filter_by(
            user_id=actor.id, role="president", active=True
        ).all()
    ]
    if actor_president_chapter_ids:
        target_membership = ChapterMembership.query.filter(
            ChapterMembership.user_id == target.id,
            ChapterMembership.chapter_id.in_(actor_president_chapter_ids),
            ChapterMembership.active.is_(True),
            ChapterMembership.role.in_(["treasurer", "vice_president", "secretary"]),
        ).first()
        if target_membership is not None:
            return True

    return False
