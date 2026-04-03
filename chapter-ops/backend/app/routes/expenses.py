"""
Expense routes — /api/expenses/*

Reimbursement request flow:
- Any member can submit, view own, and cancel pending requests
- Treasurer+ can view all, approve, deny, mark paid, and export
"""

import csv
import io
import os
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

import boto3
from botocore.exceptions import ClientError
from flask import Blueprint, current_app, g, jsonify, request, Response
from flask_login import current_user, login_required

from app.extensions import db
from app.models.expense import Expense, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_STATUSES
from app.models import ChapterMembership
from app.utils.decorators import chapter_required, role_required

expenses_bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")

ALLOWED_RECEIPT_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "heic", "webp"}
MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10 MB


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=current_app.config["S3_ENDPOINT_URL"],
        aws_access_key_id=current_app.config["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=current_app.config["S3_SECRET_ACCESS_KEY"],
        region_name=current_app.config["S3_REGION"],
    )


def _is_treasurer_plus(chapter_id: str) -> bool:
    membership = current_user.get_membership(chapter_id)
    return (
        membership is not None
        and membership.has_role("treasurer")
        and membership.role != "admin"
    )


# ── List expenses ──────────────────────────────────────────────────────────────

@expenses_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_expenses():
    """
    List expenses.
    - Treasurer+ sees all chapter expenses.
    - Members see only their own.
    Filterable by status via ?status=pending|approved|paid|denied
    """
    chapter = g.current_chapter
    status = request.args.get("status")

    is_officer = _is_treasurer_plus(chapter.id)

    query = Expense.query.filter_by(chapter_id=chapter.id)
    if not is_officer:
        query = query.filter_by(submitted_by_id=current_user.id)
    if status and status in EXPENSE_STATUSES:
        query = query.filter_by(status=status)

    expenses = query.order_by(Expense.created_at.desc()).all()

    # Summary for officers
    summary = None
    if is_officer:
        all_expenses = Expense.query.filter_by(chapter_id=chapter.id).all()
        total_pending = sum(
            Decimal(str(e.amount)) for e in all_expenses if e.status == "pending"
        )
        total_approved = sum(
            Decimal(str(e.amount)) for e in all_expenses if e.status == "approved"
        )
        total_paid = sum(
            Decimal(str(e.amount)) for e in all_expenses if e.status == "paid"
        )
        summary = {
            "pending_count": sum(1 for e in all_expenses if e.status == "pending"),
            "pending_amount": str(total_pending),
            "approved_amount": str(total_approved),
            "paid_amount": str(total_paid),
        }

    return jsonify({
        "expenses": [e.to_dict() for e in expenses],
        "is_officer": is_officer,
        "summary": summary,
    }), 200


# ── Submit expense ─────────────────────────────────────────────────────────────

@expenses_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def submit_expense():
    """Submit a reimbursement request."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    required = ["title", "amount", "category", "expense_date"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    try:
        amount = Decimal(str(data["amount"]))
        if amount <= 0:
            return jsonify({"error": "Amount must be greater than zero."}), 400
    except (InvalidOperation, ValueError):
        return jsonify({"error": "Invalid amount."}), 400

    if data["category"] not in EXPENSE_CATEGORIES:
        return jsonify({"error": f"Invalid category. Must be one of: {', '.join(EXPENSE_CATEGORIES)}"}), 400

    try:
        expense_date = date.fromisoformat(data["expense_date"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid expense_date. Use YYYY-MM-DD format."}), 400

    expense = Expense(
        chapter_id=chapter.id,
        submitted_by_id=current_user.id,
        title=data["title"].strip(),
        amount=amount,
        category=data["category"],
        expense_date=expense_date,
        notes=data.get("notes", "").strip() or None,
    )
    db.session.add(expense)
    db.session.commit()

    # Trigger expense workflow if an active template exists for this chapter
    try:
        from app.models.workflow import WorkflowTemplate
        from app.services.workflow_engine import start_workflow

        template = WorkflowTemplate.query.filter_by(
            chapter_id=chapter.id,
            trigger_type="expense",
            is_active=True,
        ).first()
        # Fall back to org-wide template
        if not template:
            template = WorkflowTemplate.query.filter_by(
                organization_id=chapter.organization_id,
                chapter_id=None,
                trigger_type="expense",
                is_active=True,
            ).first()

        if template:
            start_workflow(
                template=template,
                trigger_type="expense",
                trigger_id=expense.id,
                trigger_metadata={
                    "amount": float(expense.amount),
                    "category": expense.category,
                    "title": expense.title,
                },
                initiated_by_user=current_user,
                chapter=chapter,
            )
    except Exception as exc:
        current_app.logger.warning(f"Failed to start expense workflow: {exc}")

    return jsonify(expense.to_dict()), 201


# ── Get expense detail ─────────────────────────────────────────────────────────

@expenses_bp.route("/<expense_id>", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_expense(expense_id):
    chapter = g.current_chapter
    expense = db.session.get(Expense, expense_id)

    if not expense or expense.chapter_id != chapter.id:
        return jsonify({"error": "Expense not found."}), 404

    # Members can only view own
    if not _is_treasurer_plus(chapter.id) and expense.submitted_by_id != current_user.id:
        return jsonify({"error": "Access denied."}), 403

    return jsonify(expense.to_dict()), 200


# ── Update / action on expense ─────────────────────────────────────────────────

@expenses_bp.route("/<expense_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("member")
def update_expense(expense_id):
    """
    Update an expense. Allowed actions depend on role and status:
    - Submitter can edit title/amount/category/notes/expense_date if still pending
    - Treasurer+ can approve, deny (with reason), or mark paid
    """
    chapter = g.current_chapter
    expense = db.session.get(Expense, expense_id)

    if not expense or expense.chapter_id != chapter.id:
        return jsonify({"error": "Expense not found."}), 404

    data = request.get_json() or {}
    is_officer = _is_treasurer_plus(chapter.id)
    is_submitter = expense.submitted_by_id == current_user.id

    if not is_officer and not is_submitter:
        return jsonify({"error": "Access denied."}), 403

    # Officer actions
    action = data.get("action")
    if action:
        if not is_officer:
            return jsonify({"error": "Only treasurers can take approval actions."}), 403

        if action == "approve":
            if expense.status != "pending":
                return jsonify({"error": "Only pending expenses can be approved."}), 400
            expense.status = "approved"
            expense.reviewer_id = current_user.id
            expense.reviewed_at = datetime.now(timezone.utc)
            expense.denial_reason = None

        elif action == "deny":
            if expense.status != "pending":
                return jsonify({"error": "Only pending expenses can be denied."}), 400
            expense.status = "denied"
            expense.reviewer_id = current_user.id
            expense.reviewed_at = datetime.now(timezone.utc)
            expense.denial_reason = data.get("denial_reason", "").strip() or None

        elif action == "mark_paid":
            if expense.status != "approved":
                return jsonify({"error": "Only approved expenses can be marked as paid."}), 400
            expense.status = "paid"
            expense.paid_at = datetime.now(timezone.utc)

        elif action == "reopen":
            if expense.status not in ("denied", "approved"):
                return jsonify({"error": "Only denied or approved expenses can be reopened."}), 400
            expense.status = "pending"
            expense.reviewer_id = None
            expense.reviewed_at = None
            expense.denial_reason = None

        else:
            return jsonify({"error": f"Unknown action: {action}"}), 400

    else:
        # Field edits — submitter only, expense must be pending
        if not is_submitter:
            return jsonify({"error": "Only the submitter can edit expense details."}), 403
        if expense.status != "pending":
            return jsonify({"error": "Only pending expenses can be edited."}), 400

        if "title" in data:
            expense.title = data["title"].strip()
        if "amount" in data:
            try:
                amount = Decimal(str(data["amount"]))
                if amount <= 0:
                    return jsonify({"error": "Amount must be greater than zero."}), 400
                expense.amount = amount
            except (InvalidOperation, ValueError):
                return jsonify({"error": "Invalid amount."}), 400
        if "category" in data:
            if data["category"] not in EXPENSE_CATEGORIES:
                return jsonify({"error": "Invalid category."}), 400
            expense.category = data["category"]
        if "expense_date" in data:
            try:
                expense.expense_date = date.fromisoformat(data["expense_date"])
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid expense_date."}), 400
        if "notes" in data:
            expense.notes = data["notes"].strip() or None

    db.session.commit()
    return jsonify(expense.to_dict()), 200


# ── Cancel / delete expense ────────────────────────────────────────────────────

@expenses_bp.route("/<expense_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("member")
def delete_expense(expense_id):
    """
    Cancel/delete an expense.
    - Submitter can delete their own pending expense.
    - Treasurer+ can delete any expense.
    """
    chapter = g.current_chapter
    expense = db.session.get(Expense, expense_id)

    if not expense or expense.chapter_id != chapter.id:
        return jsonify({"error": "Expense not found."}), 404

    is_officer = _is_treasurer_plus(chapter.id)
    is_submitter = expense.submitted_by_id == current_user.id

    if not is_officer and not is_submitter:
        return jsonify({"error": "Access denied."}), 403

    if not is_officer and expense.status != "pending":
        return jsonify({"error": "You can only cancel pending expense requests."}), 400

    # Clean up receipt from R2 if exists
    if expense.receipt_key:
        try:
            s3 = _get_s3_client()
            s3.delete_object(Bucket=current_app.config["S3_BUCKET_NAME"], Key=expense.receipt_key)
        except ClientError:
            pass

    db.session.delete(expense)
    db.session.commit()
    return jsonify({"success": True}), 200


# ── Upload / replace receipt ───────────────────────────────────────────────────

@expenses_bp.route("/<expense_id>/receipt", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def upload_receipt(expense_id):
    """Upload or replace a receipt for an expense."""
    chapter = g.current_chapter
    expense = db.session.get(Expense, expense_id)

    if not expense or expense.chapter_id != chapter.id:
        return jsonify({"error": "Expense not found."}), 404

    if expense.submitted_by_id != current_user.id and not _is_treasurer_plus(chapter.id):
        return jsonify({"error": "Access denied."}), 403

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_RECEIPT_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_RECEIPT_EXTENSIONS))}"}), 400

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_RECEIPT_SIZE:
        return jsonify({"error": "File too large. Maximum 10MB."}), 400

    mime_map = {
        "pdf": "application/pdf",
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "heic": "image/heic",
        "webp": "image/webp",
    }
    mime = mime_map.get(ext, "application/octet-stream")

    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    file_key = f"receipts/{chapter.id}/{expense_id}/{timestamp}_{unique_id}.{ext}"

    # Delete old receipt if exists
    if expense.receipt_key:
        try:
            s3_del = _get_s3_client()
            s3_del.delete_object(Bucket=current_app.config["S3_BUCKET_NAME"], Key=expense.receipt_key)
        except ClientError:
            pass

    try:
        s3 = _get_s3_client()
        bucket = current_app.config["S3_BUCKET_NAME"]
        s3.put_object(
            Bucket=bucket,
            Key=file_key,
            Body=file.read(),
            ContentType=mime,
            ContentDisposition=f'attachment; filename="{file.filename}"',
        )
        public_base = current_app.config["S3_PUBLIC_URL"]
        file_url = f"{public_base}/{file_key}"
    except ClientError as e:
        current_app.logger.error(f"Receipt upload failed: {e}")
        return jsonify({"error": "File upload failed. Please try again."}), 500

    expense.receipt_url = file_url
    expense.receipt_key = file_key
    expense.receipt_name = file.filename
    expense.receipt_size = size
    expense.receipt_mime = mime
    db.session.commit()

    return jsonify(expense.to_dict()), 200


# ── CSV export ─────────────────────────────────────────────────────────────────

@expenses_bp.route("/export", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def export_expenses():
    """Export all chapter expenses as CSV for Form 990 / tax prep."""
    chapter = g.current_chapter
    year = request.args.get("year")

    query = Expense.query.filter_by(chapter_id=chapter.id)
    if year:
        try:
            y = int(year)
            query = query.filter(
                db.extract("year", Expense.expense_date) == y
            )
        except ValueError:
            pass

    expenses = query.order_by(Expense.expense_date.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Title", "Category", "Amount", "Status",
        "Submitted By", "Reviewer", "Notes", "Paid At",
    ])

    for e in expenses:
        writer.writerow([
            e.expense_date.isoformat(),
            e.title,
            EXPENSE_CATEGORY_LABELS.get(e.category, e.category),
            str(e.amount),
            e.status,
            e.submitted_by.full_name if e.submitted_by else "",
            e.reviewer.full_name if e.reviewer else "",
            e.notes or "",
            e.paid_at.isoformat() if e.paid_at else "",
        ])

    filename = f"expenses_{chapter.name.replace(' ', '_')}_{year or 'all'}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
