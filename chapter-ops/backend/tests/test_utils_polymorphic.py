"""Tests for the polymorphic dict-builder helpers."""

from app.utils.polymorphic import (
    chapter_to_user_invoice_kwargs,
    region_to_chapter_invoice_kwargs,
    user_to_chapter_payment_kwargs,
)


class TestPolymorphicHelpers:
    def test_chapter_to_user_invoice_kwargs(self):
        result = chapter_to_user_invoice_kwargs(chapter_id="c-1", user_id="u-1")
        assert result == {
            "issuer_type": "chapter",
            "issuer_id": "c-1",
            "target_type": "user",
            "target_id": "u-1",
        }

    def test_region_to_chapter_invoice_kwargs(self):
        result = region_to_chapter_invoice_kwargs(region_id="r-1", chapter_id="c-1")
        assert result == {
            "issuer_type": "region",
            "issuer_id": "r-1",
            "target_type": "chapter",
            "target_id": "c-1",
        }

    def test_user_to_chapter_payment_kwargs(self):
        result = user_to_chapter_payment_kwargs(user_id="u-1", chapter_id="c-1")
        assert result == {
            "payer_type": "user",
            "payer_id": "u-1",
            "receiver_type": "chapter",
            "receiver_id": "c-1",
        }
