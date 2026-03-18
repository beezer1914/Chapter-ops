"""
User model — global user account.

Users are NOT tenant-scoped. A user can belong to multiple chapters
via ChapterMembership. Authentication is global; authorization is per-chapter.
"""

from flask_login import UserMixin
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db, bcrypt
from app.models.base import BaseModel


class User(BaseModel, UserMixin):
    __tablename__ = "user"

    email: Mapped[str] = mapped_column(db.String(120), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(db.String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(db.String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(db.String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(db.String(20), nullable=True)
    profile_picture_url: Mapped[str | None] = mapped_column(db.String(500), nullable=True)
    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)

    # The chapter the user is currently operating in (session-level context)
    active_chapter_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=True
    )

    # Relationships
    active_chapter: Mapped["Chapter | None"] = relationship("Chapter", foreign_keys=[active_chapter_id])
    memberships: Mapped[list["ChapterMembership"]] = relationship(
        "ChapterMembership", back_populates="user", lazy="dynamic"
    )
    region_memberships: Mapped[list["RegionMembership"]] = relationship(
        "RegionMembership", back_populates="user", lazy="dynamic"
    )
    org_memberships: Mapped[list["OrganizationMembership"]] = relationship(
        "OrganizationMembership", back_populates="user", lazy="dynamic"
    )

    def set_password(self, password: str) -> None:
        self.password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    def check_password(self, password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, password)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def get_membership(self, chapter_id: str) -> "ChapterMembership | None":
        """Get the user's membership record for a specific chapter."""
        return self.memberships.filter_by(chapter_id=chapter_id, active=True).first()

    def get_region_membership(self, region_id: str) -> "RegionMembership | None":
        """Get the user's membership record for a specific region."""
        return self.region_memberships.filter_by(region_id=region_id, active=True).first()

    def get_org_membership(self, organization_id: str) -> "OrganizationMembership | None":
        """Get the user's membership record for a specific organization."""
        return self.org_memberships.filter_by(organization_id=organization_id, active=True).first()

    def get_role_in_chapter(self, chapter_id: str) -> str | None:
        """Get the user's role in a specific chapter."""
        membership = self.get_membership(chapter_id)
        return membership.role if membership else None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "phone": self.phone,
            "profile_picture_url": self.profile_picture_url,
            "active": self.active,
            "active_chapter_id": self.active_chapter_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_dict_with_membership(self, chapter_id: str) -> dict:
        """Serialize user with their role in a specific chapter."""
        data = self.to_dict()
        membership = self.get_membership(chapter_id)
        if membership:
            data["membership"] = membership.to_dict()
        return data
