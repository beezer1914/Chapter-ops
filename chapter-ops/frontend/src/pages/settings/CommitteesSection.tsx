import { useEffect, useState } from "react";
import { fetchCommittees, createCommittee, updateCommittee, deleteCommittee } from "@/services/committeeService";
import api from "@/lib/api";
import { TOUR_TARGETS } from "@/tours/tourTargets";
import type { Committee } from "@/types";

export default function CommitteesSection({
  setError,
  setSuccess,
}: {
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [members, setMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = { name: "", description: "", budget_amount: "", chair_user_id: "" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    Promise.all([
      fetchCommittees(true),
      api.get<{ members: { id: string; full_name: string }[] }>("/members?per_page=200"),
    ])
      .then(([comms, membRes]) => {
        setCommittees(comms);
        setMembers(membRes.data.members ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openCreate() { setEditingId(null); setForm(emptyForm); setShowForm(true); }

  function openEdit(c: Committee) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description ?? "",
      budget_amount: parseFloat(c.budget_amount).toFixed(2),
      chair_user_id: c.chair_user_id ?? "",
    });
    setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); }

  async function handleSubmit() {
    const name = form.name.trim();
    if (!name) { setError("Committee name is required."); return; }
    setSaving(true);
    try {
      const payload = {
        name,
        description: form.description.trim() || undefined,
        budget_amount: form.budget_amount ? parseFloat(form.budget_amount) : 0,
        chair_user_id: form.chair_user_id || null,
      };
      if (editingId) {
        const updated = await updateCommittee(editingId, payload);
        setCommittees((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSuccess(`"${updated.name}" updated.`);
      } else {
        const created = await createCommittee(payload);
        setCommittees((prev) => [...prev, created]);
        setSuccess(`"${created.name}" committee created.`);
      }
      cancelForm();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to save committee.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(c: Committee) {
    try {
      const updated = await updateCommittee(c.id, { is_active: !c.is_active });
      setCommittees((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setSuccess(`"${updated.name}" ${updated.is_active ? "restored" : "archived"}.`);
    } catch {
      setError("Failed to update committee.");
    }
  }

  async function handleDelete(c: Committee) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteCommittee(c.id);
      setCommittees((prev) => prev.filter((x) => x.id !== c.id));
      setSuccess(`"${c.name}" deleted.`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to delete committee.");
    }
  }

  const active = committees.filter((c) => c.is_active);
  const archived = committees.filter((c) => !c.is_active);

  return (
    <div className="bg-surface-card-solid border border-[var(--color-border)] p-6 mt-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-content-primary mb-1">Committees</h3>
          <p className="text-sm text-content-secondary">
            Assign chairs and set budgets. Tag expenses to committees for spending oversight.
          </p>
        </div>
        {!showForm && (
          <button data-tour-target={TOUR_TARGETS.COMMITTEES_CREATE} onClick={openCreate}
            className="shrink-0 ml-4 px-3 py-1.5 text-sm font-medium bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90">
            + New Committee
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-5 p-4 border border-[var(--color-border-brand)] bg-[var(--color-bg-card)] space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
            {editingId ? "Edit Committee" : "New Committee"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" placeholder="Committee name (e.g. Social, Scholarship)" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="col-span-full" />
            <input type="text" placeholder="Description (optional)" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="col-span-full" />
            <div>
              <label className="block text-xs text-content-muted mb-1">Budget ($)</label>
              <input data-tour-target={TOUR_TARGETS.COMMITTEES_BUDGET} type="number" min="0" step="0.01" placeholder="0.00" value={form.budget_amount}
                onChange={(e) => setForm((f) => ({ ...f, budget_amount: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-content-muted mb-1">Chair (optional)</label>
              <select data-tour-target={TOUR_TARGETS.COMMITTEES_ASSIGN_CHAIR} value={form.chair_user_id} onChange={(e) => setForm((f) => ({ ...f, chair_user_id: e.target.value }))}>
                <option value="">— No chair assigned —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Committee"}
            </button>
            <button onClick={cancelForm} className="px-4 py-2 text-sm font-medium text-content-secondary hover:text-content-primary">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-content-muted">Loading committees…</p>
      ) : committees.length === 0 ? (
        <p className="text-sm text-content-muted">No committees yet. Create your first one above.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {active.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3 gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-content-primary">{c.name}</p>
                  {c.chair && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-content-muted">
                      Chair: {c.chair.full_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-content-muted mt-0.5">
                  Budget: ${parseFloat(c.budget_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  {c.description && ` · ${c.description}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(c)} className="text-xs text-content-secondary hover:text-content-primary font-medium">Edit</button>
                <button onClick={() => handleArchive(c)} className="text-xs text-amber-600 hover:text-amber-800 font-medium">Archive</button>
                <button onClick={() => handleDelete(c)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
              </div>
            </div>
          ))}
          {archived.length > 0 && (
            <div className="pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted mb-2">Archived</p>
              {archived.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 gap-4 opacity-50">
                  <p className="text-sm text-content-secondary">{c.name}</p>
                  <button onClick={() => handleArchive(c)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
