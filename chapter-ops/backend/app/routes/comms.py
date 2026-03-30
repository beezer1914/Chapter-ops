"""
Communications Hub routes.

Announcements (all members read, secretary+ write) and email blasts (secretary+).
"""

import html
import re
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models.announcement import Announcement
from app.models.membership import ChapterMembership
from app.models.user import User
from app.utils.decorators import chapter_required, role_required
from app.utils.email import send_email

comms_bp = Blueprint("comms", __name__, url_prefix="/api/comms")

OFFICER_ROLES = {"secretary", "treasurer", "vice_president", "president", "admin"}

_HEADER_CONTROL_RE = re.compile(r'[\r\n\x00]')


def _sanitize_header(value: str) -> str:
    """Strip newline and null characters to prevent email header injection."""
    return _HEADER_CONTROL_RE.sub('', value)


# ── Announcements ─────────────────────────────────────────────────────────────

@comms_bp.route("/announcements", methods=["GET"])
@login_required
@chapter_required
def list_announcements():
    """List active (non-expired) announcements for the chapter, pinned first."""
    now = datetime.now(timezone.utc)
    announcements = (
        Announcement.query
        .filter(
            Announcement.chapter_id == g.current_chapter.id,
            db.or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
        .all()
    )
    return jsonify([a.to_dict() for a in announcements])


@comms_bp.route("/announcements", methods=["POST"])
@login_required
@chapter_required
@role_required("secretary")
def create_announcement():
    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or not body:
        return jsonify({"error": "title and body are required"}), 400

    expires_at = None
    if data.get("expires_at"):
        try:
            expires_at = datetime.fromisoformat(data["expires_at"])
        except ValueError:
            return jsonify({"error": "Invalid expires_at format"}), 400

    announcement = Announcement(
        chapter_id=g.current_chapter.id,
        created_by_id=current_user.id,
        title=title,
        body=body,
        is_pinned=bool(data.get("is_pinned", False)),
        expires_at=expires_at,
    )
    db.session.add(announcement)
    db.session.commit()
    return jsonify(announcement.to_dict()), 201


@comms_bp.route("/announcements/<announcement_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("secretary")
def update_announcement(announcement_id: str):
    announcement = Announcement.query.filter_by(
        id=announcement_id, chapter_id=g.current_chapter.id
    ).first_or_404()

    data = request.get_json() or {}
    if "title" in data:
        announcement.title = data["title"].strip()
    if "body" in data:
        announcement.body = data["body"].strip()
    if "is_pinned" in data:
        announcement.is_pinned = bool(data["is_pinned"])
    if "expires_at" in data:
        if data["expires_at"] is None:
            announcement.expires_at = None
        else:
            try:
                announcement.expires_at = datetime.fromisoformat(data["expires_at"])
            except ValueError:
                return jsonify({"error": "Invalid expires_at format"}), 400

    db.session.commit()
    return jsonify(announcement.to_dict())


@comms_bp.route("/announcements/<announcement_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("secretary")
def delete_announcement(announcement_id: str):
    announcement = Announcement.query.filter_by(
        id=announcement_id, chapter_id=g.current_chapter.id
    ).first_or_404()
    db.session.delete(announcement)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


# ── Email Blast ───────────────────────────────────────────────────────────────

AUDIENCE_LABELS = {
    "all": "All Members",
    "financial": "Financial Members",
    "not_financial": "Non-Financial Members",
    "member": "Members (basic role)",
    "secretary": "Secretaries+",
    "treasurer": "Treasurers+",
    "vice_president": "Vice Presidents+",
    "president": "Presidents",
}

ROLE_ORDER = ["member", "secretary", "treasurer", "vice_president", "president", "admin"]


def _get_recipients(chapter_id: str, audience: str) -> list[User]:
    """Return User objects matching the audience filter for a chapter."""
    q = (
        db.session.query(User)
        .join(ChapterMembership, ChapterMembership.user_id == User.id)
        .filter(
            ChapterMembership.chapter_id == chapter_id,
            ChapterMembership.active == True,
        )
    )
    if audience == "financial":
        q = q.filter(ChapterMembership.financial_status == "financial")
    elif audience == "not_financial":
        q = q.filter(ChapterMembership.financial_status == "not_financial")
    elif audience in ROLE_ORDER:
        idx = ROLE_ORDER.index(audience)
        valid_roles = ROLE_ORDER[idx:]
        q = q.filter(ChapterMembership.role.in_(valid_roles))
    # "all" → no extra filter
    return q.all()


@comms_bp.route("/email-blast/preview", methods=["POST"])
@login_required
@chapter_required
@role_required("secretary")
def preview_email_blast():
    """Return recipient count for a given audience without sending."""
    data = request.get_json() or {}
    audience = data.get("audience", "all")
    if audience not in AUDIENCE_LABELS:
        return jsonify({"error": "Invalid audience"}), 400
    recipients = _get_recipients(g.current_chapter.id, audience)
    return jsonify({
        "count": len(recipients),
        "audience_label": AUDIENCE_LABELS[audience],
    })


@comms_bp.route("/email-blast", methods=["POST"])
@login_required
@chapter_required
@role_required("secretary")
def send_email_blast():
    data = request.get_json() or {}
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()
    audience = data.get("audience", "all")

    if not subject or not body:
        return jsonify({"error": "subject and body are required"}), 400
    if audience not in AUDIENCE_LABELS:
        return jsonify({"error": "Invalid audience"}), 400

    recipients = _get_recipients(g.current_chapter.id, audience)
    if not recipients:
        return jsonify({"error": "No recipients found for this audience"}), 400

    chapter_name = _sanitize_header(g.current_chapter.name)
    sender_name = _sanitize_header(f"{current_user.first_name} {current_user.last_name}")
    subject = _sanitize_header(subject)

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <div style="background:#0f52ba; padding:24px 32px; border-radius:8px 8px 0 0;">
        <h1 style="color:#ffffff; margin:0; font-size:22px;">{html.escape(chapter_name)}</h1>
      </div>
      <div style="background:#ffffff; padding:32px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px;">
        <h2 style="margin-top:0; color:#111827;">{html.escape(subject)}</h2>
        <div style="white-space:pre-wrap; line-height:1.6; color:#374151;">{html.escape(body)}</div>
        <hr style="margin:32px 0; border:none; border-top:1px solid #e5e7eb;" />
        <p style="font-size:12px; color:#9ca3af; margin:0;">
          Sent by {html.escape(sender_name)} on behalf of {html.escape(chapter_name)} via ChapterOps.
        </p>
      </div>
    </div>
    """

    sent = 0
    failed = 0
    for user in recipients:
        ok = send_email(to=user.email, subject=f"[{chapter_name}] {subject}", html=html_body)
        if ok:
            sent += 1
        else:
            failed += 1

    return jsonify({
        "sent": sent,
        "failed": failed,
        "total": len(recipients),
    })
