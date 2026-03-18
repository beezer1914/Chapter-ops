"""
ChapterTransferRequest model.

Tracks a member's request to transfer from one chapter to another.
Both the sending and receiving chapter presidents must approve before
the transfer is executed automatically.

Status flow:
  pending → approved_by_from → approved  (fully approved, transfer executed)
  pending → approved_by_from → denied
  pending → denied
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class ChapterTransferRequest(BaseModel):
    __tablename__ = "chapter_transfer_request"

    requesting_user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    from_chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    to_chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    reason: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Status: pending | approved_by_from | approved | denied
    status: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="pending", index=True
    )

    # Approval tracking
    from_chapter_approved_by: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    from_chapter_approved_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    to_chapter_approved_by: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    to_chapter_approved_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    # Denial tracking
    denied_by: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    denied_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    denial_reason: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Relationships
    requesting_user: Mapped["User"] = relationship(
        "User", foreign_keys=[requesting_user_id], backref="transfer_requests"
    )
    from_chapter: Mapped["Chapter"] = relationship(
        "Chapter", foreign_keys=[from_chapter_id]
    )
    to_chapter: Mapped["Chapter"] = relationship(
        "Chapter", foreign_keys=[to_chapter_id]
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "requesting_user_id": self.requesting_user_id,
            "requesting_user_name": self.requesting_user.full_name if self.requesting_user else None,
            "from_chapter_id": self.from_chapter_id,
            "from_chapter_name": self.from_chapter.name if self.from_chapter else None,
            "to_chapter_id": self.to_chapter_id,
            "to_chapter_name": self.to_chapter.name if self.to_chapter else None,
            "reason": self.reason,
            "status": self.status,
            "from_chapter_approved_by": self.from_chapter_approved_by,
            "from_chapter_approved_at": self.from_chapter_approved_at.isoformat() if self.from_chapter_approved_at else None,
            "to_chapter_approved_by": self.to_chapter_approved_by,
            "to_chapter_approved_at": self.to_chapter_approved_at.isoformat() if self.to_chapter_approved_at else None,
            "denied_by": self.denied_by,
            "denied_at": self.denied_at.isoformat() if self.denied_at else None,
            "denial_reason": self.denial_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
