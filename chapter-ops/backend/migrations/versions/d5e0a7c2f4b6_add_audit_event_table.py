"""add audit_event table

Append-only log of security-relevant mutations. Used immediately by
Stripe Connect routes; designed to grow.

Revision ID: d5e0a7c2f4b6
Revises: d4c6e8a0b2d3
Create Date: 2026-04-29 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd5e0a7c2f4b6'
down_revision = 'd4c6e8a0b2d3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_event',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('actor_user_id', sa.String(36), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('event_type', sa.String(64), nullable=False),
        sa.Column('target_type', sa.String(20), nullable=False),
        sa.Column('target_id', sa.String(36), nullable=False),
        sa.Column('details', sa.JSON, nullable=False),
    )
    op.create_index('ix_audit_event_actor_user_id', 'audit_event', ['actor_user_id'])
    op.create_index('ix_audit_event_event_type', 'audit_event', ['event_type'])
    op.create_index(
        'ix_audit_event_target',
        'audit_event',
        ['target_type', 'target_id'],
    )


def downgrade():
    op.drop_index('ix_audit_event_target', table_name='audit_event')
    op.drop_index('ix_audit_event_event_type', table_name='audit_event')
    op.drop_index('ix_audit_event_actor_user_id', table_name='audit_event')
    op.drop_table('audit_event')
