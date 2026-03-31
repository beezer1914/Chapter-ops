"""
Agent routes — /api/agent/*

Internal-only endpoints for the ops agent:
  GET  /api/agent/status          — last 5 AgentRun records (admin-only)
  POST /api/agent/run             — manually trigger an agent run (admin-only)
  GET  /api/agent/approve/<token> — execute a pending AgentApproval (token-auth, no login needed)
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, g
from flask_login import current_user, login_required

from app.extensions import db
from app.models.agent_run import AgentRun
from app.models.agent_approval import AgentApproval
from app.utils.decorators import role_required

agent_bp = Blueprint("agent", __name__, url_prefix="/api/agent")
logger = logging.getLogger(__name__)


def _is_platform_admin() -> bool:
    """Check if the current user is a platform-level admin (org admin of any org)."""
    from app.models.org_membership import OrganizationMembership
    if not current_user.is_authenticated:
        return False
    return db.session.query(OrganizationMembership).filter_by(
        user_id=current_user.id, role="admin", active=True
    ).first() is not None


@agent_bp.route("/status", methods=["GET"])
@login_required
def agent_status():
    """Return the last 5 AgentRun records. Admin-only."""
    if not _is_platform_admin():
        return jsonify({"error": "Admin access required."}), 403

    runs = (
        db.session.query(AgentRun)
        .order_by(AgentRun.triggered_at.desc())
        .limit(5)
        .all()
    )
    return jsonify({"runs": [r.to_dict() for r in runs]}), 200


@agent_bp.route("/run", methods=["POST"])
@login_required
def agent_run():
    """Manually trigger an agent run. Admin-only."""
    if not _is_platform_admin():
        return jsonify({"error": "Admin access required."}), 403

    try:
        from flask import current_app
        from agent.runner import run_manual

        result = run_manual(current_app._get_current_object())
        return jsonify({"success": True, "result": result}), 200
    except Exception as exc:
        logger.exception("Manual agent run failed")
        return jsonify({"error": f"Agent run failed: {exc}"}), 500


@agent_bp.route("/approve/<token>", methods=["GET"])
def agent_approve(token: str):
    """
    Execute a pending AgentApproval by token.

    No login required — the token IS the authorization.
    One-time use, expires after 24 hours.
    """
    approval = db.session.query(AgentApproval).filter_by(
        approval_token=token, executed=False
    ).first()

    if not approval:
        return jsonify({"error": "Invalid or already-used approval token."}), 404

    now = datetime.now(timezone.utc)
    if approval.expires_at.replace(tzinfo=timezone.utc) < now:
        return jsonify({"error": "This approval link has expired."}), 410

    # Execute the staged command
    try:
        result = _execute_command(approval.command_json)
        approval.executed = True
        approval.approved_at = now
        db.session.commit()

        logger.info(
            f"AgentApproval executed: action_id={approval.action_id}, "
            f"token={token[:8]}..."
        )
        return jsonify({
            "success": True,
            "action_id": approval.action_id,
            "description": approval.description,
            "result": result,
        }), 200

    except Exception as exc:
        logger.exception(f"AgentApproval execution failed: {exc}")
        db.session.rollback()
        return jsonify({"error": f"Execution failed: {exc}"}), 500


def _execute_command(command: dict) -> str:
    """
    Dispatch a staged command to the appropriate handler.

    Extend this as new approval-gated actions are added.
    """
    action = command.get("action")

    if action == "lock_user":
        from app.models.user import User
        user = db.session.get(User, command["user_id"])
        if not user:
            return "User not found."
        user.active = False
        db.session.commit()
        logger.warning(f"User {user.email} locked via agent approval")
        return f"User {user.email} has been deactivated."

    if action == "disable_stripe_checkout":
        # This would be implemented by setting a feature flag in config/cache
        # For now, log and return — implement when feature flags are added
        logger.warning("disable_stripe_checkout action triggered via approval")
        return "Stripe checkout disable request logged. Implement feature flag to activate."

    return f"Unknown action: {action}"
