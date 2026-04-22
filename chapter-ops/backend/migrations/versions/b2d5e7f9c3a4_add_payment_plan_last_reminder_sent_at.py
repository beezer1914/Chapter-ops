"""add last_reminder_sent_at to payment_plan

Revision ID: b2d5e7f9c3a4
Revises: a1b2c3d4e5f6
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2d5e7f9c3a4'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "payment_plan",
        sa.Column("last_reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("payment_plan", "last_reminder_sent_at")
