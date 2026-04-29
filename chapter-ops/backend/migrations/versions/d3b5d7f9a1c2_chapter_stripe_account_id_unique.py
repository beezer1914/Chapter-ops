"""tighten chapter.stripe_account_id to partial unique

Drops the existing non-unique ix_chapter_stripe_account_id and
recreates it as a partial unique index, matching the index shape
already on organization and region (added in c6e9b3f7a0d2).

Revision ID: d3b5d7f9a1c2
Revises: d2a4c6e8b0f1
Create Date: 2026-04-29 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd3b5d7f9a1c2'
down_revision = 'd2a4c6e8b0f1'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index('ix_chapter_stripe_account_id', table_name='chapter')
    op.create_index(
        'uq_chapter_stripe_account_id',
        'chapter',
        ['stripe_account_id'],
        unique=True,
        postgresql_where=sa.text('stripe_account_id IS NOT NULL'),
    )


def downgrade():
    op.drop_index('uq_chapter_stripe_account_id', table_name='chapter')
    op.create_index(
        'ix_chapter_stripe_account_id',
        'chapter',
        ['stripe_account_id'],
        unique=False,
    )
