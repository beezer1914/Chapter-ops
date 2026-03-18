"""
KnowledgeArticle model — org/chapter-scoped knowledge base articles.
"""

from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel
from app.extensions import db

KB_CATEGORIES = ("general", "policy", "procedure", "faq", "how_to")
KB_SCOPES = ("organization", "chapter")
KB_STATUSES = ("draft", "published", "archived")


class KnowledgeArticle(BaseModel):
    __tablename__ = "knowledge_article"

    # Scope determines visibility: org-wide vs chapter-only
    scope: Mapped[str] = mapped_column(db.String(20), nullable=False, index=True)  # organization | chapter

    # Exactly one of these is set depending on scope
    organization_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("organization.id"), nullable=False, index=True
    )
    chapter_id: Mapped[Optional[str]] = mapped_column(
        db.String(36), ForeignKey("chapter.id"), nullable=True, index=True
    )

    created_by_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("user.id"), nullable=False
    )

    # Auto-generated article number, e.g. PBS-0001 or SDS-0042
    article_number: Mapped[str] = mapped_column(db.String(20), nullable=False, unique=True, index=True)

    title: Mapped[str] = mapped_column(db.String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(db.String(30), nullable=False, default="general", index=True)
    status: Mapped[str] = mapped_column(db.String(20), nullable=False, default="draft", index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Comma-separated tags for filtering/search
    tags: Mapped[Optional[str]] = mapped_column(db.String(500), nullable=True)

    # Relationships
    author = db.relationship("User", foreign_keys=[created_by_id], lazy="select")

    def to_dict(self, include_body: bool = True) -> dict:
        data = {
            "id": self.id,
            "scope": self.scope,
            "organization_id": self.organization_id,
            "chapter_id": self.chapter_id,
            "created_by_id": self.created_by_id,
            "author": {
                "id": self.author.id,
                "first_name": self.author.first_name,
                "last_name": self.author.last_name,
                "profile_picture_url": self.author.profile_picture_url,
            } if self.author else None,
            "article_number": self.article_number,
            "title": self.title,
            "category": self.category,
            "status": self.status,
            "is_featured": self.is_featured,
            "view_count": self.view_count,
            "tags": self.tags.split(",") if self.tags else [],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if include_body:
            data["body"] = self.body
        return data
