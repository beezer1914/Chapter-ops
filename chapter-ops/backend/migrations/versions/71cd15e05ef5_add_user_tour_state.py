"""add user_tour_state

Revision ID: 71cd15e05ef5
Revises: 29323ed26475
Create Date: 2026-04-19 17:53:28.160034

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '71cd15e05ef5'
down_revision = '29323ed26475'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_tour_state",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("seen", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_user_tour_state_user_id", "user_tour_state", ["user_id"])


def downgrade():
    op.drop_index("ix_user_tour_state_user_id", table_name="user_tour_state")
    op.drop_table("user_tour_state")
