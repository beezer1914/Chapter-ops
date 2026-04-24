"""
Stripe Connect routes — /api/stripe/*

Handles OAuth connect flow for chapters to link their Stripe accounts.
Chapters connect via Standard Connect (OAuth), allowing direct charges
to land in their account with an optional platform application_fee.
"""

import secrets
from urllib.parse import urlencode

from flask import Blueprint, current_app, g, jsonify, request, session
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

    state_token = secrets.token_urlsafe(32)
    session["stripe_oauth_state"] = state_token

    params = {
        "response_type": "code",
        "client_id": client_id,
        "scope": "read_write",
        "state": state_token,
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
    from app.services.stripe_connect_service import (
        exchange_oauth_code,
        StripeConnectError,
    )

    chapter = g.current_chapter
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        error_desc = request.args.get("error_description", "Stripe authorization was denied.")
        return jsonify({"error": error_desc}), 400

    if not code:
        return jsonify({"error": "Missing authorization code."}), 400

    expected_state = session.pop("stripe_oauth_state", None)
    if not expected_state or state != expected_state:
        return jsonify({"error": "Invalid state parameter. Please try connecting again."}), 400

    try:
        stripe_account_id = exchange_oauth_code(code)
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 400

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
    from app.services.stripe_connect_service import (
        retrieve_account_status,
        StripeConnectError,
    )

    chapter = g.current_chapter

    if not chapter.stripe_account_id:
        return jsonify({"connected": False}), 200

    try:
        status = retrieve_account_status(
            chapter.stripe_account_id,
            fallback_display_name=chapter.name,
        )
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "connected": True,
        "stripe_account_id": chapter.stripe_account_id,
        **status,
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
    from app.services.stripe_connect_service import deauthorize_account

    chapter = g.current_chapter

    if not chapter.stripe_account_id:
        return jsonify({"error": "No Stripe account is connected."}), 400

    deauthorize_account(chapter.stripe_account_id)

    chapter.stripe_account_id = None
    chapter.stripe_onboarding_complete = False
    db.session.commit()

    return jsonify({"success": True}), 200
