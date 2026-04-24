"""
Email sending utilities via Resend.

Usage:
    from app.utils.email import send_email, send_invite_email

All functions return True on success, False on failure (errors are logged,
not raised, so a failed email never breaks the request that triggered it).
"""

import html
import logging

import resend
from flask import current_app

logger = logging.getLogger(__name__)


def _h(value) -> str:
    """HTML-escape user-controlled content before interpolating into email bodies.

    Names, chapter names, notes and any other DB-backed strings are user-set;
    interpolating them raw lets someone inject markup into every recipient's
    inbox by editing their profile. Always wrap user content with _h().
    """
    return html.escape(str(value) if value is not None else "", quote=True)


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

    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to join {_h(chapter_name)}</h2>
        <p>{_h(inviter_name)} has invited you to join <strong>{_h(chapter_name)}</strong> on ChapterOps.</p>
        <p>
            <a href="{register_url}"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Accept Invitation
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Or copy this link: <a href="{register_url}">{register_url}</a>
        </p>
        <p style="color:#6b7280;font-size:14px;">This invitation expires on {_h(expires_at)}.</p>
    </div>
    """

    return send_email(
        to=to,
        subject=f"You're invited to join {chapter_name}",
        html=body,
    )


# ---------------------------------------------------------------------------
# Password reset emails
# ---------------------------------------------------------------------------

def send_password_reset_email(to: str, reset_token: str, user_name: str) -> bool:
    """Send a password reset email."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"

    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>Hi {_h(user_name)},</p>
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
        html=body,
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

    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Chapter Data Export — {_h(chapter_name)}</h2>
        <p>Your chapter deletion request has been received. Your chapter and all associated
           data will be permanently deleted on <strong>{_h(deletion_date)}</strong>.</p>
        <p>Your data export is attached to this email as CSV files:</p>
        <ul>
            <li><strong>members.csv</strong> — Full member roster with roles and financial status</li>
            <li><strong>payments.csv</strong> — Complete payment history</li>
            <li><strong>donations.csv</strong> — Donation records</li>
        </ul>
        <p style="color:#6b7280;font-size:14px;">
            To cancel the deletion request, log in to ChapterOps and visit
            Settings → Chapter before {_h(deletion_date)}.
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
        "html": body,
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
# Payment plan reminder emails
# ---------------------------------------------------------------------------

def _money(amount) -> str:
    """Format a Decimal/float as $X.XX."""
    return f"${amount:,.2f}"


def _pay_link() -> str:
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    return f"{frontend_url}/my-dues"


def send_installment_upcoming_email(
    to: str,
    user_name: str,
    chapter_name: str,
    installment_amount,
    due_date,
    remaining_balance,
) -> bool:
    """Friendly heads-up a few days before an installment is due."""
    pay_url = _pay_link()
    due_str = due_date.strftime("%B %d, %Y") if hasattr(due_date, "strftime") else str(due_date)

    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="color:#111827;">Hi {_h(user_name)},</h2>
        <p>A heads-up that your next installment for <strong>{_h(chapter_name)}</strong> is coming up.</p>
        <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:15px;">
            <tr>
                <td style="padding:8px 0; color:#6b7280;">Amount due</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">{_money(installment_amount)}</td>
            </tr>
            <tr>
                <td style="padding:8px 0; color:#6b7280;">Due date</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">{_h(due_str)}</td>
            </tr>
            <tr>
                <td style="padding:8px 0; color:#6b7280;">Plan balance remaining</td>
                <td style="padding:8px 0; text-align:right;">{_money(remaining_balance)}</td>
            </tr>
        </table>
        <p>
            <a href="{pay_url}"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Pay installment
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            You can also log in to ChapterOps to view your full payment history.
        </p>
    </div>
    """

    return send_email(
        to=to,
        subject=f"[{chapter_name}] Installment due {due_str}",
        html=body,
    )


def send_installment_delinquent_email(
    to: str,
    user_name: str,
    chapter_name: str,
    installment_amount,
    original_due_date,
    days_past_due: int,
    remaining_balance,
) -> bool:
    """Kind but urgent nudge for an overdue installment, with options."""
    pay_url = _pay_link()
    due_str = (
        original_due_date.strftime("%B %d, %Y")
        if hasattr(original_due_date, "strftime") else str(original_due_date)
    )

    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <h2 style="color:#111827;">Hi {_h(user_name)},</h2>
        <p>Your installment for <strong>{_h(chapter_name)}</strong> was due on <strong>{_h(due_str)}</strong>
           ({days_past_due} day{'s' if days_past_due != 1 else ''} ago). We wanted to check in.</p>
        <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:15px;">
            <tr>
                <td style="padding:8px 0; color:#6b7280;">Amount overdue</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">{_money(installment_amount)}</td>
            </tr>
            <tr>
                <td style="padding:8px 0; color:#6b7280;">Plan balance remaining</td>
                <td style="padding:8px 0; text-align:right;">{_money(remaining_balance)}</td>
            </tr>
        </table>
        <p>We know things come up. A few options:</p>
        <ul style="line-height:1.8;">
            <li><a href="{pay_url}" style="color:#1d4ed8;">Pay the installment now</a></li>
            <li>Reach out to your chapter treasurer if you need to adjust your plan</li>
            <li>Log in to review your plan or update your payment method</li>
        </ul>
        <p style="margin-top:24px;">
            <a href="{pay_url}"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Pay now
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            If you've already paid, please disregard this message — it may take a day to update.
        </p>
    </div>
    """

    return send_email(
        to=to,
        subject=f"[{chapter_name}] Installment overdue — let's get this sorted",
        html=body,
    )


# ---------------------------------------------------------------------------
# Email change verification
# ---------------------------------------------------------------------------

def send_email_change_confirm(
    to: str,
    token: str,
    user_name: str,
    new_email: str,
) -> bool:
    """Send a confirmation link to the NEW email address to activate an email change."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    confirm_url = f"{frontend_url}/confirm-email-change?token={token}"

    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Confirm your new email</h2>
        <p>Hi {_h(user_name)},</p>
        <p>You requested to change your ChapterOps account email to <strong>{_h(new_email)}</strong>.
           Click the button below to confirm this change.</p>
        <p>
            <a href="{confirm_url}"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Confirm email change
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Or copy this link: <a href="{confirm_url}">{confirm_url}</a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            This link expires in 1 hour. If you didn't request this change, ignore this email —
            your account email will not be updated.
        </p>
    </div>
    """

    return send_email(
        to=to,
        subject="Confirm your new ChapterOps email",
        html=body,
    )


def send_email_change_notice(
    to: str,
    user_name: str,
    new_email: str,
) -> bool:
    """Notify the OLD email that an email-change was requested, so the original
    owner can react if the account is compromised."""
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Email change requested</h2>
        <p>Hi {_h(user_name)},</p>
        <p>Someone requested to change the email on your ChapterOps account from this address
           to <strong>{_h(new_email)}</strong>.</p>
        <p>If that was you, no action is needed — the new address must click a confirmation link
           for the change to take effect.</p>
        <p style="color:#dc2626;">
            <strong>If this wasn't you</strong>, your account may be compromised. Sign in now and
            change your password immediately, then contact support.
        </p>
    </div>
    """

    return send_email(
        to=to,
        subject="Email change requested on your ChapterOps account",
        html=body,
    )


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


# ---------------------------------------------------------------------------
# Chapter request lifecycle emails
# ---------------------------------------------------------------------------

def send_chapter_request_submitted_email(
    to: str,
    approver_name: str,
    requester_name: str,
    requester_email: str,
    chapter_name: str,
    organization_name: str,
    region_name: str,
) -> bool:
    """Notify an approver that a new chapter request is waiting."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New chapter request</h2>
        <p>Hi {_h(approver_name)},</p>
        <p>{_h(requester_name)} ({_h(requester_email)}) has requested to create a new chapter:</p>
        <ul style="line-height:1.8;">
            <li><strong>Chapter:</strong> {_h(chapter_name)}</li>
            <li><strong>Organization:</strong> {_h(organization_name)}</li>
            <li><strong>Region:</strong> {_h(region_name)}</li>
        </ul>
        <p>
            <a href="{frontend_url}/ihq"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Review in IHQ Dashboard
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Review the request and approve or reject it from the Pending Chapter Requests section.
        </p>
    </div>
    """
    return send_email(
        to=to,
        subject=f"New chapter request: {chapter_name} ({organization_name})",
        html=body,
    )


def send_chapter_request_approved_email(
    to: str,
    requester_name: str,
    chapter_name: str,
) -> bool:
    """Notify the requester that their chapter was approved."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your chapter has been approved</h2>
        <p>Hi {_h(requester_name)},</p>
        <p>Great news — <strong>{_h(chapter_name)}</strong> has been approved and your chapter is now live on ChapterOps.</p>
        <p>
            <a href="{frontend_url}/dashboard"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Go to your dashboard
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Next steps: invite your officers, configure your fee types, and start tracking dues.
        </p>
    </div>
    """
    return send_email(
        to=to,
        subject="Your chapter has been approved — welcome to ChapterOps",
        html=body,
    )


def send_chapter_request_rejected_email(
    to: str,
    requester_name: str,
    chapter_name: str,
    reason: str,
) -> bool:
    """Notify the requester that their chapter request was rejected."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your chapter request was not approved</h2>
        <p>Hi {_h(requester_name)},</p>
        <p>Your request to create <strong>{_h(chapter_name)}</strong> on ChapterOps was not approved.</p>
        <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:20px 0;">
            <strong>Reason:</strong><br>
            {_h(reason)}
        </div>
        <p>You can submit a new request anytime if the situation changes.</p>
        <p>
            <a href="{frontend_url}/onboarding"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Start a new request
            </a>
        </p>
    </div>
    """
    return send_email(
        to=to,
        subject="Your chapter request was not approved",
        html=body,
    )
