"""
ChapterRequest model — captures a pending ask to found a new chapter.

On approval, a real Chapter + ChapterPeriod + founder ChapterMembership
are created atomically. Rejected and cancelled requests are retained for
audit; approved requests keep a pointer to the resulting_chapter_id.
"""

from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


VALID_STATUSES = {"pending", "approved", "rejected", "cancelled"}
VALID_FOUNDER_ROLES = {"member", "secretary", "treasurer", "vice_president", "president"}
VALID_APPROVER_SCOPES = {"org_admin", "platform_admin"}


class ChapterRequest(BaseModel):
    __tablename__ = "chapter_request"

    __table_args__ = (
        db.Index(
            "uq_chapter_request_pending",
            "organization_id", "region_id", "name_normalized",
            unique=True,
            postgresql_where=db.text("status = 'pending'"),
            sqlite_where=db.text("status = 'pending'"),
        ),
        db.Index("ix_chapter_request_requester_status", "requester_user_id", "status"),
        db.Index("ix_chapter_request_approver_status", "approver_scope", "status"),
    )

    requester_user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    organization_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("organization.id"), nullable=False, index=True
    )
    region_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("region.id"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(db.String(200), nullable=False)
    name_normalized: Mapped[str] = mapped_column(db.String(200), nullable=False)
    designation: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    chapter_type: Mapped[str] = mapped_column(db.String(20), nullable=False)
    city: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    country: Mapped[str] = mapped_column(db.String(100), nullable=False, default="United States")
    timezone: Mapped[str] = mapped_column(db.String(50), nullable=False, default="America/New_York")

    founder_role: Mapped[str] = mapped_column(db.String(30), nullable=False)
    status: Mapped[str] = mapped_column(db.String(20), nullable=False, default="pending")
    approver_scope: Mapped[str] = mapped_column(db.String(20), nullable=False)

    approved_by_user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    rejected_reason: Mapped[str | None] = mapped_column(db.Text, nullable=True)
    resulting_chapter_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=True
    )
    acted_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    # Relationships
    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_user_id])
    organization: Mapped["Organization"] = relationship("Organization")
    region: Mapped["Region"] = relationship("Region")
    approver: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by_user_id])
    resulting_chapter: Mapped["Chapter | None"] = relationship(
        "Chapter", foreign_keys=[resulting_chapter_id]
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "requester_user_id": self.requester_user_id,
            "requester_name": self.requester.full_name if self.requester else None,
            "requester_email": self.requester.email if self.requester else None,
            "organization_id": self.organization_id,
            "organization_name": self.organization.name if self.organization else None,
            "region_id": self.region_id,
            "region_name": self.region.name if self.region else None,
            "name": self.name,
            "designation": self.designation,
            "chapter_type": self.chapter_type,
            "city": self.city,
            "state": self.state,
            "country": self.country,
            "timezone": self.timezone,
            "founder_role": self.founder_role,
            "status": self.status,
            "approver_scope": self.approver_scope,
            "approved_by_user_id": self.approved_by_user_id,
            "rejected_reason": self.rejected_reason,
            "resulting_chapter_id": self.resulting_chapter_id,
            "acted_at": self.acted_at.isoformat() if self.acted_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
