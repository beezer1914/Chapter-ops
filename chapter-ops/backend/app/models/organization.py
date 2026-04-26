"""
Organization model — represents a national Greek letter organization.

Examples: Phi Beta Sigma Fraternity, Inc., Alpha Kappa Alpha Sorority, Inc.
"""

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


class Organization(BaseModel):
    __tablename__ = "organization"

    name: Mapped[str] = mapped_column(db.String(200), nullable=False)
    abbreviation: Mapped[str] = mapped_column(db.String(20), nullable=False)  # e.g. "PBS", "AKA"
    greek_letters: Mapped[str | None] = mapped_column(db.String(50), nullable=True)  # e.g. "ΦΒΣ"
    org_type: Mapped[str] = mapped_column(db.String(20), nullable=False)  # "fraternity" or "sorority"
    council: Mapped[str | None] = mapped_column(db.String(20), nullable=True)  # "NPHC", "NPC", "IFC", etc.
    founded_year: Mapped[int | None] = mapped_column(db.Integer, nullable=True)
    motto: Mapped[str | None] = mapped_column(db.String(300), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(db.String(500), nullable=True)
    website: Mapped[str | None] = mapped_column(db.String(300), nullable=True)
    active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)

    # True for fictional demo organizations seeded for prospect demos
    # (e.g., DGLO). Excluded from platform-wide metrics.
    is_demo: Mapped[bool] = mapped_column(
        db.Boolean,
        nullable=False,
        default=False,
        server_default=db.text("false"),
    )

    # Subscription plan: "beta" | "starter" | "pro" | "elite" | "organization"
    # "beta" = Chapter Pro features at $0 during beta period
    plan: Mapped[str] = mapped_column(db.String(20), nullable=False, default="beta")

    # ── Stripe Connect (Deploy 1) ────────────────────────────────
    stripe_account_id: Mapped[str | None] = mapped_column(
        db.String(100), nullable=True
    )
    stripe_onboarding_complete: Mapped[bool] = mapped_column(
        db.Boolean, default=False, nullable=False
    )

    # Organization-level configuration (role titles, custom member fields)
    config: Mapped[dict] = mapped_column(db.JSON, nullable=False, default=dict)

    # Relationships
    chapters: Mapped[list["Chapter"]] = relationship("Chapter", back_populates="organization", lazy="dynamic")
    regions: Mapped[list["Region"]] = relationship("Region", back_populates="organization", lazy="dynamic")
    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        "OrganizationMembership", back_populates="organization", lazy="dynamic"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "abbreviation": self.abbreviation,
            "greek_letters": self.greek_letters,
            "org_type": self.org_type,
            "council": self.council,
            "founded_year": self.founded_year,
            "motto": self.motto,
            "logo_url": self.logo_url,
            "website": self.website,
            "active": self.active,
            "is_demo": self.is_demo,
            "plan": self.plan,
            "stripe_onboarding_complete": self.stripe_onboarding_complete,
            "config": self.config,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
