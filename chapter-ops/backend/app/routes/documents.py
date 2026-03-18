"""
Document Vault routes — chapter-scoped file storage.

Endpoints:
  GET    /api/documents              list documents (member+, filterable by category)
  POST   /api/documents              upload document (secretary+)
  PATCH  /api/documents/<id>         update title/description/category (secretary+)
  DELETE /api/documents/<id>         delete document (secretary+)
  GET    /api/documents/<id>/download presigned download URL (member+)
"""

import os
import time
import uuid

import boto3
from botocore.exceptions import ClientError
from flask import Blueprint, current_app, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models.document import Document, DOCUMENT_CATEGORIES
from app.models.workflow import WorkflowTemplate
from app.services import workflow_engine
from app.utils.decorators import chapter_required, role_required

documents_bp = Blueprint("documents", __name__, url_prefix="/api/documents")

# Allowed document MIME types and extensions
ALLOWED_DOC_EXTENSIONS = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "txt": "text/plain",
    "csv": "text/csv",
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


# ── List documents ─────────────────────────────────────────────────────────────

@documents_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_documents():
    chapter = g.current_chapter
    category = request.args.get("category")

    query = db.session.query(Document).filter(Document.chapter_id == chapter.id)
    if category and category in DOCUMENT_CATEGORIES:
        query = query.filter(Document.category == category)

    docs = query.order_by(Document.created_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])


# ── Upload document ────────────────────────────────────────────────────────────

@documents_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("secretary")
def upload_document():
    chapter = g.current_chapter

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip() or None
    category = request.form.get("category", "other")

    if not title:
        return jsonify({"error": "Title is required."}), 400
    if category not in DOCUMENT_CATEGORIES:
        return jsonify({"error": f"Invalid category. Must be one of: {', '.join(DOCUMENT_CATEGORIES)}"}), 400
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_DOC_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_DOC_EXTENSIONS.keys())}"}), 400

    # Check file size
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_DOC_SIZE:
        return jsonify({"error": f"File too large. Maximum size is {MAX_DOC_SIZE // 1024 // 1024}MB."}), 400

    # Build S3 key
    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    safe_name = file.filename.rsplit(".", 1)[0][:40].replace(" ", "_")
    file_key = f"documents/{chapter.id}/{timestamp}_{unique_id}_{safe_name}.{ext}"

    # Upload to R2
    try:
        s3 = _get_s3_client()
        bucket = current_app.config["S3_BUCKET_NAME"]
        mime = ALLOWED_DOC_EXTENSIONS.get(ext, "application/octet-stream")
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
        current_app.logger.error(f"Document upload failed: {e}")
        return jsonify({"error": "File upload failed. Please try again."}), 500

    doc = Document(
        chapter_id=chapter.id,
        uploaded_by_id=current_user.id,
        title=title,
        description=description,
        category=category,
        file_url=file_url,
        file_key=file_key,
        file_name=file.filename,
        file_size=size,
        mime_type=mime,
    )
    db.session.add(doc)
    db.session.commit()

    # Auto-start any active document workflow template for this chapter.
    # Prefer a chapter-specific template over an org-wide one.
    # Errors are non-fatal — the upload always succeeds.
    workflow_instance_id = None
    try:
        template = (
            WorkflowTemplate.query
            .filter_by(chapter_id=chapter.id, trigger_type="document", is_active=True)
            .first()
        )
        if template is None:
            template = (
                WorkflowTemplate.query
                .filter_by(
                    organization_id=chapter.organization_id,
                    chapter_id=None,
                    trigger_type="document",
                    is_active=True,
                )
                .first()
            )
        if template:
            instance = workflow_engine.start_workflow(
                template=template,
                trigger_type="document",
                trigger_id=doc.id,
                trigger_metadata={
                    "title": doc.title,
                    "category": doc.category,
                    "file_name": doc.file_name,
                    "file_size": doc.file_size,
                    "uploaded_by": current_user.full_name,
                },
                initiated_by_user=current_user,
                chapter=chapter,
            )
            workflow_instance_id = instance.id
            current_app.logger.info(
                f"Workflow {instance.id} started for document {doc.id} (template: {template.name})"
            )
    except Exception as exc:
        current_app.logger.error(f"Failed to auto-start document workflow for {doc.id}: {exc}")

    result = doc.to_dict()
    if workflow_instance_id:
        result["workflow_instance_id"] = workflow_instance_id
    return jsonify(result), 201


# ── Update document metadata ───────────────────────────────────────────────────

@documents_bp.route("/<doc_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("secretary")
def update_document(doc_id: str):
    chapter = g.current_chapter
    doc = db.session.query(Document).filter(
        Document.id == doc_id, Document.chapter_id == chapter.id
    ).first()
    if not doc:
        return jsonify({"error": "Document not found."}), 404

    data = request.get_json() or {}
    if "title" in data:
        title = data["title"].strip()
        if not title:
            return jsonify({"error": "Title cannot be empty."}), 400
        doc.title = title
    if "description" in data:
        doc.description = data["description"] or None
    if "category" in data:
        if data["category"] not in DOCUMENT_CATEGORIES:
            return jsonify({"error": "Invalid category."}), 400
        doc.category = data["category"]

    db.session.commit()
    return jsonify(doc.to_dict())


# ── Delete document ────────────────────────────────────────────────────────────

@documents_bp.route("/<doc_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("secretary")
def delete_document(doc_id: str):
    chapter = g.current_chapter
    doc = db.session.query(Document).filter(
        Document.id == doc_id, Document.chapter_id == chapter.id
    ).first()
    if not doc:
        return jsonify({"error": "Document not found."}), 404

    # Delete from S3
    try:
        s3 = _get_s3_client()
        bucket = current_app.config["S3_BUCKET_NAME"]
        s3.delete_object(Bucket=bucket, Key=doc.file_key)
    except Exception as e:
        current_app.logger.warning(f"S3 delete failed for {doc.file_key}: {e}")

    db.session.delete(doc)
    db.session.commit()
    return jsonify({"success": True})


# ── Presigned download URL ─────────────────────────────────────────────────────

@documents_bp.route("/<doc_id>/download", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def download_document(doc_id: str):
    chapter = g.current_chapter
    doc = db.session.query(Document).filter(
        Document.id == doc_id, Document.chapter_id == chapter.id
    ).first()
    if not doc:
        return jsonify({"error": "Document not found."}), 404

    try:
        s3 = _get_s3_client()
        bucket = current_app.config["S3_BUCKET_NAME"]
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket,
                "Key": doc.file_key,
                "ResponseContentDisposition": f'attachment; filename="{doc.file_name}"',
            },
            ExpiresIn=3600,  # 1 hour
        )
        return jsonify({"download_url": url})
    except ClientError as e:
        current_app.logger.error(f"Presigned URL generation failed: {e}")
        return jsonify({"error": "Could not generate download link."}), 500
