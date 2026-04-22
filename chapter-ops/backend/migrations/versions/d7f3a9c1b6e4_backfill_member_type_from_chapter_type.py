"""Backfill member_type from chapter_type

Revision ID: d7f3a9c1b6e4
Revises: c3e6f8b1d4a7
Create Date: 2026-04-22

"""
from alembic import op


revision = 'd7f3a9c1b6e4'
down_revision = 'c3e6f8b1d4a7'
branch_labels = None
depends_on = None


def upgrade():
    # Align member_type with the owning chapter's chapter_type for rows that were
    # created under the old DB default of 'collegiate'. Leave 'life' memberships
    # alone — they're explicit and should not be overwritten.
    op.execute(
        """
        UPDATE chapter_membership AS cm
        SET member_type = 'graduate'
        FROM chapter AS c
        WHERE cm.chapter_id = c.id
          AND c.chapter_type = 'graduate'
          AND cm.member_type = 'collegiate'
        """
    )


def downgrade():
    # No-op: the upgrade reconciles data to match ground truth; reverting would
    # reintroduce the bug by forcing graduate-chapter members back to collegiate.
    pass
