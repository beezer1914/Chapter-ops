"""
Region model — intermediate organizational unit between Organization and Chapter.

Examples: Eastern Region, Southern Region, Western Region.
Each region belongs to an organization and contains multiple chapters.
"""

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Region(BaseModel):
    __tablename__ = "region"

    # Parent organization
    organization_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("organization.id"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(db.String(200), nullable=False)
    abbreviation: Mapped[str | None] = mapped_column(db.String(20), nullable=True)
    description: Mapped[str | None] = mapped_column(db.String(500), nullable=True)
    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)

    # Region-level configuration
    config: Mapped[dict] = mapped_column(db.JSON, nullable=False, default=dict)

    # ── Stripe Connect (Deploy 1) ────────────────────────────────
    stripe_account_id: Mapped[str | None] = mapped_column(
        db.String(100), nullable=True
    )
    stripe_onboarding_complete: Mapped[bool] = mapped_column(
        db.Boolean, default=False, nullable=False
    )

    __table_args__ = (
        db.UniqueConstraint("organization_id", "name", name="uq_org_region_name"),
    )

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="regions")
    chapters: Mapped[list["Chapter"]] = relationship("Chapter", back_populates="region", lazy="dynamic")
    memberships: Mapped[list["RegionMembership"]] = relationship(
        "RegionMembership", back_populates="region", lazy="dynamic"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "organization_id": self.organization_id,
            "name": self.name,
            "abbreviation": self.abbreviation,
            "description": self.description,
            "active": self.active,
            "config": self.config,
            "stripe_account_id": self.stripe_account_id,
            "stripe_onboarding_complete": self.stripe_onboarding_complete,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
