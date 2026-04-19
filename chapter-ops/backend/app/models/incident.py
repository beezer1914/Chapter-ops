"""
Incident models — risk management and upstream reporting.

Chapters report incidents (hazing, misconduct, injury, etc.) that route
upstream to regional directors and organization admins as a key operational
metric. Region and organization IDs are denormalized onto Incident so
upstream dashboards can query efficiently without joining through Chapter.

Three models:
  - Incident            — the report itself
  - IncidentAttachment  — optional file evidence (R2-backed, 24h edit window)
  - IncidentStatusEvent — immutable audit log of status transitions
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


INCIDENT_TYPES = (
    "hazing",
    "sexual_misconduct",
    "alcohol_drugs",
    "physical_altercation",
    "property_damage",
    "member_injury",
    "financial_misconduct",
    "discrimination",
    "other",
)

INCIDENT_SEVERITIES = ("low", "medium", "high", "critical")

INCIDENT_STATUSES = ("reported", "acknowledged", "under_review", "resolved", "closed")


class Incident(BaseModel):
    __tablename__ = "incident"

    # Tenant scoping — chapter is the primary boundary. region_id and
    # organization_id are denormalized for upstream queries.
    chapter_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("chapter.id"), nullable=False, index=True
    )
    region_id: Mapped[Optional[str]] = mapped_column(
        db.String(36), ForeignKey("region.id"), nullable=True, index=True
    )
    organization_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("organization.id"), nullable=False, index=True
    )
    reported_by_user_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("user.id"), nullable=False
    )

    # Human-friendly reference, e.g. "INC-2026-0042"
    reference_number: Mapped[str] = mapped_column(
        db.String(32), nullable=False, unique=True, index=True
    )

    incident_type: Mapped[str] = mapped_column(db.String(40), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(db.String(20), nullable=False, index=True)

    occurred_at: Mapped[datetime] = mapped_column(
        db.DateTime(timezone=True), nullable=False
    )
    location: Mapped[Optional[str]] = mapped_column(db.String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    individuals_involved: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    law_enforcement_notified: Mapped[bool] = mapped_column(
        db.Boolean, default=False, nullable=False
    )
    medical_attention_required: Mapped[bool] = mapped_column(
        db.Boolean, default=False, nullable=False
    )

    status: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="reported", index=True
    )

    acknowledged_by_user_id: Mapped[Optional[str]] = mapped_column(
        db.String(36), ForeignKey("user.id"), nullable=True
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    # Relationships
    chapter = relationship("Chapter", foreign_keys=[chapter_id], lazy="select")
    region = relationship("Region", foreign_keys=[region_id], lazy="select")
    organization = relationship("Organization", foreign_keys=[organization_id], lazy="select")
    reporter = relationship("User", foreign_keys=[reported_by_user_id], lazy="select")
    acknowledger = relationship("User", foreign_keys=[acknowledged_by_user_id], lazy="select")
    attachments = relationship(
        "IncidentAttachment", backref="incident", cascade="all, delete-orphan", lazy="select"
    )
    status_events = relationship(
        "IncidentStatusEvent",
        backref="incident",
        cascade="all, delete-orphan",
        order_by="IncidentStatusEvent.created_at.asc()",
        lazy="select",
    )

    def to_dict(self, include_attachments: bool = False, include_events: bool = False) -> dict:
        data = {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "chapter_name": self.chapter.name if self.chapter else None,
            "region_id": self.region_id,
            "region_name": self.region.name if self.region else None,
            "organization_id": self.organization_id,
            "reported_by_user_id": self.reported_by_user_id,
            "reported_by_name": self.reporter.full_name if self.reporter else None,
            "reference_number": self.reference_number,
            "incident_type": self.incident_type,
            "severity": self.severity,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
            "location": self.location,
            "description": self.description,
            "individuals_involved": self.individuals_involved,
            "law_enforcement_notified": self.law_enforcement_notified,
            "medical_attention_required": self.medical_attention_required,
            "status": self.status,
            "acknowledged_by_user_id": self.acknowledged_by_user_id,
            "acknowledged_by_name": self.acknowledger.full_name if self.acknowledger else None,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolution_notes": self.resolution_notes,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "attachment_count": len(self.attachments) if self.attachments is not None else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_attachments:
            data["attachments"] = [a.to_dict() for a in self.attachments]
        if include_events:
            data["status_events"] = [e.to_dict() for e in self.status_events]
        return data


class IncidentAttachment(BaseModel):
    __tablename__ = "incident_attachment"

    incident_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("incident.id"), nullable=False, index=True
    )
    uploaded_by_user_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("user.id"), nullable=False
    )
    file_url: Mapped[str] = mapped_column(db.String(1024), nullable=False)
    file_key: Mapped[str] = mapped_column(db.String(512), nullable=False)
    file_name: Mapped[str] = mapped_column(db.String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(db.Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(db.String(100), nullable=False)

    uploader = relationship("User", foreign_keys=[uploaded_by_user_id], lazy="select")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "incident_id": self.incident_id,
            "uploaded_by_user_id": self.uploaded_by_user_id,
            "uploaded_by_name": self.uploader.full_name if self.uploader else None,
            "file_url": self.file_url,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class IncidentStatusEvent(BaseModel):
    __tablename__ = "incident_status_event"

    incident_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("incident.id"), nullable=False, index=True
    )
    changed_by_user_id: Mapped[str] = mapped_column(
        db.String(36), ForeignKey("user.id"), nullable=False
    )
    from_status: Mapped[Optional[str]] = mapped_column(db.String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(db.String(30), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    changed_by = relationship("User", foreign_keys=[changed_by_user_id], lazy="select")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "incident_id": self.incident_id,
            "changed_by_user_id": self.changed_by_user_id,
            "changed_by_name": self.changed_by.full_name if self.changed_by else None,
            "from_status": self.from_status,
            "to_status": self.to_status,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
