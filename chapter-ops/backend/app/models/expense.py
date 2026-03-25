"""
Expense model — chapter-scoped reimbursement requests.

Any member can submit an expense request. Treasurer+ approves, denies,
or marks it paid. Receipt uploads are stored in R2.
"""

from datetime import date, datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


EXPENSE_CATEGORIES = [
    "travel",
    "supplies",
    "equipment",
    "food_beverage",
    "venue",
    "other",
]

EXPENSE_CATEGORY_LABELS = {
    "travel": "Travel",
    "supplies": "Supplies",
    "equipment": "Equipment",
    "food_beverage": "Food & Beverage",
    "venue": "Venue",
    "other": "Other",
}

EXPENSE_STATUSES = ["pending", "approved", "paid", "denied"]


class Expense(BaseModel):
    __tablename__ = "expense"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    submitted_by_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )

    # Expense details
    title: Mapped[str] = mapped_column(db.String(200), nullable=False)
    amount: Mapped[float] = mapped_column(db.Numeric(10, 2), nullable=False)
    category: Mapped[str] = mapped_column(db.String(30), nullable=False, default="other")
    expense_date: Mapped[date] = mapped_column(db.Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="pending"
    )  # pending, approved, paid, denied

    # Review info (set when approved/denied)
    reviewer_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    denial_reason: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Payment tracking
    paid_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    # Receipt (optional R2-backed file)
    receipt_url: Mapped[str | None] = mapped_column(db.String(500), nullable=True)
    receipt_key: Mapped[str | None] = mapped_column(db.String(500), nullable=True)
    receipt_name: Mapped[str | None] = mapped_column(db.String(255), nullable=True)
    receipt_size: Mapped[int | None] = mapped_column(db.Integer, nullable=True)
    receipt_mime: Mapped[str | None] = mapped_column(db.String(100), nullable=True)

    # Relationships
    submitted_by: Mapped["User"] = relationship("User", foreign_keys=[submitted_by_id])
    reviewer: Mapped["User | None"] = relationship("User", foreign_keys=[reviewer_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "submitted_by_id": self.submitted_by_id,
            "submitted_by": {
                "id": self.submitted_by.id,
                "full_name": self.submitted_by.full_name,
                "email": self.submitted_by.email,
            } if self.submitted_by else None,
            "title": self.title,
            "amount": str(self.amount),
            "category": self.category,
            "category_label": EXPENSE_CATEGORY_LABELS.get(self.category, self.category),
            "expense_date": self.expense_date.isoformat(),
            "notes": self.notes,
            "status": self.status,
            "reviewer_id": self.reviewer_id,
            "reviewer": {
                "id": self.reviewer.id,
                "full_name": self.reviewer.full_name,
            } if self.reviewer else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "denial_reason": self.denial_reason,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "receipt_url": self.receipt_url,
            "receipt_name": self.receipt_name,
            "receipt_size": self.receipt_size,
            "receipt_mime": self.receipt_mime,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
