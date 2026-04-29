"""Tests asserting Stripe webhook Payment creation dual-writes (Deploy 2)."""

from decimal import Decimal
from unittest.mock import patch

from app.extensions import db
from app.models import Payment
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
)


class TestWebhookPaymentDualWrite:
    def _build_event(self, chapter, user, session_id="cs_test_dualwrite_1"):
        return {
            "type": "checkout.session.completed",
            "account": chapter.stripe_account_id,
            "data": {
                "object": {
                    "id": session_id,
                    "amount_total": 10000,  # $100.00
                    "metadata": {
                        "payment_type": "one-time",
                        "chapter_id": chapter.id,
                        "user_id": user.id,
                    },
                },
            },
        }

    def test_webhook_payment_dual_writes(self, client, db_session, app):
        org = make_organization()
        chapter = make_chapter(org)
        chapter.stripe_account_id = "acct_test_chapter_1"
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        event = self._build_event(chapter, user)
        with patch("stripe.Webhook.construct_event", return_value=event):
            resp = client.post(
                "/webhook",
                data=b"{}",
                headers={"Stripe-Signature": "test"},
            )
        assert resp.status_code == 200

        payment = Payment.query.filter_by(stripe_session_id="cs_test_dualwrite_1").first()
        assert payment is not None
        # Legacy
        assert payment.chapter_id == chapter.id
        assert payment.user_id == user.id
        assert payment.amount == Decimal("100.00")
        # Polymorphic dual-written
        assert payment.payer_type == "user"
        assert payment.payer_id == user.id
        assert payment.receiver_type == "chapter"
        assert payment.receiver_id == chapter.id
