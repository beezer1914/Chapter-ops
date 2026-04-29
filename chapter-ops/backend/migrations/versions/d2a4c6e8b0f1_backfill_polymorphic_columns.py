"""backfill polymorphic columns on invoice and payment (also merges MFA chain)

Populates issuer_type/issuer_id/target_type/target_id on invoice and
payer_type/payer_id/receiver_type/receiver_id on payment from the
existing legacy columns. Idempotent — only updates rows where the
polymorphic column is NULL.

Also merges the MFA reset audit chain (cbdffd5a4544) with the Deploy 1
chain (c6e9b3f7a0d2) by listing both as parents.

Revision ID: d2a4c6e8b0f1
Revises: c6e9b3f7a0d2, cbdffd5a4544
Create Date: 2026-04-29 09:00:00.000000

"""
from alembic import op


revision = 'd2a4c6e8b0f1'
down_revision = ('c6e9b3f7a0d2', 'cbdffd5a4544')
branch_labels = None
depends_on = None


def upgrade():
    # Invoice.scope='member' → chapter→user
    op.execute("""
        UPDATE invoice
        SET issuer_type = 'chapter',
            issuer_id   = chapter_id,
            target_type = 'user',
            target_id   = billed_user_id
        WHERE scope = 'member'
          AND issuer_type IS NULL
          AND chapter_id IS NOT NULL
          AND billed_user_id IS NOT NULL
    """)

    # Invoice.scope='chapter' → region→chapter
    op.execute("""
        UPDATE invoice
        SET issuer_type = 'region',
            issuer_id   = region_id,
            target_type = 'chapter',
            target_id   = billed_chapter_id
        WHERE scope = 'chapter'
          AND issuer_type IS NULL
          AND region_id IS NOT NULL
          AND billed_chapter_id IS NOT NULL
    """)

    # Payment → user→chapter
    op.execute("""
        UPDATE payment
        SET payer_type    = 'user',
            payer_id      = user_id,
            receiver_type = 'chapter',
            receiver_id   = chapter_id
        WHERE payer_type IS NULL
          AND user_id IS NOT NULL
          AND chapter_id IS NOT NULL
    """)


def downgrade():
    # Safe ONLY while legacy columns (scope/chapter_id/billed_user_id/...) remain
    # authoritative. After Deploy 5 drops them, this downgrade destroys data that
    # cannot be reconstructed. Revisit before Deploy 5 lands.
    op.execute("""
        UPDATE invoice
        SET issuer_type = NULL,
            issuer_id   = NULL,
            target_type = NULL,
            target_id   = NULL
    """)
    op.execute("""
        UPDATE payment
        SET payer_type    = NULL,
            payer_id      = NULL,
            receiver_type = NULL,
            receiver_id   = NULL
    """)
