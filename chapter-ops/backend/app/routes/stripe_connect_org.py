"""Stripe Connect routes — /api/stripe/org/<org_id>/*

Handles OAuth connect flow for organizations to link their Stripe accounts.
Only organization admins can initiate the flow.
"""

import secrets
from urllib.parse import urlencode

from flask import Blueprint, current_app, g, jsonify, request, session
from flask_login import login_required

from app.extensions import db
from app.utils.audit import record_audit
from app.utils.decorators import org_admin_required

stripe_connect_org_bp = Blueprint(
    "stripe_connect_org", __name__, url_prefix="/api/stripe/org"
)


@stripe_connect_org_bp.route("/<org_id>/connect", methods=["GET"])
@login_required
@org_admin_required
def get_connect_url(org_id):
    """Generate the Stripe OAuth URL for an organization to connect their account."""
    org = g.current_organization
    client_id = current_app.config["STRIPE_CLIENT_ID"]
    redirect_uri = current_app.config["STRIPE_CONNECT_REDIRECT_URI"]

    if not client_id:
        return jsonify({"error": "Stripe Connect is not configured on this platform."}), 503

    state_token = secrets.token_urlsafe(32)
    session[f"stripe_oauth_state_org_{org.id}"] = state_token

    params = {
        "response_type": "code",
        "client_id": client_id,
        "scope": "read_write",
        "state": state_token,
        "redirect_uri": redirect_uri,
    }
    url = "https://connect.stripe.com/oauth/authorize?" + urlencode(params)
    return jsonify({"url": url}), 200


@stripe_connect_org_bp.route("/<org_id>/callback", methods=["GET"])
@login_required
@org_admin_required
def stripe_callback(org_id):
    """Handle the OAuth callback from Stripe after the org admin authorizes."""
    from app.services.stripe_connect_service import (
        exchange_oauth_code,
        StripeConnectError,
    )

    org = g.current_organization
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

    expected_state = session.pop(f"stripe_oauth_state_org_{org.id}", None)
    if not expected_state or state != expected_state:
        return jsonify({
            "error": "Invalid state parameter. Please try connecting again."
        }), 400

    try:
        stripe_account_id = exchange_oauth_code(code)
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 400

    org.stripe_account_id = stripe_account_id
    org.stripe_onboarding_complete = True
    record_audit(
        event_type="stripe_connect.organization.connect",
        target_type="organization",
        target_id=org.id,
        details={"stripe_account_id": stripe_account_id},
    )
    db.session.commit()

    return jsonify({
        "success": True,
        "stripe_account_id": stripe_account_id,
    }), 200


@stripe_connect_org_bp.route("/<org_id>/account", methods=["GET"])
@login_required
@org_admin_required
def get_account_status(org_id):
    """Return the organization's Stripe Connect account status."""
    from app.services.stripe_connect_service import (
        retrieve_account_status,
        StripeConnectError,
    )

    org = g.current_organization

    if not org.stripe_account_id:
        return jsonify({"connected": False}), 200

    try:
        status = retrieve_account_status(
            org.stripe_account_id,
            fallback_display_name=org.name,
        )
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "connected": True,
        "stripe_account_id": org.stripe_account_id,
        **status,
    }), 200


@stripe_connect_org_bp.route("/<org_id>/disconnect", methods=["DELETE"])
@login_required
@org_admin_required
def disconnect_stripe(org_id):
    """Disconnect the organization's Stripe account."""
    from app.services.stripe_connect_service import deauthorize_account

    org = g.current_organization

    if not org.stripe_account_id:
        return jsonify({"error": "No Stripe account is connected."}), 400

    deauthorize_account(org.stripe_account_id)

    previous_account_id = org.stripe_account_id
    record_audit(
        event_type="stripe_connect.organization.disconnect",
        target_type="organization",
        target_id=org.id,
        details={"stripe_account_id": previous_account_id},
    )
    org.stripe_account_id = None
    org.stripe_onboarding_complete = False
    db.session.commit()

    return jsonify({"success": True}), 200
