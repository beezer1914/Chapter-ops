"""
ChapterPeriodDues model — per-member, per-fee-type dues obligation for a period.

One row per (period, member, fee_type). Tracks how much is owed, how much has
been paid, and the resulting status. This is the ground truth for financial status
when the dues system is active.

Status values:
  unpaid   — nothing paid yet
  partial  — some paid, not all
  paid     — fully satisfied
  exempt   — member is exempt from this fee (life member, officer waiver, etc.)
"""

from decimal import Decimal

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel

DUES_STATUSES = ("unpaid", "partial", "paid", "exempt")


class ChapterPeriodDues(BaseModel):
    __tablename__ = "chapter_period_dues"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    period_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter_period.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Matches the fee type id from chapter.config.fee_types
    fee_type_id: Mapped[str] = mapped_column(db.String(50), nullable=False)
    # Denormalized label — preserved even if fee type is renamed later
    fee_type_label: Mapped[str] = mapped_column(db.String(100), nullable=False)

    amount_owed: Mapped[Decimal] = mapped_column(db.Numeric(10, 2), nullable=False, default=Decimal("0"))
    amount_paid: Mapped[Decimal] = mapped_column(db.Numeric(10, 2), nullable=False, default=Decimal("0"))

    status: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="unpaid", index=True
    )  # "unpaid" | "partial" | "paid" | "exempt"

    notes: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", backref="period_dues")

    __table_args__ = (
        db.UniqueConstraint("period_id", "user_id", "fee_type_id", name="uq_period_dues"),
    )

    def to_dict(self, include_user: bool = False) -> dict:
        data = {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "period_id": self.period_id,
            "user_id": self.user_id,
            "fee_type_id": self.fee_type_id,
            "fee_type_label": self.fee_type_label,
            "amount_owed": str(self.amount_owed),
            "amount_paid": str(self.amount_paid),
            "amount_remaining": str(max(Decimal("0"), self.amount_owed - self.amount_paid)),
            "status": self.status,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_user and self.user:
            data["user"] = {
                "id": self.user.id,
                "full_name": self.user.full_name,
                "email": self.user.email,
            }
        return data
