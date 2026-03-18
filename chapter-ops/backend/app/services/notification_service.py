"""
Notification Service — business logic for creating and managing notifications.

All public functions take explicit model instances or IDs with chapter_id
for multi-tenant safety.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import or_

from app.extensions import db
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.user import User
from app.models.membership import ChapterMembership

logger = logging.getLogger(__name__)


# ── Public API ────────────────────────────────────────────────────────────────


def create_notification(
    chapter_id: str,
    notification_type: str,
    title: str,
    message: str,
    recipient_id: str | None = None,
    link: str | None = None,
) -> Notification:
    """
    Create a notification for a chapter.

    Args:
        chapter_id: The chapter ID (tenant scope)
        notification_type: Type of notification ("payment", "workflow", "member", "invite")
        title: Short title for the notification
        message: Detailed message content
        recipient_id: Optional user ID. If None, notification is chapter-wide
        link: Optional link to navigate to when clicked

    Returns:
        Created and committed Notification instance
    """
    notification = Notification(
        chapter_id=chapter_id,
        recipient_id=recipient_id,
        type=notification_type,
        title=title,
        message=message,
        link=link,
        is_read=False,
    )
    db.session.add(notification)
    db.session.commit()

    logger.info(
        f"Created {notification_type} notification for chapter {chapter_id}, "
        f"recipient: {recipient_id or 'chapter-wide'}"
    )

    return notification


def create_payment_notification(
    chapter_id: str,
    payment: Payment,
    recipient_id: str | None = None,
) -> Notification:
    """
    Create a notification for a payment event.

    Args:
        chapter_id: The chapter ID
        payment: Payment model instance
        recipient_id: Optional recipient. If None, notifies chapter-wide

    Returns:
        Created Notification
    """
    amount = f"${float(payment.amount):.2f}"
    fee_type = payment.fee_type_id or "general payment"

    title = "Payment Recorded"
    message = f"Payment of {amount} recorded for {fee_type}"
    link = f"/payments"

    return create_notification(
        chapter_id=chapter_id,
        notification_type="payment",
        title=title,
        message=message,
        recipient_id=recipient_id,
        link=link,
    )


def create_member_notification(
    chapter_id: str,
    user: User,
    action: str,  # "joined", "updated"
    recipient_id: str | None = None,
) -> Notification:
    """
    Create a notification for member events.

    Args:
        chapter_id: The chapter ID
        user: User model instance
        action: Type of action ("joined", "updated")
        recipient_id: Optional recipient. If None, notifies chapter officers

    Returns:
        Created Notification
    """
    if action == "joined":
        title = "New Member Joined"
        message = f"{user.full_name} has joined the chapter"
    elif action == "updated":
        title = "Member Profile Updated"
        message = f"Your profile has been updated"
    else:
        title = "Member Update"
        message = f"{user.full_name} profile has been updated"

    link = f"/members"

    return create_notification(
        chapter_id=chapter_id,
        notification_type="member",
        title=title,
        message=message,
        recipient_id=recipient_id,
        link=link,
    )


def create_invite_notification(
    chapter_id: str,
    email: str,
    action: str,  # "accepted", "expired"
    recipient_id: str | None = None,
) -> Notification:
    """
    Create a notification for invite events.

    Args:
        chapter_id: The chapter ID
        email: Email address of the invite
        action: Type of action ("accepted", "expired")
        recipient_id: Optional recipient. If None, notifies chapter officers

    Returns:
        Created Notification
    """
    if action == "accepted":
        title = "Invite Accepted"
        message = f"{email} has accepted their invite"
    elif action == "expired":
        title = "Invite Expired"
        message = f"Invite for {email} has expired"
    else:
        title = "Invite Update"
        message = f"Invite status changed for {email}"

    link = f"/invites"

    return create_notification(
        chapter_id=chapter_id,
        notification_type="invite",
        title=title,
        message=message,
        recipient_id=recipient_id,
        link=link,
    )


def create_event_notification(
    chapter_id: str,
    event,  # Event model instance
    recipient_id: str | None = None,
) -> None:
    """
    Notify chapter members when a new event is published.

    If recipient_id is None, creates individual notifications for every
    active chapter member so each user's notification bell updates.
    """
    title = "New Event"
    message = f"{event.title} — {event.start_datetime.strftime('%b %-d') if event.start_datetime else 'Upcoming'}"
    link = "/events"

    if recipient_id:
        create_notification(
            chapter_id=chapter_id,
            notification_type="event",
            title=title,
            message=message,
            recipient_id=recipient_id,
            link=link,
        )
    else:
        # Notify all active members individually
        memberships = ChapterMembership.query.filter_by(
            chapter_id=chapter_id, active=True
        ).all()
        for membership in memberships:
            create_notification(
                chapter_id=chapter_id,
                notification_type="event",
                title=title,
                message=message,
                recipient_id=membership.user_id,
                link=link,
            )



def notify_workflow_step_assignees(
    chapter_id: str,
    instance,       # WorkflowInstance
    step_instance,  # WorkflowStepInstance
) -> None:
    """
    Send an in-app notification to every user eligible to act on a workflow
    step that just became in_progress.

    - specific_user → notifies that user directly
    - role          → notifies all active members whose role is >= required role
                      (mirrors the canAct hasRole check on the frontend)
    """
    step = step_instance.step
    step_name = step.name if step else "Approval Step"
    trigger_title = (instance.trigger_metadata or {}).get("title", instance.trigger_id)

    title = "Action Required: Workflow Approval"
    message = f'Your approval is needed on "{step_name}" for {trigger_title}'
    link = "/workflows"

    try:
        if step_instance.assigned_to_user_id:
            create_notification(
                chapter_id=chapter_id,
                notification_type="workflow",
                title=title,
                message=message,
                recipient_id=step_instance.assigned_to_user_id,
                link=link,
            )
        elif step_instance.assigned_to_role:
            required_role = step_instance.assigned_to_role
            # Exclude users who already acted on a prior step in this workflow
            already_acted = {
                si.action_taken_by
                for si in instance.step_instances
                if si.action_taken_by and si.id != step_instance.id
            }

            _REGIONAL_ROLES = {
                "regional_director", "regional_1st_vice", "regional_2nd_vice",
                "regional_secretary", "regional_treasurer",
            }

            if required_role in _REGIONAL_ROLES:
                # Notify regional officers with the exact role for this chapter's region
                from app.models.region_membership import RegionMembership
                from app.models import Chapter
                chapter_obj = Chapter.query.get(chapter_id)
                region_id = chapter_obj.region_id if chapter_obj else None
                if region_id:
                    region_memberships = RegionMembership.query.filter_by(
                        region_id=region_id,
                        role=required_role,
                        active=True,
                    ).all()
                    for rm in region_memberships:
                        if rm.user_id not in already_acted:
                            create_notification(
                                chapter_id=chapter_id,
                                notification_type="workflow",
                                title=title,
                                message=message,
                                recipient_id=rm.user_id,
                                link=link,
                            )
            else:
                # Notify chapter members with the exact required role
                memberships = ChapterMembership.query.filter(
                    ChapterMembership.chapter_id == chapter_id,
                    ChapterMembership.active == True,
                    ChapterMembership.role == required_role,
                ).all()
                for m in memberships:
                    if m.user_id not in already_acted:
                        create_notification(
                            chapter_id=chapter_id,
                            notification_type="workflow",
                            title=title,
                            message=message,
                            recipient_id=m.user_id,
                            link=link,
                        )
    except Exception as exc:
        logger.warning(
            f"Failed to notify workflow step assignees for step_instance {step_instance.id}: {exc}"
        )


def mark_as_read(
    notification_id: str,
    user_id: str,
    chapter_id: str,
) -> Notification:
    """
    Mark a notification as read.

    Verifies that the notification belongs to the current chapter and
    the user has permission to mark it as read.

    Args:
        notification_id: Notification ID
        user_id: User ID (for ownership check)
        chapter_id: Chapter ID (for tenant isolation)

    Returns:
        Updated Notification

    Raises:
        ValueError: If notification not found or permission denied
    """
    notification = Notification.query.filter_by(
        id=notification_id,
        chapter_id=chapter_id,
    ).first()

    if not notification:
        raise ValueError("Notification not found")

    # Check permission: user must be recipient or notification is chapter-wide
    if notification.recipient_id and notification.recipient_id != user_id:
        raise ValueError("Permission denied")

    notification.is_read = True
    notification.read_at = datetime.now(timezone.utc)
    db.session.commit()

    logger.info(f"User {user_id} marked notification {notification_id} as read")

    return notification


def mark_all_as_read(
    user_id: str,
    chapter_id: str,
) -> int:
    """
    Mark all unread notifications for a user as read.

    Args:
        user_id: User ID
        chapter_id: Chapter ID (for tenant isolation)

    Returns:
        Count of notifications marked as read
    """
    notifications = Notification.query.filter(
        Notification.chapter_id == chapter_id,
        Notification.is_read == False,
        or_(
            Notification.recipient_id == user_id,
            Notification.recipient_id == None,
        ),
    ).all()

    count = len(notifications)
    now = datetime.now(timezone.utc)

    for notification in notifications:
        notification.is_read = True
        notification.read_at = now

    db.session.commit()

    logger.info(f"User {user_id} marked {count} notifications as read")

    return count


def delete_notification(
    notification_id: str,
    user_id: str,
    chapter_id: str,
) -> bool:
    """
    Delete a notification.

    Verifies that the notification belongs to the current chapter and
    the user has permission to delete it.

    Args:
        notification_id: Notification ID
        user_id: User ID (for ownership check)
        chapter_id: Chapter ID (for tenant isolation)

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If notification not found or permission denied
    """
    notification = Notification.query.filter_by(
        id=notification_id,
        chapter_id=chapter_id,
    ).first()

    if not notification:
        raise ValueError("Notification not found")

    # Check permission: user must be recipient or notification is chapter-wide
    if notification.recipient_id and notification.recipient_id != user_id:
        raise ValueError("Permission denied")

    db.session.delete(notification)
    db.session.commit()

    logger.info(f"User {user_id} deleted notification {notification_id}")

    return True
