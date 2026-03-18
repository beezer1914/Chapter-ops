"""
Stripe Connect routes — /api/stripe/*

Handles OAuth connect flow for chapters to link their Stripe accounts.
Chapters connect via Standard Connect (OAuth), allowing direct charges
to land in their account with an optional platform application_fee.
"""

import stripe
from urllib.parse import urlencode

from flask import Blueprint, current_app, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.utils.decorators import chapter_required, role_required

stripe_connect_bp = Blueprint("stripe_connect", __name__, url_prefix="/api/stripe")


@stripe_connect_bp.route("/connect", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def get_connect_url():
    """
    Generate the Stripe OAuth URL for a chapter to connect their account.

    Treasurers and above can initiate the OAuth flow. The state parameter
    encodes the chapter_id and is validated in the callback.
    """
    chapter = g.current_chapter
    client_id = current_app.config["STRIPE_CLIENT_ID"]
    redirect_uri = current_app.config["STRIPE_CONNECT_REDIRECT_URI"]

    if not client_id:
        return jsonify({"error": "Stripe Connect is not configured on this platform."}), 503

    params = {
        "response_type": "code",
        "client_id": client_id,
        "scope": "read_write",
        "state": chapter.id,
        "redirect_uri": redirect_uri,
    }
    url = "https://connect.stripe.com/oauth/authorize?" + urlencode(params)
    return jsonify({"url": url}), 200


@stripe_connect_bp.route("/callback", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def stripe_callback():
    """
    Handle the OAuth callback from Stripe after user authorizes.

    The frontend StripeCallback page extracts ?code and ?state from the
    redirect URL, then calls this endpoint to complete the connection.
    """
    chapter = g.current_chapter
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        error_desc = request.args.get("error_description", "Stripe authorization was denied.")
        return jsonify({"error": error_desc}), 400

    if not code:
        return jsonify({"error": "Missing authorization code."}), 400

    # Validate state matches current chapter (CSRF protection)
    if state != str(chapter.id):
        return jsonify({"error": "Invalid state parameter. Please try connecting again."}), 400

    try:
        response = stripe.OAuth.token(
            grant_type="authorization_code",
            code=code,
        )
    except stripe.oauth_error.OAuthError as e:
        return jsonify({"error": str(e.user_message or e)}), 400
    except stripe.error.StripeError as e:
        return jsonify({"error": str(e.user_message or e)}), 400

    stripe_account_id = response.get("stripe_user_id")
    if not stripe_account_id:
        return jsonify({"error": "Failed to retrieve Stripe account ID."}), 500

    chapter.stripe_account_id = stripe_account_id
    chapter.stripe_onboarding_complete = True
    db.session.commit()

    return jsonify({
        "success": True,
        "stripe_account_id": stripe_account_id,
    }), 200


@stripe_connect_bp.route("/account", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def get_account_status():
    """
    Get the current chapter's Stripe Connect account status.

    Returns connected=false if the chapter hasn't linked a Stripe account.
    """
    chapter = g.current_chapter

    if not chapter.stripe_account_id:
        return jsonify({"connected": False}), 200

    try:
        account = stripe.Account.retrieve(chapter.stripe_account_id)
    except stripe.error.StripeError as e:
        return jsonify({"error": str(e.user_message or e)}), 502

    return jsonify({
        "connected": True,
        "stripe_account_id": chapter.stripe_account_id,
        "charges_enabled": account.get("charges_enabled", False),
        "payouts_enabled": account.get("payouts_enabled", False),
        "display_name": (
            account.get("settings", {}).get("dashboard", {}).get("display_name")
            or account.get("business_profile", {}).get("name")
            or chapter.name
        ),
    }), 200


@stripe_connect_bp.route("/disconnect", methods=["DELETE"])
@login_required
@chapter_required
@role_required("president")
def disconnect_stripe():
    """
    Disconnect the chapter's Stripe account.

    Requires president role. Deauthorizes the OAuth connection on Stripe's side
    (best-effort) and clears the stored account ID.
    """
    chapter = g.current_chapter

    if not chapter.stripe_account_id:
        return jsonify({"error": "No Stripe account is connected."}), 400

    client_id = current_app.config["STRIPE_CLIENT_ID"]
    try:
        stripe.OAuth.deauthorize(
            client_id=client_id,
            stripe_user_id=chapter.stripe_account_id,
        )
    except stripe.error.StripeError:
        # Best-effort: clear local record even if Stripe call fails
        pass

    chapter.stripe_account_id = None
    chapter.stripe_onboarding_complete = False
    db.session.commit()

    return jsonify({"success": True}), 200
