"""
Notification side-effects for ChapterRequest lifecycle events.

Sends both in-app notifications (via Notification model) and Resend emails.
All side-effects are best-effort: failures are logged but do not abort the
triggering route's transaction (caller wraps these in try/except).
"""

import logging

from flask import current_app
from sqlalchemy import func

from app.extensions import db
from app.models import OrganizationMembership, User
from app.models.chapter_request import ChapterRequest
from app.models.notification import Notification
from app.utils.email import (
    send_chapter_request_approved_email,
    send_chapter_request_rejected_email,
    send_chapter_request_submitted_email,
)

logger = logging.getLogger(__name__)


def _in_app_for_user(
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    link: str | None = None,
    chapter_id: str | None = None,
) -> None:
    """
    Create a user-targeted in-app notification.

    The existing `Notification` model requires a non-null chapter_id. Chapter
    requests operate before a chapter exists, so we skip in-app notifications
    when chapter_id is None and rely on email + UI polling in that case.
    """
    if chapter_id is None:
        return
    try:
        db.session.add(Notification(
            chapter_id=chapter_id,
            recipient_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            link=link,
            is_read=False,
        ))
        db.session.commit()
    except Exception:
        logger.exception("Failed to create in-app notification")


def notify_approvers_of_new_request(req: ChapterRequest) -> None:
    """Email the approvers who can act on this request."""
    approver_emails: list[tuple[str, str]] = []

    if req.approver_scope == "org_admin":
        rows = (
            db.session.query(User.email, User.first_name, User.last_name)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .filter(
                OrganizationMembership.organization_id == req.organization_id,
                OrganizationMembership.role == "admin",
                OrganizationMembership.active == True,
            )
            .all()
        )
        approver_emails = [(r[0], f"{r[1]} {r[2]}") for r in rows]
    elif req.approver_scope == "platform_admin":
        founder_email = (current_app.config.get("FOUNDER_EMAIL") or "").strip()
        if founder_email:
            founder = db.session.query(User).filter(
                func.lower(User.email) == founder_email.lower()
            ).first()
            if founder:
                approver_emails = [(founder.email, founder.full_name)]

    requester_name = req.requester.full_name if req.requester else "A user"
    requester_email = req.requester.email if req.requester else ""
    for email, name in approver_emails:
        send_chapter_request_submitted_email(
            to=email,
            approver_name=name,
            requester_name=requester_name,
            requester_email=requester_email,
            chapter_name=req.name,
            organization_name=req.organization.name if req.organization else "",
            region_name=req.region.name if req.region else "",
        )


def notify_requester_approved(req: ChapterRequest) -> None:
    """Email + in-app notification to the requester."""
    if not req.requester:
        return
    send_chapter_request_approved_email(
        to=req.requester.email,
        requester_name=req.requester.full_name,
        chapter_name=req.name,
    )
    _in_app_for_user(
        user_id=req.requester.id,
        notification_type="chapter_request_approved",
        title="Chapter approved",
        message=f"{req.name} is now live. Welcome aboard.",
        link="/dashboard",
        chapter_id=req.resulting_chapter_id,
    )


def notify_requester_rejected(req: ChapterRequest) -> None:
    """Email + in-app notification to the requester on rejection."""
    if not req.requester:
        return
    send_chapter_request_rejected_email(
        to=req.requester.email,
        requester_name=req.requester.full_name,
        chapter_name=req.name,
        reason=req.rejected_reason or "(no reason provided)",
    )
    # No chapter_id → in-app skipped; requester learns via email + polling.
