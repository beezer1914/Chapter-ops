import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { fetchPeriods, fetchMyDues } from "@/services/periodService";
import { createDuesCheckout, getStripeAccountStatus } from "@/services/stripeService";
import { TOUR_TARGETS } from "@/tours/tourTargets";
import type { ChapterPeriod, ChapterPeriodDues, DuesStatus } from "@/types";
import { CheckCircle, AlertCircle, Clock, Shield, ArrowRight, CreditCard } from "lucide-react";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DuesStatus, {
  label: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  icon: typeof CheckCircle;
  iconColor: string;
}> = {
  paid: {
    label: "Paid",
    borderColor: "border-l-emerald-500",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    icon: CheckCircle,
    iconColor: "text-emerald-500",
  },
  partial: {
    label: "Partial",
    borderColor: "border-l-amber-500",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    icon: Clock,
    iconColor: "text-amber-500",
  },
  unpaid: {
    label: "Unpaid",
    borderColor: "border-l-red-500",
    badgeBg: "bg-red-50",
    badgeText: "text-red-700",
    icon: AlertCircle,
    iconColor: "text-red-500",
  },
  exempt: {
    label: "Exempt",
    borderColor: "border-l-[var(--color-border)]",
    badgeBg: "bg-[var(--color-bg-card)]",
    badgeText: "text-content-muted",
    icon: Shield,
    iconColor: "text-content-muted",
  },
};

// ── DuesRow component ─────────────────────────────────────────────────────────

function DuesRow({
  dues,
  onPay,
  paying,
  stripeConnected,
}: {
  dues: ChapterPeriodDues;
  onPay: (dues: ChapterPeriodDues) => void;
  paying: string | null;
  stripeConnected: boolean;
}) {
  const cfg = STATUS_CONFIG[dues.status];
  const Icon = cfg.icon;
  const owed = parseFloat(dues.amount_owed);
  const paid = parseFloat(dues.amount_paid);
  const remaining = parseFloat(dues.amount_remaining);
  const pctPaid = owed > 0 ? Math.min(100, Math.round((paid / owed) * 100)) : 100;
  const canPay = dues.status !== "paid" && dues.status !== "exempt" && remaining > 0;

  return (
    <div className={`border-l-4 ${cfg.borderColor} bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-card-hover)] transition-colors`}>
      <div className="px-6 py-5">
        {/* Fee label + status badge */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon className={`w-4 h-4 shrink-0 ${cfg.iconColor}`} />
            <span className="font-heading font-bold text-base text-content-heading truncate">
              {dues.fee_type_label}
            </span>
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 shrink-0 ${cfg.badgeBg} ${cfg.badgeText}`}>
            {cfg.label}
          </span>
        </div>

        {/* Amount grid */}
        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-0.5">Owed</p>
            <p className="font-heading font-bold text-lg text-content-heading">${owed.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-0.5">Paid</p>
            <p className="font-heading font-bold text-lg text-emerald-600">${paid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-0.5">Remaining</p>
            <p className={`font-heading font-bold text-lg ${remaining > 0 ? "text-red-600" : "text-content-muted"}`}>
              ${remaining.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {dues.status !== "exempt" && (
          <div className="mb-4">
            <div className="h-1 bg-[var(--color-border)] w-full">
              <div
                className={`h-1 transition-all duration-500 ${
                  pctPaid >= 100 ? "bg-emerald-500" : pctPaid > 0 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${pctPaid}%` }}
              />
            </div>
            <p className="text-[10px] text-content-muted mt-1">{pctPaid}% paid</p>
          </div>
        )}

        {/* Pay CTA */}
        {canPay && (
          stripeConnected ? (
            <button
              data-tour-target={TOUR_TARGETS.MY_DUES_PAY_CTA}
              onClick={() => onPay(dues)}
              disabled={paying === dues.id}
              className="flex items-center gap-2 text-sm font-semibold text-brand-primary-dark hover:text-brand-primary-main transition-colors group disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              {paying === dues.id ? "Redirecting…" : `Pay $${remaining.toFixed(2)}`}
              <ArrowRight className="w-3.5 h-3.5 translate-x-0 group-hover:translate-x-1 transition-transform" />
            </button>
          ) : (
            <p className="text-xs text-content-muted italic">
              Contact your treasurer to submit payment.
            </p>
          )
        )}

        {/* Notes */}
        {dues.notes && (
          <p className="mt-2 text-xs text-content-muted italic border-t border-[var(--color-border)] pt-2">
            {dues.notes}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyDues() {
  const navigate = useNavigate();
  const { user, memberships } = useAuthStore();
  const { chapter } = useConfigStore();

  const [activePeriod, setActivePeriod] = useState<ChapterPeriod | null>(null);
  const [hasPeriods, setHasPeriods] = useState(false);
  const [dues, setDues] = useState<ChapterPeriodDues[]>([]);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const [financialStatus, setFinancialStatus] = useState<string>(
    currentMembership?.financial_status ?? "not_financial"
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [periods, stripeData] = await Promise.all([
        fetchPeriods(),
        getStripeAccountStatus().catch(() => ({ connected: false })),
      ]);

      const active = periods.find((p) => p.is_active) ?? null;
      setActivePeriod(active);
      setHasPeriods(periods.length > 0);
      setStripeConnected(!!stripeData.connected);

      if (active) {
        const { dues: rows, financial_status } = await fetchMyDues(active.id);
        setDues(rows);
        if (financial_status) setFinancialStatus(financial_status);
      }
    } catch {
      setError("Failed to load your dues. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(duesRow: ChapterPeriodDues) {
    const remaining = parseFloat(duesRow.amount_remaining);
    if (remaining <= 0) return;
    setPaying(duesRow.id);
    try {
      const url = await createDuesCheckout({
        amount: remaining,
        fee_type_id: duesRow.fee_type_id,
        notes: `${duesRow.fee_type_label} — ${activePeriod?.name ?? ""}`,
      });
      window.location.href = url;
    } catch {
      setError("Could not start checkout. Please try again.");
      setPaying(null);
    }
  }

  // ── Derived totals ─────────────────────────────────────────────────────────
  const nonExempt = dues.filter((d) => d.status !== "exempt");
  const totalOwed = nonExempt.reduce((s, d) => s + parseFloat(d.amount_owed), 0);
  const totalPaid = nonExempt.reduce((s, d) => s + parseFloat(d.amount_paid), 0);
  const totalRemaining = nonExempt.reduce((s, d) => s + parseFloat(d.amount_remaining), 0);
  const overallPct = totalOwed > 0 ? Math.min(100, Math.round((totalPaid / totalOwed) * 100)) : 100;
  const allPaid = nonExempt.length > 0 && nonExempt.every((d) => d.status === "paid");

  // ── Financial status banner config ────────────────────────────────────────
  const STATUS_BANNER: Record<string, { bg: string; border: string; text: string; label: string }> = {
    financial: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", label: "You are financial for this period." },
    not_financial: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", label: "You are not yet financial for this period." },
    neophyte: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", label: "Neophyte — financial standing is waived for your first year." },
    exempt: { bg: "bg-[var(--color-bg-card)]", border: "border-[var(--color-border)]", text: "text-content-muted", label: "Your dues are waived." },
  };
  const banner = STATUS_BANNER[financialStatus] ?? STATUS_BANNER.not_financial;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto animate-fade-in">

        {/* ── Editorial header ──────────────────────────────────────── */}
        <div className="mb-8">
          <div className="border-t-2 border-[var(--color-text-heading)] pt-4 mb-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-content-muted">
                {chapter?.name ?? "Chapter"} · Dues
              </p>
              {activePeriod && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 bg-brand-primary-main/10 text-brand-primary-dark border border-brand-primary-main/20">
                  {activePeriod.name}
                </span>
              )}
            </div>
            <h1 className="font-heading text-3xl md:text-4xl font-black text-content-heading tracking-tight">
              My Dues
            </h1>
          </div>
          <div className="border-b border-[var(--color-border)] mt-3" />
        </div>

        {/* ── Error banner ──────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 font-bold text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <div className="w-7 h-7 border-[3px] border-[var(--color-border)] border-t-brand-primary-main rounded-full animate-spin" />
          </div>

        ) : !activePeriod ? (
          /* ── No active period ─────────────────────────────────────── */
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-8 py-14 text-center">
            <p className="font-heading text-xl font-bold text-content-heading mb-2">No active period</p>
            {hasPeriods ? (
              <p className="text-sm text-content-muted">
                A billing period exists but hasn't been activated yet.
                Your treasurer needs to click <strong className="text-content-secondary">Activate</strong> on the period in Settings → Billing Periods.
              </p>
            ) : (
              <p className="text-sm text-content-muted">
                Your treasurer hasn't created a billing period yet.
                This is configured in Settings → Billing Periods.
              </p>
            )}
          </div>

        ) : dues.length === 0 ? (
          /* ── No dues seeded ───────────────────────────────────────── */
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-8 py-14 text-center">
            <p className="font-heading text-xl font-bold text-content-heading mb-2">No dues on record</p>
            <p className="text-sm text-content-muted">
              Your chapter hasn't configured fee types for {activePeriod.name} yet.
              Check back soon or contact your treasurer.
            </p>
          </div>

        ) : (
          <>
            {/* ── Financial status banner ───────────────────────────── */}
            <div data-tour-target={TOUR_TARGETS.MY_DUES_STATUS_BANNER} className={`mb-6 px-5 py-3 border ${banner.bg} ${banner.border} ${banner.text} text-sm font-medium flex items-center gap-2.5`}>
              {financialStatus === "financial" || financialStatus === "exempt"
                ? <CheckCircle className="w-4 h-4 shrink-0" />
                : <AlertCircle className="w-4 h-4 shrink-0" />
              }
              {banner.label}
            </div>

            {/* ── Overall summary bar ───────────────────────────────── */}
            {nonExempt.length > 0 && (
              <div className="mb-6 border border-[var(--color-border)] bg-[var(--color-bg-card)] px-6 py-5">
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-0.5">
                      Overall Progress
                    </p>
                    <p className="font-heading text-2xl font-black text-content-heading">
                      ${totalPaid.toFixed(2)}
                      <span className="text-base font-medium text-content-muted ml-1">/ ${totalOwed.toFixed(2)}</span>
                    </p>
                  </div>
                  {allPaid ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                      <CheckCircle className="w-4 h-4" /> Fully paid
                    </span>
                  ) : (
                    <p className="text-sm text-content-muted">
                      <span className="font-semibold text-content-heading">${totalRemaining.toFixed(2)}</span> remaining
                    </p>
                  )}
                </div>
                <div className="h-1.5 bg-[var(--color-border)] w-full">
                  <div
                    className={`h-1.5 transition-all duration-700 ${
                      overallPct >= 100 ? "bg-emerald-500" : overallPct > 0 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-content-muted mt-1.5">{overallPct}% paid for {activePeriod.name}</p>
              </div>
            )}

            {/* ── Per-fee-type dues rows ────────────────────────────── */}
            <div data-tour-target={TOUR_TARGETS.MY_DUES_BREAKDOWN} className="divide-y divide-[var(--color-border)] border border-[var(--color-border)]">
              {dues.map((d) => (
                <DuesRow
                  key={d.id}
                  dues={d}
                  onPay={handlePay}
                  paying={paying}
                  stripeConnected={stripeConnected}
                />
              ))}
            </div>

            {/* ── Footer note ───────────────────────────────────────── */}
            <p className="mt-4 text-xs text-content-muted text-center">
              Questions about your balance?{" "}
              <button
                onClick={() => navigate("/payments")}
                className="underline underline-offset-2 hover:text-content-secondary transition-colors"
              >
                View payment history
              </button>
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
