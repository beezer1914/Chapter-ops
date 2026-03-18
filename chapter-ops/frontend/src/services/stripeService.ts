import api from "@/lib/api";
import type {
  StripeAccountStatus,
  StripeDuesCheckoutRequest,
  StripeDonationCheckoutRequest,
} from "@/types";

// ── Stripe Connect ────────────────────────────────────────────────────────────

export async function getStripeConnectUrl(): Promise<string> {
  const res = await api.get("/stripe/connect");
  return res.data.url;
}

export async function handleStripeCallback(
  code: string,
  state: string,
): Promise<void> {
  await api.get("/stripe/callback", { params: { code, state } });
}

export async function getStripeAccountStatus(): Promise<StripeAccountStatus> {
  const res = await api.get("/stripe/account");
  return res.data;
}

export async function disconnectStripe(): Promise<void> {
  await api.delete("/stripe/disconnect");
}

// ── Checkout Sessions ─────────────────────────────────────────────────────────

export async function createDuesCheckout(
  data: StripeDuesCheckoutRequest,
): Promise<string> {
  const res = await api.post("/payments/checkout", data);
  return res.data.checkout_url;
}

export async function createInstallmentCheckout(
  planId: string,
  amount?: number,
): Promise<string> {
  const res = await api.post(`/payments/plans/${planId}/checkout`, amount !== undefined ? { amount } : {});
  return res.data.checkout_url;
}

export async function createDonationCheckout(
  data: StripeDonationCheckoutRequest,
): Promise<string> {
  const res = await api.post("/donations/checkout", data);
  return res.data.checkout_url;
}
