"""AuditEvent — append-only log of security-relevant mutations.

Currently used by Stripe Connect routes to record connect/disconnect
events at chapter, region, and organization tiers. Designed to grow
into other security-sensitive flows over time.
"""

from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models.base import BaseModel


class AuditEvent(BaseModel):
    __tablename__ = "audit_event"

    actor_user_id: Mapped[str | None] = mapped_column(
        db.String(36),
        db.ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        db.String(64), nullable=False, index=True
    )
    target_type: Mapped[str] = mapped_column(db.String(20), nullable=False)
    target_id: Mapped[str] = mapped_column(db.String(36), nullable=False)
    details: Mapped[dict] = mapped_column(db.JSON, nullable=False, default=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "actor_user_id": self.actor_user_id,
            "event_type": self.event_type,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "details": self.details,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
