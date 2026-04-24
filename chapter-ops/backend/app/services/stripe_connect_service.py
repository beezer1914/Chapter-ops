"""Shared Stripe Connect OAuth service.

Used by chapter, region, and organization Stripe Connect routes.
Raises ``StripeConnectError`` for any recoverable Stripe API issue so
callers can return a user-friendly 400 response.
"""

from flask import current_app
import stripe


class StripeConnectError(Exception):
    """Raised for recoverable Stripe Connect OAuth / API errors."""


def exchange_oauth_code(code: str) -> str:
    """
    Exchange an OAuth ``code`` for a connected ``stripe_user_id``.

    Raises ``StripeConnectError`` on any Stripe failure or missing id.
    """
    try:
        response = stripe.OAuth.token(grant_type="authorization_code", code=code)
    except stripe.oauth_error.OAuthError as e:
        raise StripeConnectError(str(e.user_message or e))
    except stripe.error.StripeError as e:
        raise StripeConnectError(str(e.user_message or e))

    account_id = response.get("stripe_user_id")
    if not account_id:
        raise StripeConnectError("Failed to retrieve stripe account id from OAuth response.")
    return account_id


def retrieve_account_status(stripe_account_id: str, fallback_display_name: str) -> dict:
    """
    Return a dict describing the connected account's current status.

    Fields: ``charges_enabled``, ``payouts_enabled``, ``display_name``.
    ``display_name`` falls back to ``fallback_display_name`` when Stripe
    has no configured label for the account.
    """
    try:
        account = stripe.Account.retrieve(stripe_account_id)
    except stripe.error.StripeError as e:
        raise StripeConnectError(str(e.user_message or e))

    return {
        "charges_enabled": account.get("charges_enabled", False),
        "payouts_enabled": account.get("payouts_enabled", False),
        "display_name": (
            account.get("settings", {}).get("dashboard", {}).get("display_name")
            or account.get("business_profile", {}).get("name")
            or fallback_display_name
        ),
    }


def deauthorize_account(stripe_account_id: str) -> None:
    """
    Best-effort OAuth deauthorize. Swallows Stripe errors because the
    caller still wants to clear local state even if Stripe rejects
    the deauthorize (e.g., token already revoked).
    """
    client_id = current_app.config["STRIPE_CLIENT_ID"]
    try:
        stripe.OAuth.deauthorize(
            client_id=client_id,
            stripe_user_id=stripe_account_id,
        )
    except stripe.error.StripeError:
        pass
