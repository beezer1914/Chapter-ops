"""Tests for the shared Stripe Connect OAuth service."""

from unittest.mock import patch, MagicMock
import pytest
import stripe

from app.services.stripe_connect_service import (
    exchange_oauth_code,
    retrieve_account_status,
    deauthorize_account,
    StripeConnectError,
)


class TestExchangeOAuthCode:
    def test_returns_stripe_account_id(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "token") as mock_token:
            mock_token.return_value = {"stripe_user_id": "acct_123"}
            account_id = exchange_oauth_code(code="ac_test_code")
            assert account_id == "acct_123"
            mock_token.assert_called_once_with(
                grant_type="authorization_code", code="ac_test_code"
            )

    def test_raises_on_missing_account_id(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "token") as mock_token:
            mock_token.return_value = {}
            with pytest.raises(StripeConnectError, match="stripe account"):
                exchange_oauth_code(code="ac_test_code")

    def test_raises_on_stripe_oauth_error(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "token") as mock_token:
            err = stripe.oauth_error.OAuthError("invalid_grant", "Bad code")
            mock_token.side_effect = err
            with pytest.raises(StripeConnectError, match="Bad code"):
                exchange_oauth_code(code="ac_bad")


class TestRetrieveAccountStatus:
    def test_returns_account_status_dict(self, app):
        fake_account = MagicMock()
        fake_account.get = lambda k, d=None: {
            "charges_enabled": True,
            "payouts_enabled": False,
            "settings": {"dashboard": {"display_name": "Acme"}},
            "business_profile": {},
        }.get(k, d)

        with app.app_context(), patch.object(stripe.Account, "retrieve", return_value=fake_account):
            status = retrieve_account_status("acct_123", fallback_display_name="Fallback")
            assert status["charges_enabled"] is True
            assert status["payouts_enabled"] is False
            assert status["display_name"] == "Acme"

    def test_falls_back_to_display_name_when_missing(self, app):
        fake_account = MagicMock()
        fake_account.get = lambda k, d=None: {
            "charges_enabled": True,
            "payouts_enabled": True,
            "settings": {"dashboard": {}},
            "business_profile": {},
        }.get(k, d)

        with app.app_context(), patch.object(stripe.Account, "retrieve", return_value=fake_account):
            status = retrieve_account_status("acct_123", fallback_display_name="Fallback Name")
            assert status["display_name"] == "Fallback Name"


class TestDeauthorize:
    def test_calls_stripe_oauth_deauthorize(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "deauthorize") as mock_deauth:
            deauthorize_account("acct_123")
            mock_deauth.assert_called_once()
            kwargs = mock_deauth.call_args.kwargs
            assert kwargs["stripe_user_id"] == "acct_123"

    def test_swallows_stripe_errors(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "deauthorize") as mock_deauth:
            mock_deauth.side_effect = stripe.error.StripeError("already revoked")
            # Must not raise — caller may still want to clear local state
            deauthorize_account("acct_123")
