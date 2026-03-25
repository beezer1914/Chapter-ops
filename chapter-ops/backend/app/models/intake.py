"""
Intake models — MIP (Membership Intake Process) pipeline.

Candidates are NOT users until they cross. They live outside the
auth system entirely during intake. The 'cross' action is the only
moment a candidate enters the main system via an invite code.
"""

from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


INTAKE_STAGES = [
    "interested",
    "applied",
    "under_review",
    "chapter_vote",
    "national_submission",
    "approved",
    "crossed",
]

INTAKE_DOC_TYPES = ["transcript", "background_check", "recommendation", "other"]


class IntakeCandidate(BaseModel):
    __tablename__ = "intake_candidate"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )

    # Personal info — NOT a User during intake
    first_name: Mapped[str] = mapped_column(db.String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(db.String(100), nullable=False)
    email: Mapped[str] = mapped_column(db.String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(db.String(20), nullable=True)

    # Pipeline stage
    stage: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="interested"
    )  # see INTAKE_STAGES

    # Metadata
    semester: Mapped[str | None] = mapped_column(db.String(20), nullable=True)
    gpa: Mapped[float | None] = mapped_column(db.Numeric(3, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Officer assignment
    assigned_to_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )

    # D9 cultural data — set at crossing
    line_name: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    line_number: Mapped[int | None] = mapped_column(db.Integer, nullable=True)

    # Crossing — these are set when stage becomes "crossed"
    crossed_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    invite_code_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("invite_code.id"), nullable=True
    )

    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)

    # Relationships
    assigned_to: Mapped["User | None"] = relationship(
        "User", foreign_keys=[assigned_to_id]
    )
    crossed_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[user_id]
    )
    documents: Mapped[list["IntakeDocument"]] = relationship(
        "IntakeDocument", back_populates="candidate", lazy="dynamic"
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def to_dict(self, include_documents: bool = False) -> dict:
        data = {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "email": self.email,
            "phone": self.phone,
            "stage": self.stage,
            "semester": self.semester,
            "gpa": float(self.gpa) if self.gpa is not None else None,
            "notes": self.notes,
            "assigned_to_id": self.assigned_to_id,
            "assigned_to": {
                "id": self.assigned_to.id,
                "full_name": self.assigned_to.full_name,
            } if self.assigned_to else None,
            "line_name": self.line_name,
            "line_number": self.line_number,
            "crossed_at": self.crossed_at.isoformat() if self.crossed_at else None,
            "user_id": self.user_id,
            "invite_code_id": self.invite_code_id,
            "active": self.active,
            "document_count": self.documents.count(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_documents:
            data["documents"] = [d.to_dict() for d in self.documents.all()]
        return data


class IntakeDocument(BaseModel):
    __tablename__ = "intake_document"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    candidate_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("intake_candidate.id"), nullable=False, index=True
    )
    uploaded_by_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False
    )

    document_type: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="other"
    )  # see INTAKE_DOC_TYPES
    title: Mapped[str] = mapped_column(db.String(200), nullable=False)
    file_url: Mapped[str] = mapped_column(db.String(500), nullable=False)
    file_key: Mapped[str] = mapped_column(db.String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(db.String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(db.Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(db.String(100), nullable=False)

    # Relationships
    candidate: Mapped["IntakeCandidate"] = relationship(
        "IntakeCandidate", back_populates="documents"
    )
    uploader: Mapped["User"] = relationship("User", foreign_keys=[uploaded_by_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "candidate_id": self.candidate_id,
            "uploaded_by_id": self.uploaded_by_id,
            "uploader": {
                "id": self.uploader.id,
                "full_name": self.uploader.full_name,
            } if self.uploader else None,
            "document_type": self.document_type,
            "title": self.title,
            "file_url": self.file_url,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
