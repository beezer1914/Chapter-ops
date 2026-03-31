"""
Chapter health check.

- Dormant chapters: zero logins in last 30 days
- Overdue payment plans: installments >14 days late
- Stale dues collection: no financial status promotions in >60 days
"""

import logging
from datetime import datetime, timedelta, timezone

from agent.context import AgentContext, Finding

logger = logging.getLogger(__name__)


def run(ctx: AgentContext) -> None:
    try:
        _check_dormant_chapters(ctx)
    except Exception as exc:
        logger.exception("chapters.dormant check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="chapters.dormant",
            summary="Dormant chapter check crashed",
            detail=str(exc),
        ))

    try:
        _check_overdue_plans(ctx)
    except Exception as exc:
        logger.exception("chapters.overdue_plans check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="chapters.overdue_plans",
            summary="Overdue payment plan check crashed",
            detail=str(exc),
        ))

    try:
        _check_stale_dues_collection(ctx)
    except Exception as exc:
        logger.exception("chapters.stale_dues check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="chapters.stale_dues",
            summary="Stale dues collection check crashed",
            detail=str(exc),
        ))


def _check_dormant_chapters(ctx: AgentContext) -> None:
    from app.extensions import db
    from app.models.chapter import Chapter
    from app.models.auth_event import AuthEvent
    from app.models.membership import ChapterMembership
    from sqlalchemy import func

    since = datetime.now(timezone.utc) - timedelta(days=30)

    # Get all active chapters
    chapters = db.session.query(Chapter).filter(Chapter.active == True).all()

    for chapter in chapters:
        # Get user IDs in this chapter
        member_ids = [
            m.user_id
            for m in db.session.query(ChapterMembership.user_id)
            .filter(
                ChapterMembership.chapter_id == chapter.id,
                ChapterMembership.active == True,
            )
            .all()
        ]
        if not member_ids:
            continue

        # Count logins in last 30 days for members of this chapter
        login_count = (
            db.session.query(func.count(AuthEvent.id))
            .filter(
                AuthEvent.user_id.in_(member_ids),
                AuthEvent.event_type == "login_success",
                AuthEvent.created_at >= since,
            )
            .scalar()
        )

        if login_count == 0:
            ctx.findings.append(Finding(
                severity="info",
                check="chapters.dormant",
                summary=f"Chapter '{chapter.name}' has had zero logins in the last 30 days",
                detail=f"Chapter: {chapter.name}\nMembers: {len(member_ids)}\nLast 30d logins: 0",
                recommended_action="Consider outreach to this chapter — potential churn risk.",
            ))


def _check_overdue_plans(ctx: AgentContext) -> None:
    from app.extensions import db
    from app.models.payment_plan import PaymentPlan
    from app.models.payment import Payment
    from app.models.chapter import Chapter
    from sqlalchemy import func

    cutoff = datetime.now(timezone.utc) - timedelta(days=14)

    # Find active plans whose most recent payment is older than 14 days
    overdue_plans = (
        db.session.query(PaymentPlan)
        .filter(PaymentPlan.status == "active")
        .all()
    )

    chapter_overdue: dict[str, list] = {}
    for plan in overdue_plans:
        last_payment = (
            db.session.query(Payment)
            .filter(Payment.payment_plan_id == plan.id)
            .order_by(Payment.created_at.desc())
            .first()
        )
        # A plan is overdue if it has no payments or last payment was >14 days ago
        ref_date = last_payment.created_at if last_payment else plan.created_at
        if ref_date and ref_date.replace(tzinfo=timezone.utc) < cutoff:
            chapter_overdue.setdefault(plan.chapter_id, []).append(plan)

    for chapter_id, plans in chapter_overdue.items():
        chapter = db.session.get(Chapter, chapter_id)
        name = chapter.name if chapter else chapter_id
        ctx.findings.append(Finding(
            severity="info",
            check="chapters.overdue_plans",
            summary=f"Chapter '{name}' has {len(plans)} payment plan(s) with no activity in >14 days",
            detail=f"Chapter: {name}\nOverdue active plans: {len(plans)}",
            recommended_action="Consider sending a dues reminder to affected members.",
        ))


def _check_stale_dues_collection(ctx: AgentContext) -> None:
    from app.extensions import db
    from app.models.chapter import Chapter
    from app.models.payment import Payment
    from app.models.membership import ChapterMembership
    from sqlalchemy import func

    cutoff = datetime.now(timezone.utc) - timedelta(days=60)

    chapters = db.session.query(Chapter).filter(Chapter.active == True).all()

    for chapter in chapters:
        member_count = (
            db.session.query(func.count(ChapterMembership.id))
            .filter(
                ChapterMembership.chapter_id == chapter.id,
                ChapterMembership.active == True,
            )
            .scalar()
        )

        if not member_count or member_count < 3:
            continue  # Skip tiny/empty chapters

        # Check if any payments were recorded in the last 60 days
        recent_payment = (
            db.session.query(Payment)
            .filter(
                Payment.chapter_id == chapter.id,
                Payment.created_at >= cutoff,
            )
            .first()
        )

        if not recent_payment:
            ctx.findings.append(Finding(
                severity="info",
                check="chapters.stale_dues",
                summary=f"Chapter '{chapter.name}' has recorded no payments in >60 days (has {member_count} members)",
                detail=f"Chapter: {chapter.name}\nMembers: {member_count}\nLast payment: >60 days ago",
                recommended_action="This chapter may not be actively collecting dues. Consider outreach.",
            ))
