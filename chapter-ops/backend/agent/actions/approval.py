"""
Approval-gated actions — requires human confirmation before execution.

Writes a pending AgentApproval record to the database and emails Brandon
with a one-time confirmation link. The link hits /api/agent/approve/<token>.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agent.context import AgentContext

logger = logging.getLogger(__name__)


def request_approval(
    ctx: "AgentContext",
    action_id: str,
    description: str,
    command: dict,
) -> None:
    """
    Stage an action for human approval.

    Writes an AgentApproval record, emails the founder, and logs to ctx.approval_requests.
    """
    try:
        from flask import current_app
        from app.extensions import db
        from app.models.agent_approval import AgentApproval
        from app.utils.email import send_email

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

        approval = AgentApproval(
            expires_at=expires_at,
            action_id=action_id,
            description=description,
            command_json=command,
            approval_token=token,
        )
        db.session.add(approval)
        db.session.commit()

        # Build confirmation link
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
        backend_url = current_app.config.get("BACKEND_URL", "http://localhost:5000")
        confirm_url = f"{backend_url}/api/agent/approve/{token}"

        founder_email = current_app.config.get("FOUNDER_EMAIL")
        if founder_email:
            html = f"""
            <div style="font-family: sans-serif; max-width: 680px; margin: 0 auto;
                        background: #0a1128; color: #f0f4fa; padding: 32px; border-radius: 8px;">
                <div style="background: #d97706; color: white; padding: 12px 20px;
                            border-radius: 6px; font-weight: 700; margin-bottom: 24px;">
                    🔐 Action Requires Your Approval
                </div>
                <h2 style="color: #f0f4fa; margin: 0 0 8px;">Approval Request</h2>
                <p style="color: #94a3c0;">{description}</p>
                <div style="background: rgba(255,255,255,0.05); border-radius: 6px;
                            padding: 16px; margin: 20px 0; font-family: monospace;
                            font-size: 13px; color: #94a3c0;">
                    Action ID: {action_id}<br>
                    Command: {command}
                </div>
                <a href="{confirm_url}"
                   style="display: inline-block; padding: 14px 28px; background: #0f52ba;
                          color: white; text-decoration: none; border-radius: 6px;
                          font-weight: 700; font-size: 15px;">
                    ✅ Approve & Execute
                </a>
                <p style="color: #5c6d8a; font-size: 12px; margin-top: 20px;">
                    This approval link expires in 24 hours. If you did not expect this,
                    ignore this email — the action will not be taken.<br><br>
                    Run ID: {ctx.run_id}
                </p>
            </div>
            """
            send_email(
                to=founder_email,
                subject=f"[ChapterOps] Approval Required: {action_id}",
                html=html,
            )

        msg = f"Approval requested: {action_id} — {description}"
        logger.info(msg)
        ctx.approval_requests.append(msg)

    except Exception as exc:
        logger.exception(f"request_approval failed for action_id={action_id}")
        ctx.approval_requests.append(f"Approval request FAILED: {action_id} — {exc}")
