"""
UserTourState model — persists per-user onboarding tour progress.

Stores a JSON object keyed by tour ID, where each value records when
the tour was seen and which role the user held at the time. One row
per user (unique constraint on user_id).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import ForeignKey, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class UserTourState(BaseModel):
    __tablename__ = "user_tour_state"

    user_id: Mapped[str] = mapped_column(
        db.String(36),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    seen: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),
        nullable=False,
        default=dict,
    )

    user = relationship("User", backref=db.backref("tour_state", uselist=False))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "seen": self.seen,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
