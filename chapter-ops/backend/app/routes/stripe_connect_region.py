"""Stripe Connect routes — /api/stripe/region/<region_id>/*

Handles OAuth connect flow for regions to link their Stripe accounts.
Regional treasurers (or org admins, via region_role_required) can initiate
the flow.
"""

import secrets
from urllib.parse import urlencode

from flask import Blueprint, current_app, g, jsonify, request, session
from flask_login import login_required

from app.extensions import db
from app.utils.audit import record_audit
from app.utils.decorators import region_role_required

stripe_connect_region_bp = Blueprint(
    "stripe_connect_region", __name__, url_prefix="/api/stripe/region"
)


@stripe_connect_region_bp.route("/<region_id>/connect", methods=["GET"])
@login_required
@region_role_required("regional_treasurer")
def get_connect_url(region_id):
    region = g.current_region
    client_id = current_app.config["STRIPE_CLIENT_ID"]
    redirect_uri = current_app.config["STRIPE_CONNECT_REDIRECT_URI"]

    if not client_id:
        return jsonify({"error": "Stripe Connect is not configured on this platform."}), 503

    state_token = secrets.token_urlsafe(32)
    session[f"stripe_oauth_state_region_{region.id}"] = state_token

    params = {
        "response_type": "code",
        "client_id": client_id,
        "scope": "read_write",
        "state": state_token,
        "redirect_uri": redirect_uri,
    }
    url = "https://connect.stripe.com/oauth/authorize?" + urlencode(params)
    return jsonify({"url": url}), 200


@stripe_connect_region_bp.route("/<region_id>/callback", methods=["GET"])
@login_required
@region_role_required("regional_treasurer")
def stripe_callback(region_id):
    from app.services.stripe_connect_service import (
        exchange_oauth_code,
        StripeConnectError,
    )

    region = g.current_region
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        error_desc = request.args.get(
            "error_description", "Stripe authorization was denied."
        )
        return jsonify({"error": error_desc}), 400

    if not code:
        return jsonify({"error": "Missing authorization code."}), 400

    expected_state = session.pop(f"stripe_oauth_state_region_{region.id}", None)
    if not expected_state or state != expected_state:
        return jsonify({
            "error": "Invalid state parameter. Please try connecting again."
        }), 400

    try:
        stripe_account_id = exchange_oauth_code(code)
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 400

    region.stripe_account_id = stripe_account_id
    region.stripe_onboarding_complete = True
    record_audit(
        event_type="stripe_connect.region.connect",
        target_type="region",
        target_id=region.id,
        details={"stripe_account_id": stripe_account_id},
    )
    db.session.commit()

    return jsonify({
        "success": True,
        "stripe_account_id": stripe_account_id,
    }), 200


@stripe_connect_region_bp.route("/<region_id>/account", methods=["GET"])
@login_required
@region_role_required("regional_treasurer")
def get_account_status(region_id):
    from app.services.stripe_connect_service import (
        retrieve_account_status,
        StripeConnectError,
    )

    region = g.current_region

    if not region.stripe_account_id:
        return jsonify({"connected": False}), 200

    try:
        status = retrieve_account_status(
            region.stripe_account_id,
            fallback_display_name=region.name,
        )
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "connected": True,
        "stripe_account_id": region.stripe_account_id,
        **status,
    }), 200


@stripe_connect_region_bp.route("/<region_id>/disconnect", methods=["DELETE"])
@login_required
@region_role_required("regional_treasurer")
def disconnect_stripe(region_id):
    from app.services.stripe_connect_service import deauthorize_account

    region = g.current_region

    if not region.stripe_account_id:
        return jsonify({"error": "No Stripe account is connected."}), 400

    deauthorize_account(region.stripe_account_id)

    previous_account_id = region.stripe_account_id
    record_audit(
        event_type="stripe_connect.region.disconnect",
        target_type="region",
        target_id=region.id,
        details={"stripe_account_id": previous_account_id},
    )
    region.stripe_account_id = None
    region.stripe_onboarding_complete = False
    db.session.commit()

    return jsonify({"success": True}), 200
