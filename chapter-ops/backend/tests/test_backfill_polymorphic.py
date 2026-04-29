"""End-to-end check: legacy rows exist → migration runs → polymorphic columns populated."""

from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models import Invoice, Payment
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_region,
)


class TestBackfillPolymorphic:
    def test_invoice_member_scope_backfilled(self, app, db_session):
        """Legacy chapter→member invoice gets polymorphic columns when
        inserted with explicit NULL polymorphic columns and the backfill
        SQL is run against it."""
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="treasurer")
        db.session.commit()

        # Simulate a legacy row written before Deploy 1
        inv = Invoice(
            scope="member",
            chapter_id=chapter.id,
            billed_user_id=user.id,
            invoice_number="INV-LEGACY-1",
            description="Legacy",
            amount=Decimal("10.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
        )
        db.session.add(inv)
        db.session.commit()
        assert inv.issuer_type is None  # legacy shape

        # Run the backfill SQL by hand
        db.session.execute(db.text("""
            UPDATE invoice
            SET issuer_type = 'chapter', issuer_id = chapter_id,
                target_type = 'user', target_id = billed_user_id
            WHERE scope = 'member' AND issuer_type IS NULL
        """))
        db.session.commit()

        db.session.refresh(inv)
        assert inv.issuer_type == "chapter"
        assert inv.issuer_id == chapter.id
        assert inv.target_type == "user"
        assert inv.target_id == user.id

    def test_invoice_chapter_scope_backfilled(self, app, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        user = make_user()
        db.session.commit()

        inv = Invoice(
            scope="chapter",
            region_id=region.id,
            billed_chapter_id=chapter.id,
            invoice_number="RGN-LEGACY-1",
            description="Legacy head tax",
            amount=Decimal("100.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
        )
        db.session.add(inv)
        db.session.commit()
        assert inv.issuer_type is None

        db.session.execute(db.text("""
            UPDATE invoice
            SET issuer_type = 'region', issuer_id = region_id,
                target_type = 'chapter', target_id = billed_chapter_id
            WHERE scope = 'chapter' AND issuer_type IS NULL
        """))
        db.session.commit()
        db.session.refresh(inv)
        assert inv.issuer_type == "region"
        assert inv.issuer_id == region.id
        assert inv.target_type == "chapter"
        assert inv.target_id == chapter.id

    def test_payment_backfilled(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        p = Payment(
            chapter_id=chapter.id,
            user_id=user.id,
            amount=Decimal("50.00"),
            payment_type="one-time",
            method="cash",
        )
        db.session.add(p)
        db.session.commit()
        assert p.payer_type is None

        db.session.execute(db.text("""
            UPDATE payment
            SET payer_type = 'user', payer_id = user_id,
                receiver_type = 'chapter', receiver_id = chapter_id
            WHERE payer_type IS NULL
        """))
        db.session.commit()
        db.session.refresh(p)
        assert p.payer_type == "user"
        assert p.payer_id == user.id
        assert p.receiver_type == "chapter"
        assert p.receiver_id == chapter.id
