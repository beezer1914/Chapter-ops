"""
Stripe webhook handler — /webhook

Processes incoming Stripe events. This route is CSRF-exempt and outside
the tenant middleware (no chapter context set by default). All queries
must explicitly filter by chapter_id from event metadata.

For local testing use the Stripe CLI:
    stripe listen --forward-to localhost:5000/webhook
"""

import logging
from decimal import Decimal

import stripe

from flask import Blueprint, current_app, jsonify, request

from app.extensions import db
from app.models import Chapter, ChapterMembership, Payment, Donation, Invoice
from app.models.event import EventAttendance

logger = logging.getLogger(__name__)

webhooks_bp = Blueprint("webhooks", __name__, url_prefix="/webhook")


@webhooks_bp.route("", methods=["POST"])
def stripe_webhook():
    """Handle incoming Stripe webhook events."""
    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")
    webhook_secret = current_app.config["STRIPE_WEBHOOK_SECRET"]

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError:
        logger.warning("Stripe webhook: invalid payload")
        return jsonify({"error": "Invalid payload"}), 400
    except stripe.error.SignatureVerificationError:
        logger.warning("Stripe webhook: invalid signature")
        return jsonify({"error": "Invalid signature"}), 400

    event_type = event["type"]
    logger.info(f"Stripe webhook received: {event_type}")

    try:
        if event_type == "checkout.session.completed":
            _handle_checkout_completed(event["data"]["object"])
        elif event_type == "account.updated":
            _handle_account_updated(event)
        else:
            logger.debug(f"Unhandled Stripe event type: {event_type}")
    except Exception as exc:
        # Log but don't return 4xx — Stripe would retry indefinitely
        logger.exception(f"Error processing Stripe webhook {event_type}: {exc}")

    return jsonify({"received": True}), 200


def _handle_checkout_completed(session: dict) -> None:
    """
    Process a completed Stripe Checkout Session.

    Creates a Payment or Donation record based on metadata.payment_type.
    Idempotent: checks stripe_session_id before creating to handle retries.
    """
    metadata = session.get("metadata", {})
    payment_type = metadata.get("payment_type")
    chapter_id = metadata.get("chapter_id")
    session_id = session.get("id")

    if not chapter_id or not session_id:
        logger.warning(f"checkout.session.completed missing chapter_id or session_id: {session_id}")
        return

    if payment_type in ("one-time", "installment"):
        _create_payment_from_session(session, metadata, payment_type)
    elif payment_type == "donation":
        _create_donation_from_session(session, metadata)
    elif payment_type == "event_ticket":
        _complete_event_ticket(session, metadata)
    else:
        logger.warning(f"Unknown payment_type in metadata: {payment_type}, session: {session_id}")


def _create_payment_from_session(session: dict, metadata: dict, payment_type: str) -> None:
    """Create a Payment record from a completed checkout session."""
    session_id = session["id"]
    chapter_id = metadata.get("chapter_id")
    user_id = metadata.get("user_id")
    plan_id = metadata.get("plan_id") or None

    logger.info(f"Processing {payment_type} payment: session={session_id}, chapter={chapter_id}, user={user_id}, plan={plan_id}")

    # Idempotency check
    existing = Payment.query.filter_by(stripe_session_id=session_id).first()
    if existing:
        logger.info(f"Payment already recorded for session {session_id}, skipping.")
        return

    amount_cents = session.get("amount_total", 0)
    amount = Decimal(str(amount_cents)) / Decimal("100")

    payment = Payment(
        chapter_id=chapter_id,
        user_id=user_id,
        amount=amount,
        payment_type=payment_type,
        method="stripe",
        stripe_session_id=session_id,
        fee_type_id=metadata.get("fee_type_id") or None,
        plan_id=plan_id,
        notes=metadata.get("notes") or None,
    )
    db.session.add(payment)
    db.session.flush()

    # Auto-promote member to financial if currently not_financial
    if user_id and chapter_id:
        membership = ChapterMembership.query.filter_by(
            user_id=user_id, chapter_id=chapter_id, active=True
        ).first()
        if membership and membership.financial_status == "not_financial":
            membership.financial_status = "financial"
            logger.info(f"Member {user_id} promoted to financial after payment {payment.id}")

    # If installment: check if plan is now complete
    if plan_id:
        from app.models import PaymentPlan
        plan = db.session.get(PaymentPlan, plan_id)
        if plan and plan.is_complete():
            plan.status = "completed"
            logger.info(f"PaymentPlan {plan_id} marked complete.")

    # Auto-link to outstanding invoice if one exists for this user+chapter
    invoice_id = metadata.get("invoice_id")
    if invoice_id:
        invoice = db.session.get(Invoice, invoice_id)
        if invoice and invoice.status in ("sent", "overdue", "draft"):
            invoice.payment_id = payment.id
            invoice.status = "paid"
            invoice.paid_at = payment.created_at
            logger.info(f"Invoice {invoice_id} marked paid via payment {payment.id}")
    else:
        # Try to find an open invoice matching this user + chapter + amount
        open_invoice = Invoice.query.filter(
            Invoice.chapter_id == chapter_id,
            Invoice.billed_user_id == user_id,
            Invoice.status.in_(["sent", "overdue"]),
            Invoice.payment_id.is_(None),
        ).order_by(Invoice.due_date.asc()).first()
        if open_invoice and open_invoice.amount == amount:
            open_invoice.payment_id = payment.id
            open_invoice.status = "paid"
            open_invoice.paid_at = payment.created_at
            logger.info(f"Auto-linked invoice {open_invoice.id} to payment {payment.id}")

    db.session.commit()
    logger.info(f"Payment recorded: {payment.id} for session {session_id}")


def _create_donation_from_session(session: dict, metadata: dict) -> None:
    """Create a Donation record from a completed checkout session."""
    session_id = session["id"]
    chapter_id = metadata.get("chapter_id")

    # Idempotency check
    existing = Donation.query.filter_by(stripe_session_id=session_id).first()
    if existing:
        logger.info(f"Donation already recorded for session {session_id}, skipping.")
        return

    amount_cents = session.get("amount_total", 0)
    amount = amount_cents / 100.0

    donation = Donation(
        chapter_id=chapter_id,
        donor_name=metadata.get("donor_name", "Anonymous"),
        donor_email=metadata.get("donor_email") or None,
        amount=amount,
        method="stripe",
        stripe_session_id=session_id,
        notes=metadata.get("notes") or None,
        user_id=metadata.get("user_id") or None,
    )
    db.session.add(donation)
    db.session.commit()
    logger.info(f"Donation recorded: {donation.id} for session {session_id}")


def _handle_account_updated(event: dict) -> None:
    """
    Update chapter's Stripe onboarding status when their account is updated.

    Stripe fires this for connected accounts when their capabilities change.
    """
    account_id = event.get("account")
    if not account_id:
        return

    chapter = Chapter.query.filter_by(stripe_account_id=account_id).first()
    if not chapter:
        logger.debug(f"No chapter found for stripe_account_id {account_id}")
        return

    account_data = event["data"]["object"]
    charges_enabled = account_data.get("charges_enabled", False)

    if chapter.stripe_onboarding_complete != charges_enabled:
        chapter.stripe_onboarding_complete = charges_enabled
        db.session.commit()
        logger.info(
            f"Chapter {chapter.id} stripe_onboarding_complete → {charges_enabled}"
        )


def _complete_event_ticket(session: dict, metadata: dict) -> None:
    """Mark an event attendance record as paid after successful Stripe checkout."""
    session_id = session.get("id")
    attendance_id = metadata.get("attendance_id")

    if not attendance_id:
        logger.warning(f"event_ticket webhook missing attendance_id: {session_id}")
        return

    attendance = db.session.get(EventAttendance, attendance_id)
    if not attendance:
        logger.warning(f"EventAttendance {attendance_id} not found for session {session_id}")
        return

    if attendance.payment_status == "paid":
        logger.info(f"EventAttendance {attendance_id} already marked paid, skipping.")
        return

    attendance.payment_status = "paid"
    attendance.rsvp_status = "going"
    attendance.stripe_session_id = session_id
    db.session.commit()
    logger.info(f"EventAttendance {attendance_id} marked paid for session {session_id}")
