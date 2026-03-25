"""
ChapterMilestone model — historical events in a chapter's story.

Examples: founding date, charter, recharters, suspensions,
reactivations, regional/national awards, notable achievements.
"""

from datetime import date

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


MILESTONE_TYPES = [
    "founding",
    "charter",
    "recharter",
    "suspended",
    "reactivated",
    "award",
    "achievement",
    "other",
]

MILESTONE_TYPE_LABELS = {
    "founding": "Founding",
    "charter": "Charter Granted",
    "recharter": "Re-Charted",
    "suspended": "Suspended",
    "reactivated": "Reactivated",
    "award": "Award",
    "achievement": "Achievement",
    "other": "Other",
}


class ChapterMilestone(BaseModel):
    __tablename__ = "chapter_milestone"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    created_by_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False
    )

    title: Mapped[str] = mapped_column(db.String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(db.Text, nullable=True)
    milestone_type: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="other"
    )
    date: Mapped[date] = mapped_column(db.Date, nullable=False)
    is_public: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)

    # Relationships
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "created_by_id": self.created_by_id,
            "created_by": {
                "id": self.created_by.id,
                "full_name": self.created_by.full_name,
            } if self.created_by else None,
            "title": self.title,
            "description": self.description,
            "milestone_type": self.milestone_type,
            "milestone_type_label": MILESTONE_TYPE_LABELS.get(
                self.milestone_type, self.milestone_type
            ),
            "date": self.date.isoformat(),
            "is_public": self.is_public,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
