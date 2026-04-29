"""Builder helpers for polymorphic Invoice and Payment column sets.

Every Invoice/Payment construction site must use these helpers rather
than spelling out string literals like 'chapter' or 'user' inline. This
keeps the legal (issuer, target) and (payer, receiver) tuples in one
place and prevents drift across routes.
"""


def chapter_to_user_invoice_kwargs(*, chapter_id: str, user_id: str) -> dict:
    """Polymorphic kwargs for a chapter→member dues invoice."""
    return {
        "issuer_type": "chapter",
        "issuer_id": chapter_id,
        "target_type": "user",
        "target_id": user_id,
    }


def region_to_chapter_invoice_kwargs(*, region_id: str, chapter_id: str) -> dict:
    """Polymorphic kwargs for a region→chapter head-tax invoice."""
    return {
        "issuer_type": "region",
        "issuer_id": region_id,
        "target_type": "chapter",
        "target_id": chapter_id,
    }


def user_to_chapter_payment_kwargs(*, user_id: str, chapter_id: str) -> dict:
    """Polymorphic kwargs for a member-paid, chapter-received Payment."""
    return {
        "payer_type": "user",
        "payer_id": user_id,
        "receiver_type": "chapter",
        "receiver_id": chapter_id,
    }
