"""
Intake routes — /api/intake/*

Membership Intake Process (MIP) pipeline.
Candidates are NOT users until they cross via an invite code.

All routes are hidden from general members — only intake officers
and secretary+ can access this pipeline.
"""

import os
import secrets
import time
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from flask import Blueprint, current_app, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import InviteCode, User
from app.models.intake import IntakeCandidate, IntakeDocument, INTAKE_STAGES, INTAKE_DOC_TYPES
from app.utils.decorators import chapter_required, role_required, intake_access_required
from app.utils.permissions import enforce_module_access

# ── Config helpers ─────────────────────────────────────────────────────────────

DEFAULT_INTAKE_STAGES = [
    {"id": "interested",          "label": "Interested",          "color": "slate",   "is_terminal": False},
    {"id": "applied",             "label": "Applied",             "color": "sky",     "is_terminal": False},
    {"id": "under_review",        "label": "Under Review",        "color": "amber",   "is_terminal": False},
    {"id": "chapter_vote",        "label": "Chapter Vote",        "color": "orange",  "is_terminal": False},
    {"id": "national_submission", "label": "National Submission", "color": "purple",  "is_terminal": False},
    {"id": "approved",            "label": "Approved",            "color": "emerald", "is_terminal": False},
    {"id": "crossed",             "label": "Crossed",             "color": "brand",   "is_terminal": True},
]

DEFAULT_DOC_TYPES = [
    {"id": "transcript",        "label": "Transcript"},
    {"id": "background_check",  "label": "Background Check"},
    {"id": "recommendation",    "label": "Recommendation Letter"},
    {"id": "other",             "label": "Other"},
]


def _chapter_stages(chapter) -> list[dict]:
    """Return configured intake stages, falling back to NPHC defaults."""
    return (chapter.config or {}).get("intake_stages") or DEFAULT_INTAKE_STAGES


def _chapter_doc_types(chapter) -> list[dict]:
    """Return configured doc types, falling back to defaults."""
    return (chapter.config or {}).get("intake_doc_types") or DEFAULT_DOC_TYPES


def _terminal_stage_id(chapter) -> str:
    """Return the id of the terminal (crossing) stage."""
    for s in _chapter_stages(chapter):
        if s.get("is_terminal"):
            return s["id"]
    return "crossed"  # Absolute fallback


def _pre_terminal_stage_id(chapter) -> str | None:
    """Return the id of the stage immediately before the terminal stage."""
    stages = _chapter_stages(chapter)
    for i, s in enumerate(stages):
        if s.get("is_terminal") and i > 0:
            return stages[i - 1]["id"]
    return None

intake_bp = Blueprint("intake", __name__, url_prefix="/api/intake")


@intake_bp.before_request
def _gate_module():
    return enforce_module_access("intake")


ALLOWED_DOC_EXTENSIONS = {
    "pdf", "doc", "docx", "jpg", "jpeg", "png", "txt", "csv",
}
MAX_DOC_SIZE = 25 * 1024 * 1024  # 25 MB


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=current_app.config["S3_ENDPOINT_URL"],
        aws_access_key_id=current_app.config["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=current_app.config["S3_SECRET_ACCESS_KEY"],
        region_name=current_app.config["S3_REGION"],
    )


# ── List candidates ────────────────────────────────────────────────────────────

@intake_bp.route("", methods=["GET"])
@login_required
@chapter_required
@intake_access_required
def list_candidates():
    """List all active intake candidates, optionally filtered by stage."""
    chapter = g.current_chapter
    stages = _chapter_stages(chapter)
    stage_ids = [s["id"] for s in stages]
    stage_filter = request.args.get("stage")

    query = IntakeCandidate.query.filter_by(chapter_id=chapter.id, active=True)
    if stage_filter and stage_filter in stage_ids:
        query = query.filter_by(stage=stage_filter)

    candidates = query.order_by(IntakeCandidate.created_at.asc()).all()

    # Group by stage for pipeline view
    grouped = {sid: [] for sid in stage_ids}
    for c in candidates:
        bucket = c.stage if c.stage in grouped else stage_ids[0]
        grouped[bucket].append(c.to_dict())

    return jsonify({
        "candidates": [c.to_dict() for c in candidates],
        "by_stage": grouped,
        "stages": stages,
    }), 200


# ── Create candidate ───────────────────────────────────────────────────────────

@intake_bp.route("", methods=["POST"])
@login_required
@chapter_required
@intake_access_required
def create_candidate():
    """Add a new intake candidate to the pipeline."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    required = ["first_name", "last_name", "email"]
    missing = [f for f in required if not data.get(f, "").strip()]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    gpa = None
    if data.get("gpa") is not None:
        try:
            gpa = float(data["gpa"])
            if not (0.0 <= gpa <= 4.0):
                return jsonify({"error": "GPA must be between 0.0 and 4.0."}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid GPA value."}), 400

    stages = _chapter_stages(chapter)
    stage_ids = [s["id"] for s in stages]
    first_stage_id = stage_ids[0]
    stage = data.get("stage", first_stage_id)
    if stage not in stage_ids:
        return jsonify({"error": f"Invalid stage. Must be one of: {', '.join(stage_ids)}"}), 400

    assigned_to_id = data.get("assigned_to_id")
    if assigned_to_id:
        assignee = db.session.get(User, assigned_to_id)
        if not assignee:
            return jsonify({"error": "Assigned officer not found."}), 404

    candidate = IntakeCandidate(
        chapter_id=chapter.id,
        first_name=data["first_name"].strip(),
        last_name=data["last_name"].strip(),
        email=data["email"].strip().lower(),
        phone=data.get("phone", "").strip() or None,
        stage=stage,
        semester=data.get("semester", "").strip() or None,
        gpa=gpa,
        notes=data.get("notes", "").strip() or None,
        assigned_to_id=assigned_to_id or None,
    )
    db.session.add(candidate)
    db.session.commit()

    return jsonify(candidate.to_dict()), 201


# ── Get candidate detail ───────────────────────────────────────────────────────

@intake_bp.route("/<candidate_id>", methods=["GET"])
@login_required
@chapter_required
@intake_access_required
def get_candidate(candidate_id):
    """Get full candidate detail including documents."""
    chapter = g.current_chapter
    candidate = db.session.get(IntakeCandidate, candidate_id)

    if not candidate or candidate.chapter_id != chapter.id or not candidate.active:
        return jsonify({"error": "Candidate not found."}), 404

    return jsonify(candidate.to_dict(include_documents=True)), 200


# ── Update candidate ───────────────────────────────────────────────────────────

@intake_bp.route("/<candidate_id>", methods=["PATCH"])
@login_required
@chapter_required
@intake_access_required
def update_candidate(candidate_id):
    """Update candidate info, stage, notes, or assignment."""
    chapter = g.current_chapter
    candidate = db.session.get(IntakeCandidate, candidate_id)

    if not candidate or candidate.chapter_id != chapter.id or not candidate.active:
        return jsonify({"error": "Candidate not found."}), 404

    data = request.get_json() or {}

    if "first_name" in data:
        candidate.first_name = data["first_name"].strip()
    if "last_name" in data:
        candidate.last_name = data["last_name"].strip()
    if "email" in data:
        candidate.email = data["email"].strip().lower()
    if "phone" in data:
        candidate.phone = data["phone"].strip() or None
    if "semester" in data:
        candidate.semester = data["semester"].strip() or None
    if "gpa" in data:
        if data["gpa"] is None:
            candidate.gpa = None
        else:
            try:
                gpa = float(data["gpa"])
                if not (0.0 <= gpa <= 4.0):
                    return jsonify({"error": "GPA must be between 0.0 and 4.0."}), 400
                candidate.gpa = gpa
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid GPA value."}), 400
    if "notes" in data:
        candidate.notes = data["notes"].strip() or None
    if "line_name" in data:
        candidate.line_name = data["line_name"].strip() or None
    if "line_number" in data:
        candidate.line_number = int(data["line_number"]) if data["line_number"] else None
    if "assigned_to_id" in data:
        if data["assigned_to_id"]:
            assignee = db.session.get(User, data["assigned_to_id"])
            if not assignee:
                return jsonify({"error": "Assigned officer not found."}), 404
        candidate.assigned_to_id = data["assigned_to_id"] or None

    # Stage update — cannot manually set to the terminal stage (use the /cross endpoint)
    if "stage" in data:
        new_stage = data["stage"]
        stage_ids = [s["id"] for s in _chapter_stages(chapter)]
        terminal = _terminal_stage_id(chapter)
        if new_stage not in stage_ids:
            return jsonify({"error": "Invalid stage."}), 400
        if new_stage == terminal:
            return jsonify({"error": "Use the /cross endpoint to initiate a candidate."}), 400
        candidate.stage = new_stage

    db.session.commit()
    return jsonify(candidate.to_dict(include_documents=True)), 200


# ── Deactivate candidate ───────────────────────────────────────────────────────

@intake_bp.route("/<candidate_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("president")
def deactivate_candidate(candidate_id):
    """Soft-delete a candidate from the pipeline."""
    chapter = g.current_chapter
    candidate = db.session.get(IntakeCandidate, candidate_id)

    if not candidate or candidate.chapter_id != chapter.id or not candidate.active:
        return jsonify({"error": "Candidate not found."}), 404

    candidate.active = False
    db.session.commit()
    return jsonify({"success": True}), 200


# ── Cross candidate → create invite ───────────────────────────────────────────

@intake_bp.route("/<candidate_id>/cross", methods=["POST"])
@login_required
@chapter_required
@role_required("president")
def cross_candidate(candidate_id):
    """
    Cross a candidate: mark them as crossed and generate an invite code
    linked to their email so they can register as a member.

    Only available for candidates in 'approved' stage.
    """
    chapter = g.current_chapter
    candidate = db.session.get(IntakeCandidate, candidate_id)

    if not candidate or candidate.chapter_id != chapter.id or not candidate.active:
        return jsonify({"error": "Candidate not found."}), 404

    terminal = _terminal_stage_id(chapter)
    pre_terminal = _pre_terminal_stage_id(chapter)

    if candidate.stage == terminal:
        return jsonify({"error": "Candidate has already been initiated."}), 400

    if pre_terminal and candidate.stage != pre_terminal:
        stage_label = next((s["label"] for s in _chapter_stages(chapter) if s["id"] == pre_terminal), pre_terminal)
        return jsonify({"error": f"Candidate must be in '{stage_label}' stage before initiating."}), 400

    # Optionally set line data from request
    data = request.get_json() or {}
    if "line_name" in data:
        candidate.line_name = data["line_name"].strip() or None
    if "line_number" in data:
        candidate.line_number = int(data["line_number"]) if data["line_number"] else None

    # Generate a unique invite code
    code = secrets.token_hex(8).upper()
    while InviteCode.query.filter_by(code=code).first():
        code = secrets.token_hex(8).upper()

    invite = InviteCode(
        chapter_id=chapter.id,
        code=code,
        role="member",
        created_by=current_user.id,
        expires_at=None,  # no expiry — president controls timing
    )
    db.session.add(invite)
    db.session.flush()  # get invite.id

    # Initiate the candidate
    candidate.stage = terminal
    candidate.crossed_at = datetime.now(timezone.utc)
    candidate.invite_code_id = invite.id

    db.session.commit()

    return jsonify({
        "success": True,
        "candidate": candidate.to_dict(),
        "invite_code": invite.code,
        "message": f"Share invite code {invite.code} with {candidate.full_name} to complete registration.",
    }), 200


# ── Upload document ────────────────────────────────────────────────────────────

@intake_bp.route("/<candidate_id>/documents", methods=["POST"])
@login_required
@chapter_required
@intake_access_required
def upload_document(candidate_id):
    """Upload a document for an intake candidate."""
    chapter = g.current_chapter
    candidate = db.session.get(IntakeCandidate, candidate_id)

    if not candidate or candidate.chapter_id != chapter.id or not candidate.active:
        return jsonify({"error": "Candidate not found."}), 404

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    title = request.form.get("title", "").strip()
    document_type = request.form.get("document_type", "other")

    if not title:
        return jsonify({"error": "Title is required."}), 400
    valid_doc_type_ids = [dt["id"] for dt in _chapter_doc_types(chapter)]
    if document_type not in valid_doc_type_ids:
        return jsonify({"error": f"Invalid document type. Must be one of: {', '.join(valid_doc_type_ids)}"}), 400
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_DOC_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_DOC_EXTENSIONS))}"}), 400

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_DOC_SIZE:
        return jsonify({"error": "File too large. Maximum 25MB."}), 400

    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    safe_name = file.filename.rsplit(".", 1)[0][:40].replace(" ", "_")
    file_key = f"intake/{chapter.id}/{candidate_id}/{timestamp}_{unique_id}_{safe_name}.{ext}"

    mime_map = {
        "pdf": "application/pdf",
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "txt": "text/plain", "csv": "text/csv",
    }
    mime = mime_map.get(ext, "application/octet-stream")

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
        current_app.logger.error(f"Intake document upload failed: {e}")
        return jsonify({"error": "File upload failed. Please try again."}), 500

    doc = IntakeDocument(
        chapter_id=chapter.id,
        candidate_id=candidate.id,
        uploaded_by_id=current_user.id,
        document_type=document_type,
        title=title,
        file_url=file_url,
        file_key=file_key,
        file_name=file.filename,
        file_size=size,
        mime_type=mime,
    )
    db.session.add(doc)
    db.session.commit()

    return jsonify(doc.to_dict()), 201


# ── Delete document ────────────────────────────────────────────────────────────

@intake_bp.route("/<candidate_id>/documents/<doc_id>", methods=["DELETE"])
@login_required
@chapter_required
@intake_access_required
def delete_document(candidate_id, doc_id):
    """Delete an intake document."""
    chapter = g.current_chapter
    candidate = db.session.get(IntakeCandidate, candidate_id)
    if not candidate or candidate.chapter_id != chapter.id:
        return jsonify({"error": "Candidate not found."}), 404

    doc = db.session.get(IntakeDocument, doc_id)
    if not doc or doc.candidate_id != candidate_id or doc.chapter_id != chapter.id:
        return jsonify({"error": "Document not found."}), 404

    # Delete from R2
    try:
        s3 = _get_s3_client()
        s3.delete_object(Bucket=current_app.config["S3_BUCKET_NAME"], Key=doc.file_key)
    except ClientError as e:
        current_app.logger.error(f"Failed to delete intake document from R2: {e}")

    db.session.delete(doc)
    db.session.commit()
    return jsonify({"success": True}), 200
