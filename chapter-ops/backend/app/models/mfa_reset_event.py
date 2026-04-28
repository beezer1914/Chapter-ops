"""
MFAResetEvent model — audit log for MFA admin resets.

A separate, structured record (not just AuthEvent) because resets are
high-stakes and warrant actor + target + reason in a queryable form.
"""

from typing import Optional

from sqlalchemy import String, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models.base import BaseModel


class MFAResetEvent(BaseModel):
    __tablename__ = "mfa_reset_event"

    target_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Snapshot of actor's role at time of reset (preserved if their role changes later)
    actor_role_at_reset: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
