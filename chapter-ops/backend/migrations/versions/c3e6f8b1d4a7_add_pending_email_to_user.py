"""add pending_email fields to user

Revision ID: c3e6f8b1d4a7
Revises: b2d5e7f9c3a4
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3e6f8b1d4a7'
down_revision = 'b2d5e7f9c3a4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("pending_email", sa.String(length=120), nullable=True))
    op.add_column("user", sa.Column("pending_email_token", sa.String(length=100), nullable=True))
    op.add_column(
        "user",
        sa.Column("pending_email_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_pending_email_token", "user", ["pending_email_token"])


def downgrade():
    op.drop_index("ix_user_pending_email_token", table_name="user")
    op.drop_column("user", "pending_email_expires_at")
    op.drop_column("user", "pending_email_token")
    op.drop_column("user", "pending_email")
