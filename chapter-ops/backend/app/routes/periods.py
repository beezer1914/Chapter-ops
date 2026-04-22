"""
Period routes — /api/periods/*

Manages chapter billing/activity periods.

  GET    /           list all periods for the chapter (newest first)
  POST   /           create a new period (treasurer+)
  PUT    /<id>       update name, dates, notes (treasurer+)
  DELETE /<id>       delete a period with no linked data (treasurer+)
  POST   /<id>/activate   mark as active, deactivate all others (treasurer+)
"""

from datetime import date

from flask import Blueprint, g, jsonify, request
from flask_login import login_required

from app.extensions import db
from app.models.chapter_period import ChapterPeriod, PERIOD_TYPES
from app.services.dues_service import seed_period_dues, rollover_unpaid_dues, recompute_financial_status
from app.utils.decorators import chapter_required, role_required
from app.utils.permissions import enforce_module_access

periods_bp = Blueprint("periods", __name__, url_prefix="/api/periods")


@periods_bp.before_request
def _gate_module():
    return enforce_module_access("payments")


def _parse_date(value: str | None, field: str):
    """Parse an ISO date string or return a 400 tuple."""
    if not value:
        return None, (jsonify({"error": f"{field} is required."}), 400)
    try:
        return date.fromisoformat(value), None
    except ValueError:
        return None, (jsonify({"error": f"{field} must be a valid ISO date (YYYY-MM-DD)."}), 400)


@periods_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_periods():
    """List all periods for the current chapter, newest first."""
    chapter = g.current_chapter
    periods = (
        ChapterPeriod.query
        .filter_by(chapter_id=chapter.id)
        .order_by(ChapterPeriod.start_date.desc())
        .all()
    )
    return jsonify({"periods": [p.to_dict() for p in periods]}), 200


@periods_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def create_period():
    """Create a new period for the current chapter."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required."}), 400

    period_type = data.get("period_type", "semester")
    if period_type not in PERIOD_TYPES:
        return jsonify({"error": f"period_type must be one of: {', '.join(PERIOD_TYPES)}."}), 400

    start_date, err = _parse_date(data.get("start_date"), "start_date")
    if err:
        return err
    end_date, err = _parse_date(data.get("end_date"), "end_date")
    if err:
        return err

    if end_date <= start_date:
        return jsonify({"error": "end_date must be after start_date."}), 400

    make_active = bool(data.get("is_active", False))

    if make_active:
        ChapterPeriod.query.filter_by(chapter_id=chapter.id, is_active=True).update({"is_active": False})

    period = ChapterPeriod(
        chapter_id=chapter.id,
        name=name,
        period_type=period_type,
        start_date=start_date,
        end_date=end_date,
        is_active=make_active,
        notes=(data.get("notes") or "").strip() or None,
    )
    db.session.add(period)
    db.session.commit()

    if period.is_active:
        try:
            seed_period_dues(chapter, period)
            db.session.commit()
        except Exception:
            pass  # Non-fatal — dues can be seeded manually later

    return jsonify({"period": period.to_dict()}), 201


@periods_bp.route("/<period_id>", methods=["PUT"])
@login_required
@chapter_required
@role_required("treasurer")
def update_period(period_id: str):
    """Update a period's name, dates, or notes."""
    chapter = g.current_chapter
    period = ChapterPeriod.query.filter_by(id=period_id, chapter_id=chapter.id).first()
    if not period:
        return jsonify({"error": "Period not found."}), 404

    data = request.get_json() or {}

    if "name" in data:
        name = data["name"].strip()
        if not name:
            return jsonify({"error": "name cannot be empty."}), 400
        period.name = name

    if "period_type" in data:
        if data["period_type"] not in PERIOD_TYPES:
            return jsonify({"error": f"period_type must be one of: {', '.join(PERIOD_TYPES)}."}), 400
        period.period_type = data["period_type"]

    if "start_date" in data:
        d, err = _parse_date(data["start_date"], "start_date")
        if err:
            return err
        period.start_date = d

    if "end_date" in data:
        d, err = _parse_date(data["end_date"], "end_date")
        if err:
            return err
        period.end_date = d

    if period.end_date <= period.start_date:
        return jsonify({"error": "end_date must be after start_date."}), 400

    if "notes" in data:
        period.notes = (data["notes"] or "").strip() or None

    db.session.commit()
    return jsonify({"period": period.to_dict()}), 200


@periods_bp.route("/<period_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("treasurer")
def delete_period(period_id: str):
    """Delete a period. Cannot delete the active period."""
    chapter = g.current_chapter
    period = ChapterPeriod.query.filter_by(id=period_id, chapter_id=chapter.id).first()
    if not period:
        return jsonify({"error": "Period not found."}), 404

    if period.is_active:
        return jsonify({"error": "Cannot delete the active period. Activate a different period first."}), 400

    db.session.delete(period)
    db.session.commit()
    return jsonify({"success": True}), 200


@periods_bp.route("/<period_id>/activate", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def activate_period(period_id: str):
    """
    Mark a period as active, deactivating all others for this chapter.

    Optional body: { "rollover_unpaid": true }
    When rollover_unpaid is true, unpaid/partial balances from the previously
    active period are carried forward into this period's dues rows.
    """
    chapter = g.current_chapter
    period = ChapterPeriod.query.filter_by(id=period_id, chapter_id=chapter.id).first()
    if not period:
        return jsonify({"error": "Period not found."}), 404

    data = request.get_json(silent=True) or {}
    rollover_unpaid = bool(data.get("rollover_unpaid", False))

    # Capture the currently active period before deactivating it
    prev_period = ChapterPeriod.query.filter_by(
        chapter_id=chapter.id, is_active=True
    ).first() if rollover_unpaid else None

    # Deactivate all other periods and activate this one
    ChapterPeriod.query.filter_by(chapter_id=chapter.id, is_active=True).update({"is_active": False})
    period.is_active = True
    db.session.commit()

    # Seed dues rows for the new period (idempotent)
    rollover_count = 0
    try:
        seed_period_dues(chapter, period)
        db.session.commit()

        # Optionally carry forward unpaid balances from the previous period
        if rollover_unpaid and prev_period and prev_period.id != period.id:
            rollover_count = rollover_unpaid_dues(chapter, prev_period, period)
            db.session.commit()
    except Exception:
        pass  # Non-fatal — dues seeding failures don't block activation

    response = {"period": period.to_dict()}
    if rollover_unpaid:
        response["rollover_count"] = rollover_count
    return jsonify(response), 200


@periods_bp.route("/<period_id>/my-dues", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_my_dues(period_id: str):
    """
    Return the current user's dues records for a specific period.
    Auto-seeds rows if the member has none yet (handles late joiners and
    accounts created outside the invite flow).
    """
    from flask_login import current_user
    from app.models import ChapterMembership
    from app.models.chapter_period_dues import ChapterPeriodDues
    from app.services.dues_service import seed_member_dues, recompute_financial_status

    chapter = g.current_chapter
    period = ChapterPeriod.query.filter_by(id=period_id, chapter_id=chapter.id).first()
    if not period:
        return jsonify({"error": "Period not found."}), 404

    dues = (
        ChapterPeriodDues.query
        .filter_by(chapter_id=chapter.id, period_id=period.id, user_id=current_user.id)
        .order_by(ChapterPeriodDues.fee_type_label)
        .all()
    )

    # Auto-seed if this member has no rows yet and the period is active
    if not dues and period.is_active:
        try:
            seed_member_dues(chapter, current_user.id)
            db.session.commit()
            dues = (
                ChapterPeriodDues.query
                .filter_by(chapter_id=chapter.id, period_id=period.id, user_id=current_user.id)
                .order_by(ChapterPeriodDues.fee_type_label)
                .all()
            )
        except Exception:
            pass  # Non-fatal — return empty list if seeding fails

    # Always recompute financial status so the response reflects current dues state
    if dues and period.is_active:
        try:
            recompute_financial_status(chapter, current_user.id)
            db.session.commit()
        except Exception:
            pass

    membership = ChapterMembership.query.filter_by(
        chapter_id=chapter.id, user_id=current_user.id, active=True
    ).first()
    financial_status = membership.financial_status if membership else None

    return jsonify({
        "dues": [d.to_dict() for d in dues],
        "financial_status": financial_status,
    }), 200


@periods_bp.route("/<period_id>/dues", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def list_period_dues(period_id: str):
    """List all dues records for a period, optionally filtered by user_id."""
    from app.models.chapter_period_dues import ChapterPeriodDues

    chapter = g.current_chapter
    period = ChapterPeriod.query.filter_by(id=period_id, chapter_id=chapter.id).first()
    if not period:
        return jsonify({"error": "Period not found."}), 404

    query = ChapterPeriodDues.query.filter_by(chapter_id=chapter.id, period_id=period.id)

    user_id = request.args.get("user_id")
    if user_id:
        query = query.filter_by(user_id=user_id)

    dues = query.order_by(ChapterPeriodDues.fee_type_label).all()
    return jsonify({"dues": [d.to_dict(include_user=True) for d in dues]}), 200


@periods_bp.route("/<period_id>/dues/<dues_id>", methods=["PUT"])
@login_required
@chapter_required
@role_required("treasurer")
def update_dues_record(period_id: str, dues_id: str):
    """
    Allow a treasurer to adjust a dues record's amount_owed or add a note.
    Status is recomputed automatically from amount_paid vs amount_owed.
    To mark as exempt, pass {"status": "exempt"}.
    """
    from decimal import Decimal, InvalidOperation
    from app.models.chapter_period_dues import ChapterPeriodDues

    chapter = g.current_chapter
    period = ChapterPeriod.query.filter_by(id=period_id, chapter_id=chapter.id).first()
    if not period:
        return jsonify({"error": "Period not found."}), 404

    dues = ChapterPeriodDues.query.filter_by(
        id=dues_id, chapter_id=chapter.id, period_id=period.id
    ).first()
    if not dues:
        return jsonify({"error": "Dues record not found."}), 404

    data = request.get_json() or {}

    if "amount_owed" in data:
        try:
            new_owed = Decimal(str(data["amount_owed"]))
            if new_owed < Decimal("0"):
                return jsonify({"error": "amount_owed cannot be negative."}), 400
            dues.amount_owed = new_owed
            # Recompute status based on new amount_owed
            if dues.status != "exempt":
                if dues.amount_paid >= dues.amount_owed:
                    dues.status = "paid"
                elif dues.amount_paid > Decimal("0"):
                    dues.status = "partial"
                else:
                    dues.status = "unpaid"
        except InvalidOperation:
            return jsonify({"error": "amount_owed must be a valid number."}), 400

    if "status" in data:
        if data["status"] == "exempt":
            dues.status = "exempt"
            dues.amount_owed = Decimal("0")
        elif data["status"] in ("unpaid", "partial", "paid"):
            # Allow manual override only if not currently exempt
            if dues.status != "exempt":
                dues.status = data["status"]

    if "notes" in data:
        dues.notes = (data["notes"] or "").strip() or None

    db.session.commit()
    recompute_financial_status(chapter, dues.user_id)
    db.session.commit()
    return jsonify({"dues": dues.to_dict()}), 200
