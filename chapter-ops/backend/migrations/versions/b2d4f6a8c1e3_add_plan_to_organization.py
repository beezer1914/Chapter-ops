"""Add plan field to organization for subscription tier tracking

Revision ID: b2d4f6a8c1e3
Revises: a1c3e5b7d9f2
Create Date: 2026-03-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2d4f6a8c1e3'
down_revision = 'a1c3e5b7d9f2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'organization',
        sa.Column('plan', sa.String(20), nullable=False, server_default='beta')
    )


def downgrade():
    op.drop_column('organization', 'plan')
