"""
Incidents routes — risk management and upstream reporting.

Visibility model:
  - Chapter president: files + reads/manages their own chapter's incidents
  - Regional officers (regional_director, 1st/2nd vice, secretary, treasurer):
      read-only access to all incidents in their region, plus status updates
  - Organization admins: full read access to all incidents in the org, plus
      status updates
  - All other roles: blocked

Endpoints:
  GET    /api/incidents               list (scoped by role)
  POST   /api/incidents               file (chapter president only)
  GET    /api/incidents/<id>          detail (scoped by role)
  PATCH  /api/incidents/<id>/status   status update (upstream viewers only)
  POST   /api/incidents/<id>/attachments  upload evidence (filer, 24h window)
  GET    /api/incidents/<id>/attachments/<att_id>/download  presigned URL
  GET    /api/incidents/stats         aggregate counts (upstream viewers)
"""

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError
from flask import Blueprint, current_app, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import (
    Chapter,
    ChapterMembership,
    Incident,
    IncidentAttachment,
    IncidentStatusEvent,
    OrganizationMembership,
    RegionMembership,
)
from app.models.incident import INCIDENT_SEVERITIES, INCIDENT_STATUSES, INCIDENT_TYPES
from app.services import notification_service

incidents_bp = Blueprint("incidents", __name__, url_prefix="/api/incidents")


# ── Access helpers ─────────────────────────────────────────────────────────────


def _org_admin_orgs(user) -> set[str]:
    """Return set of organization IDs where this user is an active admin."""
    rows = OrganizationMembership.query.filter_by(
        user_id=user.id, role="admin", active=True
    ).all()
    return {r.organization_id for r in rows}


def _regional_role_regions(user) -> set[str]:
    """Return set of region IDs where this user holds a regional officer role."""
    rows = RegionMembership.query.filter_by(user_id=user.id, active=True).all()
    _OFFICER = {
        "regional_director", "regional_1st_vice", "regional_2nd_vice",
        "regional_secretary", "regional_treasurer",
    }
    return {r.region_id for r in rows if r.role in _OFFICER}


def _is_chapter_president(user, chapter_id: str) -> bool:
    m = ChapterMembership.query.filter_by(
        user_id=user.id, chapter_id=chapter_id, active=True
    ).first()
    return bool(m and m.role in ("president", "admin"))


def _can_view_incident(user, incident: Incident) -> bool:
    """Viewers: filing chapter president, regional officers of that region,
    org admins of that org."""
    if incident.organization_id in _org_admin_orgs(user):
        return True
    if incident.region_id and incident.region_id in _regional_role_regions(user):
        return True
    if _is_chapter_president(user, incident.chapter_id):
        return True
    return False


def _is_upstream_viewer(user, incident: Incident) -> bool:
    """Regional officer or org admin — can update status."""
    if incident.organization_id in _org_admin_orgs(user):
        return True
    if incident.region_id and incident.region_id in _regional_role_regions(user):
        return True
    return False


# ── S3 helpers (reuse Document pattern) ────────────────────────────────────────


def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=current_app.config["S3_ENDPOINT_URL"],
        aws_access_key_id=current_app.config["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=current_app.config["S3_SECRET_ACCESS_KEY"],
        region_name=current_app.config["S3_REGION"],
    )


ALLOWED_ATTACHMENT_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "gif", "webp",
    "txt", "heic", "mov", "mp4",
}
ALLOWED_ATTACHMENT_MIME = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "heic": "image/heic",
    "txt": "text/plain",
    "mov": "video/quicktime",
    "mp4": "video/mp4",
}
MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024  # 50 MB


# ── Reference number generator ─────────────────────────────────────────────────


def _generate_reference_number() -> str:
    """Generate next sequential reference like INC-2026-0042."""
    year = datetime.now(timezone.utc).year
    prefix = f"INC-{year}-"
    latest = (
        db.session.query(Incident)
        .filter(Incident.reference_number.like(f"{prefix}%"))
        .order_by(Incident.reference_number.desc())
        .first()
    )
    next_seq = 1
    if latest:
        try:
            next_seq = int(latest.reference_number.rsplit("-", 1)[1]) + 1
        except (ValueError, IndexError):
            next_seq = 1
    return f"{prefix}{next_seq:04d}"


# ── List ───────────────────────────────────────────────────────────────────────


@incidents_bp.route("", methods=["GET"])
@login_required
def list_incidents():
    scope = request.args.get("scope", "auto")  # auto | chapter | region | org
    status = request.args.get("status")
    severity = request.args.get("severity")
    incident_type = request.args.get("type")

    admin_orgs = _org_admin_orgs(current_user)
    officer_regions = _regional_role_regions(current_user)
    is_org_admin = bool(admin_orgs)
    is_regional = bool(officer_regions)

    # Determine scope — prefer the broadest access the user has unless scope requested
    query = db.session.query(Incident)

    if scope == "chapter" or (scope == "auto" and not is_org_admin and not is_regional):
        chapter = g.get("current_chapter")
        if not chapter:
            return jsonify({"error": "No chapter selected."}), 400
        if not _is_chapter_president(current_user, chapter.id):
            return jsonify({"error": "Only the chapter president can view incidents."}), 403
        query = query.filter(Incident.chapter_id == chapter.id)
        view_mode = "chapter"
    elif scope == "region" or (scope == "auto" and is_regional and not is_org_admin):
        if not officer_regions:
            return jsonify({"error": "You are not a regional officer."}), 403
        query = query.filter(Incident.region_id.in_(officer_regions))
        view_mode = "region"
    else:  # org
        if not is_org_admin:
            return jsonify({"error": "Organization admin access required."}), 403
        query = query.filter(Incident.organization_id.in_(admin_orgs))
        view_mode = "org"

    if status and status in INCIDENT_STATUSES:
        query = query.filter(Incident.status == status)
    if severity and severity in INCIDENT_SEVERITIES:
        query = query.filter(Incident.severity == severity)
    if incident_type and incident_type in INCIDENT_TYPES:
        query = query.filter(Incident.incident_type == incident_type)

    incidents = query.order_by(Incident.created_at.desc()).limit(200).all()
    return jsonify({
        "incidents": [i.to_dict() for i in incidents],
        "view_mode": view_mode,
        "is_org_admin": is_org_admin,
        "is_regional_officer": is_regional,
    })


# ── Stats ──────────────────────────────────────────────────────────────────────


@incidents_bp.route("/stats", methods=["GET"])
@login_required
def incident_stats():
    admin_orgs = _org_admin_orgs(current_user)
    officer_regions = _regional_role_regions(current_user)

    query = db.session.query(Incident)
    if admin_orgs:
        query = query.filter(Incident.organization_id.in_(admin_orgs))
    elif officer_regions:
        query = query.filter(Incident.region_id.in_(officer_regions))
    else:
        return jsonify({"error": "Upstream access required."}), 403

    all_incidents = query.all()
    by_status = {s: 0 for s in INCIDENT_STATUSES}
    by_severity = {s: 0 for s in INCIDENT_SEVERITIES}
    by_type = {t: 0 for t in INCIDENT_TYPES}
    open_count = 0
    critical_open = 0

    for inc in all_incidents:
        by_status[inc.status] = by_status.get(inc.status, 0) + 1
        by_severity[inc.severity] = by_severity.get(inc.severity, 0) + 1
        by_type[inc.incident_type] = by_type.get(inc.incident_type, 0) + 1
        if inc.status not in ("resolved", "closed"):
            open_count += 1
            if inc.severity == "critical":
                critical_open += 1

    return jsonify({
        "total": len(all_incidents),
        "open": open_count,
        "critical_open": critical_open,
        "by_status": by_status,
        "by_severity": by_severity,
        "by_type": by_type,
    })


# ── File a new incident (chapter president only) ───────────────────────────────


@incidents_bp.route("", methods=["POST"])
@login_required
def create_incident():
    chapter = g.get("current_chapter")
    if not chapter:
        return jsonify({"error": "No chapter selected."}), 400

    if not _is_chapter_president(current_user, chapter.id):
        return jsonify({"error": "Only the chapter president can file incidents."}), 403

    data = request.get_json() or {}

    incident_type = data.get("incident_type", "").strip()
    severity = data.get("severity", "").strip()
    description = (data.get("description") or "").strip()
    occurred_at_str = data.get("occurred_at")

    if incident_type not in INCIDENT_TYPES:
        return jsonify({"error": "Invalid incident_type."}), 400
    if severity not in INCIDENT_SEVERITIES:
        return jsonify({"error": "Invalid severity."}), 400
    if not description:
        return jsonify({"error": "Description is required."}), 400
    if not occurred_at_str:
        return jsonify({"error": "occurred_at is required."}), 400

    try:
        occurred_at = datetime.fromisoformat(occurred_at_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid occurred_at format."}), 400

    incident = Incident(
        chapter_id=chapter.id,
        region_id=chapter.region_id,
        organization_id=chapter.organization_id,
        reported_by_user_id=current_user.id,
        reference_number=_generate_reference_number(),
        incident_type=incident_type,
        severity=severity,
        occurred_at=occurred_at,
        location=(data.get("location") or "").strip() or None,
        description=description,
        individuals_involved=(data.get("individuals_involved") or "").strip() or None,
        law_enforcement_notified=bool(data.get("law_enforcement_notified", False)),
        medical_attention_required=bool(data.get("medical_attention_required", False)),
        status="reported",
    )
    db.session.add(incident)
    db.session.flush()

    db.session.add(IncidentStatusEvent(
        incident_id=incident.id,
        changed_by_user_id=current_user.id,
        from_status=None,
        to_status="reported",
        note="Incident filed.",
    ))
    db.session.commit()

    # Notify regional officers — in-app notifications.
    try:
        if chapter.region_id:
            region_officers = RegionMembership.query.filter(
                RegionMembership.region_id == chapter.region_id,
                RegionMembership.active == True,
                RegionMembership.role.in_([
                    "regional_director", "regional_1st_vice", "regional_2nd_vice",
                    "regional_secretary", "regional_treasurer",
                ]),
            ).all()
            title = f"New Incident: {incident.reference_number}"
            message = f"{chapter.name} filed a {severity} incident ({incident_type})."
            link = f"/incidents?id={incident.id}"
            for rm in region_officers:
                notification_service.create_notification(
                    chapter_id=chapter.id,
                    notification_type="member",
                    title=title,
                    message=message,
                    recipient_id=rm.user_id,
                    link=link,
                )

        # Notify org admins
        org_admins = OrganizationMembership.query.filter_by(
            organization_id=chapter.organization_id, role="admin", active=True
        ).all()
        for oa in org_admins:
            notification_service.create_notification(
                chapter_id=chapter.id,
                notification_type="member",
                title=f"New Incident: {incident.reference_number}",
                message=f"{chapter.name} filed a {severity} incident ({incident_type}).",
                recipient_id=oa.user_id,
                link=f"/incidents?id={incident.id}",
            )
    except Exception as exc:
        current_app.logger.warning(f"Incident notification dispatch failed: {exc}")

    return jsonify(incident.to_dict(include_attachments=True, include_events=True)), 201


# ── Get detail ─────────────────────────────────────────────────────────────────


@incidents_bp.route("/<incident_id>", methods=["GET"])
@login_required
def get_incident(incident_id: str):
    incident = db.session.get(Incident, incident_id)
    if not incident:
        return jsonify({"error": "Incident not found."}), 404
    if not _can_view_incident(current_user, incident):
        return jsonify({"error": "You do not have access to this incident."}), 403
    return jsonify(incident.to_dict(include_attachments=True, include_events=True))


# ── Update status (upstream only) ──────────────────────────────────────────────


@incidents_bp.route("/<incident_id>/status", methods=["PATCH"])
@login_required
def update_incident_status(incident_id: str):
    incident = db.session.get(Incident, incident_id)
    if not incident:
        return jsonify({"error": "Incident not found."}), 404

    if not _is_upstream_viewer(current_user, incident):
        return jsonify({"error": "Only regional or organization officers can update status."}), 403

    data = request.get_json() or {}
    new_status = (data.get("status") or "").strip()
    note = (data.get("note") or "").strip() or None
    resolution_notes = (data.get("resolution_notes") or "").strip() or None

    if new_status not in INCIDENT_STATUSES:
        return jsonify({"error": "Invalid status."}), 400
    if new_status == incident.status:
        return jsonify({"error": "Status unchanged."}), 400

    from_status = incident.status
    now = datetime.now(timezone.utc)

    incident.status = new_status
    if new_status == "acknowledged" and not incident.acknowledged_at:
        incident.acknowledged_by_user_id = current_user.id
        incident.acknowledged_at = now
    if new_status == "resolved":
        incident.resolved_at = now
        if resolution_notes:
            incident.resolution_notes = resolution_notes

    db.session.add(IncidentStatusEvent(
        incident_id=incident.id,
        changed_by_user_id=current_user.id,
        from_status=from_status,
        to_status=new_status,
        note=note,
    ))
    db.session.commit()

    # Notify filing president
    try:
        notification_service.create_notification(
            chapter_id=incident.chapter_id,
            notification_type="member",
            title=f"Incident {incident.reference_number} → {new_status.replace('_', ' ').title()}",
            message=f"{current_user.full_name} updated status to {new_status}.",
            recipient_id=incident.reported_by_user_id,
            link=f"/incidents?id={incident.id}",
        )
    except Exception as exc:
        current_app.logger.warning(f"Incident status notification failed: {exc}")

    return jsonify(incident.to_dict(include_attachments=True, include_events=True))


# ── Attachment upload (filer, 24h window) ──────────────────────────────────────


@incidents_bp.route("/<incident_id>/attachments", methods=["POST"])
@login_required
def upload_attachment(incident_id: str):
    incident = db.session.get(Incident, incident_id)
    if not incident:
        return jsonify({"error": "Incident not found."}), 404

    # Only the filer, within 24h of incident creation, can add attachments.
    if incident.reported_by_user_id != current_user.id:
        return jsonify({"error": "Only the filer can add attachments."}), 403

    created = incident.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(hours=24):
        return jsonify({"error": "Attachment window (24 hours) has closed."}), 403

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        return jsonify({"error": "Unsupported file type."}), 400

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_ATTACHMENT_SIZE:
        return jsonify({"error": f"File too large. Max {MAX_ATTACHMENT_SIZE // 1024 // 1024}MB."}), 400

    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    safe_name = file.filename.rsplit(".", 1)[0][:40].replace(" ", "_")
    file_key = f"incidents/{incident.chapter_id}/{incident.id}/{timestamp}_{unique_id}_{safe_name}.{ext}"
    mime = ALLOWED_ATTACHMENT_MIME.get(ext, "application/octet-stream")

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
        current_app.logger.error(f"Incident attachment upload failed: {e}")
        return jsonify({"error": "File upload failed."}), 500

    att = IncidentAttachment(
        incident_id=incident.id,
        uploaded_by_user_id=current_user.id,
        file_url=file_url,
        file_key=file_key,
        file_name=file.filename,
        file_size=size,
        mime_type=mime,
    )
    db.session.add(att)
    db.session.commit()
    return jsonify(att.to_dict()), 201


# ── Attachment download (presigned) ────────────────────────────────────────────


@incidents_bp.route("/<incident_id>/attachments/<att_id>/download", methods=["GET"])
@login_required
def download_attachment(incident_id: str, att_id: str):
    incident = db.session.get(Incident, incident_id)
    if not incident:
        return jsonify({"error": "Incident not found."}), 404
    if not _can_view_incident(current_user, incident):
        return jsonify({"error": "Access denied."}), 403

    att = db.session.get(IncidentAttachment, att_id)
    if not att or att.incident_id != incident.id:
        return jsonify({"error": "Attachment not found."}), 404

    try:
        s3 = _get_s3_client()
        bucket = current_app.config["S3_BUCKET_NAME"]
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket,
                "Key": att.file_key,
                "ResponseContentDisposition": f'attachment; filename="{att.file_name}"',
            },
            ExpiresIn=3600,
        )
        return jsonify({"download_url": url})
    except ClientError as e:
        current_app.logger.error(f"Incident attachment presigned URL failed: {e}")
        return jsonify({"error": "Could not generate download link."}), 500
