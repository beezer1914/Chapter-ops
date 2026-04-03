import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import {
  fetchPayments,
  fetchMyPayments,
  createPayment,
  fetchPaymentSummary,
  fetchPaymentPlans,
  createPaymentPlan,
  cancelPlan,
} from "@/services/paymentService";
import { fetchMembers } from "@/services/chapterService";
import {
  createDuesCheckout,
  createInstallmentCheckout,
} from "@/services/stripeService";
import type {
  PaymentWithUser,
  PaymentSummary,
  PaymentPlanWithUser,
  MemberWithUser,
  MemberRole,
} from "@/types";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
  regional_director: 3, regional_1st_vice: 2,
};

type PlanFrequency = "weekly" | "biweekly" | "monthly" | "quarterly";

function calcEndDate(startDate: string, installments: number, frequency: PlanFrequency): string {
  if (!startDate || installments < 1) return "";
  const d = new Date(startDate);
  switch (frequency) {
    case "weekly":     d.setDate(d.getDate() + installments * 7); break;
    case "biweekly":   d.setDate(d.getDate() + installments * 14); break;
    case "monthly":    d.setMonth(d.getMonth() + installments); break;
    case "quarterly":  d.setMonth(d.getMonth() + installments * 3); break;
  }
  return d.toISOString().split("T")[0] ?? "";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", check: "Check", bank_transfer: "Bank Transfer",
  zelle: "Zelle", venmo: "Venmo", cashapp: "Cash App", manual: "Other",
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly", quarterly: "Quarterly",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-900/30 text-green-400",
  completed: "bg-blue-900/30 text-blue-400",
  cancelled: "bg-red-900/30 text-red-400",
};

type Tab = "payments" | "plans";

// ── Pay Installment Modal ─────────────────────────────────────────────────────

function PayInstallmentModal({
  plan,
  onClose,
  onSubmit,
}: {
  plan: PaymentPlanWithUser;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}) {
  const installment = parseFloat(plan.installment_amount);
  const totalPaid = parseFloat(plan.total_paid);
  const total = parseFloat(plan.total_amount);
  const remaining = Math.max(0, total - totalPaid);
  const [amount, setAmount] = useState(installment.toFixed(2));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    onSubmit(val);
  }

  const val = parseFloat(amount) || 0;
  const isOverRemaining = val > remaining + 0.001;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface-card-solid rounded-xl shadow-glass p-6 w-full max-w-sm">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Pay Installment</h3>
        <p className="text-sm text-content-secondary mb-4 capitalize">
          {FREQUENCY_LABELS[plan.frequency] ?? plan.frequency} plan · ${remaining.toFixed(2)} remaining
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Amount ($)
            </label>
            <input
              type="number" step="0.01" min="0.01" max={remaining.toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required autoFocus
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
            <p className="text-xs text-content-muted mt-1">
              Scheduled installment: ${installment.toFixed(2)} · You can pay more to pay off faster.
            </p>
            {isOverRemaining && (
              <p className="text-xs text-red-500 mt-1">
                Amount exceeds remaining balance of ${remaining.toFixed(2)}.
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={val <= 0 || isOverRemaining}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              Continue to Stripe
            </button>
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Payments() {
  const { memberships, user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  // Capture once at mount — stays true even after URL params are cleared
  const [redirectedFromStripe] = useState(searchParams.get("stripe_success") === "1");
  const [tab, setTab] = useState<Tab>(
    searchParams.get("redirect_type") === "installment" ? "plans" : "payments"
  );
  const [error, setError] = useState<string | null>(null);
  const [stripeToast, setStripeToast] = useState<"success" | "cancelled" | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current user's role
  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const currentRole = currentMembership?.role ?? "member";
  const canManage = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"];
  const canView = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  // Handle Stripe redirect params
  useEffect(() => {
    if (searchParams.get("stripe_success") === "1") {
      setStripeToast("success");
      searchParams.delete("stripe_success");
      searchParams.delete("redirect_type");
      setSearchParams(searchParams, { replace: true });
    } else if (searchParams.get("stripe_cancelled") === "1") {
      setStripeToast("cancelled");
      searchParams.delete("stripe_cancelled");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (stripeToast) {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setStripeToast(null), 5000);
    }
  }, [stripeToast]);

  // Members get a simplified personal view; officers see the full chapter view
  if (!canView) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-content-primary mb-6">Payments</h2>

          {stripeToast === "success" && (
            <div className="mb-4 p-3 bg-green-900/20 text-green-400 rounded-lg text-sm flex justify-between">
              Payment completed! Your payment is being processed and will be recorded shortly.
              <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
            </div>
          )}
          {stripeToast === "cancelled" && (
            <div className="mb-4 p-3 bg-yellow-900/20 text-yellow-400 rounded-lg text-sm flex justify-between">
              Payment was cancelled. You can try again whenever you're ready.
              <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 text-red-400 rounded-lg text-sm">
              {error}
              <button onClick={() => setError(null)} className="ml-2 font-medium underline">Dismiss</button>
            </div>
          )}

          <MemberPaymentsView
            currentUserId={user?.id ?? ""}
            setError={setError}
            stripeSuccess={redirectedFromStripe}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-content-primary mb-6">Payments</h2>

        {stripeToast === "success" && (
          <div className="mb-4 p-3 bg-green-900/20 text-green-400 rounded-lg text-sm flex justify-between">
            Payment completed! Your payment is being processed and will be recorded shortly.
            <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}
        {stripeToast === "cancelled" && (
          <div className="mb-4 p-3 bg-yellow-900/20 text-yellow-400 rounded-lg text-sm flex justify-between">
            Payment was cancelled. You can try again whenever you're ready.
            <button onClick={() => setStripeToast(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 text-red-400 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline">Dismiss</button>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-[var(--color-border)] mb-6">
          <nav className="flex gap-6">
            {(["payments", "plans"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-brand-primary text-brand-primary"
                    : "border-transparent text-content-secondary hover:text-content-secondary"
                }`}
              >
                {t === "payments" ? "Payments" : "Payment Plans"}
              </button>
            ))}
          </nav>
        </div>

        {tab === "payments" ? (
          <PaymentsTab
            canManage={canManage}
            setError={setError}
          />
        ) : (
          <PlansTab
            canManage={canManage}
            currentUserId={user?.id ?? ""}
            setError={setError}
            stripeSuccess={redirectedFromStripe}
          />
        )}
      </div>
    </Layout>
  );
}

// ── Member View (role < secretary) ───────────────────────────────────────────

function MemberPaymentsView({
  currentUserId,
  setError,
  stripeSuccess = false,
}: {
  currentUserId: string;
  setError: (e: string | null) => void;
  stripeSuccess?: boolean;
}) {
  const [payments, setPayments] = useState<PaymentWithUser[]>([]);
  const [plans, setPlans] = useState<PaymentPlanWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeAmount, setStripeAmount] = useState("");
  const [stripeFeeType, setStripeFeeType] = useState("");
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [payModalPlan, setPayModalPlan] = useState<PaymentPlanWithUser | null>(null);

  // Payment plan form state
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planTotal, setPlanTotal] = useState("");
  const [planInstallments, setPlanInstallments] = useState("6");
  const [planFrequency, setPlanFrequency] = useState<PlanFrequency>("monthly");
  const [planStart, setPlanStart] = useState("");
  const [planSubmitting, setPlanSubmitting] = useState(false);

  const { getFeeTypes } = useConfigStore();
  const feeTypes = getFeeTypes();

  useEffect(() => {
    async function load() {
      try {
        const [p, pl] = await Promise.all([fetchMyPayments(), fetchPaymentPlans(true)]);
        setPayments(p as PaymentWithUser[]);
        setPlans(pl);
      } catch {
        setError("Failed to load your payment history.");
      } finally {
        setLoading(false);
      }
    }
    load();
    // Webhook may not have fired yet when user returns from Stripe — re-fetch after 3s
    if (stripeSuccess) {
      const t = setTimeout(load, 3000);
      return () => clearTimeout(t);
    }
  }, []);

  async function handleStripeCheckout(e: React.FormEvent) {
    e.preventDefault();
    setStripeSubmitting(true);
    setError(null);
    try {
      const url = await createDuesCheckout({
        amount: parseFloat(stripeAmount),
        fee_type_id: stripeFeeType || undefined,
      });
      window.location.href = url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to create payment session.";
      setError(msg);
      setStripeSubmitting(false);
    }
  }

  async function handlePayInstallment(plan: PaymentPlanWithUser, amount: number) {
    setPayModalPlan(null);
    setPayingPlanId(plan.id);
    setError(null);
    try {
      const url = await createInstallmentCheckout(plan.id, amount);
      window.location.href = url;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to create checkout session.";
      setError(message);
      setPayingPlanId(null);
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    const endDate = calcEndDate(planStart, parseInt(planInstallments), planFrequency);
    if (!endDate) { setError("Invalid start date or installments."); return; }
    setPlanSubmitting(true);
    setError(null);
    try {
      const plan = await createPaymentPlan({
        user_id: currentUserId,
        total_amount: parseFloat(planTotal),
        expected_installments: parseInt(planInstallments),
        frequency: planFrequency,
        start_date: planStart,
        end_date: endDate,
      });
      setPlans((prev) => [plan, ...prev]);
      setShowPlanForm(false);
      setPlanTotal("");
      setPlanInstallments("6");
      setPlanFrequency("monthly");
      setPlanStart("");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to create payment plan.";
      setError(message);
    } finally {
      setPlanSubmitting(false);
    }
  }

  const activePlans = plans.filter((p) => p.status === "active" && !p.is_complete && p.user_id === currentUserId);

  if (loading) return <div className="text-content-secondary">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Pay Dues */}
      <div className="bg-surface-card-solid rounded-lg shadow-glass p-6">
        <h3 className="text-base font-semibold text-content-primary mb-3">Pay Dues</h3>
        <button
          onClick={() => setShowStripeModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark"
        >
          Pay via Stripe
        </button>
      </div>

      {/* Stripe modal */}
      {showStripeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface-card-solid rounded-xl shadow-glass p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-content-primary mb-4">Pay via Stripe</h3>
            <form onSubmit={handleStripeCheckout} className="space-y-4">
              {feeTypes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Fee Type</label>
                  <select
                    value={stripeFeeType}
                    onChange={(e) => {
                      setStripeFeeType(e.target.value);
                      const ft = feeTypes.find((f) => f.id === e.target.value);
                      if (ft && ft.default_amount > 0 && !stripeAmount) {
                        setStripeAmount(ft.default_amount.toString());
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">Select a fee type (optional)</option>
                    {feeTypes.map((ft) => (
                      <option key={ft.id} value={ft.id}>
                        {ft.label}{ft.default_amount > 0 ? ` — $${ft.default_amount.toFixed(2)}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Amount ($)</label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={stripeAmount}
                  onChange={(e) => setStripeAmount(e.target.value)}
                  required placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <p className="text-xs text-content-muted">You'll be redirected to Stripe's secure checkout page.</p>
              <div className="flex gap-3">
                <button type="submit" disabled={stripeSubmitting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
                  {stripeSubmitting ? "Redirecting..." : "Continue to Stripe"}
                </button>
                <button type="button" onClick={() => { setShowStripeModal(false); setStripeAmount(""); setStripeFeeType(""); }}
                  className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Up Payment Plan */}
      <div className="bg-surface-card-solid rounded-lg shadow-glass p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-content-primary">Payment Plan</h3>
          {!showPlanForm && (
            <button
              onClick={() => setShowPlanForm(true)}
              className="px-3 py-1.5 text-xs font-medium text-brand-primary border border-brand-primary/30 rounded-lg hover:bg-brand-primary/5 transition-colors"
            >
              Set Up a Plan
            </button>
          )}
        </div>
        {showPlanForm ? (
          <form onSubmit={handleCreatePlan} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Total Amount ($)</label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={planTotal} onChange={(e) => setPlanTotal(e.target.value)}
                  required placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Frequency</label>
                <select
                  value={planFrequency} onChange={(e) => setPlanFrequency(e.target.value as PlanFrequency)}
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly (every 2 weeks)</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly (every 3 months)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Number of Payments</label>
                <input
                  type="number" min="1" max="52"
                  value={planInstallments} onChange={(e) => setPlanInstallments(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Start Date</label>
                <input
                  type="date" value={planStart} onChange={(e) => setPlanStart(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>
            {/* Auto-calculated summary */}
            {planTotal && planInstallments && planStart && (
              <div className="bg-brand-primary-50 border border-brand-primary-200/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-content-secondary">Per payment</span>
                  <span className="font-semibold text-content-primary">
                    ${(parseFloat(planTotal) / parseInt(planInstallments)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-secondary">Anticipated end date</span>
                  <span className="font-semibold text-content-primary">
                    {formatDate(calcEndDate(planStart, parseInt(planInstallments), planFrequency))}
                  </span>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="submit" disabled={planSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
              >
                {planSubmitting ? "Creating..." : "Create Plan"}
              </button>
              <button
                type="button" onClick={() => setShowPlanForm(false)}
                className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-content-secondary">
            Set up a structured payment schedule to pay your dues in installments.
          </p>
        )}
      </div>

      {/* Active Payment Plans */}
      {activePlans.length > 0 && (
        <div className="bg-surface-card-solid rounded-lg shadow-glass overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <h3 className="text-base font-semibold text-content-primary">Your Active Payment Plans</h3>
          </div>
          <div className="divide-y divide-white/5">
            {activePlans.map((plan) => {
              const paid = parseFloat(plan.total_paid);
              const total = parseFloat(plan.total_amount);
              const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
              return (
                <div key={plan.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-content-primary">{FREQUENCY_LABELS[plan.frequency] ?? plan.frequency} plan</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 bg-white/10 rounded-full h-2 max-w-[180px]">
                        <div className="bg-brand-primary h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-content-secondary">${paid.toFixed(2)} / ${total.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setPayModalPlan(plan)}
                    disabled={payingPlanId === plan.id}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 shrink-0"
                  >
                    {payingPlanId === plan.id ? "Redirecting..." : "Pay Installment"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pay installment modal */}
      {payModalPlan && (
        <PayInstallmentModal
          plan={payModalPlan}
          onClose={() => setPayModalPlan(null)}
          onSubmit={(amount) => handlePayInstallment(payModalPlan, amount)}
        />
      )}

      {/* My Payment History */}
      <div className="bg-surface-card-solid rounded-lg shadow-glass overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-base font-semibold text-content-primary">My Payment History</h3>
        </div>
        {payments.length === 0 ? (
          <div className="px-6 py-8 text-center text-content-secondary text-sm">No payments recorded yet.</div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-white/5">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-content-primary">${parseFloat(p.amount).toFixed(2)}</span>
                    <span className="text-xs text-content-muted">{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-content-secondary">
                    <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                    <span className="capitalize">{p.payment_type}</span>
                    {p.notes && <span className="text-content-muted">{p.notes}</span>}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <table className="hidden md:table min-w-full divide-y divide-white/5">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-surface-card-solid divide-y divide-white/5">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-white/5">
                    <td className="px-6 py-4 text-sm text-content-secondary">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm font-medium text-content-primary">${parseFloat(p.amount).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-content-secondary">{METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="px-6 py-4 text-sm text-content-secondary capitalize">{p.payment_type}</td>
                    <td className="px-6 py-4 text-sm text-content-muted truncate max-w-[200px]">{p.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── Payments Tab ─────────────────────────────────────────────────────────────

function PaymentsTab({
  canManage,
  setError,
}: {
  canManage: boolean;
  setError: (e: string | null) => void;
}) {
  const [payments, setPayments] = useState<PaymentWithUser[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeAmount, setStripeAmount] = useState("");
  const [stripeFeeType, setStripeFeeType] = useState("");
  const [stripeSubmitting, setStripeSubmitting] = useState(false);

  const { getFeeTypes } = useConfigStore();
  const feeTypes = getFeeTypes();

  // Form state
  const [formUserId, setFormUserId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState("cash");
  const [formFeeType, setFormFeeType] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [paymentsData, membersData] = await Promise.all([
        fetchPayments(),
        fetchMembers(),
      ]);
      setPayments(paymentsData);
      setMembers(membersData);
      if (canManage) {
        const summaryData = await fetchPaymentSummary();
        setSummary(summaryData);
      }
    } catch {
      setError("Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payment = await createPayment({
        user_id: formUserId,
        amount: parseFloat(formAmount),
        method: formMethod,
        fee_type_id: formFeeType || undefined,
        notes: formNotes || undefined,
      });
      setPayments((prev) => [payment, ...prev]);
      setShowForm(false);
      setFormUserId("");
      setFormAmount("");
      setFormMethod("cash");
      setFormFeeType("");
      setFormNotes("");
      // Refresh summary
      if (canManage) {
        const summaryData = await fetchPaymentSummary();
        setSummary(summaryData);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to record payment.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStripeCheckout(e: React.FormEvent) {
    e.preventDefault();
    setStripeSubmitting(true);
    setError(null);
    try {
      const url = await createDuesCheckout({
        amount: parseFloat(stripeAmount),
        fee_type_id: stripeFeeType || undefined,
      });
      window.location.href = url;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to create payment session.";
      setError(msg);
      setStripeSubmitting(false);
    }
  }

  if (loading) return <div className="text-content-secondary">Loading payments...</div>;

  return (
    <>
      {/* Summary Cards */}
      {canManage && summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-surface-card-solid rounded-lg shadow-glass p-4">
            <div className="text-sm text-content-secondary">Total Collected</div>
            <div className="text-2xl font-bold text-content-primary">
              ${parseFloat(summary.total_collected).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-surface-card-solid rounded-lg shadow-glass p-4">
            <div className="text-sm text-content-secondary">This Month</div>
            <div className="text-2xl font-bold text-content-primary">
              ${parseFloat(summary.total_this_month).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-surface-card-solid rounded-lg shadow-glass p-4">
            <div className="text-sm text-content-secondary">By Method</div>
            <div className="text-sm mt-1 space-y-0.5">
              {Object.entries(summary.by_method).map(([method, amount]) => (
                <div key={method} className="flex justify-between">
                  <span className="text-content-secondary">{METHOD_LABELS[method] ?? method}</span>
                  <span className="font-medium">${parseFloat(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
              {Object.keys(summary.by_method).length === 0 && (
                <span className="text-content-muted">No payments yet</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pay Dues via Stripe */}
      <div className="mb-4 flex gap-3 flex-wrap">
        <button
          onClick={() => setShowStripeModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark"
        >
          Make a Payment
        </button>
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
          >
            {showForm ? "Cancel" : "Record Manual Payment"}
          </button>
        )}
      </div>

      {showStripeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface-card-solid rounded-xl shadow-glass p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-content-primary mb-4">Pay via Stripe</h3>
            <form onSubmit={handleStripeCheckout} className="space-y-4">
              {feeTypes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Fee Type</label>
                  <select
                    value={stripeFeeType}
                    onChange={(e) => {
                      setStripeFeeType(e.target.value);
                      const ft = feeTypes.find((f) => f.id === e.target.value);
                      if (ft && ft.default_amount > 0 && !stripeAmount) {
                        setStripeAmount(ft.default_amount.toString());
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="">Select a fee type (optional)</option>
                    {feeTypes.map((ft) => (
                      <option key={ft.id} value={ft.id}>
                        {ft.label}{ft.default_amount > 0 ? ` — $${ft.default_amount.toFixed(2)}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={stripeAmount}
                  onChange={(e) => setStripeAmount(e.target.value)}
                  required
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <p className="text-xs text-content-muted">
                You'll be redirected to Stripe's secure checkout page to complete payment.
              </p>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={stripeSubmitting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
                >
                  {stripeSubmitting ? "Redirecting..." : "Continue to Stripe"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowStripeModal(false); setStripeAmount(""); setStripeFeeType(""); }}
                  className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-card-solid rounded-lg shadow-glass p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Member</label>
              <select
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">Select member...</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Method</label>
              <select
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                {Object.entries(METHOD_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            {feeTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Fee Type</label>
                <select
                  value={formFeeType}
                  onChange={(e) => {
                    setFormFeeType(e.target.value);
                    const ft = feeTypes.find((f) => f.id === e.target.value);
                    if (ft && ft.default_amount > 0 && !formAmount) {
                      setFormAmount(ft.default_amount.toString());
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="">None</option>
                  {feeTypes.map((ft) => (
                    <option key={ft.id} value={ft.id}>
                      {ft.label}{ft.default_amount > 0 ? ` ($${ft.default_amount.toFixed(2)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Notes</label>
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {submitting ? "Recording..." : "Record Payment"}
          </button>
        </form>
      )}

      {/* Payments Table */}
      {payments.length === 0 ? (
        <div className="bg-surface-card-solid rounded-lg shadow-glass p-6 text-content-secondary">
          No payments recorded yet.
        </div>
      ) : (
        <div className="bg-surface-card-solid rounded-lg shadow-glass overflow-hidden">
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-white/5">
            {payments.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-content-primary">{p.user?.full_name ?? "Unknown"}</span>
                  <span className="text-sm font-medium text-content-primary">${parseFloat(p.amount).toFixed(2)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-content-secondary">
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                  <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                  <span className="capitalize">{p.payment_type}</span>
                  {p.notes && <span className="text-content-muted">{p.notes}</span>}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <table className="hidden md:table min-w-full divide-y divide-white/5">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Member</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Notes</th>
              </tr>
            </thead>
            <tbody className="bg-surface-card-solid divide-y divide-white/5">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 text-sm text-content-secondary">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-medium text-content-primary">{p.user?.full_name ?? "Unknown"}</td>
                  <td className="px-6 py-4 text-sm font-medium text-content-primary">${parseFloat(p.amount).toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm text-content-secondary">{METHOD_LABELS[p.method] ?? p.method}</td>
                  <td className="px-6 py-4 text-sm text-content-secondary capitalize">{p.payment_type}</td>
                  <td className="px-6 py-4 text-sm text-content-muted truncate max-w-[200px]">{p.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Plans Tab ────────────────────────────────────────────────────────────────

function PlansTab({
  canManage,
  currentUserId,
  setError,
  stripeSuccess = false,
}: {
  canManage: boolean;
  currentUserId: string;
  setError: (e: string | null) => void;
  stripeSuccess?: boolean;
}) {
  const [plans, setPlans] = useState<PaymentPlanWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [payModalPlan, setPayModalPlan] = useState<PaymentPlanWithUser | null>(null);

  // Form state
  const [formUserId, setFormUserId] = useState("");
  const [formTotal, setFormTotal] = useState("");
  const [formInstallments, setFormInstallments] = useState("6");
  const [formFrequency, setFormFrequency] = useState<PlanFrequency>("monthly");
  const [formStart, setFormStart] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
    // Webhook may not have fired yet when user returns from Stripe — re-fetch after 3s
    if (stripeSuccess) {
      const t = setTimeout(loadData, 3000);
      return () => clearTimeout(t);
    }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [plansData, membersData] = await Promise.all([
        fetchPaymentPlans(),
        fetchMembers(),
      ]);
      setPlans(plansData);
      setMembers(membersData);
    } catch {
      setError("Failed to load payment plans.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const endDate = calcEndDate(formStart, parseInt(formInstallments), formFrequency);
    if (!endDate) { setError("Invalid start date or installments."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const plan = await createPaymentPlan({
        user_id: formUserId,
        total_amount: parseFloat(formTotal),
        expected_installments: parseInt(formInstallments),
        frequency: formFrequency,
        start_date: formStart,
        end_date: endDate,
      });
      setPlans((prev) => [plan, ...prev]);
      setShowForm(false);
      setFormUserId("");
      setFormTotal("");
      setFormInstallments("6");
      setFormFrequency("monthly");
      setFormStart("");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to create plan.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(plan: PaymentPlanWithUser) {
    if (!confirm(`Cancel payment plan for ${plan.user?.full_name ?? "this member"}?`)) return;
    try {
      const updated = await cancelPlan(plan.id);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to cancel plan.";
      setError(message);
    }
  }

  async function handlePayInstallment(plan: PaymentPlanWithUser, amount: number) {
    setPayModalPlan(null);
    setPayingPlanId(plan.id);
    setError(null);
    try {
      const url = await createInstallmentCheckout(plan.id, amount);
      window.location.href = url;
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to create checkout session.";
      setError(message);
      setPayingPlanId(null);
    }
  }

  if (loading) return <div className="text-content-secondary">Loading plans...</div>;

  return (
    <>
      {canManage && (
        <div className="mb-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark"
          >
            {showForm ? "Cancel" : "Create Payment Plan"}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-card-solid rounded-lg shadow-glass p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Member</label>
              <select
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="">Select member...</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Total Amount ($)</label>
              <input
                type="number" step="0.01" min="0.01"
                value={formTotal} onChange={(e) => setFormTotal(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Frequency</label>
              <select
                value={formFrequency}
                onChange={(e) => setFormFrequency(e.target.value as PlanFrequency)}
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly (every 2 weeks)</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly (every 3 months)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Number of Payments</label>
              <input
                type="number" min="1" max="52"
                value={formInstallments} onChange={(e) => setFormInstallments(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Start Date</label>
              <input
                type="date"
                value={formStart} onChange={(e) => setFormStart(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>
          {/* Auto-calculated summary */}
          {formTotal && formInstallments && formStart && (
            <div className="bg-white/5 border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-content-secondary">Per payment</span>
                <span className="font-semibold text-content-primary">
                  ${(parseFloat(formTotal) / parseInt(formInstallments)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-content-secondary">Anticipated end date</span>
                <span className="font-semibold text-content-primary">
                  {formatDate(calcEndDate(formStart, parseInt(formInstallments), formFrequency))}
                </span>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Plan"}
          </button>
        </form>
      )}

      {plans.length === 0 ? (
        <div className="bg-surface-card-solid rounded-lg shadow-glass p-6 text-content-secondary">
          No payment plans yet.
        </div>
      ) : (
        <div className="bg-surface-card-solid rounded-lg shadow-glass overflow-hidden">
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-white/5">
            {plans.map((plan) => {
              const paid = parseFloat(plan.total_paid);
              const total = parseFloat(plan.total_amount);
              const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
              const canPayInstallment =
                plan.status === "active" &&
                !plan.is_complete &&
                plan.user_id === currentUserId;
              return (
                <div key={plan.id} className="px-4 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-content-primary">{plan.user?.full_name ?? "Unknown"}</span>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[plan.status] ?? "bg-gray-800/50 text-gray-400"}`}>
                      {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div className="bg-brand-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-content-secondary shrink-0">${paid.toFixed(2)} / ${total.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-content-secondary mb-3">{FREQUENCY_LABELS[plan.frequency] ?? plan.frequency} · ${total.toFixed(2)} total</p>
                  {(canPayInstallment || (canManage && plan.status === "active")) && (
                    <div className="flex gap-2">
                      {canPayInstallment && (
                        <button
                          onClick={() => setPayModalPlan(plan)}
                          disabled={payingPlanId === plan.id}
                          className="flex-1 py-2 text-xs font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
                        >
                          {payingPlanId === plan.id ? "Redirecting..." : "Pay Installment"}
                        </button>
                      )}
                      {canManage && plan.status === "active" && (
                        <button
                          onClick={() => handleCancel(plan)}
                          className="flex-1 py-2 text-xs font-medium text-red-400 bg-red-900/20 rounded-lg hover:bg-red-900/30"
                        >
                          Cancel Plan
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <table className="hidden md:table min-w-full divide-y divide-white/5">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Member</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Progress</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Frequency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-content-secondary uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface-card-solid divide-y divide-white/5">
              {plans.map((plan) => {
                const paid = parseFloat(plan.total_paid);
                const total = parseFloat(plan.total_amount);
                const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
                const canPayInstallment =
                  plan.status === "active" &&
                  !plan.is_complete &&
                  plan.user_id === currentUserId;
                return (
                  <tr key={plan.id} className="hover:bg-white/5">
                    <td className="px-6 py-4 text-sm font-medium text-content-primary">{plan.user?.full_name ?? "Unknown"}</td>
                    <td className="px-6 py-4 text-sm text-content-primary">${total.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/10 rounded-full h-2 max-w-[120px]">
                          <div className="bg-brand-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-content-secondary">${paid.toFixed(2)} / ${total.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-content-secondary">{FREQUENCY_LABELS[plan.frequency] ?? plan.frequency}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[plan.status] ?? "bg-gray-800/50 text-gray-400"}`}>
                        {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm space-x-3">
                      {canPayInstallment && (
                        <button
                          onClick={() => setPayModalPlan(plan)}
                          disabled={payingPlanId === plan.id}
                          className="text-brand-primary hover:text-brand-primary-dark font-medium disabled:opacity-50"
                        >
                          {payingPlanId === plan.id ? "Redirecting..." : "Pay Installment"}
                        </button>
                      )}
                      {canManage && plan.status === "active" && (
                        <button
                          onClick={() => handleCancel(plan)}
                          className="text-red-400 hover:text-red-300 font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pay installment modal */}
      {payModalPlan && (
        <PayInstallmentModal
          plan={payModalPlan}
          onClose={() => setPayModalPlan(null)}
          onSubmit={(amount) => handlePayInstallment(payModalPlan, amount)}
        />
      )}
    </>
  );
}
