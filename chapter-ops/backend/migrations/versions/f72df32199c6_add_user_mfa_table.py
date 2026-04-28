"""add user_mfa table

Revision ID: f72df32199c6
Revises: 08f1191e4c18
Create Date: 2026-04-27 13:50:23.011270
"""
from alembic import op
import sqlalchemy as sa

revision = 'f72df32199c6'
down_revision = '08f1191e4c18'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('user_mfa',
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('secret', sa.String(length=200), nullable=False),
    sa.Column('enabled', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('backup_codes_hashed', sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
    sa.Column('enrolled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_reset_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', name='uq_user_mfa_user_id')
    )
    op.create_index(op.f('ix_user_mfa_user_id'), 'user_mfa', ['user_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_user_mfa_user_id'), table_name='user_mfa')
    op.drop_table('user_mfa')
