import { useEffect, useState, useRef } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchExpenses,
  submitExpense,
  updateExpense,
  deleteExpense,
  uploadReceipt,
  getExportUrl,
} from "@/services/expenseService";
import { fetchCommittees } from "@/services/committeeService";
import type {
  Expense,
  ExpenseStatus,
  ExpenseCategory,
  ExpenseSummary,
  CreateExpenseRequest,
  Committee,
} from "@/types";
import {
  Receipt,
  Plus,
  Check,
  X,
  Upload,
  Download,
  FileText,
  AlertCircle,
  Paperclip,
  RotateCcw,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_TABS: { key: ExpenseStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "denied", label: "Denied" },
];

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  pending: "bg-amber-900/30 text-amber-400 border-amber-700",
  approved: "bg-emerald-900/30 text-emerald-400 border-emerald-700",
  paid: "bg-blue-900/30 text-blue-400 border-blue-700",
  denied: "bg-red-900/30 text-red-400 border-red-700",
};

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  paid: "Paid",
  denied: "Denied",
};

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "travel", label: "Travel" },
  { value: "supplies", label: "Supplies" },
  { value: "equipment", label: "Equipment" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "venue", label: "Venue" },
  { value: "other", label: "Other" },
];

function formatAmount(amount: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    parseFloat(amount)
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Expenses() {
  const { memberships, user } = useAuthStore();
  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const roleHierarchy: Record<string, number> = {
    member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
    regional_director: 5, regional_1st_vice: 4,
  };
  const role = currentMembership?.role ?? "member";
  const roleRank = roleHierarchy[role] ?? 0;
  const isOfficer = roleRank >= (roleHierarchy["treasurer"] ?? 2) && roleRank <= (roleHierarchy["president"] ?? 4);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());

  useEffect(() => { loadExpenses(); }, [statusFilter]);

  async function loadExpenses() {
    try {
      setLoading(true);
      const data = await fetchExpenses(statusFilter === "all" ? undefined : statusFilter);
      setExpenses(data.expenses);
      setSummary(data.summary);
    } catch {
      setError("Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }

  function handleExpenseUpdated(updated: Expense) {
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setDetailExpense(updated);
  }

  async function handleDelete(expense: Expense) {
    if (!confirm(`Cancel "${expense.title}"?`)) return;
    try {
      await deleteExpense(expense.id);
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
      setDetailExpense(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg || "Failed to cancel expense.");
    }
  }

  const currentYear = new Date().getFullYear();
  const exportYears = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h2 className="text-3xl font-heading font-extrabold text-content-primary tracking-tight">
              Expenses
            </h2>
            <p className="text-content-secondary mt-1">
              {isOfficer ? "Manage reimbursement requests" : "Submit and track your reimbursement requests"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isOfficer && (
              <div className="flex items-center gap-1">
                <select
                  value={exportYear}
                  onChange={(e) => setExportYear(parseInt(e.target.value))}
                  className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-surface-card-solid text-content-secondary focus:outline-none"
                >
                  {exportYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <a
                  href={getExportUrl(exportYear)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border)] rounded-lg hover:bg-white/5 transition-colors"
                >
                  <Download className="w-4 h-4" /> CSV
                </a>
              </div>
            )}
            <button
              onClick={() => setSubmitOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary-main text-white rounded-xl text-sm font-semibold hover:bg-brand-primary-dark transition-colors shadow-glass"
            >
              <Plus className="w-4 h-4" /> Submit Request
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-red-900/20 border-l-4 border-red-500 text-red-400 rounded-lg text-sm font-medium flex justify-between items-center">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span>
            <button onClick={() => setError(null)} className="text-lg font-bold px-2">&times;</button>
          </div>
        )}

        {/* Summary cards — officer only */}
        {isOfficer && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Pending Requests" value={String(summary.pending_count)} sub="requests" accent="amber" />
            <SummaryCard label="Pending Amount" value={formatAmount(summary.pending_amount)} accent="amber" />
            <SummaryCard label="Approved" value={formatAmount(summary.approved_amount)} accent="emerald" />
            <SummaryCard label="Total Paid Out" value={formatAmount(summary.paid_amount)} accent="blue" />
          </div>
        )}

        {/* Status tabs */}
        <div className="flex gap-1 mb-5 overflow-x-auto scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border ${
                statusFilter === tab.key
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-surface-card-solid text-content-secondary border-[var(--color-border)] hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Expense list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand-primary-light border-t-brand-primary-main rounded-full animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="bg-surface-card-solid backdrop-blur-xl rounded-2xl shadow-glass border border-[var(--color-border)] p-14 text-center">
            <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-7 h-7 text-content-muted" />
            </div>
            <h3 className="text-base font-semibold text-content-primary mb-1">No expenses yet</h3>
            <p className="text-sm text-content-secondary">
              {statusFilter === "all"
                ? "Submit a reimbursement request to get started."
                : `No ${statusFilter} expenses found.`}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-surface-card-solid rounded-2xl shadow-glass border border-[var(--color-border)] overflow-hidden">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Expense</th>
                    {isOfficer && <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Submitted By</th>}
                    <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {expenses.map((expense) => (
                    <tr key={expense.id}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                      onClick={() => setDetailExpense(expense)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-sm font-semibold text-content-primary group-hover:text-brand-primary-dark">
                              {expense.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-xs text-content-muted">{expense.category_label}</p>
                              {expense.committee && (
                                <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-content-muted">
                                  {expense.committee.name}
                                </span>
                              )}
                            </div>
                          </div>
                          {expense.receipt_url && (
                            <Paperclip className="w-3.5 h-3.5 text-content-muted shrink-0" />
                          )}
                        </div>
                      </td>
                      {isOfficer && (
                        <td className="px-6 py-4 text-sm text-content-secondary">
                          {expense.submitted_by?.full_name}
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-content-secondary">
                        {new Date(expense.expense_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-content-primary">
                        {formatAmount(expense.amount)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[expense.status]}`}>
                          {STATUS_LABELS[expense.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100">
                        <span className="text-xs text-brand-primary-main font-medium">View →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {expenses.map((expense) => (
                <div key={expense.id}
                  className="bg-surface-card-solid rounded-2xl shadow-glass border border-[var(--color-border)] p-4 cursor-pointer"
                  onClick={() => setDetailExpense(expense)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-content-primary text-sm">{expense.title}</p>
                      <p className="text-xs text-content-muted mt-0.5">{expense.category_label}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[expense.status]}`}>
                      {STATUS_LABELS[expense.status]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-content-primary">{formatAmount(expense.amount)}</span>
                    <span className="text-xs text-content-muted">
                      {new Date(expense.expense_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    {isOfficer && expense.submitted_by ? (
                      <p className="text-xs text-content-secondary">{expense.submitted_by.full_name}</p>
                    ) : <span />}
                    {expense.committee && (
                      <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-content-muted">
                        {expense.committee.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Submit Modal */}
      {submitOpen && (
        <SubmitExpenseModal
          onClose={() => setSubmitOpen(false)}
          onSubmitted={(e) => {
            setExpenses((prev) => [e, ...prev]);
            setSubmitOpen(false);
            loadExpenses(); // refresh summary
          }}
        />
      )}

      {/* Detail Modal */}
      {detailExpense && (
        <ExpenseDetailModal
          expense={detailExpense}
          isOfficer={isOfficer}
          currentUserId={user?.id ?? ""}
          onClose={() => setDetailExpense(null)}
          onUpdated={handleExpenseUpdated}
          onDeleted={() => handleDelete(detailExpense)}
        />
      )}
    </Layout>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent: "amber" | "emerald" | "blue";
}) {
  const colors = {
    amber: "bg-amber-900/20 border-amber-700 text-amber-400",
    emerald: "bg-emerald-900/20 border-emerald-700 text-emerald-400",
    blue: "bg-blue-900/20 border-blue-700 text-blue-400",
  }[accent];
  return (
    <div className={`${colors} border rounded-xl p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Submit Expense Modal ───────────────────────────────────────────────────────

function SubmitExpenseModal({
  onClose, onSubmitted,
}: { onClose: () => void; onSubmitted: (e: Expense) => void }) {
  const [form, setForm] = useState<CreateExpenseRequest>({
    title: "", amount: 0, category: "other",
    expense_date: new Date().toISOString().split("T")[0] ?? "",
    notes: "", committee_id: null,
  });
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchCommittees().then(setCommittees).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const created = await submitExpense({
        ...form,
        notes: form.notes?.trim() || undefined,
      });
      onSubmitted(created);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(msg || "Failed to submit expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 backdrop-blur-sm p-4">
      <form onSubmit={handleSubmit}
        className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-[var(--color-border)] bg-white/5 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-heading font-semibold text-content-primary">Submit Expense Request</h3>
          <button type="button" onClick={onClose} className="text-content-muted hover:text-content-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {err && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">Description *</label>
            <input required value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Chapter retreat supplies"
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted text-sm">$</span>
                <input required type="number" min="0.01" step="0.01"
                  value={form.amount || ""}
                  onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) }))}
                  className="w-full rounded-xl border border-[var(--color-border)] pl-7 pr-3 py-2 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Date *</label>
              <input required type="date" value={form.expense_date}
                onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">Category *</label>
            <select value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {committees.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Committee (optional)</label>
              <select
                value={form.committee_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, committee_id: e.target.value || null }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main"
              >
                <option value="">— No committee —</option>
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">Notes</label>
            <textarea rows={3} value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Additional context for the treasurer..."
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-brand-primary-main resize-none" />
          </div>
        </div>

        <div className="px-6 py-4 bg-white/5 border-t border-[var(--color-border)] flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border)] rounded-xl hover:bg-white/5">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark disabled:opacity-50">
            {saving ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Expense Detail Modal ───────────────────────────────────────────────────────

function ExpenseDetailModal({
  expense, isOfficer, currentUserId, onClose, onUpdated, onDeleted,
}: {
  expense: Expense;
  isOfficer: boolean;
  currentUserId: string;
  onClose: () => void;
  onUpdated: (e: Expense) => void;
  onDeleted: () => void;
}) {
  const isOwn = expense.submitted_by_id === currentUserId;
  const [denialReason, setDenialReason] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function doAction(action: "approve" | "deny" | "mark_paid" | "reopen", extra?: object) {
    setActing(true);
    setErr(null);
    try {
      const updated = await updateExpense(expense.id, { action, ...extra });
      onUpdated(updated);
      setDenyOpen(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(msg || "Action failed.");
    } finally {
      setActing(false);
    }
  }

  async function handleReceiptUpload(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const updated = await uploadReceipt(expense.id, file);
      onUpdated(updated);
    } catch {
      setErr("Failed to upload receipt.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 backdrop-blur-sm p-4">
      <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--color-border)] bg-white/5 flex items-start justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-heading font-bold text-content-primary">{expense.title}</h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[expense.status]}`}>
                {STATUS_LABELS[expense.status]}
              </span>
            </div>
            <p className="text-sm text-content-secondary mt-0.5">
              {expense.category_label} ·{" "}
              {new Date(expense.expense_date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-secondary shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {err && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}

          {/* Amount */}
          <div className="text-center py-4 bg-white/5 rounded-xl border border-[var(--color-border)]">
            <p className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-1">Amount Requested</p>
            <p className="text-3xl font-bold text-content-primary">{formatAmount(expense.amount)}</p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {isOfficer && expense.submitted_by && (
              <InfoPill label="Submitted By" value={expense.submitted_by.full_name} />
            )}
            {expense.reviewer && (
              <InfoPill label="Reviewed By" value={expense.reviewer.full_name} />
            )}
            {expense.paid_at && (
              <InfoPill label="Paid On" value={new Date(expense.paid_at).toLocaleDateString()} />
            )}
          </div>

          {/* Notes */}
          {expense.notes && (
            <div className="bg-white/5 rounded-xl p-3 border border-[var(--color-border)]">
              <p className="text-xs font-semibold text-content-muted mb-1">Notes</p>
              <p className="text-sm text-content-secondary whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}

          {/* Denial reason */}
          {expense.denial_reason && (
            <div className="bg-red-900/20 rounded-xl p-3 border border-red-900/30">
              <p className="text-xs font-semibold text-red-400 mb-1">Denial Reason</p>
              <p className="text-sm text-red-400">{expense.denial_reason}</p>
            </div>
          )}

          {/* Receipt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-content-secondary">Receipt</p>
              {(isOwn || isOfficer) && expense.status === "pending" && (
                <>
                  <button onClick={() => receiptRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-main hover:text-brand-primary-dark">
                    <Upload className="w-3.5 h-3.5" />
                    {expense.receipt_url ? "Replace" : "Upload"}
                  </button>
                  <input ref={receiptRef} type="file" className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
                    onChange={(e) => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])} />
                </>
              )}
            </div>
            {expense.receipt_url ? (
              <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-[var(--color-border)] hover:bg-white/10 transition-colors group">
                <FileText className="w-5 h-5 text-content-muted shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content-primary truncate group-hover:text-brand-primary-main">
                    {expense.receipt_name || "Receipt"}
                  </p>
                  {expense.receipt_size && (
                    <p className="text-xs text-content-muted">{formatFileSize(expense.receipt_size)}</p>
                  )}
                </div>
                <Download className="w-4 h-4 text-content-muted group-hover:text-brand-primary-main shrink-0" />
              </a>
            ) : (
              <p className="text-sm text-content-muted italic">No receipt attached.</p>
            )}
            {uploading && <p className="text-xs text-brand-primary-main mt-1">Uploading...</p>}
          </div>

          {/* Deny input */}
          {denyOpen && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-content-secondary">Reason for denial (optional)</label>
              <textarea rows={2} value={denialReason}
                onChange={(e) => setDenialReason(e.target.value)}
                placeholder="Provide context to the member..."
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-[var(--color-bg-input)] focus:bg-[var(--color-bg-input)] focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              <div className="flex gap-2">
                <button onClick={() => setDenyOpen(false)}
                  className="px-3 py-1.5 text-sm text-content-secondary bg-surface-card-solid border border-[var(--color-border)] rounded-lg hover:bg-white/5">Cancel</button>
                <button onClick={() => doAction("deny", { denial_reason: denialReason || null })}
                  disabled={acting}
                  className="px-4 py-1.5 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50">
                  {acting ? "Denying..." : "Confirm Deny"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/5 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex gap-2 flex-wrap">
            {/* Officer actions */}
            {isOfficer && expense.status === "pending" && !denyOpen && (
              <>
                <button onClick={() => doAction("approve")} disabled={acting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50">
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button onClick={() => setDenyOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600">
                  <X className="w-4 h-4" /> Deny
                </button>
              </>
            )}
            {isOfficer && expense.status === "approved" && (
              <button onClick={() => doAction("mark_paid")} disabled={acting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark disabled:opacity-50">
                <Check className="w-4 h-4" /> Mark Paid
              </button>
            )}
            {isOfficer && (expense.status === "denied" || expense.status === "approved") && (
              <button onClick={() => doAction("reopen")} disabled={acting}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-content-secondary bg-surface-card-solid border border-[var(--color-border)] rounded-xl hover:bg-white/5">
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </button>
            )}
          </div>
          {/* Delete/cancel */}
          {(isOwn && expense.status === "pending") || isOfficer ? (
            <button onClick={onDeleted}
              className="text-sm text-red-400 hover:text-red-300 font-medium">
              {expense.status === "pending" ? "Cancel request" : "Delete"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-xl px-3 py-2 border border-[var(--color-border)]">
      <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-content-primary mt-0.5">{value}</p>
    </div>
  );
}
