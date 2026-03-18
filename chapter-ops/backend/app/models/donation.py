"""
Donation model — tenant-scoped donation tracking.

Donations are separate from dues and can come from members or non-members.
"""

from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models.base import BaseModel


class Donation(BaseModel):
    __tablename__ = "donation"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    donor_name: Mapped[str] = mapped_column(db.String(100), nullable=False)
    donor_email: Mapped[str | None] = mapped_column(db.String(120), nullable=True)
    amount: Mapped[float] = mapped_column(db.Numeric(10, 2), nullable=False)
    method: Mapped[str] = mapped_column(
        db.String(50), nullable=False, default="stripe"
    )  # "stripe", "cash", "check", etc.
    notes: Mapped[str | None] = mapped_column(db.String(500), nullable=True)
    stripe_session_id: Mapped[str | None] = mapped_column(db.String(200), nullable=True)

    # Optional link to a user (if the donor is a registered member)
    user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "donor_name": self.donor_name,
            "donor_email": self.donor_email,
            "amount": str(self.amount),
            "method": self.method,
            "notes": self.notes,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
