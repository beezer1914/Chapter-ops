"""
Auth security check.

- Brute-force detection: IPs with >10 failed logins in last hour
- Account lockout candidates: users with >5 failures in 15 min
- Suspicious logins: treasurer/president from new country
"""

import logging
from datetime import datetime, timedelta, timezone

from agent.context import AgentContext, Finding

logger = logging.getLogger(__name__)


def run(ctx: AgentContext) -> None:
    try:
        _check_brute_force_by_ip(ctx)
    except Exception as exc:
        logger.exception("auth.brute_force_ip check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="auth.brute_force_ip",
            summary="IP brute-force check crashed",
            detail=str(exc),
        ))

    try:
        _check_account_lockout_candidates(ctx)
    except Exception as exc:
        logger.exception("auth.account_lockout check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="auth.account_lockout",
            summary="Account lockout check crashed",
            detail=str(exc),
        ))

    try:
        _check_suspicious_logins(ctx)
    except Exception as exc:
        logger.exception("auth.suspicious_logins check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="auth.suspicious_logins",
            summary="Suspicious login check crashed",
            detail=str(exc),
        ))


def _check_brute_force_by_ip(ctx: AgentContext) -> None:
    from app.extensions import db
    from app.models.auth_event import AuthEvent
    from sqlalchemy import func

    since = datetime.now(timezone.utc) - timedelta(hours=1)

    rows = (
        db.session.query(AuthEvent.ip_address, func.count().label("attempts"))
        .filter(
            AuthEvent.event_type == "login_failure",
            AuthEvent.created_at >= since,
        )
        .group_by(AuthEvent.ip_address)
        .having(func.count() > 10)
        .all()
    )

    for row in rows:
        ctx.findings.append(Finding(
            severity="warning",
            check="auth.brute_force_ip",
            summary=f"IP {row.ip_address} made {row.attempts} failed login attempts in the last hour",
            detail=f"IP: {row.ip_address}\nFailed attempts (last 1h): {row.attempts}",
            recommended_action="Consider blocking this IP at the firewall or CDN level.",
        ))


def _check_account_lockout_candidates(ctx: AgentContext) -> None:
    from app.extensions import db
    from app.models.auth_event import AuthEvent
    from app.models.user import User
    from agent.actions.approval import request_approval
    from sqlalchemy import func

    since = datetime.now(timezone.utc) - timedelta(minutes=15)

    rows = (
        db.session.query(AuthEvent.user_id, func.count().label("attempts"))
        .filter(
            AuthEvent.event_type == "login_failure",
            AuthEvent.created_at >= since,
            AuthEvent.user_id.isnot(None),
        )
        .group_by(AuthEvent.user_id)
        .having(func.count() > 5)
        .all()
    )

    for row in rows:
        user = db.session.get(User, row.user_id)
        display = user.email if user else row.user_id
        ctx.findings.append(Finding(
            severity="warning",
            check="auth.account_lockout",
            summary=f"Account {display} had {row.attempts} failed logins in 15 minutes",
            detail=f"User: {display}\nFailed attempts (last 15m): {row.attempts}",
            recommended_action="Locking this account requires approval.",
        ))
        request_approval(
            ctx=ctx,
            action_id=f"auth.lock_account.{row.user_id}",
            description=f"Lock account for {display} due to {row.attempts} failed login attempts in 15 minutes",
            command={"action": "lock_user", "user_id": row.user_id},
        )


def _check_suspicious_logins(ctx: AgentContext) -> None:
    from app.extensions import db
    from app.models.auth_event import AuthEvent
    from app.models.membership import ChapterMembership
    from sqlalchemy import func

    since = datetime.now(timezone.utc) - timedelta(hours=24)

    # Find successful logins from users with elevated roles
    elevated_roles = ("treasurer", "vice_president", "president")
    elevated_user_ids = {
        m.user_id
        for m in db.session.query(ChapterMembership.user_id)
        .filter(
            ChapterMembership.role.in_(elevated_roles),
            ChapterMembership.active == True,
        )
        .all()
    }

    if not elevated_user_ids:
        return

    recent_logins = (
        db.session.query(AuthEvent)
        .filter(
            AuthEvent.event_type == "login_success",
            AuthEvent.created_at >= since,
            AuthEvent.user_id.in_(elevated_user_ids),
            AuthEvent.country_code.isnot(None),
        )
        .all()
    )

    # Flag logins from a country not seen in the previous 30 days for that user
    for event in recent_logins:
        lookback = datetime.now(timezone.utc) - timedelta(days=30)
        prior_countries = {
            r.country_code
            for r in db.session.query(AuthEvent.country_code)
            .filter(
                AuthEvent.user_id == event.user_id,
                AuthEvent.event_type == "login_success",
                AuthEvent.created_at >= lookback,
                AuthEvent.created_at < event.created_at,
                AuthEvent.country_code.isnot(None),
            )
            .all()
        }
        if prior_countries and event.country_code not in prior_countries:
            ctx.findings.append(Finding(
                severity="info",
                check="auth.suspicious_logins",
                summary=f"Elevated-role user logged in from new country: {event.country_code}",
                detail=(
                    f"User ID: {event.user_id}\n"
                    f"New country: {event.country_code}\n"
                    f"Previous countries (30d): {sorted(prior_countries)}\n"
                    f"IP: {event.ip_address}"
                ),
                recommended_action="Verify with the user if this login was expected.",
            ))
