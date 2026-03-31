"""
Ops Agent Runner — APScheduler setup and job orchestration.

Two scheduled jobs:
  - ops_agent_run()    every 15 minutes — lightweight health checks
  - ops_agent_digest() daily at AGENT_DIGEST_HOUR — morning summary email

Set AGENT_ENABLED=false in .env to disable all jobs (useful in dev).
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def init_agent(app) -> None:
    """
    Initialize and start the APScheduler background scheduler.
    Called from the Flask app factory after all extensions are initialized.
    """
    import os
    if not app.config.get("AGENT_ENABLED", True):
        logger.info("Ops agent disabled (AGENT_ENABLED=false)")
        return

    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    scheduler = BackgroundScheduler(timezone="UTC")

    digest_hour = int(app.config.get("AGENT_DIGEST_HOUR", 7))

    scheduler.add_job(
        func=lambda: _run_checks(app, run_type="scheduled"),
        trigger=IntervalTrigger(minutes=15),
        id="ops_agent_checks",
        name="Ops Agent — Health Checks",
        replace_existing=True,
        misfire_grace_time=120,
    )

    scheduler.add_job(
        func=lambda: _run_digest(app),
        trigger=CronTrigger(hour=digest_hour, minute=0),
        id="ops_agent_digest",
        name="Ops Agent — Morning Digest",
        replace_existing=True,
        misfire_grace_time=600,
    )

    scheduler.add_job(
        func=lambda: _purge_auth_events(app),
        trigger=CronTrigger(hour=3, minute=30),  # 3:30am UTC daily
        id="ops_agent_purge_auth_events",
        name="Ops Agent — AuthEvent 90-day Purge",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    scheduler.start()
    logger.info(
        f"Ops agent scheduler started — checks every 15m, digest at {digest_hour:02d}:00 UTC"
    )


def run_manual(app) -> dict:
    """
    Trigger a manual agent run outside the schedule.
    Returns a summary dict for the API response.
    """
    return _run_checks(app, run_type="manual")


def _run_checks(app, run_type: str = "scheduled") -> dict:
    """Execute all check modules and persist the AgentRun record."""
    from agent.context import AgentContext
    from agent.checks import database, stripe, auth, chapters, storage
    from agent.actions.safe import send_alert

    with app.app_context():
        ctx = AgentContext()
        ctx.triggered_at = datetime.now(timezone.utc)

        # Run all checks — each is independently wrapped in try/except
        for check_module in [database, stripe, auth, chapters, storage]:
            try:
                check_module.run(ctx)
            except Exception as exc:
                logger.exception(f"Check module {check_module.__name__} crashed at runner level")

        # Fire an immediate alert for any critical findings
        critical_findings = ctx.findings_by_severity("critical")
        if critical_findings:
            summary = "\n".join(f"• [{f.check}] {f.summary}" for f in critical_findings)
            send_alert(ctx, subject="Critical issues detected", body=summary)

        # Persist the run record
        _persist_run(ctx, run_type)

        logger.info(
            f"Agent run complete (run_id={ctx.run_id}, type={run_type}, "
            f"severity={ctx.highest_severity}, findings={len(ctx.findings)})"
        )

        return {
            "run_id": ctx.run_id,
            "status": ctx.highest_severity,
            "findings_count": len(ctx.findings),
            "actions_taken": len(ctx.actions_taken),
            "approval_requests": len(ctx.approval_requests),
        }


def _run_digest(app) -> None:
    """Run checks and send the morning digest email."""
    from agent.context import AgentContext
    from agent.checks import database, stripe, auth, chapters, storage
    from agent.digest import send_digest

    with app.app_context():
        ctx = AgentContext()
        ctx.triggered_at = datetime.now(timezone.utc)

        for check_module in [database, stripe, auth, chapters, storage]:
            try:
                check_module.run(ctx)
            except Exception as exc:
                logger.exception(f"Digest check module {check_module.__name__} crashed")

        send_digest(ctx)
        _persist_run(ctx, run_type="digest")


def _purge_auth_events(app) -> None:
    """Delete AuthEvent records older than 90 days."""
    from datetime import timedelta
    with app.app_context():
        try:
            from app.extensions import db
            from app.models.auth_event import AuthEvent

            cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            deleted = (
                db.session.query(AuthEvent)
                .filter(AuthEvent.created_at < cutoff)
                .delete(synchronize_session=False)
            )
            db.session.commit()
            if deleted:
                logger.info(f"Purged {deleted} AuthEvent records older than 90 days")
        except Exception as exc:
            logger.exception(f"AuthEvent purge failed: {exc}")


def _persist_run(ctx, run_type: str) -> None:
    """Save the AgentRun record to the database."""
    try:
        from app.extensions import db
        from app.models.agent_run import AgentRun

        run = AgentRun(
            triggered_at=ctx.triggered_at,
            completed_at=datetime.now(timezone.utc),
            run_type=run_type,
            status=ctx.highest_severity,
            findings_json=[f.to_dict() for f in ctx.findings],
            actions_taken_json=ctx.actions_taken,
        )
        db.session.add(run)
        db.session.commit()
    except Exception as exc:
        logger.exception(f"Failed to persist AgentRun: {exc}")
