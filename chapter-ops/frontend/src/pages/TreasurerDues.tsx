import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { fetchPeriods, fetchPeriodDues, updateDuesRecord } from "@/services/periodService";
import { TOUR_TARGETS } from "@/tours/tourTargets";
import type { ChapterPeriod, ChapterPeriodDues, DuesStatus, MemberRole } from "@/types";
import {
  CheckCircle, AlertCircle, Clock, Shield, X, ChevronDown, Search, ArrowUpRight,
} from "lucide-react";

// ── Role gate ─────────────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_CELL: Record<DuesStatus, { bg: string; text: string; label: string; dot: string }> = {
  paid:    { bg: "bg-emerald-50",  text: "text-emerald-700", label: "Paid",    dot: "bg-emerald-500" },
  partial: { bg: "bg-amber-50",    text: "text-amber-700",   label: "Partial", dot: "bg-amber-500" },
  unpaid:  { bg: "bg-red-50",      text: "text-red-700",     label: "Unpaid",  dot: "bg-red-500" },
  exempt:  { bg: "bg-[var(--color-bg-card)]", text: "text-content-muted", label: "Exempt", dot: "bg-[var(--color-border)]" },
};

function StatusChip({ status }: { status: DuesStatus }) {
  const cfg = STATUS_CELL[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FeeTypeCol = {
  id: string;
  label: string;
  totalOwed: number;
  totalPaid: number;
  totalRemaining: number;
};

type MemberRow = {
  userId: string;
  fullName: string;
  email: string;
  byFeeType: Record<string, ChapterPeriodDues>;   // fee_type_id → dues record
  totalOwed: number;
  totalPaid: number;
  totalRemaining: number;
};

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditModal({
  dues,
  period,
  onClose,
  onSaved,
}: {
  dues: ChapterPeriodDues;
  period: ChapterPeriod;
  onClose: () => void;
  onSaved: (updated: ChapterPeriodDues) => void;
}) {
  const [amountOwed, setAmountOwed] = useState(dues.amount_owed);
  const [notes, setNotes] = useState(dues.notes ?? "");
  const [exempt, setExempt] = useState(dues.status === "exempt");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = { notes };
      if (exempt) {
        payload.status = "exempt";
      } else {
        payload.amount_owed = parseFloat(amountOwed);
      }
      const updated = await updateDuesRecord(period.id, dues.id, payload);
      onSaved(updated);
      onClose();
    } catch {
      setErr("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  const remaining = parseFloat(dues.amount_remaining);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-0.5">
              {dues.fee_type_label}
            </p>
            <h3 className="font-heading font-bold text-lg text-content-heading">
              {dues.user?.full_name ?? "Member"}
            </h3>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-primary mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current state */}
        <div className="px-6 py-4 bg-[var(--color-bg-deep)] border-b border-[var(--color-border)]">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-content-muted uppercase tracking-wider font-semibold mb-0.5">Owed</p>
              <p className="font-heading font-bold text-base text-content-heading">${parseFloat(dues.amount_owed).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-content-muted uppercase tracking-wider font-semibold mb-0.5">Paid</p>
              <p className="font-heading font-bold text-base text-emerald-600">${parseFloat(dues.amount_paid).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-content-muted uppercase tracking-wider font-semibold mb-0.5">Remaining</p>
              <p className={`font-heading font-bold text-base ${remaining > 0 ? "text-red-600" : "text-content-muted"}`}>
                ${remaining.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <StatusChip status={dues.status} />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
          {err && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 border border-red-200">{err}</p>
          )}

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={exempt}
              onChange={(e) => setExempt(e.target.checked)}
              className="w-4 h-4 accent-brand-primary-main"
            />
            <span className="text-sm text-content-primary font-medium">Mark as exempt (waive dues)</span>
          </label>

          {!exempt && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-content-muted mb-1.5">
                Amount Owed ($)
              </label>
              <input
                type="number" step="0.01" min="0"
                value={amountOwed}
                onChange={(e) => setAmountOwed(e.target.value)}
                className="w-full border border-[var(--color-border)] bg-[var(--color-bg-deep)] px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-brand-primary-main"
              />
              <p className="text-[10px] text-content-muted mt-1">Adjusting amount owed does not affect payments already recorded.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-content-muted mb-1.5">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment arrangement, scholarship, etc."
              className="w-full border border-[var(--color-border)] bg-[var(--color-bg-deep)] px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-brand-primary-main resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 text-sm font-semibold bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-content-secondary border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TreasurerDues() {
  const navigate = useNavigate();
  const { user, memberships } = useAuthStore();
  const { chapter } = useConfigStore();

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const isTreasurer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"];

  const [periods, setPeriods] = useState<ChapterPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [allDues, setAllDues] = useState<ChapterPeriodDues[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDues, setLoadingDues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<DuesStatus | "all">("all");
  const [editingDues, setEditingDues] = useState<ChapterPeriodDues | null>(null);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;

  // Load periods on mount
  useEffect(() => {
    (async () => {
      try {
        const ps = await fetchPeriods();
        setPeriods(ps);
        const active = ps.find((p) => p.is_active);
        if (active) setSelectedPeriodId(active.id);
        else if (ps.length > 0) setSelectedPeriodId(ps[0].id);
      } catch {
        setError("Failed to load periods.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load dues when period changes
  useEffect(() => {
    if (!selectedPeriodId) return;
    (async () => {
      setLoadingDues(true);
      try {
        const rows = await fetchPeriodDues(selectedPeriodId);
        setAllDues(rows);
      } catch {
        setError("Failed to load dues.");
      } finally {
        setLoadingDues(false);
      }
    })();
  }, [selectedPeriodId]);

  // ── Build matrix ────────────────────────────────────────────────────────────
  const { feeTypeCols, memberRows, grandTotals } = useMemo(() => {
    // Extract unique fee types (preserve order from first occurrence)
    const ftMap = new Map<string, FeeTypeCol>();
    for (const d of allDues) {
      if (!ftMap.has(d.fee_type_id)) {
        ftMap.set(d.fee_type_id, {
          id: d.fee_type_id,
          label: d.fee_type_label,
          totalOwed: 0,
          totalPaid: 0,
          totalRemaining: 0,
        });
      }
      const col = ftMap.get(d.fee_type_id)!;
      if (d.status !== "exempt") {
        col.totalOwed += parseFloat(d.amount_owed);
        col.totalPaid += parseFloat(d.amount_paid);
        col.totalRemaining += parseFloat(d.amount_remaining);
      }
    }
    const feeTypeCols = Array.from(ftMap.values()).sort((a, b) => a.label.localeCompare(b.label));

    // Group by user
    const userMap = new Map<string, MemberRow>();
    for (const d of allDues) {
      if (!userMap.has(d.user_id)) {
        userMap.set(d.user_id, {
          userId: d.user_id,
          fullName: d.user?.full_name ?? "Unknown",
          email: d.user?.email ?? "",
          byFeeType: {},
          totalOwed: 0,
          totalPaid: 0,
          totalRemaining: 0,
        });
      }
      const row = userMap.get(d.user_id)!;
      row.byFeeType[d.fee_type_id] = d;
      if (d.status !== "exempt") {
        row.totalOwed += parseFloat(d.amount_owed);
        row.totalPaid += parseFloat(d.amount_paid);
        row.totalRemaining += parseFloat(d.amount_remaining);
      }
    }
    const memberRows = Array.from(userMap.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );

    const grandTotals = {
      owed: memberRows.reduce((s, r) => s + r.totalOwed, 0),
      paid: memberRows.reduce((s, r) => s + r.totalPaid, 0),
      remaining: memberRows.reduce((s, r) => s + r.totalRemaining, 0),
      rate: 0,
    };
    grandTotals.rate = grandTotals.owed > 0
      ? Math.round((grandTotals.paid / grandTotals.owed) * 100)
      : 100;

    return { feeTypeCols, memberRows, grandTotals };
  }, [allDues]);

  // ── Filter rows ─────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return memberRows.filter((row) => {
      const matchesSearch = !search || row.fullName.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (filterStatus === "all") return true;
      // Member matches if ANY of their dues rows have this status
      return Object.values(row.byFeeType).some((d) => d.status === filterStatus);
    });
  }, [memberRows, search, filterStatus]);

  // Update a dues record in local state after edit
  function handleDuesSaved(updated: ChapterPeriodDues) {
    setAllDues((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  // ── Access gate ─────────────────────────────────────────────────────────────
  if (!isTreasurer) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-24 text-center">
          <p className="font-heading text-2xl font-bold text-content-heading mb-2">Access Restricted</p>
          <p className="text-sm text-content-muted">Treasurer or higher required to view chapter dues.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto animate-fade-in">

        {/* ── Editorial header ──────────────────────────────────────── */}
        <div className="mb-8">
          <div className="border-t-2 border-[var(--color-text-heading)] pt-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-content-muted mb-1">
                  {chapter?.name ?? "Chapter"} · Dues Overview
                </p>
                <h1 className="font-heading text-3xl md:text-4xl font-black text-content-heading tracking-tight">
                  Chapter Dues
                </h1>
              </div>

              {/* Period picker */}
              {periods.length > 0 && (
                <div className="relative mt-1">
                  <select
                    data-tour-target={TOUR_TARGETS.CHAPTER_DUES_PERIOD_PICKER}
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="appearance-none text-sm font-semibold bg-[var(--color-bg-card)] border border-[var(--color-border)] text-content-primary px-4 py-2 pr-8 focus:outline-none focus:border-brand-primary-main cursor-pointer"
                  >
                    {periods.map((p) => (
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
          <div className="mb-6 px-4 py-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 font-bold text-red-500">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-7 h-7 border-[3px] border-[var(--color-border)] border-t-brand-primary-main rounded-full animate-spin" />
          </div>
        ) : periods.length === 0 ? (
          <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-8 py-14 text-center">
            <p className="font-heading text-xl font-bold text-content-heading mb-2">No periods configured</p>
            <p className="text-sm text-content-muted">Go to Settings → Periods to create your first billing period.</p>
          </div>
        ) : (
          <>
            {/* ── Summary stats ─────────────────────────────────────── */}
            <div data-tour-target={TOUR_TARGETS.CHAPTER_DUES_COLLECTION_STATS} className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--color-border)] border border-[var(--color-border)] mb-8">
              {[
                { label: "Total Owed", value: `$${grandTotals.owed.toFixed(2)}`, sub: `${memberRows.length} member${memberRows.length !== 1 ? "s" : ""}` },
                { label: "Collected", value: `$${grandTotals.paid.toFixed(2)}`, sub: "payments recorded" },
                { label: "Outstanding", value: `$${grandTotals.remaining.toFixed(2)}`, sub: "still due", accent: grandTotals.remaining > 0 },
                { label: "Collection Rate", value: `${grandTotals.rate}%`, sub: "of total owed", accent: grandTotals.rate < 80 },
              ].map((stat) => (
                <div key={stat.label} className="bg-[var(--color-bg-card)] px-5 py-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1">{stat.label}</p>
                  <p className={`font-heading text-2xl font-black tracking-tight ${stat.accent ? "text-red-600" : "text-content-heading"}`}>
                    {stat.value}
                  </p>
                  <p className="text-[11px] text-content-muted mt-0.5">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* ── Filter bar ────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 mb-5">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search members…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-[var(--color-border)] bg-[var(--color-bg-card)] text-content-primary focus:outline-none focus:border-brand-primary-main"
                />
              </div>

              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as DuesStatus | "all")}
                  className="appearance-none text-sm bg-[var(--color-bg-card)] border border-[var(--color-border)] text-content-primary px-3 py-2 pr-7 focus:outline-none focus:border-brand-primary-main cursor-pointer"
                >
                  <option value="all">All statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                  <option value="exempt">Exempt</option>
                </select>
                <ChevronDown className="w-3 h-3 text-content-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {loadingDues ? (
              <div className="flex justify-center py-16">
                <div className="w-7 h-7 border-[3px] border-[var(--color-border)] border-t-brand-primary-main rounded-full animate-spin" />
              </div>
            ) : allDues.length === 0 ? (
              <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-8 py-14 text-center">
                <p className="font-heading text-xl font-bold text-content-heading mb-2">No dues records</p>
                <p className="text-sm text-content-muted">
                  No dues have been seeded for {selectedPeriod?.name ?? "this period"} yet.
                  Make sure fee types are configured in Settings, then activate the period to generate records.
                </p>
              </div>
            ) : (
              <>
                {/* ── Desktop matrix ─────────────────────────────── */}
                <div data-tour-target={TOUR_TARGETS.CHAPTER_DUES_MATRIX} className="hidden md:block overflow-x-auto border border-[var(--color-border)]">
                  <table className="w-full text-sm border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-[var(--color-bg-deep)] border-b border-[var(--color-border)]">
                        <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-content-muted w-48">
                          Member
                        </th>
                        {feeTypeCols.map((col) => (
                          <th key={col.id} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-content-muted min-w-[160px]">
                            {col.label}
                          </th>
                        ))}
                        <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
                          Total Remaining
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={feeTypeCols.length + 2} className="px-5 py-10 text-center text-sm text-content-muted">
                            No members match the current filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr key={row.userId} className="hover:bg-[var(--color-bg-card-hover)] transition-colors group">
                            <td className="px-5 py-3">
                              <p className="font-medium text-content-primary text-sm">{row.fullName}</p>
                              <p className="text-[11px] text-content-muted">{row.email}</p>
                            </td>
                            {feeTypeCols.map((col) => {
                              const d = row.byFeeType[col.id];
                              if (!d) return (
                                <td key={col.id} className="px-4 py-3 text-content-muted text-xs">—</td>
                              );
                              return (
                                <td key={col.id} className="px-4 py-3">
                                  <button
                                    data-tour-target={TOUR_TARGETS.CHAPTER_DUES_INLINE_EDIT}
                                    onClick={() => setEditingDues(d)}
                                    className="text-left group/cell hover:opacity-80 transition-opacity"
                                    title="Click to adjust"
                                  >
                                    <StatusChip status={d.status} />
                                    {d.status !== "exempt" && (
                                      <p className="text-[11px] text-content-muted mt-1">
                                        ${parseFloat(d.amount_paid).toFixed(2)} / ${parseFloat(d.amount_owed).toFixed(2)}
                                      </p>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-5 py-3 text-right">
                              <span className={`font-heading font-bold text-sm ${row.totalRemaining > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                {row.totalRemaining > 0 ? `$${row.totalRemaining.toFixed(2)}` : "✓ Clear"}
                              </span>
                              {row.totalRemaining > 0 && (
                                <button
                                  onClick={() => navigate(`/payments?member_id=${row.userId}`)}
                                  className="ml-2 inline-flex items-center text-[10px] text-content-muted hover:text-brand-primary-main transition-colors"
                                  title="Record payment"
                                >
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>

                    {/* Column totals footer */}
                    <tfoot>
                      <tr className="border-t-2 border-[var(--color-text-heading)] bg-[var(--color-bg-deep)]">
                        <td className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-content-muted">
                          Totals
                        </td>
                        {feeTypeCols.map((col) => {
                          const rate = col.totalOwed > 0 ? Math.round((col.totalPaid / col.totalOwed) * 100) : 100;
                          return (
                            <td key={col.id} className="px-4 py-3">
                              <p className="font-heading font-bold text-sm text-content-heading">${col.totalPaid.toFixed(2)} collected</p>
                              <p className="text-[11px] text-content-muted">{rate}% of ${col.totalOwed.toFixed(2)}</p>
                              <div className="mt-1.5 h-1 bg-[var(--color-border)] w-24">
                                <div
                                  className={`h-1 ${rate >= 100 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${rate}%` }}
                                />
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-5 py-3 text-right">
                          <p className="font-heading font-bold text-sm text-content-heading">${grandTotals.remaining.toFixed(2)} due</p>
                          <p className="text-[11px] text-content-muted">{grandTotals.rate}% collected</p>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* ── Mobile card list ───────────────────────────── */}
                <div className="md:hidden space-y-3">
                  {filteredRows.length === 0 ? (
                    <p className="text-center text-sm text-content-muted py-10">No members match the current filter.</p>
                  ) : (
                    filteredRows.map((row) => (
                      <div key={row.userId} className="border border-[var(--color-border)] bg-[var(--color-bg-card)]">
                        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm text-content-primary">{row.fullName}</p>
                            <p className="text-[11px] text-content-muted">{row.email}</p>
                          </div>
                          <span className={`font-heading font-bold text-sm ${row.totalRemaining > 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {row.totalRemaining > 0 ? `-$${row.totalRemaining.toFixed(2)}` : "Clear"}
                          </span>
                        </div>
                        <div className="divide-y divide-[var(--color-border)]">
                          {feeTypeCols.map((col) => {
                            const d = row.byFeeType[col.id];
                            if (!d) return null;
                            return (
                              <button
                                key={col.id}
                                onClick={() => setEditingDues(d)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-bg-card-hover)] transition-colors"
                              >
                                <span className="text-sm text-content-secondary">{col.label}</span>
                                <div className="flex items-center gap-2">
                                  {d.status !== "exempt" && (
                                    <span className="text-[11px] text-content-muted">
                                      ${parseFloat(d.amount_paid).toFixed(2)}/${parseFloat(d.amount_owed).toFixed(2)}
                                    </span>
                                  )}
                                  <StatusChip status={d.status} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <p className="mt-3 text-xs text-content-muted">
                  Click any cell to adjust amount, mark exempt, or add a note.
                  Payments are recorded on the <button onClick={() => navigate("/payments")} className="underline underline-offset-2 hover:text-content-secondary">Payments</button> page.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Edit modal ────────────────────────────────────────────── */}
      {editingDues && selectedPeriod && (
        <EditModal
          dues={editingDues}
          period={selectedPeriod}
          onClose={() => setEditingDues(null)}
          onSaved={handleDuesSaved}
        />
      )}
    </Layout>
  );
}
