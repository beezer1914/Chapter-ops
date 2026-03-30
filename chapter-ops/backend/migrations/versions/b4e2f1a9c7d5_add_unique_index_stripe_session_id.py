"""Add partial unique index on stripe_session_id for payment and donation

Prevents duplicate records from webhook race conditions by enforcing uniqueness
at the database level (only when the value is not NULL).

Revision ID: b4e2f1a9c7d5
Revises: f2a8b6c4d1e9
Create Date: 2026-03-27 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b4e2f1a9c7d5'
down_revision = 'f2a8b6c4d1e9'
branch_labels = None
depends_on = None


def upgrade():
    # Partial unique indexes: only enforce uniqueness when stripe_session_id is not NULL.
    # This allows multiple manual payments (NULL stripe_session_id) while preventing
    # duplicate Stripe webhook processing.
    op.create_index(
        'uq_payment_stripe_session_id',
        'payment',
        ['stripe_session_id'],
        unique=True,
        postgresql_where=sa.text('stripe_session_id IS NOT NULL'),
    )
    op.create_index(
        'uq_donation_stripe_session_id',
        'donation',
        ['stripe_session_id'],
        unique=True,
        postgresql_where=sa.text('stripe_session_id IS NOT NULL'),
    )


def downgrade():
    op.drop_index('uq_donation_stripe_session_id', table_name='donation')
    op.drop_index('uq_payment_stripe_session_id', table_name='payment')
