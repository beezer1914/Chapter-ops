"""add incident reporting tables

Revision ID: 29323ed26475
Revises: e6f8a0b2c4d5
Create Date: 2026-04-18 22:33:43.892423
"""
from alembic import op
import sqlalchemy as sa


revision = '29323ed26475'
down_revision = 'e6f8a0b2c4d5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'incident',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('chapter_id', sa.String(length=36), nullable=False),
        sa.Column('region_id', sa.String(length=36), nullable=True),
        sa.Column('organization_id', sa.String(length=36), nullable=False),
        sa.Column('reported_by_user_id', sa.String(length=36), nullable=False),
        sa.Column('reference_number', sa.String(length=32), nullable=False),
        sa.Column('incident_type', sa.String(length=40), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('individuals_involved', sa.Text(), nullable=True),
        sa.Column('law_enforcement_notified', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('medical_attention_required', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='reported'),
        sa.Column('acknowledged_by_user_id', sa.String(length=36), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['chapter_id'], ['chapter.id']),
        sa.ForeignKeyConstraint(['region_id'], ['region.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id']),
        sa.ForeignKeyConstraint(['reported_by_user_id'], ['user.id']),
        sa.ForeignKeyConstraint(['acknowledged_by_user_id'], ['user.id']),
        sa.UniqueConstraint('reference_number', name='uq_incident_reference_number'),
    )
    op.create_index('ix_incident_chapter_id', 'incident', ['chapter_id'])
    op.create_index('ix_incident_region_id', 'incident', ['region_id'])
    op.create_index('ix_incident_organization_id', 'incident', ['organization_id'])
    op.create_index('ix_incident_reference_number', 'incident', ['reference_number'])
    op.create_index('ix_incident_incident_type', 'incident', ['incident_type'])
    op.create_index('ix_incident_severity', 'incident', ['severity'])
    op.create_index('ix_incident_status', 'incident', ['status'])

    op.create_table(
        'incident_attachment',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('incident_id', sa.String(length=36), nullable=False),
        sa.Column('uploaded_by_user_id', sa.String(length=36), nullable=False),
        sa.Column('file_url', sa.String(length=1024), nullable=False),
        sa.Column('file_key', sa.String(length=512), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incident.id']),
        sa.ForeignKeyConstraint(['uploaded_by_user_id'], ['user.id']),
    )
    op.create_index('ix_incident_attachment_incident_id', 'incident_attachment', ['incident_id'])

    op.create_table(
        'incident_status_event',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('incident_id', sa.String(length=36), nullable=False),
        sa.Column('changed_by_user_id', sa.String(length=36), nullable=False),
        sa.Column('from_status', sa.String(length=30), nullable=True),
        sa.Column('to_status', sa.String(length=30), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['incident_id'], ['incident.id']),
        sa.ForeignKeyConstraint(['changed_by_user_id'], ['user.id']),
    )
    op.create_index('ix_incident_status_event_incident_id', 'incident_status_event', ['incident_id'])


def downgrade():
    op.drop_index('ix_incident_status_event_incident_id', table_name='incident_status_event')
    op.drop_table('incident_status_event')
    op.drop_index('ix_incident_attachment_incident_id', table_name='incident_attachment')
    op.drop_table('incident_attachment')
    op.drop_index('ix_incident_status', table_name='incident')
    op.drop_index('ix_incident_severity', table_name='incident')
    op.drop_index('ix_incident_incident_type', table_name='incident')
    op.drop_index('ix_incident_reference_number', table_name='incident')
    op.drop_index('ix_incident_organization_id', table_name='incident')
    op.drop_index('ix_incident_region_id', table_name='incident')
    op.drop_index('ix_incident_chapter_id', table_name='incident')
    op.drop_table('incident')
