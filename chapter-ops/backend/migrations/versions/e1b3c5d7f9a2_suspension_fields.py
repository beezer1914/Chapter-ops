"""suspension fields for chapter and chapter_membership

Revision ID: e1b3c5d7f9a2
Revises: d9e4f2a8b6c1
Create Date: 2026-04-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'e1b3c5d7f9a2'
down_revision = 'd9e4f2a8b6c1'
branch_labels = None
depends_on = None


def upgrade():
    # Chapter suspension
    op.add_column('chapter', sa.Column('suspended', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('chapter', sa.Column('suspension_reason', sa.String(length=500), nullable=True))

    # ChapterMembership suspension
    op.add_column('chapter_membership', sa.Column('suspended', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('chapter_membership', sa.Column('suspension_reason', sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column('chapter_membership', 'suspension_reason')
    op.drop_column('chapter_membership', 'suspended')
    op.drop_column('chapter', 'suspension_reason')
    op.drop_column('chapter', 'suspended')
