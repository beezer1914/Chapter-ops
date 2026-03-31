"""Add auth_event, agent_run, and agent_approval tables for ops agent

Revision ID: a1c3e5b7d9f2
Revises: b4e2f1a9c7d5
Create Date: 2026-03-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1c3e5b7d9f2'
down_revision = 'b4e2f1a9c7d5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'auth_event',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('user_agent', sa.String(512), nullable=True),
        sa.Column('country_code', sa.String(2), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_auth_event_user_id', 'auth_event', ['user_id'])
    op.create_index('ix_auth_event_ip_address', 'auth_event', ['ip_address'])
    op.create_index('ix_auth_event_created_at', 'auth_event', ['created_at'])

    op.create_table(
        'agent_run',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('run_type', sa.String(20), nullable=False, server_default='scheduled'),
        sa.Column('status', sa.String(20), nullable=False, server_default='ok'),
        sa.Column('findings_json', sa.JSON(), nullable=True),
        sa.Column('actions_taken_json', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_agent_run_triggered_at', 'agent_run', ['triggered_at'])

    op.create_table(
        'agent_approval',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('action_id', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('command_json', sa.JSON(), nullable=False),
        sa.Column('approval_token', sa.String(64), nullable=False),
        sa.Column('executed', sa.Boolean(), nullable=False, server_default='false'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('approval_token', name='uq_agent_approval_token'),
    )


def downgrade():
    op.drop_table('agent_approval')
    op.drop_table('agent_run')
    op.drop_index('ix_auth_event_created_at', table_name='auth_event')
    op.drop_index('ix_auth_event_ip_address', table_name='auth_event')
    op.drop_index('ix_auth_event_user_id', table_name='auth_event')
    op.drop_table('auth_event')
