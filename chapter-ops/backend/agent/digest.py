"""
Morning digest — assembles and sends the daily summary email to FOUNDER_EMAIL.

Structure:
  1. Status line
  2. Critical findings
  3. Warnings
  4. Actions taken autonomously
  5. Pending approvals
  6. Info / chapter insights
  7. Footer with run ID
"""

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agent.context import AgentContext

logger = logging.getLogger(__name__)


def send_digest(ctx: "AgentContext") -> None:
    """Build and send the morning digest email."""
    try:
        from flask import current_app
        from app.utils.email import send_email

        founder_email = current_app.config.get("FOUNDER_EMAIL")
        if not founder_email:
            logger.warning("FOUNDER_EMAIL not configured — skipping digest")
            return

        html = _build_html(ctx)
        subject = _build_subject(ctx)

        send_email(to=founder_email, subject=subject, html=html)
        logger.info(f"Morning digest sent to {founder_email} (run_id={ctx.run_id})")
    except Exception as exc:
        logger.exception(f"Digest send failed: {exc}")


def _build_subject(ctx: "AgentContext") -> str:
    severity = ctx.highest_severity
    criticals = len(ctx.findings_by_severity("critical"))
    warnings = len(ctx.findings_by_severity("warning"))

    if severity == "critical":
        return f"[ChapterOps Digest] 🚨 {criticals} critical issue(s) found"
    if severity == "warning":
        return f"[ChapterOps Digest] ⚠️ {warnings} warning(s) found"
    return "[ChapterOps Digest] ✅ All systems healthy"


def _build_html(ctx: "AgentContext") -> str:
    criticals = ctx.findings_by_severity("critical")
    warnings = ctx.findings_by_severity("warning")
    infos = ctx.findings_by_severity("info")

    status_color = {"ok": "#059669", "warning": "#d97706", "critical": "#dc2626"}.get(
        ctx.highest_severity, "#059669"
    )
    status_label = {
        "ok": "✅ All systems healthy",
        "warning": f"⚠️ {len(warnings)} warning(s) found, {len(ctx.actions_taken)} action(s) taken",
        "critical": f"🚨 {len(criticals)} critical issue(s) found",
    }.get(ctx.highest_severity, "✅ All systems healthy")

    sections = []

    # Status banner
    sections.append(f"""
        <div style="background: {status_color}; color: white; padding: 16px 24px;
                    border-radius: 8px; font-size: 18px; font-weight: 700; margin-bottom: 24px;">
            {status_label}
        </div>
    """)

    # Critical findings
    if criticals:
        sections.append(_section_html("🚨 Critical Findings", criticals, "#dc2626", "#2d0f0f"))

    # Warnings
    if warnings:
        sections.append(_section_html("⚠️ Warnings", warnings, "#d97706", "#2d1f0f"))

    # Actions taken
    if ctx.actions_taken:
        items = "".join(f"<li style='margin: 6px 0; color: #94a3c0;'>{a}</li>" for a in ctx.actions_taken)
        sections.append(f"""
            <div style="margin-bottom: 24px;">
                <h3 style="color: #f0f4fa; margin: 0 0 12px; font-size: 16px;">🤖 Actions Taken Autonomously</h3>
                <ul style="margin: 0; padding-left: 20px;">{items}</ul>
            </div>
        """)

    # Pending approvals
    if ctx.approval_requests:
        items = "".join(f"<li style='margin: 6px 0; color: #94a3c0;'>{a}</li>" for a in ctx.approval_requests)
        sections.append(f"""
            <div style="margin-bottom: 24px;">
                <h3 style="color: #f0f4fa; margin: 0 0 12px; font-size: 16px;">🔐 Pending Your Approval</h3>
                <ul style="margin: 0; padding-left: 20px;">{items}</ul>
                <p style="color: #5c6d8a; font-size: 13px; margin-top: 8px;">
                    Check your email for individual approval links (sent separately).
                </p>
            </div>
        """)

    # Info / chapter insights
    if infos:
        sections.append(_section_html("📊 Chapter Insights", infos, "#0f52ba", "#0a1128"))

    # All clear
    if not criticals and not warnings and not infos:
        sections.append("""
            <div style="padding: 24px; background: rgba(5,150,105,0.1); border-radius: 8px;
                        border: 1px solid rgba(5,150,105,0.3); text-align: center; margin-bottom: 24px;">
                <p style="color: #34d399; font-size: 16px; margin: 0;">
                    No issues detected. Platform is running smoothly.
                </p>
            </div>
        """)

    body_html = "\n".join(sections)

    return f"""
    <div style="font-family: 'Outfit', sans-serif; max-width: 680px; margin: 0 auto;
                background: #060b18; color: #f0f4fa; padding: 32px; border-radius: 12px;">
        <div style="margin-bottom: 28px; padding-bottom: 20px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);">
            <h1 style="font-family: Georgia, serif; color: #f0f4fa;
                       font-size: 26px; margin: 0 0 4px;">ChapterOps Morning Digest</h1>
            <p style="color: #5c6d8a; margin: 0; font-size: 14px;">
                {ctx.triggered_at.strftime("%A, %B %-d, %Y")}
            </p>
        </div>

        {body_html}

        <div style="margin-top: 32px; padding-top: 16px;
                    border-top: 1px solid rgba(255,255,255,0.08);">
            <p style="color: #5c6d8a; font-size: 11px; margin: 0;">
                ChapterOps Ops Agent &nbsp;·&nbsp;
                Run ID: {ctx.run_id} &nbsp;·&nbsp;
                {ctx.triggered_at.strftime("%Y-%m-%d %H:%M:%S UTC")}
            </p>
        </div>
    </div>
    """


def _section_html(title: str, findings: list, accent: str, bg: str) -> str:
    items = []
    for f in findings:
        rec = f"<p style='color: #5c6d8a; font-size: 13px; margin: 4px 0 0;'>→ {f.recommended_action}</p>" \
              if f.recommended_action else ""
        items.append(f"""
            <div style="background: {bg}; border: 1px solid {accent}33;
                        border-left: 3px solid {accent}; border-radius: 6px;
                        padding: 14px 16px; margin-bottom: 10px;">
                <p style="font-weight: 600; color: #f0f4fa; margin: 0 0 4px;">
                    [{f.check}] {f.summary}
                </p>
                <p style="color: #94a3c0; font-size: 13px; margin: 0;
                          white-space: pre-wrap;">{f.detail}</p>
                {rec}
            </div>
        """)

    return f"""
        <div style="margin-bottom: 28px;">
            <h3 style="color: #f0f4fa; margin: 0 0 14px; font-size: 16px;">{title}</h3>
            {"".join(items)}
        </div>
    """
