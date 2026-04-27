"""
UserMFA model — TOTP secret + backup codes for a user's two-factor auth.

The secret is encrypted at rest with Fernet using MFA_SECRET_KEY env var.
Backup codes are bcrypt-hashed individually, stored as a JSON array (single-
use; consumed slot becomes null).
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Boolean, ForeignKey, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models.base import BaseModel


class UserMFA(BaseModel):
    __tablename__ = "user_mfa"
    __table_args__ = (
        db.UniqueConstraint("user_id", name="uq_user_mfa_user_id"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Fernet-encrypted TOTP secret (decrypted only at verification time)
    secret: Mapped[str] = mapped_column(String(200), nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=db.text("false")
    )
    # Array of bcrypt hashes (or null for consumed slots)
    backup_codes_hashed: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list
    )
    enrolled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
