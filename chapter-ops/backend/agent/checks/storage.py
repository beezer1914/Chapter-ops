"""
Storage health check.

- R2 connectivity via HEAD on a sentinel file
- Orphaned Document DB records (file_key resolves to 404)
"""

import logging

from agent.context import AgentContext, Finding

logger = logging.getLogger(__name__)

_SENTINEL_KEY = "ops-agent/sentinel.txt"


def run(ctx: AgentContext) -> None:
    try:
        _check_r2_connectivity(ctx)
    except Exception as exc:
        logger.exception("storage.r2_connectivity check crashed")
        ctx.findings.append(Finding(
            severity="critical",
            check="storage.r2_connectivity",
            summary="R2 storage connectivity check crashed",
            detail=str(exc),
            recommended_action="Check S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
        ))

    try:
        _check_orphaned_documents(ctx)
    except Exception as exc:
        logger.exception("storage.orphaned_documents check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="storage.orphaned_documents",
            summary="Orphaned document check crashed",
            detail=str(exc),
        ))


def _check_r2_connectivity(ctx: AgentContext) -> None:
    from flask import current_app
    from app.utils.s3 import get_s3_client
    from botocore.exceptions import ClientError

    s3 = get_s3_client()
    bucket = current_app.config["S3_BUCKET_NAME"]

    # Ensure sentinel file exists — write it if not
    try:
        s3.head_object(Bucket=bucket, Key=_SENTINEL_KEY)
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            # Sentinel missing — write it
            s3.put_object(
                Bucket=bucket,
                Key=_SENTINEL_KEY,
                Body=b"chapterops-ops-agent-sentinel",
                ContentType="text/plain",
            )
        else:
            ctx.findings.append(Finding(
                severity="critical",
                check="storage.r2_connectivity",
                summary="R2 storage is unreachable",
                detail=str(e),
                recommended_action="Check Cloudflare R2 status and credentials.",
            ))


def _check_orphaned_documents(ctx: AgentContext) -> None:
    from flask import current_app
    from app.extensions import db
    from app.models.document import Document
    from app.utils.s3 import get_s3_client
    from botocore.exceptions import ClientError

    s3 = get_s3_client()
    bucket = current_app.config["S3_BUCKET_NAME"]

    # Sample up to 50 most recent documents to avoid hammering the API
    docs = (
        db.session.query(Document)
        .filter(Document.file_key.isnot(None))
        .order_by(Document.created_at.desc())
        .limit(50)
        .all()
    )

    orphaned = []
    for doc in docs:
        try:
            s3.head_object(Bucket=bucket, Key=doc.file_key)
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                orphaned.append(doc)

    if orphaned:
        detail = "\n".join(
            f"  - {d.name} (id={d.id}, key={d.file_key})" for d in orphaned
        )
        ctx.findings.append(Finding(
            severity="warning",
            check="storage.orphaned_documents",
            summary=f"{len(orphaned)} Document record(s) reference missing R2 files",
            detail=f"Orphaned documents:\n{detail}",
            recommended_action="These DB records point to files that no longer exist in R2. Consider cleaning them up.",
        ))
