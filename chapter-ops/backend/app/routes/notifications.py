"""
Notification routes — /api/notifications/*

Handles fetching, marking as read, and deleting notifications for users.
"""

from flask import Blueprint, jsonify, request, g
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.extensions import db
from app.models import Notification
from app.services import notification_service
from app.utils.decorators import chapter_required

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.route("", methods=["GET"])
@login_required
@chapter_required
def list_notifications():
    """
    Get all notifications for the current user in the current chapter.

    Returns most recent 50 notifications, ordered by created_at descending.
    Includes both user-specific and chapter-wide notifications.
    """
    chapter = g.current_chapter

    notifications = (
        Notification.query.filter(
            Notification.chapter_id == chapter.id,
            or_(
                Notification.recipient_id == current_user.id,
                Notification.recipient_id == None,  # Chapter-wide notifications
            ),
        )
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )

    return jsonify({"notifications": [n.to_dict() for n in notifications]}), 200


@notifications_bp.route("/unread-count", methods=["GET"])
@login_required
@chapter_required
def unread_count():
    """
    Get count of unread notifications for the current user.

    Used for polling to update the notification badge.
    """
    chapter = g.current_chapter

    count = Notification.query.filter(
        Notification.chapter_id == chapter.id,
        Notification.is_read == False,
        or_(
            Notification.recipient_id == current_user.id,
            Notification.recipient_id == None,
        ),
    ).count()

    return jsonify({"unread_count": count}), 200


@notifications_bp.route("/<notification_id>/read", methods=["POST"])
@login_required
@chapter_required
def mark_notification_as_read(notification_id):
    """
    Mark a single notification as read.

    Verifies the notification belongs to the current chapter and user has permission.
    """
    chapter = g.current_chapter

    try:
        notification = notification_service.mark_as_read(
            notification_id=notification_id,
            user_id=current_user.id,
            chapter_id=chapter.id,
        )
        return jsonify(notification.to_dict()), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@notifications_bp.route("/read-all", methods=["POST"])
@login_required
@chapter_required
def mark_all_as_read():
    """
    Mark all unread notifications for the current user as read.
    """
    chapter = g.current_chapter

    count = notification_service.mark_all_as_read(
        user_id=current_user.id,
        chapter_id=chapter.id,
    )

    return jsonify({"success": True, "count": count}), 200


@notifications_bp.route("/<notification_id>", methods=["DELETE"])
@login_required
@chapter_required
def delete_notification(notification_id):
    """
    Delete a notification.

    Verifies the notification belongs to the current chapter and user has permission.
    """
    chapter = g.current_chapter

    try:
        notification_service.delete_notification(
            notification_id=notification_id,
            user_id=current_user.id,
            chapter_id=chapter.id,
        )
        return jsonify({"success": True}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
