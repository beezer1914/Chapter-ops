"""add chapter_period_dues table

Revision ID: a2b4c6d8e1f3
Revises: f1a2b3c4d5e6
Create Date: 2026-04-07 01:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a2b4c6d8e1f3'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'chapter_period_dues',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('chapter_id', sa.String(36), sa.ForeignKey('chapter.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_id', sa.String(36), sa.ForeignKey('chapter_period.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('fee_type_id', sa.String(50), nullable=False),
        sa.Column('fee_type_label', sa.String(100), nullable=False),
        sa.Column('amount_owed', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('amount_paid', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='unpaid'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('period_id', 'user_id', 'fee_type_id', name='uq_period_dues'),
    )
    op.create_index('ix_chapter_period_dues_chapter_id', 'chapter_period_dues', ['chapter_id'])
    op.create_index('ix_chapter_period_dues_period_id', 'chapter_period_dues', ['period_id'])
    op.create_index('ix_chapter_period_dues_user_id', 'chapter_period_dues', ['user_id'])
    op.create_index('ix_chapter_period_dues_status', 'chapter_period_dues', ['status'])


def downgrade():
    op.drop_index('ix_chapter_period_dues_status', table_name='chapter_period_dues')
    op.drop_index('ix_chapter_period_dues_user_id', table_name='chapter_period_dues')
    op.drop_index('ix_chapter_period_dues_period_id', table_name='chapter_period_dues')
    op.drop_index('ix_chapter_period_dues_chapter_id', table_name='chapter_period_dues')
    op.drop_table('chapter_period_dues')
