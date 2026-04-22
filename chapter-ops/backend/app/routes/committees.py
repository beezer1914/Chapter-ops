"""
Committee routes — /api/committees/*

Chapter committees with chairs and budgets.

  GET    /                list active committees (all members); ?include_inactive=true for officers
  POST   /                create a committee (treasurer+)
  PUT    /<id>            update name, description, budget, chair, is_active (treasurer+)
  DELETE /<id>            delete a committee with no tagged expenses (treasurer+)
  GET    /<id>/stats      budget vs. spent breakdown for a committee (treasurer+)
"""

from decimal import Decimal, InvalidOperation

from flask import Blueprint, g, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import func

from app.extensions import db
from app.models.committee import Committee
from app.models.expense import Expense
from app.utils.decorators import chapter_required, role_required
from app.utils.permissions import enforce_module_access

committees_bp = Blueprint("committees", __name__, url_prefix="/api/committees")


@committees_bp.before_request
def _gate_module():
    return enforce_module_access("expenses")


def _is_treasurer_plus() -> bool:
    from app.models import ChapterMembership
    chapter = g.current_chapter
    m = ChapterMembership.query.filter_by(
        chapter_id=chapter.id, user_id=current_user.id, active=True
    ).first()
    hierarchy = {"member": 0, "secretary": 1, "treasurer": 2, "vice_president": 3, "president": 4, "admin": 5}
    return m is not None and hierarchy.get(m.role, 0) >= hierarchy["treasurer"]


# ── List ───────────────────────────────────────────────────────────────────────

@committees_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_committees():
    """List committees. Members see active only; officers can include inactive."""
    chapter = g.current_chapter
    include_inactive = request.args.get("include_inactive") == "true" and _is_treasurer_plus()

    query = Committee.query.filter_by(chapter_id=chapter.id)
    if not include_inactive:
        query = query.filter_by(is_active=True)

    committees = query.order_by(Committee.name).all()
    return jsonify({"committees": [c.to_dict() for c in committees]}), 200


# ── Create ─────────────────────────────────────────────────────────────────────

@committees_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def create_committee():
    chapter = g.current_chapter
    data = request.get_json() or {}

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required."}), 400

    budget_amount = Decimal("0")
    if "budget_amount" in data:
        try:
            budget_amount = Decimal(str(data["budget_amount"]))
            if budget_amount < 0:
                return jsonify({"error": "budget_amount cannot be negative."}), 400
        except InvalidOperation:
            return jsonify({"error": "budget_amount must be a valid number."}), 400

    chair_user_id = data.get("chair_user_id") or None
    if chair_user_id:
        from app.models import ChapterMembership
        chair_membership = ChapterMembership.query.filter_by(
            chapter_id=chapter.id, user_id=chair_user_id, active=True
        ).first()
        if not chair_membership:
            return jsonify({"error": "Chair must be an active chapter member."}), 400

    committee = Committee(
        chapter_id=chapter.id,
        name=name,
        description=(data.get("description") or "").strip() or None,
        budget_amount=budget_amount,
        chair_user_id=chair_user_id,
    )
    db.session.add(committee)
    db.session.commit()
    return jsonify({"committee": committee.to_dict()}), 201


# ── Update ─────────────────────────────────────────────────────────────────────

@committees_bp.route("/<committee_id>", methods=["PUT"])
@login_required
@chapter_required
@role_required("treasurer")
def update_committee(committee_id: str):
    chapter = g.current_chapter
    committee = Committee.query.filter_by(id=committee_id, chapter_id=chapter.id).first()
    if not committee:
        return jsonify({"error": "Committee not found."}), 404

    data = request.get_json() or {}

    if "name" in data:
        name = data["name"].strip()
        if not name:
            return jsonify({"error": "name cannot be empty."}), 400
        committee.name = name

    if "description" in data:
        committee.description = (data["description"] or "").strip() or None

    if "budget_amount" in data:
        try:
            amt = Decimal(str(data["budget_amount"]))
            if amt < 0:
                return jsonify({"error": "budget_amount cannot be negative."}), 400
            committee.budget_amount = amt
        except InvalidOperation:
            return jsonify({"error": "budget_amount must be a valid number."}), 400

    if "chair_user_id" in data:
        chair_user_id = data["chair_user_id"] or None
        if chair_user_id:
            from app.models import ChapterMembership
            chair_membership = ChapterMembership.query.filter_by(
                chapter_id=chapter.id, user_id=chair_user_id, active=True
            ).first()
            if not chair_membership:
                return jsonify({"error": "Chair must be an active chapter member."}), 400
        committee.chair_user_id = chair_user_id

    if "is_active" in data:
        committee.is_active = bool(data["is_active"])

    db.session.commit()
    return jsonify({"committee": committee.to_dict()}), 200


# ── Delete ─────────────────────────────────────────────────────────────────────

@committees_bp.route("/<committee_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("treasurer")
def delete_committee(committee_id: str):
    chapter = g.current_chapter
    committee = Committee.query.filter_by(id=committee_id, chapter_id=chapter.id).first()
    if not committee:
        return jsonify({"error": "Committee not found."}), 404

    expense_count = Expense.query.filter_by(chapter_id=chapter.id, committee_id=committee.id).count()
    if expense_count > 0:
        return jsonify({
            "error": f"Cannot delete committee with {expense_count} tagged expense(s). Archive it instead."
        }), 400

    db.session.delete(committee)
    db.session.commit()
    return jsonify({"success": True}), 200


# ── Stats ──────────────────────────────────────────────────────────────────────

@committees_bp.route("/<committee_id>/stats", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def committee_stats(committee_id: str):
    """Budget vs. spent breakdown for a single committee."""
    chapter = g.current_chapter
    committee = Committee.query.filter_by(id=committee_id, chapter_id=chapter.id).first()
    if not committee:
        return jsonify({"error": "Committee not found."}), 404

    def _sum_by_status(*statuses):
        result = (
            db.session.query(func.sum(Expense.amount))
            .filter(
                Expense.chapter_id == chapter.id,
                Expense.committee_id == committee.id,
                Expense.status.in_(statuses),
            )
            .scalar()
        )
        return Decimal(str(result or 0))

    spent = _sum_by_status("approved", "paid")
    pending = _sum_by_status("pending")
    budget = committee.budget_amount or Decimal("0")
    remaining = max(Decimal("0"), budget - spent)

    recent_expenses = (
        Expense.query
        .filter_by(chapter_id=chapter.id, committee_id=committee.id)
        .order_by(Expense.created_at.desc())
        .limit(10)
        .all()
    )

    return jsonify({
        "committee": committee.to_dict(),
        "budget": str(budget),
        "spent": str(spent),
        "pending": str(pending),
        "remaining": str(remaining),
        "over_budget": spent > budget and budget > Decimal("0"),
        "utilization_rate": round(float(spent / budget) * 100) if budget > 0 else 0,
        "recent_expenses": [e.to_dict() for e in recent_expenses],
    }), 200
