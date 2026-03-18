"""
Document model — chapter-scoped file vault.
"""

from typing import Optional

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel
from app.extensions import db

DOCUMENT_CATEGORIES = ("minutes", "bylaws", "financials", "forms", "other")


class Document(BaseModel):
    __tablename__ = "document"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("chapter.id"), nullable=False, index=True
    )
    uploaded_by_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("user.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(db.String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(
        db.String(50), nullable=False, default="other", index=True
    )
    file_url: Mapped[str] = mapped_column(db.String(1024), nullable=False)
    file_key: Mapped[str] = mapped_column(db.String(512), nullable=False)
    file_name: Mapped[str] = mapped_column(db.String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(db.Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(db.String(100), nullable=False)

    # Relationships
    uploader = db.relationship("User", foreign_keys=[uploaded_by_id], lazy="select")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "uploaded_by_id": self.uploaded_by_id,
            "uploader": {
                "id": self.uploader.id,
                "first_name": self.uploader.first_name,
                "last_name": self.uploader.last_name,
                "profile_picture_url": self.uploader.profile_picture_url,
            } if self.uploader else None,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "file_url": self.file_url,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
