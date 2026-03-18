"""
Announcement model — chapter-scoped bulletin board posts.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel
from app.extensions import db


class Announcement(BaseModel):
    __tablename__ = "announcement"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("chapter.id"), nullable=False, index=True
    )
    created_by_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("user.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(db.String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    author = db.relationship("User", foreign_keys=[created_by_id], lazy="select")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "created_by_id": self.created_by_id,
            "author": {
                "id": self.author.id,
                "first_name": self.author.first_name,
                "last_name": self.author.last_name,
                "profile_picture_url": self.author.profile_picture_url,
            } if self.author else None,
            "title": self.title,
            "body": self.body,
            "is_pinned": self.is_pinned,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
