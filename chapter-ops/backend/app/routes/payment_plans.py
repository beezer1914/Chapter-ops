"""
Payment plan routes — /api/payment-plans/*

Handles payment plan creation, listing, and cancellation.
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, g
from flask_login import current_user, login_required

from app.extensions import db
from app.models import PaymentPlan, ChapterMembership, User, Payment
from app.utils.decorators import chapter_required, role_required

payment_plans_bp = Blueprint("payment_plans", __name__, url_prefix="/api/payment-plans")

VALID_FREQUENCIES = {"weekly", "biweekly", "monthly", "quarterly"}


@payment_plans_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_plans():
    """
    List payment plans for the current chapter.

    If query param `mine=true`, returns only the current user's plans (member+).
    Otherwise requires secretary+ to view all plans.
    """
    chapter = g.current_chapter
    mine = request.args.get("mine", "").lower() == "true"

    if mine:
        query = PaymentPlan.query.filter_by(
            chapter_id=chapter.id, user_id=current_user.id
        )
    else:
        # Need secretary+ to view all plans
        membership = current_user.get_membership(chapter.id)
        if not membership or not membership.has_role("secretary"):
            return jsonify({"error": "Insufficient permissions. Requires secretary or higher."}), 403
        query = PaymentPlan.query.filter_by(chapter_id=chapter.id)

    # Filter by status
    status = request.args.get("status")
    if status in ("active", "completed", "cancelled"):
        query = query.filter_by(status=status)

    plans = query.order_by(
        db.case(
            (PaymentPlan.status == "active", 0),
            (PaymentPlan.status == "completed", 1),
            else_=2,
        ),
        PaymentPlan.created_at.desc(),
    ).all()

    result = []
    for plan in plans:
        data = plan.to_dict()
        user = db.session.get(User, plan.user_id)
        if user:
            data["user"] = {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "full_name": user.full_name,
            }
        result.append(data)

    return jsonify({"plans": result}), 200


@payment_plans_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def create_plan():
    """
    Create a payment plan for a member.

    Members can create plans for themselves only.
    Treasurer+ can create plans for any member.
    Auto-calculates installment_amount from total_amount / expected_installments.
    """
    chapter = g.current_chapter
    data = request.get_json() or {}

    required = ["user_id", "frequency", "start_date", "end_date", "total_amount", "expected_installments"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Members can only create plans for themselves; treasurer+ can create for anyone
    if data["user_id"] != current_user.id:
        membership = current_user.get_membership(chapter.id)
        if not membership or not membership.has_role("treasurer"):
            return jsonify({"error": "Insufficient permissions. You can only create payment plans for yourself."}), 403

    # Validate frequency
    if data["frequency"] not in VALID_FREQUENCIES:
        return jsonify({"error": f"Invalid frequency. Must be one of: {', '.join(sorted(VALID_FREQUENCIES))}"}), 400

    # Validate amount
    try:
        total_amount = Decimal(str(data["total_amount"]))
        if total_amount <= 0:
            return jsonify({"error": "total_amount must be greater than zero."}), 400
    except (InvalidOperation, ValueError):
        return jsonify({"error": "Invalid total_amount."}), 400

    # Validate expected_installments
    expected = data["expected_installments"]
    if not isinstance(expected, int) or expected < 1:
        return jsonify({"error": "expected_installments must be a positive integer."}), 400

    # Validate dates
    try:
        start = date.fromisoformat(data["start_date"])
        end = date.fromisoformat(data["end_date"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    if end <= start:
        return jsonify({"error": "end_date must be after start_date."}), 400

    # Validate user is a member
    membership = ChapterMembership.query.filter_by(
        user_id=data["user_id"], chapter_id=chapter.id, active=True
    ).first()
    if not membership:
        return jsonify({"error": "User is not an active member of this chapter."}), 400

    # Auto-calculate installment amount
    installment_amount = round(total_amount / expected, 2)

    plan = PaymentPlan(
        chapter_id=chapter.id,
        user_id=data["user_id"],
        frequency=data["frequency"],
        start_date=start,
        end_date=end,
        total_amount=total_amount,
        installment_amount=installment_amount,
        expected_installments=expected,
    )
    db.session.add(plan)
    db.session.commit()

    result = plan.to_dict()
    user = db.session.get(User, plan.user_id)
    if user:
        result["user"] = {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
        }

    return jsonify({"success": True, "plan": result}), 201


@payment_plans_bp.route("/<plan_id>", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def plan_detail(plan_id):
    """
    Get a payment plan with its payment history.

    Members can view their own plans; secretary+ can view any plan.
    """
    chapter = g.current_chapter
    plan = db.session.get(PaymentPlan, plan_id)

    if not plan or plan.chapter_id != chapter.id:
        return jsonify({"error": "Payment plan not found."}), 404

    # Members can only view their own plans
    if plan.user_id != current_user.id:
        membership = current_user.get_membership(chapter.id)
        if not membership or not membership.has_role("secretary"):
            return jsonify({"error": "Insufficient permissions."}), 403

    result = plan.to_dict()
    user = db.session.get(User, plan.user_id)
    if user:
        result["user"] = {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
        }

    # Include payments for this plan
    payments = (
        Payment.query
        .filter_by(plan_id=plan.id)
        .order_by(Payment.created_at.desc())
        .all()
    )
    result["payments"] = [p.to_dict() for p in payments]

    return jsonify({"plan": result}), 200


@payment_plans_bp.route("/<plan_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("treasurer")
def update_plan(plan_id):
    """Cancel a payment plan. Only active plans can be cancelled."""
    chapter = g.current_chapter
    plan = db.session.get(PaymentPlan, plan_id)

    if not plan or plan.chapter_id != chapter.id:
        return jsonify({"error": "Payment plan not found."}), 404

    data = request.get_json() or {}
    new_status = data.get("status")

    if new_status != "cancelled":
        return jsonify({"error": "Only cancellation is supported. Set status to 'cancelled'."}), 400

    if plan.status != "active":
        return jsonify({"error": "Only active plans can be cancelled."}), 400

    plan.status = "cancelled"
    db.session.commit()

    result = plan.to_dict()
    user = db.session.get(User, plan.user_id)
    if user:
        result["user"] = {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
        }

    return jsonify({"success": True, "plan": result}), 200
