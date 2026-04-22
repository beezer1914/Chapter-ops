"""
Google reCAPTCHA v3 verification.

Called from /auth/login and /auth/register. Verification is skipped when
RECAPTCHA_SECRET_KEY is blank so local/CI environments don't need to set it.
"""

import json
import logging
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError

from flask import current_app, request

logger = logging.getLogger(__name__)

_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
_TIMEOUT_SECONDS = 5


def verify_recaptcha(token: str | None, expected_action: str) -> tuple[bool, str | None]:
    """
    Verify a reCAPTCHA v3 token against Google's siteverify endpoint.

    Returns (ok, error_message). ``ok=True`` when verification passes or is
    skipped. ``error_message`` is a user-safe string on failure.

    Fail-open contract: when RECAPTCHA_SECRET_KEY is not configured the call
    short-circuits to ``(True, None)``. In production, set the secret.
    """
    secret = current_app.config.get("RECAPTCHA_SECRET_KEY", "")
    if not secret:
        return True, None

    if not token:
        return False, "Captcha verification failed. Please try again."

    payload = urlencode({
        "secret": secret,
        "response": token,
        "remoteip": request.remote_addr or "",
    }).encode("utf-8")

    try:
        req = Request(_VERIFY_URL, data=payload, method="POST")
        with urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError) as e:
        # Fail open on transient Google outages rather than locking users out.
        logger.warning("reCAPTCHA verify unreachable: %s", e)
        return True, None

    if not body.get("success"):
        logger.info("reCAPTCHA rejected: %s", body.get("error-codes"))
        return False, "Captcha verification failed. Please try again."

    action = body.get("action")
    if action != expected_action:
        logger.info("reCAPTCHA action mismatch: got %r expected %r", action, expected_action)
        return False, "Captcha verification failed. Please try again."

    min_score = float(current_app.config.get("RECAPTCHA_MIN_SCORE", 0.5))
    score = float(body.get("score", 0.0))
    if score < min_score:
        logger.info("reCAPTCHA score too low: %.2f < %.2f", score, min_score)
        return False, "Captcha verification failed. Please try again."

    return True, None
