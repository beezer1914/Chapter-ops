import { useEffect, useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { fetchChapterAnalytics } from "@/services/analyticsService";
import type { ChapterAnalytics, MemberRole } from "@/types";
import { TrendingUp, TrendingDown, Minus, ChevronDown, Users, DollarSign, Calendar, BarChart3 } from "lucide-react";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function delta(current: number, prev: number | undefined): { val: number; icon: typeof TrendingUp; color: string } | null {
  if (prev == null || prev === 0) return null;
  const diff = current - prev;
  if (Math.abs(diff) < 0.5) return { val: 0, icon: Minus, color: "text-content-muted" };
  return diff > 0
    ? { val: diff, icon: TrendingUp, color: "text-emerald-600" }
    : { val: diff, icon: TrendingDown, color: "text-red-600" };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  icon: typeof DollarSign;
}) {
  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] px-5 py-5">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">{label}</p>
        <Icon className="w-4 h-4 text-content-muted opacity-50" />
      </div>
      <p className={`font-heading text-2xl font-black tracking-tight ${accent ? "text-red-600" : "text-content-heading"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-content-muted mt-1">{sub}</p>}
    </div>
  );
}

// ── Horizontal progress bar ───────────────────────────────────────────────────

function ProgressBar({ pct, color = "bg-brand-primary-main" }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-[var(--color-border)] w-full">
      <div
        className={`h-1.5 transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

// ── Bar chart (CSS only) ──────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; value: number; tooltip: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-20 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full bg-brand-primary-main/30 hover:bg-brand-primary-main transition-colors cursor-default"
            style={{ height: `${Math.max(2, (d.value / max) * 80)}px` }}
          />
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#0a0a0a] text-white text-[10px] px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {d.tooltip}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stacked member status bar ─────────────────────────────────────────────────

function MemberStatusBar({ financial, not_financial, neophyte, exempt, total }: {
  financial: number; not_financial: number; neophyte: number; exempt: number; total: number;
}) {
  if (total === 0) return <p className="text-xs text-content-muted">No members.</p>;
  const segments = [
    { label: "Financial", count: financial, bg: "bg-emerald-500", text: "text-emerald-700", badge: "bg-emerald-50" },
    { label: "Not Financial", count: not_financial, bg: "bg-red-500", text: "text-red-700", badge: "bg-red-50" },
    { label: "Neophyte", count: neophyte, bg: "bg-amber-400", text: "text-amber-700", badge: "bg-amber-50" },
    { label: "Exempt", count: exempt, bg: "bg-[var(--color-border)]", text: "text-content-muted", badge: "bg-[var(--color-bg-card)]" },
  ].filter((s) => s.count > 0);

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-4 w-full overflow-hidden mb-4">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.bg} transition-all`}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {segments.map((s) => (
          <div key={s.label} className={`flex items-center justify-between px-3 py-2 ${s.badge} border border-[var(--color-border)]`}>
            <span className={`text-xs font-semibold ${s.text}`}>{s.label}</span>
            <span className={`font-heading font-bold text-base ${s.text}`}>
              {s.count}
              <span className="text-[10px] font-normal ml-1">({Math.round(s.count / total * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Period comparison card ────────────────────────────────────────────────────

function PeriodCompare({
  current, prev,
}: {
  current: { name: string; rate: number; paid: string; owed: string } | null;
  prev: { name: string; rate: number; paid: string; owed: string } | null;
}) {
  if (!current) return null;
  const d = prev ? delta(current.rate, prev.rate) : null;
  const DeltaIcon = d?.icon ?? Minus;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--color-border)] border border-[var(--color-border)]">
      {/* Current */}
      <div className="bg-[var(--color-bg-card)] px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">
            {current.name}
          </p>
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-brand-primary-main/10 text-brand-primary-dark border border-brand-primary-main/20">
            Current
          </span>
        </div>
        <div className="flex items-end gap-3 mb-3">
          <p className="font-heading text-4xl font-black text-content-heading">{current.rate}%</p>
          {d && (
            <div className={`flex items-center gap-1 mb-1 ${d.color}`}>
              <DeltaIcon className="w-4 h-4" />
              <span className="text-sm font-semibold">
                {d.val > 0 ? "+" : ""}{Math.round(d.val)}pp
              </span>
            </div>
          )}
        </div>
        <ProgressBar
          pct={current.rate}
          color={current.rate >= 80 ? "bg-emerald-500" : current.rate >= 50 ? "bg-amber-500" : "bg-red-500"}
        />
        <p className="text-xs text-content-muted mt-2">${fmt(current.paid)} of ${fmt(current.owed)}</p>
      </div>

      {/* Previous */}
      <div className="bg-[var(--color-bg-deep)] px-5 py-5">
        {prev ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
              {prev.name}
            </p>
            <p className="font-heading text-4xl font-black text-content-muted mb-3">{prev.rate}%</p>
            <ProgressBar pct={prev.rate} color="bg-[var(--color-border)]" />
            <p className="text-xs text-content-muted mt-2">${fmt(prev.paid)} of ${fmt(prev.owed)}</p>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-content-muted text-center">No previous period to compare</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { user, memberships } = useAuthStore();
  const { chapter } = useConfigStore();

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const canView = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  const [data, setData] = useState<ChapterAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");

  useEffect(() => {
    load();
  }, []);

  async function load(periodId?: string) {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchChapterAnalytics(periodId);
      setData(d);
      if (!periodId && d.period) setSelectedPeriodId(d.period.id);
    } catch {
      setError("Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodChange(id: string) {
    setSelectedPeriodId(id);
    load(id);
  }

  // ── Derived values ─────────────────────────────────────────────────
  const monthlyBars = useMemo(() => {
    if (!data?.monthly_payments?.length) return [];
    return data.monthly_payments.map((m) => ({
      label: fmtMonth(m.month),
      value: parseFloat(m.total),
      tooltip: `${fmtMonth(m.month)}: $${fmt(m.total)} (${m.count} payments)`,
    }));
  }, [data?.monthly_payments]);

  if (!canView) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-24 text-center">
          <p className="font-heading text-2xl font-bold text-content-heading mb-2">Access Restricted</p>
          <p className="text-sm text-content-muted">Secretary or higher required to view analytics.</p>
        </div>
      </Layout>
    );
  }

  const dues = data?.dues_summary;
  const prevDues = data?.prev_dues_summary;
  const status = data?.member_status;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto animate-fade-in">

        {/* ── Editorial header ──────────────────────────────────────── */}
        <div className="mb-8">
          <div className="border-t-2 border-[var(--color-text-heading)] pt-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-content-muted mb-1">
                  {chapter?.name ?? "Chapter"} · Reporting
                </p>
                <h1 className="font-heading text-3xl md:text-4xl font-black text-content-heading tracking-tight">
                  Analytics
                </h1>
              </div>

              {/* Period picker */}
              {data && data.all_periods.length > 0 && (
                <div className="relative mt-1">
                  <select
                    value={selectedPeriodId}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                    className="appearance-none text-sm font-semibold bg-[var(--color-bg-card)] border border-[var(--color-border)] text-content-primary px-4 py-2 pr-8 focus:outline-none focus:border-brand-primary-main cursor-pointer"
                  >
                    {data.all_periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.is_active ? " (Active)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </div>
          </div>
          <div className="border-b border-[var(--color-border)] mt-3" />
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 font-bold">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-7 h-7 border-[3px] border-[var(--color-border)] border-t-brand-primary-main rounded-full animate-spin" />
          </div>
        ) : !data || !data.period ? (
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-8 py-14 text-center">
            <p className="font-heading text-xl font-bold text-content-heading mb-2">No period data</p>
            <p className="text-sm text-content-muted">Activate a billing period in Settings to see analytics.</p>
          </div>
        ) : (
          <div className="space-y-8">

            {/* ── Row 1: Key metrics ────────────────────────────────── */}
            <section>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                Period Overview · {data.period.name}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-border)] border border-[var(--color-border)]">
                <StatCard
                  label="Collection Rate"
                  value={`${dues?.collection_rate ?? 0}%`}
                  sub={prevDues ? `${prevDues.collection_rate}% last period` : undefined}
                  accent={(dues?.collection_rate ?? 100) < 60}
                  icon={BarChart3}
                />
                <StatCard
                  label="Total Collected"
                  value={`$${fmt(dues?.total_paid ?? "0")}`}
                  sub={`of $${fmt(dues?.total_owed ?? "0")} owed`}
                  icon={DollarSign}
                />
                <StatCard
                  label="Outstanding"
                  value={`$${fmt(dues?.total_remaining ?? "0")}`}
                  sub={dues && dues.member_count > dues.fully_paid_members
                    ? `${dues.member_count - dues.fully_paid_members} members still owe`
                    : "All clear"}
                  accent={parseFloat(dues?.total_remaining ?? "0") > 0}
                  icon={DollarSign}
                />
                <StatCard
                  label="Active Members"
                  value={String(status?.total ?? 0)}
                  sub={`${status?.financial ?? 0} financial`}
                  icon={Users}
                />
              </div>
            </section>

            {/* ── Row 2: Period comparison ──────────────────────────── */}
            <section>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                Period Comparison
              </h2>
              <PeriodCompare
                current={dues ? {
                  name: data.period.name,
                  rate: dues.collection_rate,
                  paid: dues.total_paid,
                  owed: dues.total_owed,
                } : null}
                prev={prevDues && data.prev_period ? {
                  name: data.prev_period.name,
                  rate: prevDues.collection_rate,
                  paid: prevDues.total_paid,
                  owed: prevDues.total_owed,
                } : null}
              />
            </section>

            {/* ── Row 3: Dues by fee type ───────────────────────────── */}
            {dues && dues.by_fee_type.length > 0 && (
              <section>
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                  Dues by Fee Type
                </h2>
                <div className="border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                  {dues.by_fee_type.map((ft) => (
                    <div key={ft.fee_type_id} className="px-5 py-4 bg-[var(--color-bg-card)]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-content-primary">{ft.label}</p>
                        <div className="flex items-center gap-3 text-xs text-content-muted">
                          <span className={`font-heading font-bold text-base ${ft.collection_rate >= 80 ? "text-emerald-600" : ft.collection_rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                            {ft.collection_rate}%
                          </span>
                          <span>${fmt(ft.paid)} / ${fmt(ft.owed)}</span>
                        </div>
                      </div>
                      <ProgressBar
                        pct={ft.collection_rate}
                        color={ft.collection_rate >= 80 ? "bg-emerald-500" : ft.collection_rate >= 50 ? "bg-amber-500" : "bg-red-500"}
                      />
                      <p className="text-[11px] text-content-muted mt-1.5">
                        ${fmt(ft.remaining)} outstanding · {ft.member_count} members tracked
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Row 4: Member status distribution ────────────────── */}
            {status && status.total > 0 && (
              <section>
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                  Member Status · {status.total} Active
                </h2>
                <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-5 py-5">
                  <MemberStatusBar
                    financial={status.financial}
                    not_financial={status.not_financial}
                    neophyte={status.neophyte}
                    exempt={status.exempt}
                    total={status.total}
                  />
                </div>
              </section>
            )}

            {/* ── Row 5 + 6: Payment timeline & events ─────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Payment timeline */}
              <section>
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                  Payment Activity · Last 12 Months
                </h2>
                <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-5 pt-5 pb-4">
                  {monthlyBars.length === 0 ? (
                    <p className="text-sm text-content-muted py-8 text-center">No payments recorded yet.</p>
                  ) : (
                    <>
                      <BarChart data={monthlyBars} />
                      {/* Month labels */}
                      <div className="flex gap-1 mt-1">
                        {monthlyBars.map((d, i) => (
                          <div key={i} className="flex-1 text-center text-[8px] text-content-muted truncate">
                            {i % 3 === 0 || monthlyBars.length <= 6 ? d.label : ""}
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-content-muted mt-3 border-t border-[var(--color-border)] pt-2">
                        Total: $
                        {fmt(monthlyBars.reduce((s, d) => s + d.value, 0))} across{" "}
                        {data.monthly_payments.reduce((s, m) => s + m.count, 0)} payments
                      </p>
                    </>
                  )}
                </div>
              </section>

              {/* Event stats */}
              <section>
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                  Events · {data.period.name}
                </h2>
                <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-5 py-5">
                  {data.event_stats.total_events === 0 ? (
                    <p className="text-sm text-content-muted py-8 text-center">No events in this period.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-px bg-[var(--color-border)] border border-[var(--color-border)] mb-4">
                        <div className="bg-[var(--color-bg-deep)] px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">Events</p>
                          <p className="font-heading font-black text-2xl text-content-heading">{data.event_stats.total_events}</p>
                        </div>
                        <div className="bg-[var(--color-bg-deep)] px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">Avg Fill</p>
                          <p className="font-heading font-black text-2xl text-content-heading">
                            {data.event_stats.avg_attendance_rate != null ? `${data.event_stats.avg_attendance_rate}%` : "—"}
                          </p>
                        </div>
                      </div>
                      {data.event_stats.top_events.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">Top Events</p>
                          {data.event_stats.top_events.map((ev) => (
                            <div key={ev.id} className="flex items-center justify-between text-sm">
                              <span className="text-content-secondary truncate mr-4">{ev.title}</span>
                              <span className="shrink-0 font-semibold text-content-heading tabular-nums">
                                {ev.attendee_count}
                                {ev.capacity ? <span className="text-content-muted font-normal">/{ev.capacity}</span> : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              {/* Budget breakdown — only if committees exist */}
              {data.budget_summary && data.budget_summary.length > 0 && (
                <section>
                  <h2 className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-3">
                    Committee Budgets
                  </h2>
                  <div className="space-y-3">
                    {data.budget_summary.map((c) => {
                      const budget = parseFloat(c.budget);
                      const spent = parseFloat(c.spent);
                      const pending = parseFloat(c.pending);
                      const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                      const pendingPct = budget > 0 ? Math.min(100 - pct, Math.round((pending / budget) * 100)) : 0;
                      return (
                        <div key={c.committee_id} className={`border px-4 py-4 ${c.over_budget ? "border-red-500/50 bg-red-500/5" : "border-[var(--color-border)] bg-[var(--color-bg-card)]"}`}>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-content-primary">{c.name}</p>
                                {c.over_budget && (
                                  <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 bg-red-500/10 border border-red-500/30 text-red-600">
                                    Over Budget
                                  </span>
                                )}
                              </div>
                              {c.chair && (
                                <p className="text-xs text-content-muted mt-0.5">Chair: {c.chair.full_name}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-content-muted">Budget</p>
                              <p className="font-heading font-black text-lg text-content-heading">${fmt(c.budget)}</p>
                            </div>
                          </div>

                          {/* Stacked progress bar */}
                          <div className="h-1.5 bg-[var(--color-bg-deep)] mb-2 flex overflow-hidden">
                            <div
                              className={`h-full transition-all ${c.over_budget ? "bg-red-500" : "bg-emerald-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                            {pendingPct > 0 && (
                              <div className="h-full bg-amber-400/60" style={{ width: `${pendingPct}%` }} />
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-[10px] text-content-muted uppercase tracking-widest">Spent</p>
                              <p className="text-sm font-semibold text-content-primary">${fmt(c.spent)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-content-muted uppercase tracking-widest">Pending</p>
                              <p className="text-sm font-semibold text-amber-600">${fmt(c.pending)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-content-muted uppercase tracking-widest">Remaining</p>
                              <p className={`text-sm font-semibold ${c.over_budget ? "text-red-600" : "text-content-primary"}`}>
                                {c.over_budget ? "-" : ""}${fmt(c.remaining)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

          </div>
        )}
      </div>
    </Layout>
  );
}
