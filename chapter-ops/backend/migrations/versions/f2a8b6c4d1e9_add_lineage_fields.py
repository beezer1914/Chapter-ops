"""Add lineage fields to chapter_membership and create chapter_milestone table

Revision ID: f2a8b6c4d1e9
Revises: e7b3a1d9c4f2
Create Date: 2026-03-24 15:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'f2a8b6c4d1e9'
down_revision = 'e7b3a1d9c4f2'
branch_labels = None
depends_on = None


def upgrade():
    # Add lineage columns to chapter_membership
    op.add_column('chapter_membership', sa.Column('big_id', sa.String(36), sa.ForeignKey('user.id'), nullable=True))
    op.add_column('chapter_membership', sa.Column('line_season', sa.String(100), nullable=True))
    op.add_column('chapter_membership', sa.Column('line_number', sa.Integer(), nullable=True))
    op.add_column('chapter_membership', sa.Column('line_name', sa.String(100), nullable=True))

    # Create chapter_milestone table
    op.create_table(
        'chapter_milestone',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('chapter_id', sa.String(36), sa.ForeignKey('chapter.id'), nullable=False),
        sa.Column('created_by_id', sa.String(36), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('milestone_type', sa.String(30), nullable=False, server_default='other'),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chapter_milestone_chapter_id', 'chapter_milestone', ['chapter_id'])
    op.create_index('ix_chapter_milestone_date', 'chapter_milestone', ['date'])


def downgrade():
    op.drop_index('ix_chapter_milestone_date', 'chapter_milestone')
    op.drop_index('ix_chapter_milestone_chapter_id', 'chapter_milestone')
    op.drop_table('chapter_milestone')
    op.drop_column('chapter_membership', 'line_name')
    op.drop_column('chapter_membership', 'line_number')
    op.drop_column('chapter_membership', 'line_season')
    op.drop_column('chapter_membership', 'big_id')
