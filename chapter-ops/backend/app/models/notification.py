"""
Notification model — tenant-scoped user notifications.

Every notification belongs to a chapter (via chapter_id) and optionally to a specific user.
If recipient_id is NULL, the notification is chapter-wide (visible to all members).
"""

from datetime import datetime

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Notification(BaseModel):
    __tablename__ = "notification"
    __table_args__ = (
        # Composite index for the notification polling query:
        # WHERE chapter_id = ? AND (recipient_id = ? OR recipient_id IS NULL) AND is_read = false
        Index("ix_notification_chapter_recipient_read", "chapter_id", "recipient_id", "is_read"),
    )

    # Multi-tenant scoping
    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )

    # Recipient (null = all chapter members)
    recipient_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True, index=True
    )

    # Notification content
    type: Mapped[str] = mapped_column(
        db.String(50), nullable=False
    )  # "payment", "workflow", "member", "invite"
    title: Mapped[str] = mapped_column(db.String(200), nullable=False)
    message: Mapped[str] = mapped_column(db.Text, nullable=False)

    # Optional link for action
    link: Mapped[str | None] = mapped_column(db.String(500), nullable=True)

    # State management
    is_read: Mapped[bool] = mapped_column(db.Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    # Relationships
    chapter: Mapped["Chapter"] = relationship("Chapter", backref="notifications")
    recipient: Mapped["User | None"] = relationship("User", backref="notifications")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "recipient_id": self.recipient_id,
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "link": self.link,
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
