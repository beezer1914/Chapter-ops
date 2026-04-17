"""
Donation routes — /api/donations/*

Handles donation recording, listing, and Stripe Checkout for online donations.
"""

import stripe

from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, jsonify, request, g
from flask_login import current_user, login_required

from app.extensions import db
from app.models import Donation, ChapterMembership, User
from app.utils.decorators import chapter_required, role_required
from app.utils.pagination import paginate

donations_bp = Blueprint("donations", __name__, url_prefix="/api/donations")

VALID_METHODS = {"cash", "check", "bank_transfer", "manual"}


@donations_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("secretary")
def list_donations():
    """List donations for the current chapter."""
    chapter = g.current_chapter
    query = Donation.query.filter_by(chapter_id=chapter.id)

    method = request.args.get("method")
    if method and method in VALID_METHODS:
        query = query.filter_by(method=method)

    from sqlalchemy.orm import joinedload
    query = query.options(joinedload(Donation.user)).order_by(Donation.created_at.desc())
    paged, meta = paginate(query)

    result = []
    for donation in paged.items:
        data = donation.to_dict()
        if donation.user:
            data["user"] = {
                "id": donation.user.id,
                "full_name": donation.user.full_name,
                "email": donation.user.email,
            }
        result.append(data)

    return jsonify({"donations": result, "pagination": meta}), 200


@donations_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def create_donation():
    """Record a donation."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    required = ["donor_name", "amount", "method"]
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

    method = data["method"]
    if method not in VALID_METHODS:
        return jsonify({"error": f"Invalid method. Must be one of: {', '.join(sorted(VALID_METHODS))}"}), 400

    # Validate user_id if provided
    user_id = data.get("user_id")
    if user_id:
        membership = ChapterMembership.query.filter_by(
            user_id=user_id, chapter_id=chapter.id, active=True
        ).first()
        if not membership:
            return jsonify({"error": "Linked user is not an active member of this chapter."}), 400

    donation = Donation(
        chapter_id=chapter.id,
        donor_name=data["donor_name"].strip(),
        donor_email=data.get("donor_email", "").strip() or None,
        amount=amount,
        method=method,
        notes=data.get("notes", "").strip() or None,
        user_id=user_id,
    )
    db.session.add(donation)
    db.session.commit()

    result = donation.to_dict()
    if donation.user_id:
        user = db.session.get(User, donation.user_id)
        if user:
            result["user"] = {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
            }

    return jsonify({"success": True, "donation": result}), 201


@donations_bp.route("/checkout", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def create_donation_checkout():
    """
    Create a Stripe Checkout Session for an online donation.

    The Donation record is created by the webhook when checkout.session.completed
    fires, keeping checkout initiation and fulfillment decoupled.

    Body:
        amount       (required) — donation amount in dollars
        donor_name   (optional) — defaults to current user's full name
        donor_email  (optional) — defaults to current user's email
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

    donor_name = (data.get("donor_name") or "").strip() or current_user.full_name
    donor_email = (data.get("donor_email") or "").strip() or current_user.email

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"Donation — {chapter.name}"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend_url}/donations?stripe_success=1",
            cancel_url=f"{frontend_url}/donations?stripe_cancelled=1",
            metadata={
                "payment_type": "donation",
                "chapter_id": chapter.id,
                "user_id": current_user.id,
                "donor_name": donor_name,
                "donor_email": donor_email,
                "notes": data.get("notes", ""),
            },
            stripe_account=chapter.stripe_account_id,
        )
    except stripe.error.StripeError as e:
        return jsonify({"error": str(e.user_message or e)}), 502

    return jsonify({"checkout_url": session.url}), 200
