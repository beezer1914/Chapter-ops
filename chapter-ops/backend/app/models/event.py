"""
Event and EventAttendance models — tenant-scoped chapter events.

Event: A chapter event (social, fundraiser, community service).
EventAttendance: An RSVP/ticket for an event (member or non-member).
"""

import secrets
from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Event(BaseModel):
    __tablename__ = "events"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    created_by: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )

    title: Mapped[str] = mapped_column(db.String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(db.Text, nullable=True)
    event_type: Mapped[str] = mapped_column(
        db.String(50), nullable=False
    )  # social | fundraiser | community_service

    start_datetime: Mapped[datetime] = mapped_column(
        db.DateTime(timezone=True), nullable=False
    )
    end_datetime: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    location: Mapped[str | None] = mapped_column(db.String(300), nullable=True)

    capacity: Mapped[int | None] = mapped_column(db.Integer, nullable=True)  # null = unlimited
    is_paid: Mapped[bool] = mapped_column(db.Boolean, default=False, nullable=False)
    ticket_price: Mapped[float | None] = mapped_column(db.Numeric(10, 2), nullable=True)

    is_public: Mapped[bool] = mapped_column(db.Boolean, default=False, nullable=False)
    public_slug: Mapped[str | None] = mapped_column(
        db.String(20), unique=True, nullable=True, index=True
    )

    status: Mapped[str] = mapped_column(
        db.String(20), default="published", nullable=False
    )  # draft | published | cancelled

    service_hours: Mapped[float | None] = mapped_column(
        db.Numeric(4, 2), nullable=True
    )  # for community_service type
    banner_image_url: Mapped[str | None] = mapped_column(db.String(500), nullable=True)

    # Relationships
    chapter: Mapped["Chapter"] = relationship("Chapter", backref="events")
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])
    attendances: Mapped[list["EventAttendance"]] = relationship(
        "EventAttendance", back_populates="event", cascade="all, delete-orphan"
    )

    @staticmethod
    def generate_slug() -> str:
        """Generate a unique 8-character hex slug for public events."""
        return secrets.token_hex(4)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "created_by": self.created_by,
            "title": self.title,
            "description": self.description,
            "event_type": self.event_type,
            "start_datetime": self.start_datetime.isoformat() if self.start_datetime else None,
            "end_datetime": self.end_datetime.isoformat() if self.end_datetime else None,
            "location": self.location,
            "capacity": self.capacity,
            "is_paid": self.is_paid,
            "ticket_price": str(self.ticket_price) if self.ticket_price is not None else None,
            "is_public": self.is_public,
            "public_slug": self.public_slug,
            "status": self.status,
            "service_hours": str(self.service_hours) if self.service_hours is not None else None,
            "banner_image_url": self.banner_image_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class EventAttendance(BaseModel):
    __tablename__ = "event_attendance"
    __table_args__ = (
        db.UniqueConstraint("event_id", "user_id", name="uq_event_user_attendance"),
    )

    event_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("events.id"), nullable=False, index=True
    )
    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )

    # Member RSVP (logged-in user)
    user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True, index=True
    )

    # Non-member RSVP (public form)
    attendee_name: Mapped[str | None] = mapped_column(db.String(200), nullable=True)
    attendee_email: Mapped[str | None] = mapped_column(db.String(255), nullable=True)

    rsvp_status: Mapped[str] = mapped_column(
        db.String(20), default="going", nullable=False
    )  # going | not_going | maybe

    checked_in: Mapped[bool] = mapped_column(db.Boolean, default=False, nullable=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    payment_status: Mapped[str] = mapped_column(
        db.String(20), default="free", nullable=False
    )  # free | pending | paid
    stripe_session_id: Mapped[str | None] = mapped_column(
        db.String(200), nullable=True, unique=True
    )
    ticket_price_paid: Mapped[float | None] = mapped_column(db.Numeric(10, 2), nullable=True)

    notes: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="attendances")
    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "event_id": self.event_id,
            "chapter_id": self.chapter_id,
            "user_id": self.user_id,
            "attendee_name": self.attendee_name,
            "attendee_email": self.attendee_email,
            "rsvp_status": self.rsvp_status,
            "checked_in": self.checked_in,
            "checked_in_at": self.checked_in_at.isoformat() if self.checked_in_at else None,
            "payment_status": self.payment_status,
            "stripe_session_id": self.stripe_session_id,
            "ticket_price_paid": str(self.ticket_price_paid) if self.ticket_price_paid is not None else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
