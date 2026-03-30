import { useEffect, useState, useRef } from "react";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchPipeline,
  createCandidate,
  updateCandidate,
  deactivateCandidate,
  crossCandidate,
  uploadIntakeDocument,
  deleteIntakeDocument,
  getCandidate,
} from "@/services/intakeService";
import type {
  IntakeCandidate,
  IntakeStage,
  IntakeDocument,
  CreateCandidateRequest,
  UpdateCandidateRequest,
} from "@/types";
import {
  UserPlus,
  ChevronRight,
  ChevronLeft,
  FileText,
  Upload,
  Trash2,
  Edit2,
  Star,
  X,
  Check,
  AlertCircle,
} from "lucide-react";

// ── Stage config ───────────────────────────────────────────────────────────────

const STAGES: IntakeStage[] = [
  "interested",
  "applied",
  "under_review",
  "chapter_vote",
  "national_submission",
  "approved",
  "crossed",
];

const STAGE_LABELS: Record<IntakeStage, string> = {
  interested: "Interested",
  applied: "Applied",
  under_review: "Under Review",
  chapter_vote: "Chapter Vote",
  national_submission: "National Submission",
  approved: "Approved",
  crossed: "Crossed",
};

const STAGE_COLORS: Record<IntakeStage, { bg: string; text: string; dot: string; badge: string }> = {
  interested:          { bg: "bg-slate-900/30",   text: "text-slate-400",  dot: "bg-slate-400",   badge: "bg-slate-900/30 text-slate-400 border-slate-700" },
  applied:             { bg: "bg-sky-900/30",     text: "text-sky-400",    dot: "bg-sky-500",     badge: "bg-sky-900/30 text-sky-400 border-sky-700" },
  under_review:        { bg: "bg-amber-900/30",   text: "text-amber-400",  dot: "bg-amber-500",   badge: "bg-amber-900/30 text-amber-400 border-amber-700" },
  chapter_vote:        { bg: "bg-orange-900/30",  text: "text-orange-400", dot: "bg-orange-500",  badge: "bg-orange-900/30 text-orange-400 border-orange-700" },
  national_submission: { bg: "bg-purple-900/30",  text: "text-purple-400", dot: "bg-purple-500",  badge: "bg-purple-900/30 text-purple-400 border-purple-700" },
  approved:            { bg: "bg-emerald-900/30", text: "text-emerald-400",dot: "bg-emerald-500", badge: "bg-emerald-900/30 text-emerald-400 border-emerald-700" },
  crossed:             { bg: "bg-brand-primary-50", text: "text-brand-primary-dark", dot: "bg-brand-primary-main", badge: "bg-brand-primary-100 text-brand-primary-dark border-brand-primary-200" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  transcript: "Transcript",
  background_check: "Background Check",
  recommendation: "Recommendation Letter",
  other: "Other",
};

const LINE_SEASONS = [
  "Spring 2025 Line", "Fall 2025 Line",
  "Spring 2026 Line", "Fall 2026 Line",
  "Spring 2027 Line", "Fall 2027 Line",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextStage(stage: IntakeStage): IntakeStage | null {
  const idx = STAGES.indexOf(stage);
  if (idx === -1 || idx >= STAGES.length - 2) return null; // can't advance past "approved" manually
  return STAGES[idx + 1] as IntakeStage;
}

function prevStage(stage: IntakeStage): IntakeStage | null {
  const idx = STAGES.indexOf(stage);
  if (idx <= 0 || stage === "crossed") return null;
  return STAGES[idx - 1] as IntakeStage;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Intake() {
  const { memberships, user } = useAuthStore();
  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const isPresident = currentMembership?.role === "president";

  const [byStage, setByStage] = useState<Record<IntakeStage, IntakeCandidate[]>>(
    Object.fromEntries(STAGES.map((s) => [s, []])) as Record<IntakeStage, IntakeCandidate[]>
  );
  const [activeStage, setActiveStage] = useState<IntakeStage>("interested");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [detailCandidate, setDetailCandidate] = useState<IntakeCandidate | null>(null);
  const [crossOpen, setCrossOpen] = useState(false);
  const [crossResult, setCrossResult] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => { loadPipeline(); }, []);

  async function loadPipeline() {
    try {
      setLoading(true);
      const data = await fetchPipeline();
      setByStage(data.by_stage);
    } catch {
      setError("Failed to load intake pipeline.");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(candidate: IntakeCandidate) {
    try {
      const full = await getCandidate(candidate.id);
      setDetailCandidate(full);
    } catch {
      setError("Failed to load candidate details.");
    }
  }

  async function handleAdvance(candidate: IntakeCandidate) {
    const next = nextStage(candidate.stage);
    if (!next) return;
    try {
      const updated = await updateCandidate(candidate.id, { stage: next });
      refreshCandidate(updated);
      if (detailCandidate?.id === candidate.id) setDetailCandidate(updated);
    } catch {
      setError("Failed to advance candidate.");
    }
  }

  async function handleRevert(candidate: IntakeCandidate) {
    const prev = prevStage(candidate.stage);
    if (!prev) return;
    try {
      const updated = await updateCandidate(candidate.id, { stage: prev });
      refreshCandidate(updated);
      if (detailCandidate?.id === candidate.id) setDetailCandidate(updated);
    } catch {
      setError("Failed to revert candidate.");
    }
  }

  async function handleDeactivate(candidate: IntakeCandidate) {
    if (!confirm(`Remove ${candidate.full_name} from the intake pipeline?`)) return;
    try {
      await deactivateCandidate(candidate.id);
      setByStage((prev) => {
        const updated = { ...prev };
        updated[candidate.stage] = updated[candidate.stage].filter((c) => c.id !== candidate.id);
        return updated;
      });
      if (detailCandidate?.id === candidate.id) setDetailCandidate(null);
    } catch {
      setError("Failed to remove candidate.");
    }
  }

  function refreshCandidate(updated: IntakeCandidate) {
    setByStage((prev) => {
      const next = { ...prev };
      // Remove from all stages first
      for (const s of STAGES) {
        next[s] = next[s].filter((c) => c.id !== updated.id);
      }
      // Add to correct stage
      next[updated.stage] = [...next[updated.stage], updated];
      return next;
    });
  }

  const stageCandidates = byStage[activeStage] ?? [];
  const totalCount = STAGES.reduce((sum, s) => sum + (byStage[s]?.length ?? 0), 0);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-3xl font-heading font-extrabold text-content-primary tracking-tight">
              Intake Pipeline
            </h2>
            <p className="text-content-secondary mt-1">
              {totalCount} candidate{totalCount !== 1 ? "s" : ""} in pipeline · Confidential
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-primary-main text-white rounded-xl text-sm font-semibold hover:bg-brand-primary-dark transition-colors shadow-glass"
          >
            <UserPlus className="w-4 h-4" />
            Add Candidate
          </button>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-red-900/20 border-l-4 border-red-500 text-red-400 rounded-lg text-sm font-medium flex justify-between items-center">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 text-lg font-bold px-2">&times;</button>
          </div>
        )}

        {/* Stage tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {STAGES.map((stage) => {
            const count = byStage[stage]?.length ?? 0;
            const colors = STAGE_COLORS[stage];
            const isActive = stage === activeStage;
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border ${
                  isActive
                    ? `${colors.bg} ${colors.text} border-current/20 shadow-glass`
                    : "bg-surface-card-solid text-content-secondary border-[var(--color-border)] hover:bg-white/5"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isActive ? colors.dot : "bg-content-muted"}`} />
                {STAGE_LABELS[stage]}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${isActive ? "bg-white/60" : "bg-white/10"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Candidate list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand-primary-light border-t-brand-primary-main rounded-full animate-spin" />
          </div>
        ) : stageCandidates.length === 0 ? (
          <div className="bg-surface-card-solid backdrop-blur-xl rounded-2xl shadow-glass border border-[var(--color-border)] p-14 text-center">
            <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-7 h-7 text-content-muted" />
            </div>
            <h3 className="text-base font-semibold text-content-primary mb-1">
              No candidates in {STAGE_LABELS[activeStage]}
            </h3>
            <p className="text-sm text-content-secondary">
              {activeStage === "interested"
                ? "Add a candidate to start the pipeline."
                : "Advance candidates from earlier stages."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stageCandidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                isPresident={isPresident}
                onOpen={() => openDetail(c)}
                onAdvance={() => handleAdvance(c)}
                onRevert={() => handleRevert(c)}
                onCross={() => { setDetailCandidate(c); setCrossOpen(true); }}
                onDeactivate={() => handleDeactivate(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Candidate Modal */}
      {addOpen && (
        <AddCandidateModal
          onClose={() => setAddOpen(false)}
          onCreated={(c) => {
            refreshCandidate(c);
            setActiveStage(c.stage);
            setAddOpen(false);
          }}
        />
      )}

      {/* Candidate Detail Modal */}
      {detailCandidate && !crossOpen && (
        <CandidateDetailModal
          candidate={detailCandidate}
          isPresident={isPresident}
          onClose={() => setDetailCandidate(null)}
          onUpdated={(updated) => {
            refreshCandidate(updated);
            setDetailCandidate(updated);
          }}
          onAdvance={() => handleAdvance(detailCandidate)}
          onRevert={() => handleRevert(detailCandidate)}
          onCross={() => setCrossOpen(true)}
          onDeactivate={() => handleDeactivate(detailCandidate)}
          onDocumentChange={async () => {
            const full = await getCandidate(detailCandidate.id);
            setDetailCandidate(full);
            refreshCandidate(full);
          }}
        />
      )}

      {/* Cross Candidate Modal */}
      {crossOpen && detailCandidate && !crossResult && (
        <CrossModal
          candidate={detailCandidate}
          onClose={() => setCrossOpen(false)}
          onCrossed={(code) => {
            setCrossResult({ code, name: detailCandidate.full_name });
            setCrossOpen(false);
            setDetailCandidate(null);
            loadPipeline();
          }}
        />
      )}

      {/* Cross Success */}
      {crossResult && (
        <CrossSuccessModal
          name={crossResult.name}
          code={crossResult.code}
          onClose={() => setCrossResult(null)}
        />
      )}
    </Layout>
  );
}

// ── Candidate Card ─────────────────────────────────────────────────────────────

function CandidateCard({
  candidate, isPresident, onOpen, onAdvance, onRevert, onCross, onDeactivate,
}: {
  candidate: IntakeCandidate;
  isPresident: boolean;
  onOpen: () => void;
  onAdvance: () => void;
  onRevert: () => void;
  onCross: () => void;
  onDeactivate: () => void;
}) {
  const colors = STAGE_COLORS[candidate.stage];
  const canAdvance = candidate.stage !== "crossed" && candidate.stage !== "approved";
  const canCross = candidate.stage === "approved" && isPresident;
  const canRevert = candidate.stage !== "interested" && candidate.stage !== "crossed";

  return (
    <div
      className="bg-surface-card-solid rounded-2xl shadow-glass border border-[var(--color-border)] p-5 flex flex-col gap-3 hover:shadow-glass transition-shadow cursor-pointer group"
      onClick={onOpen}
    >
      {/* Name + stage badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-content-primary group-hover:text-brand-primary-dark transition-colors">
            {candidate.full_name}
          </p>
          <p className="text-xs text-content-secondary mt-0.5 truncate">{candidate.email}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
          {STAGE_LABELS[candidate.stage]}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-secondary">
        {candidate.semester && <span>{candidate.semester}</span>}
        {candidate.gpa != null && <span>GPA {candidate.gpa.toFixed(2)}</span>}
        {candidate.document_count > 0 && (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" /> {candidate.document_count} doc{candidate.document_count !== 1 ? "s" : ""}
          </span>
        )}
        {candidate.assigned_to && (
          <span className="text-brand-primary-main/70 font-medium">
            → {candidate.assigned_to.full_name.split(" ")[0]}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-[var(--color-border)] mt-auto" onClick={(e) => e.stopPropagation()}>
        {canRevert && (
          <button
            onClick={onRevert}
            className="p-1.5 text-content-muted hover:text-content-secondary hover:bg-white/10 rounded-lg transition-colors"
            title="Move back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {canCross ? (
          <button
            onClick={onCross}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-primary-main text-white text-xs font-semibold rounded-lg hover:bg-brand-primary-dark transition-colors"
          >
            <Star className="w-3.5 h-3.5" /> Cross
          </button>
        ) : canAdvance ? (
          <button
            onClick={onAdvance}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/20 transition-colors"
          >
            Advance <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="flex-1" />
        )}
        {isPresident && (
          <button
            onClick={onDeactivate}
            className="p-1.5 text-content-muted hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add Candidate Modal ────────────────────────────────────────────────────────

function AddCandidateModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (c: IntakeCandidate) => void }) {
  const [form, setForm] = useState<CreateCandidateRequest>({
    first_name: "", last_name: "", email: "", phone: "",
    stage: "interested", semester: "", gpa: undefined, notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload: CreateCandidateRequest = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        stage: form.stage,
        semester: form.semester?.trim() || undefined,
        gpa: form.gpa ?? undefined,
        notes: form.notes?.trim() || undefined,
      };
      const created = await createCandidate(payload);
      onCreated(created);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(msg || "Failed to add candidate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex justify-between items-center bg-white/5">
          <h3 className="text-lg font-heading font-semibold text-content-primary">Add Intake Candidate</h3>
          <button type="button" onClick={onClose} className="text-content-muted hover:text-content-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {err && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">First Name *</label>
              <input required value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Last Name *</label>
              <input required value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">Email *</label>
            <input required type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Phone</label>
              <input value={form.phone ?? ""} type="tel"
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">GPA</label>
              <input value={form.gpa ?? ""} type="number" min="0" max="4" step="0.01"
                onChange={(e) => setForm((f) => ({ ...f, gpa: e.target.value ? parseFloat(e.target.value) : undefined }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Initial Stage</label>
              <select value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as IntakeStage }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main">
                {STAGES.filter((s) => s !== "crossed").map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Line Season</label>
              <select value={form.semester ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main">
                <option value="">— Select —</option>
                {LINE_SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">Notes</label>
            <textarea rows={3} value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main resize-none" />
          </div>
        </div>

        <div className="px-6 py-4 bg-white/5 border-t border-[var(--color-border)] flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-xl hover:bg-white/5">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark disabled:opacity-50 min-w-[120px]">
            {saving ? "Adding..." : "Add Candidate"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Candidate Detail Modal ─────────────────────────────────────────────────────

function CandidateDetailModal({
  candidate, isPresident, onClose, onUpdated, onAdvance, onRevert, onCross, onDeactivate, onDocumentChange,
}: {
  candidate: IntakeCandidate;
  isPresident: boolean;
  onClose: () => void;
  onUpdated: (c: IntakeCandidate) => void;
  onAdvance: () => void;
  onRevert: () => void;
  onCross: () => void;
  onDeactivate: () => void;
  onDocumentChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateCandidateRequest>({
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    email: candidate.email,
    phone: candidate.phone ?? "",
    semester: candidate.semester ?? "",
    gpa: candidate.gpa,
    notes: candidate.notes ?? "",
    line_name: candidate.line_name ?? "",
    line_number: candidate.line_number ?? undefined,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("other");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const canAdvance = candidate.stage !== "crossed" && candidate.stage !== "approved";
  const canCross = candidate.stage === "approved" && isPresident;
  const canRevert = candidate.stage !== "interested" && candidate.stage !== "crossed";

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      const updated = await updateCandidate(candidate.id, {
        ...editForm,
        phone: editForm.phone?.trim() || undefined,
        semester: (editForm.semester as string)?.trim() || undefined,
        gpa: editForm.gpa ?? null,
        notes: (editForm.notes as string)?.trim() || undefined,
        line_name: (editForm.line_name as string)?.trim() || undefined,
        line_number: editForm.line_number ?? null,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(msg || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload() {
    if (!uploadFile || !uploadTitle.trim()) return;
    setUploading(true);
    try {
      await uploadIntakeDocument(candidate.id, uploadFile, uploadTitle.trim(), uploadType);
      await onDocumentChange();
      setUploadOpen(false);
      setUploadTitle("");
      setUploadType("other");
      setUploadFile(null);
    } catch {
      setErr("Failed to upload document.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(doc: IntakeDocument) {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    try {
      await deleteIntakeDocument(candidate.id, doc.id);
      await onDocumentChange();
    } catch {
      setErr("Failed to delete document.");
    }
  }

  const colors = STAGE_COLORS[candidate.stage];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 backdrop-blur-sm p-4">
      <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-start justify-between gap-4 bg-white/5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-heading font-bold text-content-primary">{candidate.full_name}</h3>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                {STAGE_LABELS[candidate.stage]}
              </span>
            </div>
            <p className="text-sm text-content-secondary mt-0.5">{candidate.email}</p>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-secondary shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {err && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}

          {/* Info section */}
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1">First Name</label>
                  <input value={editForm.first_name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1">Last Name</label>
                  <input value={editForm.last_name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1">Email</label>
                <input type="email" value={editForm.email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1">Phone</label>
                  <input type="tel" value={editForm.phone ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1">GPA</label>
                  <input type="number" min="0" max="4" step="0.01" value={editForm.gpa ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, gpa: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1">Line Name</label>
                  <input value={editForm.line_name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, line_name: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1">Line Number</label>
                  <input type="number" min="1" value={editForm.line_number ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, line_number: e.target.value ? parseInt(e.target.value) : null }))}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1">Notes</label>
                <textarea rows={3} value={editForm.notes ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-xl hover:bg-white/5">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {candidate.phone && (
                  <InfoPill label="Phone" value={candidate.phone} />
                )}
                {candidate.semester && (
                  <InfoPill label="Line Season" value={candidate.semester} />
                )}
                {candidate.gpa != null && (
                  <InfoPill label="GPA" value={candidate.gpa.toFixed(2)} />
                )}
                {candidate.line_name && (
                  <InfoPill label="Line Name" value={candidate.line_name} />
                )}
                {candidate.line_number != null && (
                  <InfoPill label="Line #" value={String(candidate.line_number)} />
                )}
                {candidate.assigned_to && (
                  <InfoPill label="Assigned To" value={candidate.assigned_to.full_name} />
                )}
              </div>
              {candidate.notes && (
                <div className="bg-amber-900/20 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-400 mb-1">Notes</p>
                  <p className="text-sm text-amber-400 whitespace-pre-wrap">{candidate.notes}</p>
                </div>
              )}
              <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 text-sm text-brand-primary-main hover:text-brand-primary-dark font-medium">
                <Edit2 className="w-3.5 h-3.5" /> Edit candidate info
              </button>
            </div>
          )}

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-content-secondary">Documents</h4>
              <button onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-main hover:text-brand-primary-dark">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
            </div>

            {uploadOpen && (
              <div className="mb-4 p-4 bg-white/5 rounded-xl border border-[var(--color-border)] space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary mb-1">Title *</label>
                    <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="e.g. Fall 2025 Transcript"
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary mb-1">Type</label>
                    <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main">
                      {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <input ref={fileRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full py-2 border-2 border-dashed border-[var(--color-border-brand)] rounded-lg text-sm text-content-secondary hover:border-brand-primary-main hover:text-brand-primary-main transition-colors">
                  {uploadFile ? uploadFile.name : "Click to select file"}
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setUploadOpen(false); setUploadFile(null); setUploadTitle(""); }}
                    className="px-3 py-1.5 text-sm text-content-secondary bg-surface-card-solid border border-[var(--color-border)] rounded-lg hover:bg-white/5">Cancel</button>
                  <button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadTitle.trim()}
                    className="px-4 py-1.5 text-sm font-semibold text-white bg-brand-primary-main rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            )}

            {(candidate.documents?.length ?? 0) === 0 ? (
              <p className="text-sm text-content-muted italic">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {candidate.documents?.map((doc) => (
                  <div key={doc.id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-[var(--color-border)] group">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-content-muted shrink-0" />
                      <div className="min-w-0">
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-medium text-content-primary hover:text-brand-primary-main truncate block">
                          {doc.title}
                        </a>
                        <p className="text-xs text-content-muted">
                          {DOC_TYPE_LABELS[doc.document_type]} · {formatFileSize(doc.file_size)}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteDoc(doc)}
                      className="p-1.5 text-content-muted hover:text-red-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-white/5 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {canRevert && (
              <button onClick={() => { onRevert(); onClose(); }}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm text-content-secondary bg-surface-card-solid border border-[var(--color-border)] rounded-xl hover:bg-white/5">
                <ChevronLeft className="w-4 h-4" /> Revert
              </button>
            )}
            {canAdvance && (
              <button onClick={() => { onAdvance(); onClose(); }}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-white/10 rounded-xl hover:bg-white/20">
                Advance <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {canCross && (
              <button onClick={onCross}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark">
                <Star className="w-4 h-4" /> Cross
              </button>
            )}
          </div>
          {isPresident && candidate.stage !== "crossed" && (
            <button onClick={() => { onDeactivate(); onClose(); }}
              className="text-sm text-red-400 hover:text-red-300 font-medium">
              Remove from pipeline
            </button>
          )}
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

// ── Cross Modal ────────────────────────────────────────────────────────────────

function CrossModal({
  candidate, onClose, onCrossed,
}: { candidate: IntakeCandidate; onClose: () => void; onCrossed: (code: string) => void }) {
  const [lineName, setLineName] = useState(candidate.line_name ?? "");
  const [lineNumber, setLineNumber] = useState<string>(
    candidate.line_number != null ? String(candidate.line_number) : ""
  );
  const [crossing, setCrossing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCross() {
    setCrossing(true);
    setErr(null);
    try {
      const result = await crossCandidate(candidate.id, {
        line_name: lineName.trim() || undefined,
        line_number: lineNumber ? parseInt(lineNumber) : undefined,
      });
      onCrossed(result.invite_code);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(msg || "Failed to cross candidate.");
      setCrossing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 backdrop-blur-sm">
      <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--color-border)] bg-brand-primary-50/60">
          <h3 className="text-lg font-heading font-bold text-content-primary flex items-center gap-2">
            <Star className="w-5 h-5 text-brand-primary-main" /> Cross {candidate.full_name}
          </h3>
          <p className="text-sm text-content-secondary mt-1">
            This will generate an invite code for them to join as a member.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {err && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}
          <div className="bg-amber-900/20 border border-amber-200 rounded-xl p-3 text-sm text-amber-400">
            <strong>This action is final.</strong> Once crossed, their stage will be permanently set to "Crossed" and an invite code will be issued.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Line Name (optional)</label>
              <input value={lineName} onChange={(e) => setLineName(e.target.value)}
                placeholder="e.g. The Immovable"
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">Line Number (optional)</label>
              <input type="number" min="1" value={lineNumber} onChange={(e) => setLineNumber(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm bg-surface-input focus:bg-surface-input focus:outline-none focus:ring-2 focus:ring-brand-primary-main" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-white/5 border-t border-[var(--color-border)] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border-brand)] rounded-xl hover:bg-white/5">Cancel</button>
          <button onClick={handleCross} disabled={crossing}
            className="px-5 py-2 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark disabled:opacity-50 flex items-center gap-2">
            <Check className="w-4 h-4" /> {crossing ? "Crossing..." : "Confirm Cross"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cross Success Modal ────────────────────────────────────────────────────────

function CrossSuccessModal({ name, code, onClose }: { name: string; code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 backdrop-blur-sm">
      <div className="bg-surface-card-solid rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center">
        <div className="px-6 pt-8 pb-6">
          <div className="w-16 h-16 bg-brand-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star className="w-8 h-8 text-brand-primary-main" />
          </div>
          <h3 className="text-xl font-heading font-bold text-content-primary mb-1">{name} has crossed!</h3>
          <p className="text-sm text-content-secondary mb-6">Share this invite code to complete their registration.</p>

          <div className="bg-gray-900 rounded-xl px-5 py-4 mb-4 flex items-center justify-between gap-3">
            <span className="text-2xl font-mono font-bold text-white tracking-[0.2em]">{code}</span>
            <button onClick={copyCode}
              className="text-xs font-semibold text-content-muted hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : "Copy"}
            </button>
          </div>
          <p className="text-xs text-content-muted mb-6">They can use this code at registration to join the chapter.</p>
        </div>
        <div className="px-6 pb-6">
          <button onClick={onClose} className="w-full py-2.5 text-sm font-semibold text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
