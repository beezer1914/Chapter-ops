"""add CHECK constraints on polymorphic *_type columns

invoice.issuer_type     IN (NULL, 'organization', 'region', 'chapter')
invoice.target_type     IN (NULL, 'chapter', 'user')
payment.payer_type      IN (NULL, 'user', 'chapter')
payment.receiver_type   IN (NULL, 'organization', 'region', 'chapter')

NULLs are permitted while legacy columns remain authoritative
(through Deploy 4). NOT NULL is added by Deploy 5's cleanup.

Revision ID: d4c6e8a0b2d3
Revises: d3b5d7f9a1c2
Create Date: 2026-04-29 10:00:00.000000

"""
from alembic import op


revision = 'd4c6e8a0b2d3'
down_revision = 'd3b5d7f9a1c2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('invoice') as batch:
        batch.create_check_constraint(
            'ck_invoice_issuer_type',
            "issuer_type IS NULL OR issuer_type IN ('organization', 'region', 'chapter')",
        )
        batch.create_check_constraint(
            'ck_invoice_target_type',
            "target_type IS NULL OR target_type IN ('chapter', 'user')",
        )

    with op.batch_alter_table('payment') as batch:
        batch.create_check_constraint(
            'ck_payment_payer_type',
            "payer_type IS NULL OR payer_type IN ('user', 'chapter')",
        )
        batch.create_check_constraint(
            'ck_payment_receiver_type',
            "receiver_type IS NULL OR receiver_type IN ('organization', 'region', 'chapter')",
        )


def downgrade():
    with op.batch_alter_table('payment') as batch:
        batch.drop_constraint('ck_payment_receiver_type', type_='check')
        batch.drop_constraint('ck_payment_payer_type', type_='check')

    with op.batch_alter_table('invoice') as batch:
        batch.drop_constraint('ck_invoice_target_type', type_='check')
        batch.drop_constraint('ck_invoice_issuer_type', type_='check')
