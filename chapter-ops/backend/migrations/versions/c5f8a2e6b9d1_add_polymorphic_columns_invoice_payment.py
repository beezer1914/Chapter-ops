"""add polymorphic columns to invoice and payment

Adds nullable issuer_type/id + target_type/id on invoice and
payer_type/id + receiver_type/id on payment. No data changes.
Columns remain nullable until Deploy 2 completes backfill.

Revision ID: c5f8a2e6b9d1
Revises: b4e8d1c9a3f7
Create Date: 2026-04-24 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c5f8a2e6b9d1'
down_revision = 'b4e8d1c9a3f7'
branch_labels = None
depends_on = None


def upgrade():
    # Invoice polymorphic columns
    op.add_column('invoice', sa.Column('issuer_type', sa.String(20), nullable=True))
    op.add_column('invoice', sa.Column('issuer_id', sa.String(36), nullable=True))
    op.add_column('invoice', sa.Column('target_type', sa.String(20), nullable=True))
    op.add_column('invoice', sa.Column('target_id', sa.String(36), nullable=True))
    op.create_index('ix_invoice_issuer', 'invoice', ['issuer_type', 'issuer_id'])
    op.create_index('ix_invoice_target', 'invoice', ['target_type', 'target_id'])

    # Payment polymorphic columns
    op.add_column('payment', sa.Column('payer_type', sa.String(20), nullable=True))
    op.add_column('payment', sa.Column('payer_id', sa.String(36), nullable=True))
    op.add_column('payment', sa.Column('receiver_type', sa.String(20), nullable=True))
    op.add_column('payment', sa.Column('receiver_id', sa.String(36), nullable=True))
    op.create_index('ix_payment_payer', 'payment', ['payer_type', 'payer_id'])
    op.create_index('ix_payment_receiver', 'payment', ['receiver_type', 'receiver_id'])


def downgrade():
    op.drop_index('ix_payment_receiver', table_name='payment')
    op.drop_index('ix_payment_payer', table_name='payment')
    op.drop_column('payment', 'receiver_id')
    op.drop_column('payment', 'receiver_type')
    op.drop_column('payment', 'payer_id')
    op.drop_column('payment', 'payer_type')
    op.drop_index('ix_invoice_target', table_name='invoice')
    op.drop_index('ix_invoice_issuer', table_name='invoice')
    op.drop_column('invoice', 'target_id')
    op.drop_column('invoice', 'target_type')
    op.drop_column('invoice', 'issuer_id')
    op.drop_column('invoice', 'issuer_type')
