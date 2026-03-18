"""add_file_upload_fields

Revision ID: 3c793e2299d7
Revises: 2b682d2188c6
Create Date: 2026-02-22 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = '3c793e2299d7'
down_revision = '2b682d2188c6'
branch_labels = None
depends_on = None


def upgrade():
    # Add profile_picture_url to user table
    op.add_column('user', sa.Column('profile_picture_url', sa.String(length=500), nullable=True))

    # Add logo_url to chapter table (organization already has it)
    op.add_column('chapter', sa.Column('logo_url', sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column('chapter', 'logo_url')
    op.drop_column('user', 'profile_picture_url')
