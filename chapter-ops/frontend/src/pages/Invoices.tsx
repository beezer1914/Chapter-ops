import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { fetchMembers } from "@/services/chapterService";
import {
  fetchInvoices,
  createInvoice,
  bulkCreateInvoices,
  updateInvoice,
  sendInvoice,
  bulkSendInvoices,
  fetchInvoiceSummary,
  fetchChapterBills,
} from "@/services/invoiceService";
import { createDuesCheckout } from "@/services/stripeService";
import type {
  InvoiceWithUser,
  InvoiceSummary,
  ChapterBillInvoice,
  MemberWithUser,
  MemberRole,
  InvoiceStatus,
} from "@/types";
import {
  FileText,
  Send,
  Plus,
  Users,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  CreditCard,
} from "lucide-react";

const ROLE_HIERARCHY: Record<string, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
  regional_director: 5, regional_1st_vice: 4,
};

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; bg: string; text: string; icon: typeof Clock }> = {
  draft: { label: "Draft", bg: "bg-gray-800/50", text: "text-content-muted", icon: FileText },
  sent: { label: "Sent", bg: "bg-blue-900/30", text: "text-blue-400", icon: Send },
  paid: { label: "Paid", bg: "bg-emerald-900/30", text: "text-emerald-400", icon: CheckCircle2 },
  overdue: { label: "Overdue", bg: "bg-red-900/30", text: "text-red-400", icon: AlertCircle },
  cancelled: { label: "Cancelled", bg: "bg-gray-800/50", text: "text-content-muted", icon: XCircle },
};

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(amount: string | number): string {
  return `$${parseFloat(String(amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Invoices() {
  const { memberships, user } = useAuthStore();
  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const userRole = (currentMembership?.role ?? "member") as MemberRole;
  const canManage = (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY["treasurer"] ?? 2);

  const [error, setError] = useState<string | null>(null);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto anim-section-reveal">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-heading font-bold text-content-primary">Invoices</h1>
            <p className="text-sm text-content-secondary mt-1">
              {canManage ? "Create and manage dues invoices for chapter members." : "View your invoices and payment status."}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline text-red-400">Dismiss</button>
          </div>
        )}

        {canManage ? (
          <TreasurerView setError={setError} />
        ) : (
          <MemberView setError={setError} />
        )}
      </div>
    </Layout>
  );
}

// ── Member View ─────────────────────────────────────────────────────────

function MemberView({ setError }: { setError: (e: string | null) => void }) {
  const [invoices, setInvoices] = useState<InvoiceWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    setLoading(true);
    try {
      const data = await fetchInvoices(filter ? { status: filter } : undefined);
      setInvoices(data);
    } catch {
      setError("Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInvoices(); }, [filter]);

  async function handlePay(invoice: InvoiceWithUser) {
    setPayingId(invoice.id);
    setError(null);
    try {
      const checkoutUrl = await createDuesCheckout({
        amount: parseFloat(invoice.amount),
        invoice_id: invoice.id,
        notes: `Payment for ${invoice.invoice_number}: ${invoice.description}`,
      });
      window.location.href = checkoutUrl;
    } catch {
      setError("Unable to start payment. Your chapter may not have Stripe connected yet.");
      setPayingId(null);
    }
  }

  const unpaid = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const totalOwed = unpaid.reduce((sum, i) => sum + parseFloat(i.amount), 0);

  if (loading) return <p className="text-content-secondary text-sm py-12 text-center">Loading invoices...</p>;

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      {unpaid.length > 0 && (
        <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-900/30 rounded-xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-900/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-400">Outstanding Balance</p>
              <p className="text-2xl font-heading font-bold text-amber-300">{formatCurrency(totalOwed)}</p>
            </div>
          </div>
          <p className="text-sm text-amber-400">{unpaid.length} unpaid invoice{unpaid.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {["", "sent", "paid", "overdue"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${filter === s ? "bg-brand-primary text-white" : "bg-white/10 text-content-secondary hover:bg-white/15"}`}
          >
            {s === "" ? "All" : STATUS_CONFIG[s as InvoiceStatus]?.label}
          </button>
        ))}
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-content-muted mx-auto mb-3" />
          <p className="text-content-secondary text-sm">No invoices found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const cfg = STATUS_CONFIG[inv.status as InvoiceStatus] ?? STATUS_CONFIG.draft;
            const StatusIcon = cfg.icon;
            const canPay = inv.status === "sent" || inv.status === "overdue";
            return (
              <div key={inv.id} className="bg-surface-card-solid border border-[var(--color-border)] rounded-xl p-5 hover:border-[var(--color-border-brand)] transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-mono text-content-muted">{inv.invoice_number}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </div>
                    <p className="font-medium text-content-primary">{inv.description}</p>
                    <p className="text-sm text-content-secondary mt-1">Due {formatDate(inv.due_date)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-xl font-heading font-bold text-content-primary">{formatCurrency(inv.amount)}</p>
                    {canPay && (
                      <button
                        onClick={() => handlePay(inv)}
                        disabled={payingId === inv.id}
                        className="inline-flex items-center gap-1.5 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition disabled:opacity-50"
                      >
                        <CreditCard className="w-4 h-4" />
                        {payingId === inv.id ? "Redirecting..." : "Pay Now"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Treasurer View ──────────────────────────────────────────────────────

function TreasurerView({ setError }: { setError: (e: string | null) => void }) {
  const [invoices, setInvoices] = useState<InvoiceWithUser[]>([]);
  const [chapterBills, setChapterBills] = useState<ChapterBillInvoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [showForm, setShowForm] = useState<"single" | "bulk" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { getFeeTypes } = useConfigStore();
  const feeTypes = getFeeTypes();

  // Single form
  const [formUserId, setFormUserId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formFeeType, setFormFeeType] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Bulk form
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkDescription, setBulkDescription] = useState("");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkFeeType, setBulkFeeType] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkExcludeFinancial, setBulkExcludeFinancial] = useState(true);

  const [initialized, setInitialized] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invoicesData, membersData, summaryData, billsData] = await Promise.all([
        fetchInvoices(filter ? { status: filter } : undefined),
        fetchMembers(),
        fetchInvoiceSummary(),
        fetchChapterBills().catch(() => [] as ChapterBillInvoice[]),
      ]);
      setInvoices(invoicesData);
      setMembers(membersData);
      setSummary(summaryData);
      setChapterBills(billsData);
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }

  useEffect(() => {
    if (!initialized) return;
    fetchInvoices(filter ? { status: filter } : undefined)
      .then(setInvoices)
      .catch(() => setError("Failed to filter invoices."));
  }, [filter]);

  async function handleCreateSingle(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const inv = await createInvoice({
        billed_user_id: formUserId,
        amount: parseFloat(formAmount),
        description: formDescription,
        due_date: formDueDate,
        fee_type_id: formFeeType || undefined,
        notes: formNotes || undefined,
      });
      setInvoices((prev) => [inv, ...prev]);
      setShowForm(null);
      resetSingleForm();
      const s = await fetchInvoiceSummary();
      setSummary(s);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to create invoice.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateBulk(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await bulkCreateInvoices({
        amount: parseFloat(bulkAmount),
        description: bulkDescription,
        due_date: bulkDueDate,
        fee_type_id: bulkFeeType || undefined,
        notes: bulkNotes || undefined,
        exclude_statuses: bulkExcludeFinancial ? ["financial", "exempt"] : undefined,
      });
      setInvoices((prev) => [...result.invoices, ...prev]);
      setShowForm(null);
      resetBulkForm();
      const s = await fetchInvoiceSummary();
      setSummary(s);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to create invoices.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend(invoiceId: string) {
    try {
      const updated = await sendInvoice(invoiceId);
      setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      const s = await fetchInvoiceSummary();
      setSummary(s);
    } catch {
      setError("Failed to send invoice.");
    }
  }

  async function handleBulkSend() {
    try {
      const draftIds = invoices.filter((i) => i.status === "draft").map((i) => i.id);
      await bulkSendInvoices(draftIds);
      await loadData();
    } catch {
      setError("Failed to send invoices.");
    }
  }

  async function handleCancel(invoiceId: string) {
    try {
      const updated = await updateInvoice(invoiceId, { status: "cancelled" });
      setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      const s = await fetchInvoiceSummary();
      setSummary(s);
    } catch {
      setError("Failed to cancel invoice.");
    }
  }

  async function handleMarkPaid(invoiceId: string) {
    try {
      const updated = await updateInvoice(invoiceId, { status: "paid" });
      setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      const s = await fetchInvoiceSummary();
      setSummary(s);
    } catch {
      setError("Failed to update invoice.");
    }
  }

  function resetSingleForm() {
    setFormUserId(""); setFormAmount(""); setFormDescription("");
    setFormDueDate(""); setFormFeeType(""); setFormNotes("");
  }

  function resetBulkForm() {
    setBulkAmount(""); setBulkDescription(""); setBulkDueDate("");
    setBulkFeeType(""); setBulkNotes(""); setBulkExcludeFinancial(true);
  }

  if (loading) return <p className="text-content-secondary text-sm py-12 text-center">Loading invoices...</p>;

  const draftCount = invoices.filter((i) => i.status === "draft").length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Invoiced"
            value={formatCurrency(summary.total_invoiced)}
            sub={`${summary.total_count} invoices`}
            icon={<DollarSign className="w-5 h-5" />}
            color="blue"
          />
          <SummaryCard
            label="Paid"
            value={formatCurrency(summary.by_status.paid?.amount ?? "0")}
            sub={`${summary.by_status.paid?.count ?? 0} invoices`}
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="emerald"
          />
          <SummaryCard
            label="Outstanding"
            value={formatCurrency(
              String(parseFloat(summary.by_status.sent?.amount ?? "0") + parseFloat(summary.by_status.overdue?.amount ?? "0"))
            )}
            sub={`${(summary.by_status.sent?.count ?? 0) + (summary.by_status.overdue?.count ?? 0)} invoices`}
            icon={<Clock className="w-5 h-5" />}
            color="amber"
          />
          <SummaryCard
            label="Overdue"
            value={formatCurrency(summary.by_status.overdue?.amount ?? "0")}
            sub={`${summary.by_status.overdue?.count ?? 0} invoices`}
            icon={<AlertCircle className="w-5 h-5" />}
            color="red"
          />
        </div>
      )}

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowForm(showForm === "single" ? null : "single")}
          className="inline-flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
        <button
          onClick={() => setShowForm(showForm === "bulk" ? null : "bulk")}
          className="inline-flex items-center gap-2 bg-surface-card-solid border border-[var(--color-border-brand)] text-content-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition"
        >
          <Users className="w-4 h-4" />
          Bulk Invoice
        </button>
        {draftCount > 0 && (
          <button
            onClick={handleBulkSend}
            className="inline-flex items-center gap-2 bg-brand-primary-main text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition"
          >
            <Send className="w-4 h-4" />
            Send All Drafts ({draftCount})
          </button>
        )}

        {/* Filter pills */}
        <div className="ml-auto flex gap-2">
          {["", "draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${filter === s ? "bg-brand-primary text-white" : "bg-white/10 text-content-secondary hover:bg-white/15"}`}
            >
              {s === "" ? "All" : STATUS_CONFIG[s as InvoiceStatus]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Single invoice form */}
      {showForm === "single" && (
        <form onSubmit={handleCreateSingle} className="bg-surface-card-solid border border-[var(--color-border)] rounded-xl p-6 space-y-4">
          <h3 className="font-heading font-bold text-content-primary">Create Invoice</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Member</label>
              <select value={formUserId} onChange={(e) => setFormUserId(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary">
                <option value="">Select member...</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.first_name} {m.user.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Amount ($)</label>
              <input type="number" step="0.01" min="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Description</label>
              <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} required
                placeholder="e.g., Spring 2026 Dues"
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Due Date</label>
              <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
            {feeTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Fee Type <span className="text-content-muted font-normal">(optional)</span></label>
                <select value={formFeeType} onChange={(e) => setFormFeeType(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary">
                  <option value="">None</option>
                  {feeTypes.map((ft) => (
                    <option key={ft.id} value={ft.id}>{ft.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Notes <span className="text-content-muted font-normal">(optional)</span></label>
              <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting}
              className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition disabled:opacity-50">
              {submitting ? "Creating..." : "Create Invoice"}
            </button>
            <button type="button" onClick={() => { setShowForm(null); resetSingleForm(); }}
              className="text-content-secondary hover:text-content-secondary text-sm font-medium px-4 py-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Bulk invoice form */}
      {showForm === "bulk" && (
        <form onSubmit={handleCreateBulk} className="bg-surface-card-solid border border-[var(--color-border)] rounded-xl p-6 space-y-4">
          <h3 className="font-heading font-bold text-content-primary">Bulk Invoice — All Members</h3>
          <p className="text-sm text-content-secondary">This will create an invoice for every active member in the chapter.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Amount ($) per member</label>
              <input type="number" step="0.01" min="0.01" value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Due Date</label>
              <input type="date" value={bulkDueDate} onChange={(e) => setBulkDueDate(e.target.value)} required
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-content-secondary mb-1">Description</label>
              <input type="text" value={bulkDescription} onChange={(e) => setBulkDescription(e.target.value)} required
                placeholder="e.g., Spring 2026 Chapter Dues"
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
            {feeTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Fee Type <span className="text-content-muted font-normal">(optional)</span></label>
                <select value={bulkFeeType} onChange={(e) => setBulkFeeType(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary">
                  <option value="">None</option>
                  {feeTypes.map((ft) => (
                    <option key={ft.id} value={ft.id}>{ft.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Notes <span className="text-content-muted font-normal">(optional)</span></label>
              <input type="text" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-brand-primary" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-content-secondary">
            <input type="checkbox" checked={bulkExcludeFinancial} onChange={(e) => setBulkExcludeFinancial(e.target.checked)}
              className="rounded border-[var(--color-border-brand)] text-brand-primary focus:ring-brand-primary" />
            Skip members already marked as Financial or Exempt
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting}
              className="bg-brand-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-primary-dark transition disabled:opacity-50">
              {submitting ? "Creating..." : `Invoice All Members (${members.length})`}
            </button>
            <button type="button" onClick={() => { setShowForm(null); resetBulkForm(); }}
              className="text-content-secondary hover:text-content-secondary text-sm font-medium px-4 py-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Invoice table */}
      {invoices.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-content-muted mx-auto mb-3" />
          <p className="text-content-secondary text-sm">No invoices yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {invoices.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} onSend={handleSend} onCancel={handleCancel} onMarkPaid={handleMarkPaid} />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-surface-card-solid border border-[var(--color-border)] rounded-xl overflow-hidden">
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Member</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.map((inv) => {
                  const cfg = STATUS_CONFIG[inv.status as InvoiceStatus] ?? STATUS_CONFIG.draft;
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={inv.id} className="hover:bg-white/5 transition">
                      <td className="px-6 py-4">
                        <p className="text-xs font-mono text-content-muted">{inv.invoice_number}</p>
                        <p className="text-sm font-medium text-content-primary mt-0.5">{inv.description}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-content-secondary">
                        {inv.billed_user ? `${inv.billed_user.first_name} ${inv.billed_user.last_name}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-content-primary">{formatCurrency(inv.amount)}</td>
                      <td className="px-6 py-4 text-sm text-content-secondary">{formatDate(inv.due_date)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {inv.status === "draft" && (
                            <button onClick={() => handleSend(inv.id)}
                              className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                              Send
                            </button>
                          )}
                          {(inv.status === "sent" || inv.status === "overdue") && (
                            <button onClick={() => handleMarkPaid(inv.id)}
                              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">
                              Mark Paid
                            </button>
                          )}
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <button onClick={() => handleCancel(inv.id)}
                              className="text-xs text-content-muted hover:text-red-400 font-medium">
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Regional Invoices (head tax billed to this chapter) ──────── */}
      {chapterBills.length > 0 && (
        <div className="space-y-4 mt-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-900/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-heading font-bold text-content-primary">Regional Invoices</h2>
              <p className="text-xs text-content-secondary">Head tax and fees billed to your chapter by the region</p>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {chapterBills.map((inv) => {
              const cfg = STATUS_CONFIG[inv.status as InvoiceStatus] ?? STATUS_CONFIG.draft;
              const StatusIcon = cfg.icon;
              return (
                <div key={inv.id} className="bg-surface-card-solid border border-purple-900/30 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs font-mono text-content-muted">{inv.invoice_number}</span>
                      <p className="font-medium text-content-primary mt-0.5">{inv.description}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-content-secondary mb-1">
                    <span>{inv.region?.name ?? "Region"}</span>
                    <span className="font-semibold text-content-primary">{formatCurrency(inv.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-content-muted">
                    <span>Due {formatDate(inv.due_date)}</span>
                    {inv.per_member_rate && inv.member_count != null && (
                      <span>${parseFloat(inv.per_member_rate).toFixed(2)} × {inv.member_count} members</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-surface-card-solid border border-purple-900/30 rounded-xl overflow-hidden">
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-purple-900/20">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Region</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {chapterBills.map((inv) => {
                  const cfg = STATUS_CONFIG[inv.status as InvoiceStatus] ?? STATUS_CONFIG.draft;
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={inv.id} className="hover:bg-white/5 transition">
                      <td className="px-6 py-4">
                        <p className="text-xs font-mono text-content-muted">{inv.invoice_number}</p>
                        <p className="text-sm font-medium text-content-primary mt-0.5">{inv.description}</p>
                        {inv.per_member_rate && inv.member_count != null && (
                          <p className="text-xs text-content-muted mt-0.5">${parseFloat(inv.per_member_rate).toFixed(2)} × {inv.member_count} members</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-content-secondary">{inv.region?.name ?? "—"}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-content-primary">{formatCurrency(inv.amount)}</td>
                      <td className="px-6 py-4 text-sm text-content-secondary">{formatDate(inv.due_date)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared Components ────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub: string; icon: React.ReactNode; color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-900/30 text-blue-400",
    emerald: "bg-emerald-900/30 text-emerald-400",
    amber: "bg-amber-900/30 text-amber-400",
    red: "bg-red-900/30 text-red-400",
  };
  return (
    <div className="bg-surface-card-solid border border-[var(--color-border)] rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color]}`}>{icon}</div>
        <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-heading font-bold text-content-primary">{value}</p>
      <p className="text-xs text-content-muted mt-0.5">{sub}</p>
    </div>
  );
}

function InvoiceCard({ invoice, onSend, onCancel, onMarkPaid }: {
  invoice: InvoiceWithUser;
  onSend: (id: string) => void;
  onCancel: (id: string) => void;
  onMarkPaid: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[invoice.status as InvoiceStatus] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;

  return (
    <div className="bg-surface-card-solid border border-[var(--color-border)] rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xs font-mono text-content-muted">{invoice.invoice_number}</span>
          <p className="font-medium text-content-primary mt-0.5">{invoice.description}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm text-content-secondary mb-3">
        <span>{invoice.billed_user ? `${invoice.billed_user.first_name} ${invoice.billed_user.last_name}` : "—"}</span>
        <span className="font-semibold text-content-primary">{formatCurrency(invoice.amount)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-content-muted">Due {formatDate(invoice.due_date)}</span>
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <button onClick={() => onSend(invoice.id)} className="text-xs text-blue-400 font-medium">Send</button>
          )}
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <button onClick={() => onMarkPaid(invoice.id)} className="text-xs text-emerald-400 font-medium">Mark Paid</button>
          )}
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <button onClick={() => onCancel(invoice.id)} className="text-xs text-content-muted hover:text-red-400 font-medium">Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}
