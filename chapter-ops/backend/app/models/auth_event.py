"""
AuthEvent model — records every login attempt, logout, and password change.

Used by the ops agent to detect brute-force patterns and suspicious logins.
Records are purged after 90 days via a scheduled agent cleanup job.

Never store passwords, tokens, or other secrets here.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey

from app.extensions import db
from app.models.base import BaseModel


class AuthEvent(BaseModel):
    __tablename__ = "auth_event"

    # Nullable — failed attempts may not map to a valid user
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, index=True)  # IPv4 or IPv6
    event_type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # "login_success" | "login_failure" | "logout" | "password_change"
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    country_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "ip_address": self.ip_address,
            "event_type": self.event_type,
            "user_agent": self.user_agent,
            "country_code": self.country_code,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
