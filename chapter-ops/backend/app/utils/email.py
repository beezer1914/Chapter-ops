"""
Email sending utilities via Resend.

Usage:
    from app.utils.email import send_email, send_invite_email

All functions return True on success, False on failure (errors are logged,
not raised, so a failed email never breaks the request that triggered it).
"""

import logging

import resend
from flask import current_app

logger = logging.getLogger(__name__)


def _client() -> None:
    """Set the Resend API key from app config (must be called inside a request context)."""
    resend.api_key = current_app.config["RESEND_API_KEY"]


def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    from_email: str | None = None,
) -> bool:
    """
    Send an email via Resend.

    Args:
        to: Recipient address or list of addresses.
        subject: Email subject line.
        html: HTML body content.
        from_email: Sender address. Defaults to RESEND_FROM_EMAIL config value.

    Returns:
        True if the email was accepted by Resend, False otherwise.
    """
    _client()
    sender = from_email or current_app.config["RESEND_FROM_EMAIL"]
    recipients = [to] if isinstance(to, str) else to

    payload: dict = {
        "from": sender,
        "to": recipients,
        "subject": subject,
        "html": html,
    }
    reply_to = current_app.config.get("RESEND_REPLY_TO")
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        resend.Emails.send(payload)
        logger.info(f"Email sent: '{subject}' → {recipients}")
        return True
    except Exception as exc:
        logger.error(f"Failed to send email '{subject}' to {recipients}: {exc}")
        return False


# ---------------------------------------------------------------------------
# Invite emails
# ---------------------------------------------------------------------------

def send_invite_email(
    to: str,
    invite_code: str,
    chapter_name: str,
    inviter_name: str,
    expires_at: str,
) -> bool:
    """Send a chapter invite email."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    register_url = f"{frontend_url}/register?invite={invite_code}"

    html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to join {chapter_name}</h2>
        <p>{inviter_name} has invited you to join <strong>{chapter_name}</strong> on ChapterOps.</p>
        <p>
            <a href="{register_url}"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Accept Invitation
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Or copy this link: <a href="{register_url}">{register_url}</a>
        </p>
        <p style="color:#6b7280;font-size:14px;">This invitation expires on {expires_at}.</p>
    </div>
    """

    return send_email(
        to=to,
        subject=f"You're invited to join {chapter_name}",
        html=html,
    )


# ---------------------------------------------------------------------------
# Password reset emails
# ---------------------------------------------------------------------------

def send_password_reset_email(to: str, reset_token: str, user_name: str) -> bool:
    """Send a password reset email."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"

    html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>Hi {user_name},</p>
        <p>We received a request to reset your ChapterOps password. Click the button below to choose a new one.</p>
        <p>
            <a href="{reset_url}"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Reset Password
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Or copy this link: <a href="{reset_url}">{reset_url}</a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
    </div>
    """

    return send_email(
        to=to,
        subject="Reset your ChapterOps password",
        html=html,
    )


# ---------------------------------------------------------------------------
# Chapter data export email (sent before scheduled deletion)
# ---------------------------------------------------------------------------

def send_chapter_data_export_email(
    to: str,
    chapter_name: str,
    deletion_date: str,
    members_csv: str,
    payments_csv: str,
    donations_csv: str,
) -> bool:
    """
    Send a chapter data export email with CSV attachments via Resend.

    Called when a president requests chapter deletion. The 30-day grace
    period gives the chapter time to download their data before purge.
    """
    _client()
    sender = current_app.config["RESEND_FROM_EMAIL"]

    html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Chapter Data Export — {chapter_name}</h2>
        <p>Your chapter deletion request has been received. Your chapter and all associated
           data will be permanently deleted on <strong>{deletion_date}</strong>.</p>
        <p>Your data export is attached to this email as CSV files:</p>
        <ul>
            <li><strong>members.csv</strong> — Full member roster with roles and financial status</li>
            <li><strong>payments.csv</strong> — Complete payment history</li>
            <li><strong>donations.csv</strong> — Donation records</li>
        </ul>
        <p style="color:#6b7280;font-size:14px;">
            To cancel the deletion request, log in to ChapterOps and visit
            Settings → Chapter before {deletion_date}.
        </p>
        <p style="color:#dc2626;font-size:14px;">
            <strong>This action is irreversible after the grace period.</strong>
            Financial records are anonymized and retained for 7 years per accounting regulations.
        </p>
    </div>
    """

    payload: dict = {
        "from": sender,
        "to": [to],
        "subject": f"Chapter Data Export — {chapter_name} (deletion scheduled {deletion_date})",
        "html": html,
        "attachments": [
            {"filename": "members.csv", "content": list(members_csv.encode("utf-8"))},
            {"filename": "payments.csv", "content": list(payments_csv.encode("utf-8"))},
            {"filename": "donations.csv", "content": list(donations_csv.encode("utf-8"))},
        ],
    }
    reply_to = current_app.config.get("RESEND_REPLY_TO")
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        resend.Emails.send(payload)
        logger.info(f"Chapter data export email sent to {to} for '{chapter_name}'")
        return True
    except Exception as exc:
        logger.error(f"Failed to send chapter data export email: {exc}")
        return False


# ---------------------------------------------------------------------------
# Ops agent digest email
# ---------------------------------------------------------------------------

def send_digest(subject: str, html_body: str) -> bool:
    """Send the ops agent morning digest to the founder email."""
    founder_email = current_app.config.get("FOUNDER_EMAIL")
    if not founder_email:
        logger.warning("FOUNDER_EMAIL not configured — digest not sent")
        return False
    return send_email(to=founder_email, subject=subject, html=html_body)
