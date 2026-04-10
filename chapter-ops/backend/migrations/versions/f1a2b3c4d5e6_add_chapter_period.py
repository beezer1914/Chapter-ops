"""add chapter_period table

Revision ID: f1a2b3c4d5e6
Revises: e1b3c5d7f9a2
Create Date: 2026-04-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e1b3c5d7f9a2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'chapter_period',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('chapter_id', sa.String(36), sa.ForeignKey('chapter.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('period_type', sa.String(20), nullable=False, server_default='semester'),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chapter_period_chapter_id', 'chapter_period', ['chapter_id'])
    op.create_index('ix_chapter_period_is_active', 'chapter_period', ['is_active'])


def downgrade():
    op.drop_index('ix_chapter_period_is_active', table_name='chapter_period')
    op.drop_index('ix_chapter_period_chapter_id', table_name='chapter_period')
    op.drop_table('chapter_period')
