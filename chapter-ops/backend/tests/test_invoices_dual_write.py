"""Tests asserting Invoice routes dual-write polymorphic columns (Deploy 2)."""

from datetime import date, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Invoice
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_region,
)


def _login(client, user, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": user.email, "password": password})


class TestChapterMemberInvoiceDualWrite:
    def test_create_invoice_dual_writes_polymorphic_columns(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        member = make_user(email="m@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(member, chapter, role="member")
        treasurer.active_chapter_id = chapter.id
        db.session.commit()

        _login(client, treasurer)
        due = (date.today() + timedelta(days=30)).isoformat()
        resp = client.post("/api/invoices", json={
            "billed_user_id": member.id,
            "amount": "100.00",
            "description": "Spring dues",
            "due_date": due,
        })
        assert resp.status_code == 201
        inv_id = resp.get_json()["id"]

        inv = db.session.get(Invoice, inv_id)
        # Legacy columns still populated
        assert inv.scope == "member"
        assert inv.chapter_id == chapter.id
        assert inv.billed_user_id == member.id
        # Polymorphic columns dual-written
        assert inv.issuer_type == "chapter"
        assert inv.issuer_id == chapter.id
        assert inv.target_type == "user"
        assert inv.target_id == member.id

    def test_bulk_create_invoices_dual_writes(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        m1 = make_user(email="m1@example.com")
        m2 = make_user(email="m2@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(m1, chapter, role="member")
        make_membership(m2, chapter, role="member")
        treasurer.active_chapter_id = chapter.id
        db.session.commit()

        _login(client, treasurer)
        due = (date.today() + timedelta(days=30)).isoformat()
        resp = client.post("/api/invoices/bulk", json={
            "user_ids": [m1.id, m2.id],
            "amount": "100.00",
            "description": "Spring dues",
            "due_date": due,
        })
        assert resp.status_code == 201
        assert resp.get_json()["count"] == 2

        invs = Invoice.query.filter(
            Invoice.billed_user_id.in_([m1.id, m2.id])
        ).all()
        assert len(invs) == 2
        for inv in invs:
            assert inv.issuer_type == "chapter"
            assert inv.issuer_id == chapter.id
            assert inv.target_type == "user"
            assert inv.target_id == inv.billed_user_id
