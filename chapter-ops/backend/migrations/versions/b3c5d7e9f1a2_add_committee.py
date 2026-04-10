"""add committee table

Revision ID: b3c5d7e9f1a2
Revises: a2b4c6d8e1f3
Create Date: 2026-04-08 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'b3c5d7e9f1a2'
down_revision = 'a2b4c6d8e1f3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'committee',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('chapter_id', sa.String(36), sa.ForeignKey('chapter.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('budget_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('chair_user_id', sa.String(36), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_committee_chapter_id', 'committee', ['chapter_id'])
    op.create_index('ix_committee_chair_user_id', 'committee', ['chair_user_id'])
    op.create_index('ix_committee_is_active', 'committee', ['is_active'])


def downgrade():
    op.drop_index('ix_committee_is_active', table_name='committee')
    op.drop_index('ix_committee_chair_user_id', table_name='committee')
    op.drop_index('ix_committee_chapter_id', table_name='committee')
    op.drop_table('committee')
