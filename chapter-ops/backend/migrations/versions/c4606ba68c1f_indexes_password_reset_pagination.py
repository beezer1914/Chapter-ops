"""indexes password_reset pagination

Revision ID: c4606ba68c1f
Revises: b2d4f6a8c1e3
Create Date: 2026-04-05 22:04:31.682688
"""
from alembic import op
import sqlalchemy as sa

revision = 'c4606ba68c1f'
down_revision = 'b2d4f6a8c1e3'
branch_labels = None
depends_on = None


def upgrade():
    # ── Stripe session ID indexes (convert unique→regular for idempotency lookups) ──
    op.drop_index('uq_payment_stripe_session_id', table_name='payment',
                  postgresql_where='(stripe_session_id IS NOT NULL)')
    op.create_index('ix_payment_stripe_session_id', 'payment', ['stripe_session_id'], unique=False)

    op.drop_index('uq_donation_stripe_session_id', table_name='donation',
                  postgresql_where='(stripe_session_id IS NOT NULL)')
    op.create_index('ix_donation_stripe_session_id', 'donation', ['stripe_session_id'], unique=False)

    # ── New indexes ────────────────────────────────────────────────────────────
    op.create_index('ix_chapter_stripe_account_id', 'chapter', ['stripe_account_id'], unique=False)
    op.create_index('ix_notification_chapter_recipient_read', 'notification',
                    ['chapter_id', 'recipient_id', 'is_read'], unique=False)

    # ── Password reset columns on user ────────────────────────────────────────
    op.add_column('user', sa.Column('password_reset_token', sa.String(length=100), nullable=True))
    op.add_column('user', sa.Column('password_reset_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_user_password_reset_token', 'user', ['password_reset_token'], unique=False)


def downgrade():
    op.drop_index('ix_user_password_reset_token', table_name='user')
    op.drop_column('user', 'password_reset_expires_at')
    op.drop_column('user', 'password_reset_token')

    op.drop_index('ix_notification_chapter_recipient_read', table_name='notification')
    op.drop_index('ix_chapter_stripe_account_id', table_name='chapter')

    op.drop_index('ix_donation_stripe_session_id', table_name='donation')
    op.create_index('uq_donation_stripe_session_id', 'donation', ['stripe_session_id'],
                    unique=True, postgresql_where='(stripe_session_id IS NOT NULL)')

    op.drop_index('ix_payment_stripe_session_id', table_name='payment')
    op.create_index('uq_payment_stripe_session_id', 'payment', ['stripe_session_id'],
                    unique=True, postgresql_where='(stripe_session_id IS NOT NULL)')
