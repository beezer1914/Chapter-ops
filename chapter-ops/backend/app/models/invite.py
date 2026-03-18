"""
InviteCode model — tenant-scoped invite system for chapter registration.
"""

from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class InviteCode(BaseModel):
    __tablename__ = "invite_code"

    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(db.String(20), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(db.String(30), nullable=False, default="member")
    used: Mapped[bool] = mapped_column(db.Boolean, default=False, nullable=False)
    used_by: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    created_by: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(db.DateTime(timezone=True), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(db.DateTime(timezone=True), nullable=True)

    # Relationships
    issuer: Mapped["User"] = relationship("User", foreign_keys=[created_by], backref="invites_created")
    redeemer: Mapped["User | None"] = relationship("User", foreign_keys=[used_by], backref="invite_used")

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.now(self.expires_at.tzinfo) > self.expires_at

    @property
    def is_valid(self) -> bool:
        return not self.used and not self.is_expired

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "code": self.code,
            "role": self.role,
            "used": self.used,
            "used_by": self.used_by,
            "created_by": self.created_by,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "used_at": self.used_at.isoformat() if self.used_at else None,
            "is_valid": self.is_valid,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
