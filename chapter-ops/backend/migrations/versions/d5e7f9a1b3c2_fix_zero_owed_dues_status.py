"""fix zero-owed dues rows incorrectly set to unpaid

Revision ID: d5e7f9a1b3c2
Revises: c4d6e8f0a2b3
Create Date: 2026-04-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'd5e7f9a1b3c2'
down_revision = 'c4d6e8f0a2b3'
branch_labels = None
depends_on = None


def upgrade():
    # Fix rows where amount_owed is 0 but status is 'unpaid' — nothing owed means satisfied.
    op.execute(
        """
        UPDATE chapter_period_dues
        SET status = 'paid'
        WHERE amount_owed = 0
          AND status = 'unpaid'
        """
    )


def downgrade():
    # Not reversible in a meaningful way — leave as-is on downgrade.
    pass
