"""
ChapterPeriod model — a named billing/activity period for a chapter.

Undergraduate chapters typically use semesters (Spring 2026, Fall 2026).
Graduate/alumni chapters typically use annual periods (FY 2026).
Custom periods accommodate any other cadence.

A chapter can have many periods, but only one is active at a time.
"""

from datetime import date

from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models.base import BaseModel

PERIOD_TYPES = ("semester", "annual", "custom")


class ChapterPeriod(BaseModel):
    __tablename__ = "chapter_period"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(
        db.String(100), nullable=False
    )  # e.g. "Spring 2026", "FY 2026", "Fall 2025"

    period_type: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="semester"
    )  # "semester" | "annual" | "custom"

    start_date: Mapped[date] = mapped_column(db.Date, nullable=False)
    end_date: Mapped[date] = mapped_column(db.Date, nullable=False)

    is_active: Mapped[bool] = mapped_column(
        db.Boolean, nullable=False, default=False, index=True
    )

    notes: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "name": self.name,
            "period_type": self.period_type,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "is_active": self.is_active,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
