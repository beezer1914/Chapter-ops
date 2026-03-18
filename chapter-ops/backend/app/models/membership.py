"""
ChapterMembership model — the join table between User and Chapter.

This is where roles and financial status live. A user can be a treasurer
in one chapter and a regular member in another.
"""

from datetime import date

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class ChapterMembership(BaseModel):
    __tablename__ = "chapter_membership"

    # Composite unique constraint: one active membership per user per chapter
    __table_args__ = (
        db.UniqueConstraint("user_id", "chapter_id", name="uq_user_chapter"),
    )

    user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )

    # Role within this chapter
    role: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="member"
    )  # member, secretary, treasurer, vice_president, president, admin

    # Financial status within this chapter
    financial_status: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="not_financial"
    )  # financial, not_financial, neophyte, exempt

    # Membership details
    initiation_date: Mapped[date | None] = mapped_column(db.Date, nullable=True)
    join_date: Mapped[date] = mapped_column(db.Date, nullable=False, default=date.today)
    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)

    # Custom field values for this member (org-defined fields)
    custom_fields: Mapped[dict] = mapped_column(db.JSON, nullable=False, default=dict)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="memberships")
    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="memberships")

    # Role hierarchy for permission checks
    ROLE_HIERARCHY = {
        "member": 0,
        "secretary": 1,
        "treasurer": 2,
        "vice_president": 3,
        "president": 4,
        "admin": 5,
    }

    def has_role(self, minimum_role: str) -> bool:
        """Check if this membership's role meets or exceeds the minimum."""
        return self.ROLE_HIERARCHY.get(self.role, 0) >= self.ROLE_HIERARCHY.get(minimum_role, 0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "chapter_id": self.chapter_id,
            "role": self.role,
            "financial_status": self.financial_status,
            "initiation_date": self.initiation_date.isoformat() if self.initiation_date else None,
            "join_date": self.join_date.isoformat() if self.join_date else None,
            "active": self.active,
            "custom_fields": self.custom_fields,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
