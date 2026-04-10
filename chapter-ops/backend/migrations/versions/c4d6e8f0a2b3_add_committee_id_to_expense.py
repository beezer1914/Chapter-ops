"""add committee_id to expense

Revision ID: c4d6e8f0a2b3
Revises: b3c5d7e9f1a2
Create Date: 2026-04-08 00:01:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c4d6e8f0a2b3'
down_revision = 'b3c5d7e9f1a2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'expense',
        sa.Column(
            'committee_id',
            sa.String(36),
            sa.ForeignKey('committee.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.create_index('ix_expense_committee_id', 'expense', ['committee_id'])


def downgrade():
    op.drop_index('ix_expense_committee_id', table_name='expense')
    op.drop_column('expense', 'committee_id')
