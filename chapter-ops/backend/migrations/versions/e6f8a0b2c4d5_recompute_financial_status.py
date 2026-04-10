"""recompute financial_status for members whose dues are now fully paid

Revision ID: e6f8a0b2c4d5
Revises: d5e7f9a1b3c2
Create Date: 2026-04-08

"""
from alembic import op

revision = 'e6f8a0b2c4d5'
down_revision = 'd5e7f9a1b3c2'
branch_labels = None
depends_on = None


def upgrade():
    # Set financial_status = 'financial' for any active member whose every
    # dues row in the currently active period is 'paid' or 'exempt'.
    # bool_and() returns true only when ALL rows satisfy the condition.
    op.execute(
        """
        UPDATE chapter_membership
        SET financial_status = 'financial'
        WHERE active = true
          AND financial_status = 'not_financial'
          AND (chapter_id, user_id) IN (
              SELECT cpd.chapter_id, cpd.user_id
              FROM chapter_period_dues cpd
              JOIN chapter_period cp ON cp.id = cpd.period_id
              WHERE cp.is_active = true
              GROUP BY cpd.chapter_id, cpd.user_id
              HAVING bool_and(cpd.status IN ('paid', 'exempt'))
          )
        """
    )


def downgrade():
    pass
