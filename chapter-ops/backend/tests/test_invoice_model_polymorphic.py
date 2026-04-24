"""Tests for polymorphic columns on the Invoice model (Deploy 1 schema)."""

from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models import Invoice
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
)


class TestInvoicePolymorphicColumns:
    def test_can_set_polymorphic_issuer_and_target(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="treasurer")
        db.session.commit()

        inv = Invoice(
            scope="member",
            chapter_id=chapter.id,
            billed_user_id=user.id,
            invoice_number="INV-2026-9001",
            description="Test",
            amount=Decimal("10.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
            # NEW polymorphic columns
            issuer_type="chapter",
            issuer_id=chapter.id,
            target_type="user",
            target_id=user.id,
        )
        db.session.add(inv)
        db.session.commit()

        fetched = db.session.get(Invoice, inv.id)
        assert fetched.issuer_type == "chapter"
        assert fetched.issuer_id == chapter.id
        assert fetched.target_type == "user"
        assert fetched.target_id == user.id

    def test_polymorphic_columns_are_nullable(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="treasurer")
        db.session.commit()

        inv = Invoice(
            scope="member",
            chapter_id=chapter.id,
            billed_user_id=user.id,
            invoice_number="INV-2026-9002",
            description="Legacy row",
            amount=Decimal("10.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
            # polymorphic columns deliberately unset
        )
        db.session.add(inv)
        db.session.commit()

        fetched = db.session.get(Invoice, inv.id)
        assert fetched.issuer_type is None
        assert fetched.issuer_id is None
        assert fetched.target_type is None
        assert fetched.target_id is None
