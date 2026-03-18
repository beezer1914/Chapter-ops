"""
PaymentPlan model — tenant-scoped recurring payment schedule.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class PaymentPlan(BaseModel):
    __tablename__ = "payment_plan"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    frequency: Mapped[str] = mapped_column(
        db.String(20), nullable=False
    )  # "weekly", "biweekly", "monthly"
    start_date: Mapped[date] = mapped_column(db.Date, nullable=False)
    end_date: Mapped[date] = mapped_column(db.Date, nullable=False)
    total_amount: Mapped[float] = mapped_column(db.Numeric(10, 2), nullable=False)
    installment_amount: Mapped[float] = mapped_column(db.Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="active"
    )  # "active", "completed", "cancelled"
    expected_installments: Mapped[int | None] = mapped_column(db.Integer, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", backref="payment_plans")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="plan", lazy="dynamic")

    def total_paid(self) -> Decimal:
        return sum((Decimal(str(p.amount)) for p in self.payments.all()), Decimal("0"))

    def is_complete(self) -> bool:
        return self.total_paid() >= Decimal(str(self.total_amount))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "user_id": self.user_id,
            "frequency": self.frequency,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "total_amount": str(self.total_amount),
            "installment_amount": str(self.installment_amount),
            "status": self.status,
            "expected_installments": self.expected_installments,
            "total_paid": str(self.total_paid()),
            "is_complete": self.is_complete(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
