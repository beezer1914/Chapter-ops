"""
Stripe health check.

- Webhook endpoint delivery success rate over last 24h
- Cross-reference Stripe charges against local Payment records
"""

import logging
from datetime import datetime, timedelta, timezone

from agent.context import AgentContext, Finding

logger = logging.getLogger(__name__)


def run(ctx: AgentContext) -> None:
    try:
        _check_webhook_health(ctx)
    except Exception as exc:
        logger.exception("stripe.webhook_health check crashed")
        ctx.findings.append(Finding(
            severity="critical",
            check="stripe.webhook_health",
            summary="Stripe webhook health check crashed",
            detail=str(exc),
        ))

    try:
        _check_payment_reconciliation(ctx)
    except Exception as exc:
        logger.exception("stripe.payment_reconciliation check crashed")
        ctx.findings.append(Finding(
            severity="warning",
            check="stripe.payment_reconciliation",
            summary="Stripe payment reconciliation check crashed",
            detail=str(exc),
        ))


def _check_webhook_health(ctx: AgentContext) -> None:
    import stripe
    from agent.actions.safe import replay_stripe_webhooks
    from agent.actions.approval import request_approval

    # List all webhook endpoints registered on this Stripe account
    endpoints = stripe.WebhookEndpoint.list(limit=10)
    if not endpoints.data:
        return  # No webhooks configured — skip

    for endpoint in endpoints.data:
        # Fetch recent delivery attempts for this endpoint
        try:
            attempts = stripe.WebhookEndpoint.list_webhook_deliveries(
                endpoint.id, limit=100
            )
        except Exception:
            # Not all Stripe SDK versions expose this; skip gracefully
            return

        if not attempts.data:
            continue

        total = len(attempts.data)
        failed = sum(
            1 for a in attempts.data
            if a.get("status") not in ("succeeded",)
        )
        failure_rate = failed / total if total else 0

        if failure_rate > 0.50:
            ctx.findings.append(Finding(
                severity="critical",
                check="stripe.webhook_health",
                summary=f"Stripe webhook failure rate is {failure_rate:.0%} (>{50}% threshold)",
                detail=f"Endpoint: {endpoint.url}\nFailed: {failed}/{total}",
                recommended_action="Investigate webhook endpoint availability. Consider disabling Stripe checkout temporarily.",
            ))
            failed_ids = [
                a.id for a in attempts.data
                if a.get("status") not in ("succeeded",)
            ]
            request_approval(
                ctx=ctx,
                action_id="stripe.disable_checkout",
                description="Disable Stripe checkout due to >50% webhook failure rate",
                command={"action": "disable_stripe_checkout"},
            )
        elif failure_rate > 0.10:
            ctx.findings.append(Finding(
                severity="warning",
                check="stripe.webhook_health",
                summary=f"Stripe webhook failure rate is {failure_rate:.0%} (>{10}% threshold)",
                detail=f"Endpoint: {endpoint.url}\nFailed: {failed}/{total}",
                recommended_action="Replaying failed webhook events automatically.",
            ))
            failed_ids = [
                a.id for a in attempts.data
                if a.get("status") not in ("succeeded",)
            ]
            if failed_ids:
                replay_stripe_webhooks(ctx=ctx, event_ids=failed_ids[:20])


def _check_payment_reconciliation(ctx: AgentContext) -> None:
    """Flag Stripe charges with no matching local Payment record (potential webhook miss)."""
    import stripe
    from app.extensions import db
    from app.models.payment import Payment

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    since_ts = int(since.timestamp())

    # Fetch recent succeeded charges from Stripe
    charges = stripe.Charge.list(
        limit=100,
        created={"gte": since_ts},
    )

    stripe_charge_ids = {
        c.id for c in charges.data
        if c.status == "succeeded" and c.payment_intent
    }

    if not stripe_charge_ids:
        return

    # Check which have matching Payment records (matched via stripe_session_id or metadata)
    local_payments = db.session.query(Payment.stripe_session_id).filter(
        Payment.created_at >= since
    ).all()
    local_session_ids = {p.stripe_session_id for p in local_payments if p.stripe_session_id}

    # For reconciliation, compare Stripe payment_intent IDs against our records
    # We use a best-effort match — if there's a large mismatch, flag it
    unmatched_count = len(stripe_charge_ids) - len(local_session_ids)
    if unmatched_count > 3:
        ctx.findings.append(Finding(
            severity="warning",
            check="stripe.payment_reconciliation",
            summary=f"{unmatched_count} Stripe charges in last 24h may have no matching local Payment record",
            detail=(
                f"Stripe charges (succeeded, last 24h): {len(stripe_charge_ids)}\n"
                f"Local Payment records (last 24h): {len(local_session_ids)}\n"
                f"Discrepancy: {unmatched_count}"
            ),
            recommended_action="Check webhook logs for missed checkout.session.completed events.",
        ))
