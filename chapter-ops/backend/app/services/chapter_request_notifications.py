"""
Notification side-effects for ChapterRequest lifecycle events.

Stub module — full implementations land alongside the approve/reject routes
in a later task. Kept as a separate module so the submit route can import it
without a circular dependency.
"""

import logging

from app.models.chapter_request import ChapterRequest

logger = logging.getLogger(__name__)


def notify_approvers_of_new_request(req: ChapterRequest) -> None:
    """Notify the users authorized to approve this request (email + in-app)."""
    logger.info("notify_approvers_of_new_request: request=%s (stub)", req.id)


def notify_requester_approved(req: ChapterRequest) -> None:
    """Notify the requester that their chapter was approved."""
    logger.info("notify_requester_approved: request=%s (stub)", req.id)


def notify_requester_rejected(req: ChapterRequest) -> None:
    """Notify the requester that their chapter request was rejected."""
    logger.info("notify_requester_rejected: request=%s (stub)", req.id)
