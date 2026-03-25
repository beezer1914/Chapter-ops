"""Add member_type to chapter_membership

Revision ID: a4f91c3d7e82
Revises: 172b38581b4c
Create Date: 2026-03-23 19:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a4f91c3d7e82'
down_revision = '172b38581b4c'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'chapter_membership',
        sa.Column(
            'member_type',
            sa.String(20),
            nullable=False,
            server_default='collegiate',
        )
    )


def downgrade():
    op.drop_column('chapter_membership', 'member_type')
