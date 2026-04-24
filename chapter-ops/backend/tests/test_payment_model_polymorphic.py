"""Tests for polymorphic columns on the Payment model (Deploy 1 schema)."""

from decimal import Decimal

from app.extensions import db
from app.models import Payment
from tests.conftest import make_user, make_organization, make_chapter, make_membership


class TestPaymentPolymorphicColumns:
    def test_can_set_polymorphic_payer_and_receiver(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        pmt = Payment(
            chapter_id=chapter.id,
            user_id=user.id,
            amount=Decimal("50.00"),
            payment_type="one-time",
            method="cash",
            payer_type="user",
            payer_id=user.id,
            receiver_type="chapter",
            receiver_id=chapter.id,
        )
        db.session.add(pmt)
        db.session.commit()

        fetched = db.session.get(Payment, pmt.id)
        assert fetched.payer_type == "user"
        assert fetched.payer_id == user.id
        assert fetched.receiver_type == "chapter"
        assert fetched.receiver_id == chapter.id

    def test_polymorphic_columns_are_nullable(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        pmt = Payment(
            chapter_id=chapter.id,
            user_id=user.id,
            amount=Decimal("50.00"),
            payment_type="one-time",
            method="cash",
        )
        db.session.add(pmt)
        db.session.commit()

        fetched = db.session.get(Payment, pmt.id)
        assert fetched.payer_type is None
        assert fetched.payer_id is None
        assert fetched.receiver_type is None
        assert fetched.receiver_id is None
