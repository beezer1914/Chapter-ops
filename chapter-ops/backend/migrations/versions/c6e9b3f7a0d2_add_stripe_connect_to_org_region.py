"""add stripe connect fields to organization and region

Adds stripe_account_id (nullable, partial unique index) and
stripe_onboarding_complete (default false) to both tables.
Unique index is partial — only enforced when stripe_account_id is not null.

Revision ID: c6e9b3f7a0d2
Revises: c5f8a2e6b9d1
Create Date: 2026-04-24 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c6e9b3f7a0d2'
down_revision = 'c5f8a2e6b9d1'
branch_labels = None
depends_on = None


def upgrade():
    # Organization
    op.add_column(
        'organization',
        sa.Column('stripe_account_id', sa.String(100), nullable=True),
    )
    op.add_column(
        'organization',
        sa.Column(
            'stripe_onboarding_complete',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        'uq_organization_stripe_account_id',
        'organization',
        ['stripe_account_id'],
        unique=True,
        postgresql_where=sa.text('stripe_account_id IS NOT NULL'),
    )

    # Region
    op.add_column(
        'region',
        sa.Column('stripe_account_id', sa.String(100), nullable=True),
    )
    op.add_column(
        'region',
        sa.Column(
            'stripe_onboarding_complete',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        'uq_region_stripe_account_id',
        'region',
        ['stripe_account_id'],
        unique=True,
        postgresql_where=sa.text('stripe_account_id IS NOT NULL'),
    )


def downgrade():
    op.drop_index('uq_region_stripe_account_id', table_name='region')
    op.drop_column('region', 'stripe_onboarding_complete')
    op.drop_column('region', 'stripe_account_id')
    op.drop_index('uq_organization_stripe_account_id', table_name='organization')
    op.drop_column('organization', 'stripe_onboarding_complete')
    op.drop_column('organization', 'stripe_account_id')
