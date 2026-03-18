"""
RegionMembership model — join table between User and Region.

Enables region-level roles like Regional Director, giving visibility
across all chapters within a region.
"""

from datetime import date

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class RegionMembership(BaseModel):
    __tablename__ = "region_membership"

    __table_args__ = (
        db.UniqueConstraint("user_id", "region_id", name="uq_user_region"),
    )

    user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    region_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("region.id"), nullable=False, index=True
    )

    role: Mapped[str] = mapped_column(
        db.String(30), nullable=False, default="member"
    )  # member, regional_director, regional_1st_vice, regional_2nd_vice, regional_secretary, regional_treasurer

    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)
    join_date: Mapped[date] = mapped_column(db.Date, nullable=False, default=date.today)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="region_memberships")
    region: Mapped["Region"] = relationship("Region", back_populates="memberships")

    ROLE_HIERARCHY = {
        "member": 0,
        "regional_secretary": 1,
        "regional_treasurer": 2,
        "regional_2nd_vice": 3,
        "regional_1st_vice": 4,
        "regional_director": 5,
    }

    def has_role(self, minimum_role: str) -> bool:
        """Check if this membership's role meets or exceeds the minimum."""
        return self.ROLE_HIERARCHY.get(self.role, 0) >= self.ROLE_HIERARCHY.get(minimum_role, 0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "region_id": self.region_id,
            "role": self.role,
            "active": self.active,
            "join_date": self.join_date.isoformat() if self.join_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
