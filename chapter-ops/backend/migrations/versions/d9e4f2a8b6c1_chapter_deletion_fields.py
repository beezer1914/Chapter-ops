"""chapter deletion fields

Revision ID: d9e4f2a8b6c1
Revises: c4606ba68c1f
Create Date: 2026-04-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd9e4f2a8b6c1'
down_revision = 'c4606ba68c1f'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('chapter', sa.Column('deletion_requested_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('chapter', sa.Column('deletion_scheduled_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_chapter_deletion_scheduled_at', 'chapter', ['deletion_scheduled_at'], unique=False)


def downgrade():
    op.drop_index('ix_chapter_deletion_scheduled_at', table_name='chapter')
    op.drop_column('chapter', 'deletion_scheduled_at')
    op.drop_column('chapter', 'deletion_requested_at')
