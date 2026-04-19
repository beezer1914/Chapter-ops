"""fix user_tour_state timestamp defaults

Revision ID: a1b2c3d4e5f6
Revises: 71cd15e05ef5
Create Date: 2026-04-19 19:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '71cd15e05ef5'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "user_tour_state",
        "created_at",
        server_default=sa.func.now(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        "user_tour_state",
        "updated_at",
        server_default=sa.func.now(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )


def downgrade():
    op.alter_column(
        "user_tour_state",
        "updated_at",
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        "user_tour_state",
        "created_at",
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
