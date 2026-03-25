"""Add expense model for reimbursement tracking

Revision ID: e7b3a1d9c4f2
Revises: c9d2e5f8a1b3
Create Date: 2026-03-24 00:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e7b3a1d9c4f2'
down_revision = 'c9d2e5f8a1b3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'expense',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('chapter_id', sa.String(36), sa.ForeignKey('chapter.id'), nullable=False),
        sa.Column('submitted_by_id', sa.String(36), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('category', sa.String(30), nullable=False, server_default='other'),
        sa.Column('expense_date', sa.Date(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('reviewer_id', sa.String(36), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('denial_reason', sa.Text(), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('receipt_url', sa.String(500), nullable=True),
        sa.Column('receipt_key', sa.String(500), nullable=True),
        sa.Column('receipt_name', sa.String(255), nullable=True),
        sa.Column('receipt_size', sa.Integer(), nullable=True),
        sa.Column('receipt_mime', sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_expense_chapter_id', 'expense', ['chapter_id'])
    op.create_index('ix_expense_submitted_by_id', 'expense', ['submitted_by_id'])


def downgrade():
    op.drop_table('expense')
