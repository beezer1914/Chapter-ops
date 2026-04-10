"""
Committee model — a named chapter committee with a chair and budget.

Committees let chapters organize work and spending by functional area
(Social, Scholarship, Philanthropy, etc.). The chair is a regular member —
no new role tier needed. Budget tracking flows through expenses tagged
to a committee.
"""

from decimal import Decimal

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Committee(BaseModel):
    __tablename__ = "committee"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(db.String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Budget for the current/active period — treasurer updates this each period
    budget_amount: Mapped[Decimal] = mapped_column(
        db.Numeric(10, 2), nullable=False, default=Decimal("0")
    )

    # Chair is a regular chapter member — stored as a FK, no new role needed
    chair_user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    is_active: Mapped[bool] = mapped_column(
        db.Boolean, nullable=False, default=True, index=True
    )

    # Relationships
    chair: Mapped["User | None"] = relationship("User", foreign_keys=[chair_user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "name": self.name,
            "description": self.description,
            "budget_amount": str(self.budget_amount),
            "chair_user_id": self.chair_user_id,
            "chair": {
                "id": self.chair.id,
                "full_name": self.chair.full_name,
            } if self.chair else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
