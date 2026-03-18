"""
Chapter model — the primary tenant boundary.

Every chapter belongs to an organization and is the unit of data isolation.
All tenant-scoped data (payments, events, documents) references a chapter.
"""

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Chapter(BaseModel):
    __tablename__ = "chapter"

    organization_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("organization.id"), nullable=False, index=True
    )
    region_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("region.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(db.String(200), nullable=False)  # e.g. "Sigma Delta Sigma"
    designation: Mapped[str | None] = mapped_column(db.String(50), nullable=True)  # e.g. "ΣΔΣ", "Alpha Eta"
    chapter_type: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="graduate"
    )  # "undergraduate" or "graduate"
    city: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    country: Mapped[str] = mapped_column(db.String(100), nullable=False, default="United States")
    timezone: Mapped[str] = mapped_column(db.String(50), nullable=False, default="America/New_York")
    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(db.String(500), nullable=True)

    # Stripe Connect — each chapter has its own Stripe account
    stripe_account_id: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    stripe_onboarding_complete: Mapped[bool] = mapped_column(db.Boolean, default=False, nullable=False)

    # Subscription tier: "starter", "pro", "elite", "organization"
    subscription_tier: Mapped[str] = mapped_column(db.String(20), nullable=False, default="starter")

    # Chapter-level configuration (fee types, operational settings)
    config: Mapped[dict] = mapped_column(db.JSON, nullable=False, default=dict)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="chapters")
    region: Mapped["Region | None"] = relationship("Region", back_populates="chapters")
    memberships: Mapped[list["ChapterMembership"]] = relationship(
        "ChapterMembership", back_populates="chapter", lazy="dynamic"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "organization_id": self.organization_id,
            "region_id": self.region_id,
            "name": self.name,
            "designation": self.designation,
            "chapter_type": self.chapter_type,
            "city": self.city,
            "state": self.state,
            "country": self.country,
            "timezone": self.timezone,
            "active": self.active,
            "logo_url": self.logo_url,
            "stripe_onboarding_complete": self.stripe_onboarding_complete,
            "subscription_tier": self.subscription_tier,
            "config": self.config,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
