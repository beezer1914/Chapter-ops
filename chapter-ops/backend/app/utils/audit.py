"""Append-only audit logging helper.

Wraps AuditEvent creation in a single call so route handlers can record
security-relevant events without spelling out boilerplate. Caller is
responsible for db.session.commit() as part of the surrounding
transaction.
"""

from flask_login import current_user

from app.extensions import db
from app.models import AuditEvent


def record_audit(
    *,
    event_type: str,
    target_type: str,
    target_id: str,
    details: dict | None = None,
) -> AuditEvent:
    """Append a row to audit_event. Does not commit.

    Reads the actor from flask_login.current_user when authenticated; falls
    back to None for unauthenticated callers (e.g. callback hits where the
    session was lost — record the attempt anyway).
    """
    actor_id = current_user.id if current_user.is_authenticated else None
    event = AuditEvent(
        actor_user_id=actor_id,
        event_type=event_type,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
    )
    db.session.add(event)
    return event
