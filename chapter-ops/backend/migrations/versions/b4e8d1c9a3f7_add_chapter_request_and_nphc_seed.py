"""add chapter_request and NPHC seed

Revision ID: b4e8d1c9a3f7
Revises: d7f3a9c1b6e4
Create Date: 2026-04-23
"""

import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b4e8d1c9a3f7"
down_revision = "d7f3a9c1b6e4"
branch_labels = None
depends_on = None


NPHC_ORGS = [
    # Divine Nine — alphabetical by abbreviation
    {
        "name": "Alpha Kappa Alpha Sorority, Inc.",
        "abbreviation": "AKA",
        "greek_letters": "ΑΚΑ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1908,
        "motto": "By Culture and By Merit",
    },
    {
        "name": "Alpha Phi Alpha Fraternity, Inc.",
        "abbreviation": "APA",
        "greek_letters": "ΑΦΑ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1906,
        "motto": "First of All, Servants of All, We Shall Transcend All",
    },
    {
        "name": "Delta Sigma Theta Sorority, Inc.",
        "abbreviation": "DST",
        "greek_letters": "ΔΣΘ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1913,
        "motto": "Intelligence is the Torch of Wisdom",
    },
    {
        "name": "Iota Phi Theta Fraternity, Inc.",
        "abbreviation": "IPT",
        "greek_letters": "ΙΦΘ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1963,
        "motto": "Building a Tradition, Not Resting Upon One",
    },
    {
        "name": "Kappa Alpha Psi Fraternity, Inc.",
        "abbreviation": "KAPsi",
        "greek_letters": "ΚΑΨ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1911,
        "motto": "Achievement in Every Field of Human Endeavor",
    },
    {
        "name": "Omega Psi Phi Fraternity, Inc.",
        "abbreviation": "OPP",
        "greek_letters": "ΩΨΦ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1911,
        "motto": "Friendship is Essential to the Soul",
    },
    {
        "name": "Phi Beta Sigma Fraternity, Inc.",
        "abbreviation": "PBS",
        "greek_letters": "ΦΒΣ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1914,
        "motto": "Culture for Service and Service for Humanity",
    },
    {
        "name": "Sigma Gamma Rho Sorority, Inc.",
        "abbreviation": "SGRho",
        "greek_letters": "ΣΓΡ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1922,
        "motto": "Greater Service, Greater Progress",
    },
    {
        "name": "Zeta Phi Beta Sorority, Inc.",
        "abbreviation": "ZPhiB",
        "greek_letters": "ΖΦΒ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1920,
        "motto": "A Community-Conscious, Action-Oriented Organization",
    },
]


def upgrade():
    # ── Create chapter_request table ──────────────────────────────────────
    op.create_table(
        "chapter_request",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("requester_user_id", sa.String(length=36), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("organization_id", sa.String(length=36), sa.ForeignKey("organization.id"), nullable=False),
        sa.Column("region_id", sa.String(length=36), sa.ForeignKey("region.id"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("name_normalized", sa.String(length=200), nullable=False),
        sa.Column("designation", sa.String(length=100), nullable=True),
        sa.Column("chapter_type", sa.String(length=20), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=False, server_default="United States"),
        sa.Column("timezone", sa.String(length=50), nullable=False, server_default="America/New_York"),
        sa.Column("founder_role", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("approver_scope", sa.String(length=20), nullable=False),
        sa.Column("approved_by_user_id", sa.String(length=36), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("rejected_reason", sa.Text, nullable=True),
        sa.Column("resulting_chapter_id", sa.String(length=36), sa.ForeignKey("chapter.id"), nullable=True),
        sa.Column("acted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chapter_request_requester_user_id", "chapter_request", ["requester_user_id"])
    op.create_index("ix_chapter_request_organization_id", "chapter_request", ["organization_id"])
    op.create_index("ix_chapter_request_region_id", "chapter_request", ["region_id"])
    op.create_index(
        "uq_chapter_request_pending",
        "chapter_request",
        ["organization_id", "region_id", "name_normalized"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "ix_chapter_request_requester_status",
        "chapter_request",
        ["requester_user_id", "status"],
    )
    op.create_index(
        "ix_chapter_request_approver_status",
        "chapter_request",
        ["approver_scope", "status"],
    )

    # ── Seed NPHC orgs (idempotent: skip by abbreviation) ─────────────────
    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    for org_data in NPHC_ORGS:
        existing = conn.execute(
            sa.text("SELECT id FROM organization WHERE abbreviation = :abbr"),
            {"abbr": org_data["abbreviation"]},
        ).fetchone()

        if existing:
            org_id = existing[0]
        else:
            org_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO organization (
                        id, name, abbreviation, greek_letters, org_type, council,
                        founded_year, motto, active, plan, config, created_at, updated_at
                    ) VALUES (
                        :id, :name, :abbreviation, :greek_letters, :org_type, :council,
                        :founded_year, :motto, TRUE, 'beta', '{}', :created_at, :updated_at
                    )
                """),
                {
                    "id": org_id,
                    "name": org_data["name"],
                    "abbreviation": org_data["abbreviation"],
                    "greek_letters": org_data["greek_letters"],
                    "org_type": org_data["org_type"],
                    "council": org_data["council"],
                    "founded_year": org_data["founded_year"],
                    "motto": org_data["motto"],
                    "created_at": now,
                    "updated_at": now,
                },
            )

        # ── Upsert "Unaffiliated" region for this org (idempotent) ────────
        existing_region = conn.execute(
            sa.text("""
                SELECT id FROM region
                 WHERE organization_id = :org_id AND name = 'Unaffiliated'
            """),
            {"org_id": org_id},
        ).fetchone()

        if not existing_region:
            conn.execute(
                sa.text("""
                    INSERT INTO region (
                        id, organization_id, name, description, active, config,
                        created_at, updated_at
                    ) VALUES (
                        :id, :org_id, 'Unaffiliated',
                        'Default region for chapters operating outside a formal IHQ regional structure.',
                        TRUE, '{}', :created_at, :updated_at
                    )
                """),
                {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "created_at": now,
                    "updated_at": now,
                },
            )


def downgrade():
    # Drop the chapter_request table. Do NOT delete seeded orgs/regions —
    # they may have dependent data (chapters, memberships) by the time a
    # downgrade is attempted. Manual cleanup required if truly needed.
    op.drop_index("ix_chapter_request_approver_status", table_name="chapter_request")
    op.drop_index("ix_chapter_request_requester_status", table_name="chapter_request")
    op.drop_index("uq_chapter_request_pending", table_name="chapter_request")
    op.drop_index("ix_chapter_request_region_id", table_name="chapter_request")
    op.drop_index("ix_chapter_request_organization_id", table_name="chapter_request")
    op.drop_index("ix_chapter_request_requester_user_id", table_name="chapter_request")
    op.drop_table("chapter_request")
