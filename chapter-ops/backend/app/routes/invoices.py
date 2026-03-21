"""
Invoice routes — /api/invoices/*

Handles chapter→member invoicing (dues) and region→chapter invoicing (head tax).
"""

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, jsonify, request, g
from flask_login import current_user, login_required
from sqlalchemy import func, or_

from app.extensions import db
from app.models import (
    Invoice, Payment, Chapter, ChapterMembership, User,
    Region, RegionMembership,
)
from app.services import notification_service
from app.utils.decorators import chapter_required, role_required, region_role_required

invoices_bp = Blueprint("invoices", __name__, url_prefix="/api/invoices")

VALID_STATUSES = {"draft", "sent", "paid", "overdue", "cancelled"}


def _generate_invoice_number(scope: str, offset: int = 0) -> str:
    """Generate a sequential invoice number like INV-2026-0042.

    For bulk creation, pass offset=0,1,2,… so each invoice in the batch
    gets a unique number without querying mid-loop.
    """
    year = date.today().year
    prefix = "INV" if scope == "member" else "RGN"
    last = (
        db.session.query(Invoice)
        .filter(Invoice.invoice_number.like(f"{prefix}-{year}-%"))
        .order_by(Invoice.created_at.desc())
        .first()
    )
    if last:
        seq = int(last.invoice_number.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}-{year}-{seq + offset:04d}"


# ── Chapter → Member invoicing ──────────────────────────────────────────


@invoices_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_invoices():
    """List invoices for the current chapter.

    Members see only their own invoices.
    Treasurer+ sees all chapter invoices.
    """
    chapter = g.current_chapter
    membership = current_user.get_membership(chapter.id)

    if membership.has_role("treasurer"):
        query = Invoice.query.filter_by(chapter_id=chapter.id, scope="member")
        # Optional filters
        status = request.args.get("status")
        if status:
            query = query.filter_by(status=status)
        user_id = request.args.get("user_id")
        if user_id:
            query = query.filter_by(billed_user_id=user_id)
    else:
        query = Invoice.query.filter_by(
            chapter_id=chapter.id, scope="member", billed_user_id=current_user.id
        )
        status = request.args.get("status")
        if status:
            query = query.filter_by(status=status)

    invoices = query.order_by(Invoice.due_date.desc()).all()
    results = []
    for inv in invoices:
        d = inv.to_dict()
        if inv.billed_user:
            d["billed_user"] = {
                "id": inv.billed_user.id,
                "first_name": inv.billed_user.first_name,
                "last_name": inv.billed_user.last_name,
                "email": inv.billed_user.email,
            }
        results.append(d)
    return jsonify({"invoices": results}), 200


@invoices_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def create_invoice():
    """Create a member invoice (chapter→member)."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    # Validate required fields
    required = ["billed_user_id", "amount", "description", "due_date"]
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

    # Validate due date
    try:
        due = date.fromisoformat(data["due_date"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid due_date. Use YYYY-MM-DD format."}), 400

    # Validate member exists in this chapter
    membership = ChapterMembership.query.filter_by(
        user_id=data["billed_user_id"], chapter_id=chapter.id, active=True
    ).first()
    if not membership:
        return jsonify({"error": "User is not an active member of this chapter."}), 400

    invoice = Invoice(
        scope="member",
        chapter_id=chapter.id,
        billed_user_id=data["billed_user_id"],
        fee_type_id=data.get("fee_type_id"),
        invoice_number=_generate_invoice_number("member"),
        description=data["description"],
        amount=amount,
        status="draft",
        due_date=due,
        notes=data.get("notes"),
        created_by_id=current_user.id,
    )
    db.session.add(invoice)
    db.session.commit()

    return jsonify(invoice.to_dict()), 201


@invoices_bp.route("/bulk", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def bulk_create_invoices():
    """Create invoices for multiple (or all) chapter members at once."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    required = ["amount", "description", "due_date"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    try:
        amount = Decimal(str(data["amount"]))
        if amount <= 0:
            return jsonify({"error": "Amount must be greater than zero."}), 400
    except (InvalidOperation, ValueError):
        return jsonify({"error": "Invalid amount."}), 400

    try:
        due = date.fromisoformat(data["due_date"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid due_date. Use YYYY-MM-DD format."}), 400

    # Get target members: specific list or all active members
    user_ids = data.get("user_ids")
    if user_ids:
        members = ChapterMembership.query.filter(
            ChapterMembership.chapter_id == chapter.id,
            ChapterMembership.active == True,
            ChapterMembership.user_id.in_(user_ids),
        ).all()
    else:
        # All active members
        members = ChapterMembership.query.filter_by(
            chapter_id=chapter.id, active=True
        ).all()

    if not members:
        return jsonify({"error": "No eligible members found."}), 400

    # Optionally exclude members with certain financial statuses
    exclude_statuses = set(data.get("exclude_statuses", []))
    if exclude_statuses:
        members = [m for m in members if m.financial_status not in exclude_statuses]

    # Generate the first invoice number outside the loop, then use offset
    # to avoid duplicate numbers within the batch.
    base_number = _generate_invoice_number("member")  # queries DB once
    base_seq = int(base_number.split("-")[-1])
    year = date.today().year

    created = []
    with db.session.no_autoflush:
        for i, m in enumerate(members):
            inv = Invoice(
                scope="member",
                chapter_id=chapter.id,
                billed_user_id=m.user_id,
                fee_type_id=data.get("fee_type_id"),
                invoice_number=f"INV-{year}-{base_seq + i:04d}",
                description=data["description"],
                amount=amount,
                status="draft",
                due_date=due,
                notes=data.get("notes"),
                created_by_id=current_user.id,
            )
            db.session.add(inv)
            created.append(inv)

    db.session.commit()

    return jsonify({
        "message": f"Created {len(created)} invoices.",
        "count": len(created),
        "invoices": [inv.to_dict() for inv in created],
    }), 201


@invoices_bp.route("/<invoice_id>", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_invoice(invoice_id):
    """Get a single invoice."""
    chapter = g.current_chapter
    invoice = db.session.get(Invoice, invoice_id)
    if not invoice or invoice.chapter_id != chapter.id:
        return jsonify({"error": "Invoice not found."}), 404

    membership = current_user.get_membership(chapter.id)
    if not membership.has_role("treasurer") and invoice.billed_user_id != current_user.id:
        return jsonify({"error": "Access denied."}), 403

    d = invoice.to_dict()
    if invoice.billed_user:
        d["billed_user"] = {
            "id": invoice.billed_user.id,
            "first_name": invoice.billed_user.first_name,
            "last_name": invoice.billed_user.last_name,
            "email": invoice.billed_user.email,
        }
    return jsonify(d), 200


@invoices_bp.route("/<invoice_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("treasurer")
def update_invoice(invoice_id):
    """Update an invoice (status, notes, amount, due_date, link payment)."""
    chapter = g.current_chapter
    invoice = db.session.get(Invoice, invoice_id)
    if not invoice or invoice.chapter_id != chapter.id:
        return jsonify({"error": "Invoice not found."}), 404

    data = request.get_json() or {}

    if "status" in data:
        new_status = data["status"]
        if new_status not in VALID_STATUSES:
            return jsonify({"error": f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}"}), 400
        invoice.status = new_status
        if new_status == "sent" and not invoice.sent_at:
            invoice.sent_at = datetime.now(timezone.utc)
        if new_status == "paid" and not invoice.paid_at:
            invoice.paid_at = datetime.now(timezone.utc)

    if "amount" in data:
        try:
            amount = Decimal(str(data["amount"]))
            if amount <= 0:
                return jsonify({"error": "Amount must be greater than zero."}), 400
            invoice.amount = amount
        except (InvalidOperation, ValueError):
            return jsonify({"error": "Invalid amount."}), 400

    if "due_date" in data:
        try:
            invoice.due_date = date.fromisoformat(data["due_date"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid due_date."}), 400

    if "description" in data:
        invoice.description = data["description"]

    if "notes" in data:
        invoice.notes = data["notes"]

    if "payment_id" in data:
        if data["payment_id"]:
            payment = db.session.get(Payment, data["payment_id"])
            if not payment or payment.chapter_id != chapter.id:
                return jsonify({"error": "Payment not found."}), 404
            invoice.payment_id = data["payment_id"]
            invoice.status = "paid"
            invoice.paid_at = datetime.now(timezone.utc)
        else:
            invoice.payment_id = None

    db.session.commit()
    return jsonify(invoice.to_dict()), 200


@invoices_bp.route("/<invoice_id>/send", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def send_invoice(invoice_id):
    """Mark invoice as sent and notify the member."""
    chapter = g.current_chapter
    invoice = db.session.get(Invoice, invoice_id)
    if not invoice or invoice.chapter_id != chapter.id:
        return jsonify({"error": "Invoice not found."}), 404

    if invoice.status not in ("draft", "overdue"):
        return jsonify({"error": f"Cannot send invoice with status '{invoice.status}'."}), 400

    invoice.status = "sent"
    invoice.sent_at = datetime.now(timezone.utc)
    db.session.commit()

    # Send in-app notification
    try:
        from app.models import Notification
        notif = Notification(
            user_id=invoice.billed_user_id,
            chapter_id=chapter.id,
            title="New Invoice",
            message=f"You have a new invoice: {invoice.description} — ${invoice.amount} due {invoice.due_date.strftime('%b %d, %Y')}",
            notification_type="invoice",
        )
        db.session.add(notif)
        db.session.commit()
    except Exception as e:
        current_app.logger.error(f"Failed to send invoice notification: {e}")

    return jsonify(invoice.to_dict()), 200


@invoices_bp.route("/bulk-send", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def bulk_send_invoices():
    """Send all draft invoices at once."""
    chapter = g.current_chapter
    data = request.get_json() or {}
    invoice_ids = data.get("invoice_ids", [])

    if invoice_ids:
        invoices = Invoice.query.filter(
            Invoice.id.in_(invoice_ids),
            Invoice.chapter_id == chapter.id,
            Invoice.status == "draft",
        ).all()
    else:
        invoices = Invoice.query.filter_by(
            chapter_id=chapter.id, status="draft", scope="member"
        ).all()

    now = datetime.now(timezone.utc)
    for inv in invoices:
        inv.status = "sent"
        inv.sent_at = now

    db.session.commit()

    return jsonify({
        "message": f"Sent {len(invoices)} invoices.",
        "count": len(invoices),
    }), 200


@invoices_bp.route("/summary", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def invoice_summary():
    """Get invoice summary stats for the chapter."""
    chapter = g.current_chapter
    invoices = Invoice.query.filter_by(chapter_id=chapter.id, scope="member").all()

    total = sum(inv.amount for inv in invoices)
    by_status = {}
    for inv in invoices:
        by_status.setdefault(inv.status, {"count": 0, "amount": Decimal("0")})
        by_status[inv.status]["count"] += 1
        by_status[inv.status]["amount"] += inv.amount

    return jsonify({
        "total_invoiced": str(total),
        "total_count": len(invoices),
        "by_status": {
            k: {"count": v["count"], "amount": str(v["amount"])}
            for k, v in by_status.items()
        },
    }), 200


# ── Chapter view of regional invoices (head tax billed TO this chapter) ───

@invoices_bp.route("/chapter-bills", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def list_chapter_bills():
    """List regional invoices billed to the current chapter.

    Visible to treasurer+ and president so they know what the chapter owes the region.
    """
    chapter = g.current_chapter
    invoices = (
        Invoice.query
        .filter_by(billed_chapter_id=chapter.id, scope="chapter")
        .order_by(Invoice.due_date.desc())
        .all()
    )

    results = []
    for inv in invoices:
        d = inv.to_dict()
        if inv.region:
            d["region"] = {"id": inv.region.id, "name": inv.region.name}
        results.append(d)

    return jsonify({"invoices": results}), 200


# ── Region → Chapter invoicing (head tax) ────────────────────────────────


@invoices_bp.route("/regional/<region_id>", methods=["GET"])
@login_required
@region_role_required("member")
def list_regional_invoices(region_id):
    """List regional invoices for chapters in this region.

    Regional officers see all. Chapter treasurers see their chapter's invoices.
    """
    region = g.current_region
    membership = current_user.get_region_membership(region_id)
    is_regional_officer = membership and membership.has_role("regional_treasurer")

    if is_regional_officer or g.is_org_admin:
        invoices = Invoice.query.filter_by(region_id=region.id, scope="chapter").order_by(Invoice.due_date.desc()).all()
    else:
        # Chapter member — only see invoices for their chapter
        chapter_ids = [
            cm.chapter_id for cm in current_user.memberships.filter_by(active=True).all()
        ]
        invoices = Invoice.query.filter(
            Invoice.region_id == region.id,
            Invoice.scope == "chapter",
            Invoice.billed_chapter_id.in_(chapter_ids),
        ).order_by(Invoice.due_date.desc()).all()

    results = []
    for inv in invoices:
        d = inv.to_dict()
        if inv.billed_chapter:
            d["billed_chapter"] = {
                "id": inv.billed_chapter.id,
                "name": inv.billed_chapter.name,
                "designation": inv.billed_chapter.designation,
            }
        results.append(d)

    return jsonify({"invoices": results}), 200


@invoices_bp.route("/regional/<region_id>", methods=["POST"])
@login_required
@region_role_required("regional_treasurer")
def create_regional_invoice(region_id):
    """Create a regional head tax invoice for a chapter."""
    region = g.current_region
    data = request.get_json() or {}

    required = ["billed_chapter_id", "description", "due_date"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Validate chapter belongs to this region
    chapter = db.session.get(Chapter, data["billed_chapter_id"])
    if not chapter or chapter.region_id != region.id:
        return jsonify({"error": "Chapter not found in this region."}), 404

    try:
        due = date.fromisoformat(data["due_date"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid due_date. Use YYYY-MM-DD format."}), 400

    # Calculate amount from per_member_rate if provided
    per_member_rate = data.get("per_member_rate")
    flat_amount = data.get("amount")

    if per_member_rate:
        try:
            rate = Decimal(str(per_member_rate))
            if rate <= 0:
                return jsonify({"error": "Rate must be greater than zero."}), 400
        except (InvalidOperation, ValueError):
            return jsonify({"error": "Invalid per_member_rate."}), 400

        # Snapshot active member count
        member_count = ChapterMembership.query.filter_by(
            chapter_id=chapter.id, active=True
        ).count()
        amount = rate * member_count
    elif flat_amount:
        try:
            amount = Decimal(str(flat_amount))
            if amount <= 0:
                return jsonify({"error": "Amount must be greater than zero."}), 400
        except (InvalidOperation, ValueError):
            return jsonify({"error": "Invalid amount."}), 400
        rate = None
        member_count = None
    else:
        return jsonify({"error": "Provide either per_member_rate or amount."}), 400

    invoice = Invoice(
        scope="chapter",
        region_id=region.id,
        billed_chapter_id=chapter.id,
        per_member_rate=rate,
        member_count=member_count,
        invoice_number=_generate_invoice_number("chapter"),
        description=data["description"],
        amount=amount,
        status="draft",
        due_date=due,
        notes=data.get("notes"),
        created_by_id=current_user.id,
    )
    db.session.add(invoice)
    db.session.commit()

    result = invoice.to_dict()
    result["billed_chapter"] = {
        "id": chapter.id,
        "name": chapter.name,
        "designation": chapter.designation,
    }
    return jsonify(result), 201


@invoices_bp.route("/regional/<region_id>/bulk", methods=["POST"])
@login_required
@region_role_required("regional_treasurer")
def bulk_create_regional_invoices(region_id):
    """Create head tax invoices for all chapters in the region."""
    region = g.current_region
    data = request.get_json() or {}

    required = ["per_member_rate", "description", "due_date"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    try:
        rate = Decimal(str(data["per_member_rate"]))
        if rate <= 0:
            return jsonify({"error": "Rate must be greater than zero."}), 400
    except (InvalidOperation, ValueError):
        return jsonify({"error": "Invalid per_member_rate."}), 400

    try:
        due = date.fromisoformat(data["due_date"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid due_date. Use YYYY-MM-DD format."}), 400

    chapters = Chapter.query.filter_by(region_id=region.id, active=True).all()
    if not chapters:
        return jsonify({"error": "No active chapters in this region."}), 400

    # Pre-compute member counts so we know which chapters to skip
    eligible = []
    for ch in chapters:
        count = ChapterMembership.query.filter_by(
            chapter_id=ch.id, active=True
        ).count()
        if count > 0:
            eligible.append((ch, count))

    if not eligible:
        return jsonify({"error": "No chapters with active members."}), 400

    # Generate the first invoice number outside the loop, then use offset
    base_number = _generate_invoice_number("chapter")
    base_seq = int(base_number.split("-")[-1])
    year = date.today().year

    created = []
    with db.session.no_autoflush:
        for i, (ch, member_count) in enumerate(eligible):
            inv = Invoice(
                scope="chapter",
                region_id=region.id,
                billed_chapter_id=ch.id,
                per_member_rate=rate,
                member_count=member_count,
                invoice_number=f"RGN-{year}-{base_seq + i:04d}",
                description=data["description"],
                amount=rate * member_count,
                status="draft",
                due_date=due,
                notes=data.get("notes"),
                created_by_id=current_user.id,
            )
            db.session.add(inv)
            created.append(inv)

    db.session.commit()

    return jsonify({
        "message": f"Created {len(created)} regional invoices.",
        "count": len(created),
        "invoices": [
            {
                **inv.to_dict(),
                "billed_chapter": {
                    "id": inv.billed_chapter.id,
                    "name": inv.billed_chapter.name,
                    "designation": inv.billed_chapter.designation,
                } if inv.billed_chapter else None,
            }
            for inv in created
        ],
    }), 201


@invoices_bp.route("/regional/<region_id>/<invoice_id>", methods=["PATCH"])
@login_required
@region_role_required("regional_treasurer")
def update_regional_invoice(region_id, invoice_id):
    """Update a regional invoice (status, notes, etc.)."""
    region = g.current_region
    invoice = db.session.get(Invoice, invoice_id)
    if not invoice or invoice.region_id != region.id:
        return jsonify({"error": "Invoice not found."}), 404

    data = request.get_json() or {}

    if "status" in data:
        new_status = data["status"]
        if new_status not in VALID_STATUSES:
            return jsonify({"error": f"Invalid status."}), 400
        invoice.status = new_status
        if new_status == "sent" and not invoice.sent_at:
            invoice.sent_at = datetime.now(timezone.utc)
        if new_status == "paid" and not invoice.paid_at:
            invoice.paid_at = datetime.now(timezone.utc)

    if "notes" in data:
        invoice.notes = data["notes"]

    if "due_date" in data:
        try:
            invoice.due_date = date.fromisoformat(data["due_date"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid due_date."}), 400

    db.session.commit()
    return jsonify(invoice.to_dict()), 200
