"""
Database health check.

- Connectivity: SELECT 1
- Long-running queries via pg_stat_activity
- Alembic migration drift detection
- Redis connectivity
"""

import logging
from agent.context import AgentContext, Finding

logger = logging.getLogger(__name__)


def run(ctx: AgentContext) -> None:
    try:
        _check_postgres(ctx)
    except Exception as exc:
        logger.exception("database.postgres check crashed")
        ctx.findings.append(Finding(
            severity="critical",
            check="database.postgres",
            summary="Database connectivity check crashed unexpectedly",
            detail=str(exc),
            recommended_action="Check Flask logs and database server status immediately.",
        ))

    try:
        _check_long_queries(ctx)
    except Exception as exc:
        logger.exception("database.long_queries check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="database.long_queries",
            summary="Long-running query check crashed",
            detail=str(exc),
        ))

    try:
        _check_migration_drift(ctx)
    except Exception as exc:
        logger.exception("database.migration_drift check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="database.migration_drift",
            summary="Migration drift check crashed",
            detail=str(exc),
        ))

    try:
        _check_redis(ctx)
    except Exception as exc:
        logger.exception("database.redis check crashed")
        ctx.findings.append(Finding(
            severity="critical",
            check="database.redis",
            summary="Redis connectivity check crashed",
            detail=str(exc),
            recommended_action="Check Redis server status.",
        ))


def _check_postgres(ctx: AgentContext) -> None:
    from app.extensions import db
    from sqlalchemy import text

    result = db.session.execute(text("SELECT 1")).scalar()
    if result != 1:
        ctx.findings.append(Finding(
            severity="critical",
            check="database.postgres",
            summary="PostgreSQL connectivity check failed",
            detail="SELECT 1 did not return 1.",
            recommended_action="Verify DATABASE_URL and Postgres server status.",
        ))


def _check_long_queries(ctx: AgentContext) -> None:
    from app.extensions import db
    from sqlalchemy import text

    rows = db.session.execute(text("""
        SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
        FROM pg_stat_activity
        WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
          AND state != 'idle'
    """)).fetchall()

    if rows:
        details = "\n".join(
            f"PID {r.pid} ({r.state}): running {r.duration} — {r.query[:120]}"
            for r in rows
        )
        ctx.findings.append(Finding(
            severity="warning",
            check="database.long_queries",
            summary=f"{len(rows)} long-running query(s) detected (>30s)",
            detail=details,
            recommended_action="Review and potentially terminate long-running queries via pg_terminate_backend().",
        ))


def _check_migration_drift(ctx: AgentContext) -> None:
    """Compare applied Alembic head to latest migration file on disk."""
    import os
    import re
    from pathlib import Path
    from app.extensions import db
    from sqlalchemy import text

    # Get current applied revision from alembic_version table
    try:
        applied = db.session.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:
        applied = None

    if not applied:
        return  # No migrations applied yet (fresh DB)

    # Find latest migration file revision on disk
    versions_dir = Path(__file__).resolve().parents[3] / "migrations" / "versions"
    migration_files = list(versions_dir.glob("*.py"))
    revisions_on_disk = set()
    for f in migration_files:
        match = re.match(r"^([a-f0-9]+)_", f.name)
        if match:
            revisions_on_disk.add(match.group(1))

    if applied not in revisions_on_disk:
        ctx.findings.append(Finding(
            severity="critical",
            check="database.migration_drift",
            summary=f"Applied migration '{applied}' not found among migration files on disk",
            detail=f"Applied: {applied}\nOn disk: {sorted(revisions_on_disk)}",
            recommended_action="Run `flask db upgrade` or check for missing migration files.",
        ))


def _check_redis(ctx: AgentContext) -> None:
    import redis as redis_lib
    from flask import current_app

    r = redis_lib.from_url(current_app.config["REDIS_URL"])
    response = r.ping()
    if not response:
        ctx.findings.append(Finding(
            severity="critical",
            check="database.redis",
            summary="Redis PING failed",
            detail="Redis did not respond to PING.",
            recommended_action="Check REDIS_URL and Redis server status.",
        ))
