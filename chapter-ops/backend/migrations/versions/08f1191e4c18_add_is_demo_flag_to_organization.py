"""add is_demo flag to organization

Revision ID: 08f1191e4c18
Revises: c6e9b3f7a0d2
Create Date: 2026-04-25 22:34:59.343488
"""
from alembic import op
import sqlalchemy as sa

revision = '08f1191e4c18'
down_revision = 'c6e9b3f7a0d2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organization', sa.Column('is_demo', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade():
    op.drop_column('organization', 'is_demo')
