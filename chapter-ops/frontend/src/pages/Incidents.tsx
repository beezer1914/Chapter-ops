import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/Layout";
import {
  createIncident,
  downloadAttachment,
  getIncident,
  listIncidents,
  updateIncidentStatus,
  uploadAttachment,
} from "@/services/incidentService";
import type {
  CreateIncidentRequest,
  Incident,
  IncidentListResponse,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from "@/types";
import {
  AlertTriangle,
  Plus,
  Paperclip,
  Upload,
  X,
  Clock,
  Shield,
  FileText,
  Download,
} from "lucide-react";

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: "hazing", label: "Hazing" },
  { value: "sexual_misconduct", label: "Sexual Misconduct" },
  { value: "alcohol_drugs", label: "Alcohol / Drugs" },
  { value: "physical_altercation", label: "Physical Altercation" },
  { value: "property_damage", label: "Property Damage" },
  { value: "member_injury", label: "Member Injury" },
  { value: "financial_misconduct", label: "Financial Misconduct" },
  { value: "discrimination", label: "Discrimination" },
  { value: "other", label: "Other" },
];

const SEVERITIES: { value: IncidentSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: "reported", label: "Reported" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "under_review", label: "Under Review" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-300",
  medium: "bg-amber-50 text-amber-700 border-amber-300",
  high: "bg-orange-50 text-orange-700 border-orange-400",
  critical: "bg-red-50 text-red-700 border-red-500",
};

const SEVERITY_STRIP: Record<IncidentSeverity, string> = {
  low: "border-l-slate-400",
  medium: "border-l-amber-500",
  high: "border-l-orange-500",
  critical: "border-l-red-600",
};

const STATUS_STYLES: Record<IncidentStatus, string> = {
  reported: "bg-red-50 text-red-700",
  acknowledged: "bg-amber-50 text-amber-700",
  under_review: "bg-blue-50 text-blue-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};

function incidentTypeLabel(t: IncidentType): string {
  return INCIDENT_TYPES.find((x) => x.value === t)?.label ?? t;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Incidents() {
  const [data, setData] = useState<IncidentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [showFileModal, setShowFileModal] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");

  const canFile = useMemo(() => data?.view_mode === "chapter", [data?.view_mode]);
  const canUpdateStatus = useMemo(
    () => !!data && (data.is_org_admin || data.is_regional_officer),
    [data],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listIncidents({
        severity: filterSeverity || undefined,
        status: (filterStatus || undefined) as IncidentStatus | undefined,
        type: filterType || undefined,
      });
      setData(res);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to load incidents.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSeverity, filterStatus, filterType]);

  // Support deep-link via ?id=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) setSelectedId(id);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    (async () => {
      try {
        const inc = await getIncident(selectedId);
        setSelected(inc);
      } catch {
        setSelected(null);
      }
    })();
  }, [selectedId]);

  const filtered = data?.incidents ?? [];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Editorial double-rule header */}
        <div className="border-t-2 border-[var(--color-text-heading)]" />
        <div className="mt-[2px] border-b border-[var(--color-border)] pb-6 pt-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-content-muted mb-2">
              Risk Management
            </p>
            <h1 className="font-heading font-black text-4xl md:text-5xl text-content-heading tracking-tight leading-none">
              Incidents
            </h1>
            <p className="text-content-secondary mt-3 max-w-xl text-sm leading-relaxed">
              {data?.view_mode === "chapter" && "File and track incidents for your chapter. All reports route upstream."}
              {data?.view_mode === "region" && "Regional view — incidents filed by chapters in your region."}
              {data?.view_mode === "org" && "Organization-wide view — all incidents across every chapter."}
            </p>
          </div>

          {canFile && (
            <button
              onClick={() => setShowFileModal(true)}
              className="bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 px-5 py-3 text-[13px] font-semibold uppercase tracking-wider flex items-center gap-2 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              File Incident
            </button>
          )}
        </div>

        {/* Legal notice banner */}
        <div className="mt-4 bg-amber-50 border border-amber-300 border-l-4 border-l-amber-600 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold uppercase tracking-wider text-[10px] mb-1">Legal Notice</p>
          <p>
            Incident reports may be subject to discovery in legal proceedings. Report facts only.
            Avoid speculation, accusations without evidence, or privileged conversations.
          </p>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm px-3 py-2"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="text-sm px-3 py-2"
          >
            <option value="">All Severities</option>
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-sm px-3 py-2"
          >
            <option value="">All Types</option>
            {INCIDENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Results */}
        <div className="mt-6">
          {loading && (
            <div className="text-content-muted text-sm py-10 text-center">Loading…</div>
          )}
          {error && !loading && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-6 py-16 text-center">
              <Shield className="w-10 h-10 text-content-muted mx-auto mb-3" />
              <p className="font-heading text-xl text-content-heading mb-1">No incidents on record</p>
              <p className="text-sm text-content-secondary">
                {canFile
                  ? "Hopefully it stays that way. Use the button above if an incident needs filing."
                  : "Nothing has been reported in your scope."}
              </p>
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
              {filtered.map((inc) => (
                <button
                  key={inc.id}
                  onClick={() => setSelectedId(inc.id)}
                  className={`w-full text-left px-5 py-4 border-l-4 ${SEVERITY_STRIP[inc.severity]} hover:bg-[var(--color-bg-card-hover)] transition-colors`}
                >
                  <div className="flex items-start gap-4 justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-[11px] font-bold tracking-wider text-content-heading">
                          {inc.reference_number}
                        </span>
                        <span className={`text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 border ${SEVERITY_STYLES[inc.severity]}`}>
                          {inc.severity}
                        </span>
                        <span className={`text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 ${STATUS_STYLES[inc.status]}`}>
                          {inc.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="font-heading text-lg text-content-heading tracking-tight leading-snug">
                        {incidentTypeLabel(inc.incident_type)}
                        {data?.view_mode !== "chapter" && inc.chapter_name && (
                          <span className="text-content-secondary font-body font-normal text-sm ml-2">
                            · {inc.chapter_name}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-content-secondary mt-1 line-clamp-2">
                        {inc.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-[11px] text-content-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(inc.occurred_at)}
                        </span>
                        {inc.attachment_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />
                            {inc.attachment_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showFileModal && canFile && (
        <FileIncidentModal
          onClose={() => setShowFileModal(false)}
          onSuccess={async (newId) => {
            setShowFileModal(false);
            await load();
            setSelectedId(newId);
          }}
        />
      )}

      {selected && (
        <IncidentDetailDrawer
          incident={selected}
          canUpdateStatus={canUpdateStatus}
          onClose={() => setSelectedId(null)}
          onRefresh={async () => {
            const fresh = await getIncident(selected.id);
            setSelected(fresh);
            await load();
          }}
        />
      )}
    </Layout>
  );
}

// ── File Incident Modal ──────────────────────────────────────────────────────

function FileIncidentModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (newId: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreateIncidentRequest>({
    incident_type: "other",
    severity: "medium",
    occurred_at: new Date().toISOString().slice(0, 16),
    description: "",
    location: "",
    individuals_involved: "",
    law_enforcement_notified: false,
    medical_attention_required: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateIncidentRequest = {
        ...form,
        occurred_at: new Date(form.occurred_at).toISOString(),
      };
      const inc = await createIncident(payload);
      onSuccess(inc.id);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to file incident.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-content-muted">
              Step {step} of 3
            </p>
            <h2 className="font-heading font-black text-2xl text-content-heading tracking-tight">
              File Incident
            </h2>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">
                  Incident Type *
                </label>
                <select
                  value={form.incident_type}
                  onChange={(e) => setForm({ ...form, incident_type: e.target.value as IncidentType })}
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">
                  Severity *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setForm({ ...form, severity: s.value })}
                      className={`py-2 text-xs font-semibold uppercase tracking-wider border ${
                        form.severity === s.value
                          ? SEVERITY_STYLES[s.value] + " ring-2 ring-offset-1 ring-[var(--color-text-heading)]"
                          : "bg-transparent text-content-secondary border-[var(--color-border)] hover:border-[var(--color-text-heading)]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">
                  When did this occur? *
                </label>
                <input
                  type="datetime-local"
                  value={form.occurred_at}
                  onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chapter house, off-campus event"
                  value={form.location || ""}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">
                  Description * <span className="text-content-muted normal-case font-normal">— facts only</span>
                </label>
                <textarea
                  rows={6}
                  placeholder="What happened? Stick to what you directly observed or were told by first-hand witnesses."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">
                  Individuals Involved
                </label>
                <textarea
                  rows={3}
                  placeholder="Names, roles, and whether they were involved, witnesses, or affected."
                  value={form.individuals_involved || ""}
                  onChange={(e) => setForm({ ...form, individuals_involved: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-start gap-2 border border-[var(--color-border)] px-3 py-2.5 cursor-pointer hover:bg-[var(--color-bg-card-hover)]">
                  <input
                    type="checkbox"
                    checked={form.law_enforcement_notified}
                    onChange={(e) => setForm({ ...form, law_enforcement_notified: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-content-primary">Law enforcement notified</span>
                </label>
                <label className="flex items-start gap-2 border border-[var(--color-border)] px-3 py-2.5 cursor-pointer hover:bg-[var(--color-bg-card-hover)]">
                  <input
                    type="checkbox"
                    checked={form.medical_attention_required}
                    onChange={(e) => setForm({ ...form, medical_attention_required: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-content-primary">Medical attention required</span>
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-3">Review</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-content-secondary">Type</dt>
                    <dd className="font-medium text-content-primary">{incidentTypeLabel(form.incident_type)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-content-secondary">Severity</dt>
                    <dd className="font-medium text-content-primary uppercase">{form.severity}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-content-secondary">Occurred</dt>
                    <dd className="font-medium text-content-primary">{formatDateTime(new Date(form.occurred_at).toISOString())}</dd>
                  </div>
                  {form.location && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-content-secondary">Location</dt>
                      <dd className="font-medium text-content-primary">{form.location}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="bg-amber-50 border border-amber-300 border-l-4 border-l-amber-600 px-4 py-3 text-xs text-amber-900">
                <p className="font-semibold uppercase tracking-wider text-[10px] mb-1">Before you file</p>
                <p>
                  This report will be sent to regional officers and organization admins. You can attach
                  supporting files for 24 hours after filing. Status updates will be posted here.
                </p>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-300 text-red-700 px-3 py-2 text-sm">{error}</div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between">
          <button
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            className="text-sm text-content-secondary hover:text-content-primary px-3 py-2"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && !form.description.trim()}
              className="bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] disabled:opacity-40 px-5 py-2 text-[13px] font-semibold uppercase tracking-wider"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="bg-red-700 hover:bg-red-800 text-white disabled:opacity-50 px-5 py-2 text-[13px] font-semibold uppercase tracking-wider flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              {submitting ? "Filing…" : "File Incident"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Incident Detail Drawer ───────────────────────────────────────────────────

function IncidentDetailDrawer({
  incident,
  canUpdateStatus,
  onClose,
  onRefresh,
}: {
  incident: Incident;
  canUpdateStatus: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [newStatus, setNewStatus] = useState<IncidentStatus | "">("");
  const [statusNote, setStatusNote] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const withinEditWindow = useMemo(() => {
    const created = new Date(incident.created_at).getTime();
    return Date.now() - created < 24 * 60 * 60 * 1000;
  }, [incident.created_at]);

  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === incident.status) return;
    setUpdating(true);
    try {
      await updateIncidentStatus(incident.id, {
        status: newStatus,
        note: statusNote.trim() || undefined,
        resolution_notes: newStatus === "resolved" ? resolutionNotes.trim() || undefined : undefined,
      });
      setNewStatus("");
      setStatusNote("");
      setResolutionNotes("");
      await onRefresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Status update failed.";
      alert(message);
    } finally {
      setUpdating(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAttachment(incident.id, file);
      await onRefresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Upload failed.";
      alert(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (attId: string) => {
    try {
      const url = await downloadAttachment(incident.id, attId);
      window.open(url, "_blank");
    } catch {
      alert("Could not generate download link.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/50" />
      <div
        className="w-full max-w-2xl bg-[var(--color-bg-card-solid)] border-l border-[var(--color-border)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header strip */}
        <div className={`border-l-4 ${SEVERITY_STRIP[incident.severity]} px-6 py-5 border-b border-[var(--color-border)]`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold tracking-wider text-content-heading">
                {incident.reference_number}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 border ${SEVERITY_STYLES[incident.severity]}`}>
                {incident.severity}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 ${STATUS_STYLES[incident.status]}`}>
                {incident.status.replace("_", " ")}
              </span>
            </div>
            <button onClick={onClose} className="text-content-muted hover:text-content-primary">
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="mt-3 font-heading font-black text-2xl text-content-heading tracking-tight leading-tight">
            {incidentTypeLabel(incident.incident_type)}
          </h2>
          {incident.chapter_name && (
            <p className="text-sm text-content-secondary mt-1">
              {incident.chapter_name}
              {incident.region_name && ` · ${incident.region_name}`}
            </p>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-1">Occurred</p>
              <p className="text-content-primary">{formatDateTime(incident.occurred_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-1">Filed by</p>
              <p className="text-content-primary">{incident.reported_by_name || "—"}</p>
            </div>
            {incident.location && (
              <div className="col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-1">Location</p>
                <p className="text-content-primary">{incident.location}</p>
              </div>
            )}
          </div>

          {/* Flags */}
          {(incident.law_enforcement_notified || incident.medical_attention_required) && (
            <div className="flex gap-2 flex-wrap">
              {incident.law_enforcement_notified && (
                <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 bg-red-50 text-red-700 border border-red-300">
                  Law Enforcement Notified
                </span>
              )}
              {incident.medical_attention_required && (
                <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 bg-orange-50 text-orange-700 border border-orange-300">
                  Medical Attention
                </span>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">Description</p>
            <p className="text-sm text-content-primary whitespace-pre-wrap leading-relaxed">
              {incident.description}
            </p>
          </div>

          {incident.individuals_involved && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-1.5">Individuals Involved</p>
              <p className="text-sm text-content-primary whitespace-pre-wrap">
                {incident.individuals_involved}
              </p>
            </div>
          )}

          {incident.resolution_notes && (
            <div className="border-l-2 border-emerald-500 pl-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">Resolution</p>
              <p className="text-sm text-content-primary whitespace-pre-wrap">
                {incident.resolution_notes}
              </p>
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
                Attachments ({incident.attachments?.length ?? 0})
              </p>
              {withinEditWindow && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-semibold uppercase tracking-wider text-content-heading hover:opacity-70 flex items-center gap-1 disabled:opacity-40"
                >
                  <Upload className="w-3 h-3" />
                  {uploading ? "Uploading…" : "Add File"}
                </button>
              )}
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>
            {(incident.attachments?.length ?? 0) === 0 ? (
              <p className="text-sm text-content-muted italic">No attachments.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)]">
                {incident.attachments?.map((att) => (
                  <li key={att.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-content-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-content-primary truncate">{att.file_name}</p>
                        <p className="text-[11px] text-content-muted">{formatFileSize(att.file_size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(att.id)}
                      className="text-content-secondary hover:text-content-primary shrink-0"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Status timeline */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-2">Timeline</p>
            <ol className="space-y-3">
              {incident.status_events?.map((evt) => (
                <li key={evt.id} className="border-l-2 border-[var(--color-border)] pl-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 ${STATUS_STYLES[evt.to_status]}`}>
                      {evt.to_status.replace("_", " ")}
                    </span>
                    <span className="text-xs text-content-muted">
                      {formatDateTime(evt.created_at)} · {evt.changed_by_name || "System"}
                    </span>
                  </div>
                  {evt.note && (
                    <p className="text-sm text-content-secondary mt-1">{evt.note}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Status updater */}
          {canUpdateStatus && incident.status !== "closed" && (
            <div className="border-t border-[var(--color-border)] pt-5 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
                Update Status
              </p>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as IncidentStatus)}
                className="text-sm"
              >
                <option value="">Select new status…</option>
                {STATUSES.filter((s) => s.value !== incident.status).map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {newStatus === "resolved" && (
                <textarea
                  rows={3}
                  placeholder="Resolution notes (visible to filing chapter)…"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                />
              )}
              <textarea
                rows={2}
                placeholder="Add a note (optional)…"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
              />
              <button
                onClick={handleStatusUpdate}
                disabled={!newStatus || updating}
                className="bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] disabled:opacity-40 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider"
              >
                {updating ? "Updating…" : "Post Update"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
