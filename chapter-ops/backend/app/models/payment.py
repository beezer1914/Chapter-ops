"""
Payment model — tenant-scoped financial record.

Every payment belongs to a chapter (via chapter_id) and a user.
"""

from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Payment(BaseModel):
    __tablename__ = "payment"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(db.Numeric(10, 2), nullable=False)
    payment_type: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="one-time"
    )  # "one-time", "installment"
    method: Mapped[str] = mapped_column(
        db.String(50), nullable=False, default="stripe"
    )  # "stripe", "cash", "check", "bank_transfer", "manual"
    notes: Mapped[str | None] = mapped_column(db.String(500), nullable=True)
    stripe_session_id: Mapped[str | None] = mapped_column(db.String(200), nullable=True)

    # Fee type reference (from chapter.config.fee_types)
    fee_type_id: Mapped[str | None] = mapped_column(db.String(50), nullable=True)

    # Link to payment plan (if this is an installment)
    plan_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("payment_plan.id"), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", backref="payments")
    plan: Mapped["PaymentPlan | None"] = relationship("PaymentPlan", back_populates="payments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "user_id": self.user_id,
            "amount": str(self.amount),
            "payment_type": self.payment_type,
            "method": self.method,
            "notes": self.notes,
            "fee_type_id": self.fee_type_id,
            "plan_id": self.plan_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
