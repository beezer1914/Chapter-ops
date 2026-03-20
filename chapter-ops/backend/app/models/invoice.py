"""
Invoice model — supports both chapter→member and region→chapter invoicing.

Chapter invoices: treasurer bills a member for dues/fees.
Regional invoices: regional treasurer bills a chapter (e.g., head tax).
"""

from datetime import date, datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Invoice(BaseModel):
    __tablename__ = "invoice"

    # ── Scope ────────────────────────────────────────────────────
    # "member" = chapter→member invoice, "chapter" = region→chapter invoice
    scope: Mapped[str] = mapped_column(
        db.String(20), nullable=False
    )  # "member" | "chapter"

    # ── Chapter-level invoicing (member dues) ────────────────────
    chapter_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=True, index=True
    )
    billed_user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True, index=True
    )
    fee_type_id: Mapped[str | None] = mapped_column(
        db.String(50), nullable=True
    )

    # ── Regional invoicing (head tax) ────────────────────────────
    region_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("region.id"), nullable=True, index=True
    )
    billed_chapter_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=True, index=True
    )
    per_member_rate: Mapped[float | None] = mapped_column(
        db.Numeric(10, 2), nullable=True
    )
    member_count: Mapped[int | None] = mapped_column(
        db.Integer, nullable=True
    )

    # ── Shared fields ────────────────────────────────────────────
    invoice_number: Mapped[str] = mapped_column(
        db.String(30), nullable=False, unique=True, index=True
    )
    description: Mapped[str] = mapped_column(db.String(500), nullable=False)
    amount: Mapped[float] = mapped_column(db.Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="draft"
    )  # "draft" | "sent" | "paid" | "overdue" | "cancelled"
    due_date: Mapped[date] = mapped_column(db.Date, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # ── Payment linkage ──────────────────────────────────────────
    payment_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("payment.id"), nullable=True
    )

    # ── Who created the invoice ──────────────────────────────────
    created_by_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False
    )

    # ── Relationships ────────────────────────────────────────────
    chapter: Mapped["Chapter | None"] = relationship(
        "Chapter", foreign_keys=[chapter_id], backref="invoices_issued"
    )
    billed_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[billed_user_id], backref="invoices"
    )
    region: Mapped["Region | None"] = relationship(
        "Region", backref="invoices"
    )
    billed_chapter: Mapped["Chapter | None"] = relationship(
        "Chapter", foreign_keys=[billed_chapter_id], backref="invoices_received"
    )
    payment: Mapped["Payment | None"] = relationship(
        "Payment", backref="invoice"
    )
    created_by: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_id]
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "scope": self.scope,
            "chapter_id": self.chapter_id,
            "billed_user_id": self.billed_user_id,
            "fee_type_id": self.fee_type_id,
            "region_id": self.region_id,
            "billed_chapter_id": self.billed_chapter_id,
            "per_member_rate": str(self.per_member_rate) if self.per_member_rate else None,
            "member_count": self.member_count,
            "invoice_number": self.invoice_number,
            "description": self.description,
            "amount": str(self.amount),
            "status": self.status,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "notes": self.notes,
            "payment_id": self.payment_id,
            "created_by_id": self.created_by_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
