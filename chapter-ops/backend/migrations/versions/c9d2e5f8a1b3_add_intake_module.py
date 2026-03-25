"""Add intake module: IntakeCandidate, IntakeDocument, is_intake_officer

Revision ID: c9d2e5f8a1b3
Revises: a4f91c3d7e82
Create Date: 2026-03-24 00:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c9d2e5f8a1b3'
down_revision = 'a4f91c3d7e82'
branch_labels = None
depends_on = None


def upgrade():
    # Add is_intake_officer flag to chapter_membership
    op.add_column(
        'chapter_membership',
        sa.Column('is_intake_officer', sa.Boolean(), nullable=False, server_default='false')
    )

    # Create intake_candidate table
    op.create_table(
        'intake_candidate',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('chapter_id', sa.String(36), sa.ForeignKey('chapter.id'), nullable=False),
        sa.Column('first_name', sa.String(100), nullable=False),
        sa.Column('last_name', sa.String(100), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('stage', sa.String(30), nullable=False, server_default='interested'),
        sa.Column('semester', sa.String(20), nullable=True),
        sa.Column('gpa', sa.Numeric(3, 2), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('assigned_to_id', sa.String(36), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('line_name', sa.String(100), nullable=True),
        sa.Column('line_number', sa.Integer(), nullable=True),
        sa.Column('crossed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('invite_code_id', sa.String(36), sa.ForeignKey('invite_code.id'), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_intake_candidate_chapter_id', 'intake_candidate', ['chapter_id'])

    # Create intake_document table
    op.create_table(
        'intake_document',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('chapter_id', sa.String(36), sa.ForeignKey('chapter.id'), nullable=False),
        sa.Column('candidate_id', sa.String(36), sa.ForeignKey('intake_candidate.id'), nullable=False),
        sa.Column('uploaded_by_id', sa.String(36), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('document_type', sa.String(30), nullable=False, server_default='other'),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('file_url', sa.String(500), nullable=False),
        sa.Column('file_key', sa.String(500), nullable=False),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_intake_document_chapter_id', 'intake_document', ['chapter_id'])
    op.create_index('ix_intake_document_candidate_id', 'intake_document', ['candidate_id'])


def downgrade():
    op.drop_table('intake_document')
    op.drop_table('intake_candidate')
    op.drop_column('chapter_membership', 'is_intake_officer')
