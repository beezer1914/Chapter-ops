"""
OrganizationMembership model — join table between User and Organization.

Enables organization-level roles like admin, giving org-wide visibility
and the ability to manage regions and regional directors.
"""

from datetime import date

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class OrganizationMembership(BaseModel):
    __tablename__ = "organization_membership"

    __table_args__ = (
        db.UniqueConstraint("user_id", "organization_id", name="uq_user_organization"),
    )

    user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    organization_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("organization.id"), nullable=False, index=True
    )

    role: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="member"
    )  # member, admin

    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)
    join_date: Mapped[date] = mapped_column(db.Date, nullable=False, default=date.today)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="org_memberships")
    organization: Mapped["Organization"] = relationship("Organization", back_populates="memberships")

    ROLE_HIERARCHY = {
        "member": 0,
        "admin": 5,
    }

    def has_role(self, minimum_role: str) -> bool:
        """Check if this membership's role meets or exceeds the minimum."""
        return self.ROLE_HIERARCHY.get(self.role, 0) >= self.ROLE_HIERARCHY.get(minimum_role, 0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "organization_id": self.organization_id,
            "role": self.role,
            "active": self.active,
            "join_date": self.join_date.isoformat() if self.join_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
