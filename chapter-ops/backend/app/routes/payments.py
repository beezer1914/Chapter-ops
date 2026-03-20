"""
Payment routes — /api/payments/*

Handles manual payment recording, financial summaries, and Stripe Checkout.
"""

import stripe

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, jsonify, request, g
from flask_login import current_user, login_required
from sqlalchemy import func

from app.extensions import db
from app.models import Payment, PaymentPlan, ChapterMembership, User
from app.services import notification_service
from app.utils.decorators import chapter_required, role_required

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")

VALID_METHODS = {"cash", "check", "bank_transfer", "zelle", "venmo", "cashapp", "manual"}
VALID_PAYMENT_TYPES = {"one-time", "installment"}


@payments_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("secretary")
def list_payments():
    """
    List payments for the current chapter.

    Query params: user_id, payment_type, method, start_date, end_date
    """
    chapter = g.current_chapter
    query = Payment.query.filter_by(chapter_id=chapter.id)

    # Filters
    user_id = request.args.get("user_id")
    if user_id:
        query = query.filter_by(user_id=user_id)

    payment_type = request.args.get("payment_type")
    if payment_type and payment_type in VALID_PAYMENT_TYPES:
        query = query.filter_by(payment_type=payment_type)

    method = request.args.get("method")
    if method and method in VALID_METHODS:
        query = query.filter_by(method=method)

    start_date = request.args.get("start_date")
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            query = query.filter(Payment.created_at >= start)
        except ValueError:
            pass

    end_date = request.args.get("end_date")
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            query = query.filter(Payment.created_at <= end)
        except ValueError:
            pass

    payments = query.order_by(Payment.created_at.desc()).all()

    result = []
    for payment in payments:
        data = payment.to_dict()
        user = db.session.get(User, payment.user_id)
        if user:
            data["user"] = {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "full_name": user.full_name,
            }
        result.append(data)

    return jsonify({"payments": result}), 200


@payments_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def create_payment():
    """Record a manual payment."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    # Validate required fields
    required = ["user_id", "amount", "method"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Validate amount
    try:
        amount = Decimal(str(data["amount"]))
        if amount <= 0:
            return jsonify({"error": "Amount must be greater than zero."}), 400
    except (InvalidOperation, ValueError):
        return jsonify({"error": "Invalid amount."}), 400

    # Validate method
    method = data["method"]
    if method not in VALID_METHODS:
        return jsonify({"error": f"Invalid method. Must be one of: {', '.join(sorted(VALID_METHODS))}"}), 400

    # Validate payment type
    payment_type = data.get("payment_type", "one-time")
    if payment_type not in VALID_PAYMENT_TYPES:
        return jsonify({"error": f"Invalid payment_type. Must be one of: {', '.join(VALID_PAYMENT_TYPES)}"}), 400

    # Validate user is a member of this chapter
    membership = ChapterMembership.query.filter_by(
        user_id=data["user_id"], chapter_id=chapter.id, active=True
    ).first()
    if not membership:
        return jsonify({"error": "User is not an active member of this chapter."}), 400

    # Validate plan if provided
    plan_id = data.get("plan_id")
    if plan_id:
        plan = db.session.get(PaymentPlan, plan_id)
        if not plan or plan.chapter_id != chapter.id:
            return jsonify({"error": "Payment plan not found."}), 404
        if plan.user_id != data["user_id"]:
            return jsonify({"error": "Payment plan does not belong to this user."}), 400
        if plan.status != "active":
            return jsonify({"error": "Cannot add payment to a non-active plan."}), 400
        payment_type = "installment"

    # Validate fee_type_id if provided
    fee_type_id = data.get("fee_type_id")
    if fee_type_id:
        valid_types = [ft["id"] for ft in (chapter.config or {}).get("fee_types", [])]
        if fee_type_id not in valid_types:
            return jsonify({"error": "Invalid fee type."}), 400

    payment = Payment(
        chapter_id=chapter.id,
        user_id=data["user_id"],
        amount=amount,
        payment_type=payment_type,
        method=method,
        fee_type_id=fee_type_id or None,
        notes=data.get("notes", "").strip() or None,
        plan_id=plan_id,
    )
    db.session.add(payment)

    # Auto-promote to financial if currently not_financial
    if membership.financial_status == "not_financial":
        membership.financial_status = "financial"

    db.session.commit()

    # Create notification for the member who made the payment
    try:
        notification_service.create_payment_notification(
            chapter_id=chapter.id,
            payment=payment,
            recipient_id=payment.user_id,
        )
    except Exception as e:
        # Log but don't fail the payment if notification creation fails
        current_app.logger.error(f"Failed to create payment notification: {e}")

    result = payment.to_dict()
    user = db.session.get(User, payment.user_id)
    if user:
        result["user"] = {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
        }

    return jsonify({"success": True, "payment": result}), 201


@payments_bp.route("/summary", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def payment_summary():
    """Financial summary for the current chapter."""
    chapter = g.current_chapter

    # Total collected
    total = db.session.query(func.sum(Payment.amount)).filter_by(
        chapter_id=chapter.id
    ).scalar() or Decimal("0")

    # This month
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total_this_month = db.session.query(func.sum(Payment.amount)).filter(
        Payment.chapter_id == chapter.id,
        Payment.created_at >= month_start,
    ).scalar() or Decimal("0")

    # By method
    method_rows = db.session.query(
        Payment.method, func.sum(Payment.amount)
    ).filter_by(chapter_id=chapter.id).group_by(Payment.method).all()

    by_method = {row[0]: str(row[1]) for row in method_rows}

    return jsonify({
        "total_collected": str(total),
        "total_this_month": str(total_this_month),
        "by_method": by_method,
    }), 200


@payments_bp.route("/mine", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def my_payments():
    """Get current user's payment history for this chapter."""
    chapter = g.current_chapter
    payments = (
        Payment.query
        .filter_by(chapter_id=chapter.id, user_id=current_user.id)
        .order_by(Payment.created_at.desc())
        .all()
    )
    return jsonify({"payments": [p.to_dict() for p in payments]}), 200


@payments_bp.route("/checkout", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def create_dues_checkout():
    """
    Create a Stripe Checkout Session for a one-time dues payment.

    The member pays immediately; the Payment record is created by the webhook
    when checkout.session.completed fires.

    Body:
        amount       (required) — amount in dollars
        fee_type_id  (optional) — chapter fee type reference
        notes        (optional)
    """
    chapter = g.current_chapter

    if not chapter.stripe_account_id or not chapter.stripe_onboarding_complete:
        return jsonify({"error": "This chapter has not connected a Stripe account yet."}), 400

    data = request.get_json() or {}

    try:
        amount = Decimal(str(data.get("amount", 0)))
        if amount <= 0:
            return jsonify({"error": "Amount must be greater than zero."}), 400
    except (InvalidOperation, ValueError):
        return jsonify({"error": "Invalid amount."}), 400

    amount_cents = int(amount * 100)
    frontend_url = current_app.config["FRONTEND_URL"]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"Dues — {chapter.name}"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend_url}/payments?stripe_success=1",
            cancel_url=f"{frontend_url}/payments?stripe_cancelled=1",
            metadata={
                "payment_type": "one-time",
                "chapter_id": chapter.id,
                "user_id": current_user.id,
                "fee_type_id": data.get("fee_type_id", ""),
                "notes": data.get("notes", ""),
            },
        )
    except stripe.error.StripeError as e:
        return jsonify({"error": str(e.user_message or e)}), 502

    return jsonify({"checkout_url": session.url}), 200


@payments_bp.route("/plans/<plan_id>/checkout", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def create_installment_checkout(plan_id: str):
    """
    Create a Stripe Checkout Session for a payment plan installment.

    Pays installment_amount for the given plan. The Payment record (linked
    to the plan) is created by the webhook.
    """
    chapter = g.current_chapter

    if not chapter.stripe_account_id or not chapter.stripe_onboarding_complete:
        return jsonify({"error": "This chapter has not connected a Stripe account yet."}), 400

    plan = db.session.get(PaymentPlan, plan_id)
    if not plan or plan.chapter_id != chapter.id:
        return jsonify({"error": "Payment plan not found."}), 404

    # Members can only pay their own plans
    membership = current_user.get_membership(chapter.id)
    if plan.user_id != current_user.id and not membership.has_role("treasurer"):
        return jsonify({"error": "You can only pay your own payment plan."}), 403

    if plan.status != "active":
        return jsonify({"error": "This payment plan is not active."}), 400

    if plan.is_complete():
        return jsonify({"error": "This payment plan is already complete."}), 400

    # Allow a custom amount (must be at least $0.01, at most remaining balance)
    data = request.get_json(silent=True) or {}
    custom_amount = data.get("amount")
    if custom_amount is not None:
        try:
            from decimal import Decimal as D
            custom_amount = D(str(custom_amount))
            if custom_amount < D("0.01"):
                return jsonify({"error": "Amount must be at least $0.01."}), 400
            remaining = Decimal(str(plan.total_amount)) - Decimal(str(plan.total_paid()))
            if custom_amount > remaining:
                return jsonify({"error": f"Amount exceeds remaining balance of ${remaining:.2f}."}), 400
            amount_cents = int(custom_amount * 100)
        except Exception as e:
            current_app.logger.error(f"Invalid amount in installment checkout: {e}")
            return jsonify({"error": "Invalid amount."}), 400
    else:
        amount_cents = int(plan.installment_amount * 100)
    frontend_url = current_app.config["FRONTEND_URL"]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"Dues Installment — {chapter.name}"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend_url}/payments?stripe_success=1&redirect_type=installment",
            cancel_url=f"{frontend_url}/payments?stripe_cancelled=1",
            metadata={
                "payment_type": "installment",
                "chapter_id": chapter.id,
                "user_id": plan.user_id,
                "plan_id": plan_id,
            },
        )
    except stripe.error.StripeError as e:
        return jsonify({"error": str(e.user_message or e)}), 502

    return jsonify({"checkout_url": session.url}), 200
