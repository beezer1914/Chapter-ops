import { useEffect, useState } from "react";
import {
  getStripeAccountStatus,
  getStripeConnectUrl,
  disconnectStripe,
} from "@/services/stripeService";
import { ROLE_HIERARCHY } from "./shared";
import type { MemberRole, StripeAccountStatus } from "@/types";

export default function StripeConnectSection({
  currentRole,
  setError,
  setSuccess,
}: {
  currentRole: MemberRole;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const isTreasurer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"];
  const isPresident = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"];

  const [status, setStatus] = useState<StripeAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isTreasurer) { setLoading(false); return; }
    getStripeAccountStatus()
      .then(setStatus)
      .catch(() => setError("Failed to load Stripe account status."))
      .finally(() => setLoading(false));
  }, [isTreasurer]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const url = await getStripeConnectUrl();
      window.location.href = url;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to initiate Stripe connection.";
      setError(msg);
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Stripe? Members will no longer be able to pay online.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectStripe();
      setStatus({ connected: false });
      setSuccess("Stripe account disconnected.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to disconnect Stripe.";
      setError(msg);
    } finally {
      setDisconnecting(false);
    }
  }

  if (!isTreasurer) {
    return (
      <div className="bg-surface-card-solid rounded-lg shadow p-6 text-content-secondary">
        You need Treasurer permissions or higher to manage payment settings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Stripe Connect</h3>
        <p className="text-sm text-content-secondary mb-4">
          Connect your chapter's Stripe account to accept online dues payments and donations.
          Members pay directly — funds go straight to your chapter's bank account.
        </p>

        {loading ? (
          <div className="text-sm text-content-muted">Loading Stripe status...</div>
        ) : status?.connected ? (
          <div className="space-y-4">
            {/* Connected status */}
            <div className="flex items-center gap-3 p-4 bg-emerald-900/20 rounded-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-emerald-400 text-sm">
                  {status.display_name ?? "Stripe account"} connected
                </div>
                <div className="flex gap-4 mt-1">
                  <span className={`text-xs ${status.charges_enabled ? "text-green-400" : "text-yellow-400"}`}>
                    {status.charges_enabled ? "✓ Charges enabled" : "⚠ Charges not yet enabled"}
                  </span>
                  <span className={`text-xs ${status.payouts_enabled ? "text-green-400" : "text-yellow-400"}`}>
                    {status.payouts_enabled ? "✓ Payouts enabled" : "⚠ Payouts not yet enabled"}
                  </span>
                </div>
              </div>
              <span className="text-xs text-content-muted font-mono">{status.stripe_account_id}</span>
            </div>

            {!status.charges_enabled && (
              <div className="p-3 bg-yellow-900/20 text-yellow-400 text-sm rounded-lg">
                Your Stripe account needs additional verification before charges are enabled.
                Log into your Stripe Dashboard to complete onboarding.
              </div>
            )}

            {isPresident && (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20 rounded-lg hover:bg-red-900/30 disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect Stripe"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-400 flex-shrink-0" />
              <span className="text-sm text-content-secondary">No Stripe account connected</span>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {connecting ? "Redirecting to Stripe..." : "Connect Stripe Account"}
            </button>
            <p className="text-xs text-content-muted">
              You'll be redirected to Stripe to authorize the connection. You can connect an existing
              Stripe account or create a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
