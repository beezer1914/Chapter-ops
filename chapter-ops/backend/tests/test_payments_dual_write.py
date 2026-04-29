"""Tests asserting manual Payment route dual-writes (Deploy 2)."""

from app.extensions import db
from app.models import Payment
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
)


def _login(client, user, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": user.email, "password": password})


class TestManualPaymentDualWrite:
    def test_manual_payment_dual_writes(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        member = make_user(email="m@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(member, chapter, role="member")
        treasurer.active_chapter_id = chapter.id
        db.session.commit()

        _login(client, treasurer)
        resp = client.post("/api/payments", json={
            "user_id": member.id,
            "amount": "75.00",
            "payment_type": "one-time",
            "method": "cash",
        })
        assert resp.status_code == 201
        payment_id = resp.get_json()["payment"]["id"]

        payment = db.session.get(Payment, payment_id)
        assert payment.chapter_id == chapter.id
        assert payment.user_id == member.id
        # Polymorphic dual-written
        assert payment.payer_type == "user"
        assert payment.payer_id == member.id
        assert payment.receiver_type == "chapter"
        assert payment.receiver_id == chapter.id
