import api from "@/lib/api";
import type {
  PaymentWithUser,
  Payment,
  CreatePaymentRequest,
  PaymentSummary,
  PaymentPlanWithUser,
  CreatePaymentPlanRequest,
  DonationWithUser,
  CreateDonationRequest,
} from "@/types";

// ── Payments ─────────────────────────────────────────────────────────────────

export async function fetchPayments(params?: {
  user_id?: string;
  payment_type?: string;
  method?: string;
  start_date?: string;
  end_date?: string;
}): Promise<PaymentWithUser[]> {
  const response = await api.get("/payments", { params });
  return response.data.payments;
}

export async function createPayment(
  data: CreatePaymentRequest
): Promise<PaymentWithUser> {
  const response = await api.post("/payments", data);
  return response.data.payment;
}

export async function fetchPaymentSummary(): Promise<PaymentSummary> {
  const response = await api.get("/payments/summary");
  return response.data;
}

export async function fetchMyPayments(): Promise<Payment[]> {
  const response = await api.get("/payments/mine");
  return response.data.payments;
}

// ── Payment Plans ────────────────────────────────────────────────────────────

export async function fetchPaymentPlans(
  mine?: boolean
): Promise<PaymentPlanWithUser[]> {
  const response = await api.get("/payment-plans", {
    params: mine ? { mine: "true" } : undefined,
  });
  return response.data.plans;
}

export async function createPaymentPlan(
  data: CreatePaymentPlanRequest
): Promise<PaymentPlanWithUser> {
  const response = await api.post("/payment-plans", data);
  return response.data.plan;
}

export async function fetchPlanDetail(
  planId: string
): Promise<PaymentPlanWithUser> {
  const response = await api.get(`/payment-plans/${planId}`);
  return response.data.plan;
}

export async function cancelPlan(
  planId: string
): Promise<PaymentPlanWithUser> {
  const response = await api.patch(`/payment-plans/${planId}`, {
    status: "cancelled",
  });
  return response.data.plan;
}

// ── Donations ────────────────────────────────────────────────────────────────

export async function fetchDonations(params?: {
  method?: string;
}): Promise<DonationWithUser[]> {
  const response = await api.get("/donations", { params });
  return response.data.donations;
}

export async function createDonation(
  data: CreateDonationRequest
): Promise<DonationWithUser> {
  const response = await api.post("/donations", data);
  return response.data.donation;
}
