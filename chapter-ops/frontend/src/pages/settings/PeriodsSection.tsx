import { useEffect, useState } from "react";
import { fetchPeriods, createPeriod, updatePeriod, deletePeriod, activatePeriod } from "@/services/periodService";
import type { ChapterPeriod, PeriodType } from "@/types";

const PERIOD_TYPE_LABELS: Record<PeriodType, string> = {
  semester: "Semester",
  annual: "Annual",
  custom: "Custom",
};

export default function PeriodsSection({
  setError,
  setSuccess,
}: {
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [periods, setPeriods] = useState<ChapterPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activateTarget, setActivateTarget] = useState<ChapterPeriod | null>(null);
  const [activateRollover, setActivateRollover] = useState(false);
  const [activating, setActivating] = useState(false);

  const emptyForm = { name: "", period_type: "semester" as PeriodType, start_date: "", end_date: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchPeriods()
      .then(setPeriods)
      .catch(() => setPeriods([]))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() { setEditingId(null); setForm(emptyForm); setShowForm(true); }

  function openEdit(p: ChapterPeriod) {
    setEditingId(p.id);
    setForm({ name: p.name, period_type: p.period_type, start_date: p.start_date, end_date: p.end_date, notes: p.notes ?? "" });
    setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); }

  async function handleSubmit() {
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      setError("Name, start date, and end date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await updatePeriod(editingId, { name: form.name.trim(), period_type: form.period_type, start_date: form.start_date, end_date: form.end_date, notes: form.notes.trim() || undefined });
        setPeriods((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
        setSuccess("Period updated.");
      } else {
        const created = await createPeriod({ ...form, name: form.name.trim() });
        setPeriods((prev) => [created, ...prev]);
        setSuccess("Period created.");
      }
      cancelForm();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to save period.");
    } finally {
      setSaving(false);
    }
  }

  function openActivateModal(p: ChapterPeriod) { setActivateTarget(p); setActivateRollover(false); }

  async function handleConfirmActivate() {
    if (!activateTarget) return;
    setActivating(true);
    try {
      const { period, rolloverCount } = await activatePeriod(activateTarget.id, { rolloverUnpaid: activateRollover });
      setPeriods((prev) => prev.map((p) => ({ ...p, is_active: p.id === period.id })));
      const rolloverMsg = (activateRollover && rolloverCount != null && rolloverCount > 0)
        ? ` ${rolloverCount} unpaid balance${rolloverCount === 1 ? "" : "s"} carried forward.`
        : "";
      setSuccess(`"${period.name}" is now the active period.${rolloverMsg}`);
      setActivateTarget(null);
    } catch {
      setError("Failed to activate period.");
    } finally {
      setActivating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this period? This cannot be undone.")) return;
    try {
      await deletePeriod(id);
      setPeriods((prev) => prev.filter((p) => p.id !== id));
      setSuccess("Period deleted.");
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to delete period.");
    }
  }

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-content-primary mb-1">Billing Periods</h3>
          <p className="text-sm text-content-secondary">
            Track dues and activity by semester, fiscal year, or custom period. One period is active at a time.
          </p>
        </div>
        {!showForm && (
          <button onClick={openCreate}
            className="shrink-0 ml-4 px-3 py-1.5 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark">
            + New Period
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-5 p-4 border border-[var(--color-border-brand)] rounded-lg bg-[var(--color-bg-surface)] space-y-3">
          <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
            {editingId ? "Edit Period" : "New Period"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" placeholder="e.g. Spring 2026" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="col-span-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
            <div>
              <label className="block text-xs text-content-muted mb-1">Type</label>
              <select value={form.period_type} onChange={(e) => setForm((f) => ({ ...f, period_type: e.target.value as PeriodType }))}
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary">
                <option value="semester">Semester</option>
                <option value="annual">Annual</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-content-muted mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
            </div>
            <div>
              <label className="block text-xs text-content-muted mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
            </div>
            <input type="text" placeholder="Notes (optional)" value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="col-span-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Period"}
            </button>
            <button onClick={cancelForm} className="px-4 py-2 text-sm font-medium text-content-secondary hover:text-content-primary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-content-muted">Loading periods…</p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-content-muted">No periods yet. Create your first billing period above.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {p.is_active && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-content-primary truncate">{p.name}</p>
                  <p className="text-xs text-content-muted">
                    {PERIOD_TYPE_LABELS[p.period_type]} · {new Date(p.start_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – {new Date(p.end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!p.is_active && (
                  <button onClick={() => openActivateModal(p)} className="text-xs text-brand-primary-dark font-medium hover:underline">Activate</button>
                )}
                <button onClick={() => openEdit(p)} className="text-xs text-content-secondary hover:text-content-primary font-medium">Edit</button>
                {!p.is_active && (
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-sm bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] shadow-xl">
            <div className="border-t-2 border-[var(--color-text-heading)] border-b border-[var(--color-border)] mt-[2px] px-5 py-3">
              <h3 className="font-heading font-black text-base text-content-heading tracking-tight">Activate Period</h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-content-primary">
                Set <span className="font-semibold">&ldquo;{activateTarget.name}&rdquo;</span> as the active period?
                Dues will be seeded for all current members.
              </p>
              {periods.some((p) => p.is_active) && (
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="mt-0.5">
                    <input type="checkbox" checked={activateRollover} onChange={(e) => setActivateRollover(e.target.checked)}
                      className="w-4 h-4 accent-[var(--color-text-heading)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-content-primary">Carry forward unpaid balances</p>
                    <p className="text-xs text-content-muted mt-0.5">
                      Members with outstanding dues from{" "}
                      <span className="font-medium">{periods.find((p) => p.is_active)?.name ?? "the current period"}</span>{" "}
                      will have those amounts added to their new period dues.
                    </p>
                  </div>
                </label>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end">
              <button onClick={() => setActivateTarget(null)} disabled={activating}
                className="px-4 py-2 text-sm font-medium text-content-secondary hover:text-content-primary disabled:opacity-50">Cancel</button>
              <button onClick={handleConfirmActivate} disabled={activating}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 disabled:opacity-50">
                {activating ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
