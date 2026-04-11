import { useState } from "react";
import { updateChapterConfig } from "@/services/configService";
import type { IntakeStageConfig, IntakeDocTypeConfig, ChapterConfig } from "@/types";

const STAGE_COLOR_OPTIONS: Array<{ value: IntakeStageConfig["color"]; label: string }> = [
  { value: "slate",   label: "Slate"   },
  { value: "sky",     label: "Sky"     },
  { value: "amber",   label: "Amber"   },
  { value: "orange",  label: "Orange"  },
  { value: "purple",  label: "Purple"  },
  { value: "emerald", label: "Emerald" },
  { value: "rose",    label: "Rose"    },
  { value: "teal",    label: "Teal"    },
  { value: "brand",   label: "Brand"   },
];

const DEFAULT_INTAKE_STAGES: IntakeStageConfig[] = [
  { id: "interested",          label: "Interested",          color: "slate",   is_terminal: false },
  { id: "applied",             label: "Applied",             color: "sky",     is_terminal: false },
  { id: "under_review",        label: "Under Review",        color: "amber",   is_terminal: false },
  { id: "chapter_vote",        label: "Chapter Vote",        color: "orange",  is_terminal: false },
  { id: "national_submission", label: "National Submission", color: "purple",  is_terminal: false },
  { id: "approved",            label: "Approved",            color: "emerald", is_terminal: false },
  { id: "crossed",             label: "Crossed",             color: "brand",   is_terminal: true  },
];

const DEFAULT_DOC_TYPES: IntakeDocTypeConfig[] = [
  { id: "transcript",       label: "Transcript" },
  { id: "background_check", label: "Background Check" },
  { id: "recommendation",   label: "Recommendation Letter" },
  { id: "other",            label: "Other" },
];

export default function IntakeStagesSection({
  config,
  onSave,
  setError,
  setSuccess,
}: {
  config: ChapterConfig;
  onSave: (c: ChapterConfig) => void;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [stages, setStages] = useState<IntakeStageConfig[]>(
    config.intake_stages ?? DEFAULT_INTAKE_STAGES
  );
  const [docTypes, setDocTypes] = useState<IntakeDocTypeConfig[]>(
    config.intake_doc_types ?? DEFAULT_DOC_TYPES
  );
  const [saving, setSaving] = useState(false);

  const terminalCount = stages.filter((s) => s.is_terminal).length;

  async function handleSave() {
    if (terminalCount !== 1) {
      setError("Exactly one stage must be marked as terminal (the final crossing stage).");
      return;
    }
    if (!stages[stages.length - 1]?.is_terminal) {
      setError("The terminal stage must be the last stage in the list.");
      return;
    }
    if (stages.some((s) => !s.id.trim() || !s.label.trim())) {
      setError("All stages must have an ID and label.");
      return;
    }
    if (docTypes.some((dt) => !dt.id.trim() || !dt.label.trim())) {
      setError("All document types must have an ID and label.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChapterConfig({ intake_stages: stages, intake_doc_types: docTypes });
      onSave(updated);
      setSuccess("Intake pipeline configuration saved.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to save intake configuration.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function addStage() {
    const terminalIdx = stages.findIndex((s) => s.is_terminal);
    const insertAt = terminalIdx >= 0 ? terminalIdx : stages.length;
    setStages((prev) => [
      ...prev.slice(0, insertAt),
      { id: "", label: "", color: "slate" as IntakeStageConfig["color"], is_terminal: false },
      ...prev.slice(insertAt),
    ]);
  }

  function removeStage(index: number) {
    setStages((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStage(index: number, updates: Partial<IntakeStageConfig>) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function moveStage(index: number, direction: -1 | 1) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= stages.length) return;
    setStages((prev) => {
      const next = [...prev];
      [next[index], next[targetIdx]] = [next[targetIdx]!, next[index]!];
      return next;
    });
  }

  function addDocType() {
    setDocTypes((prev) => [...prev, { id: "", label: "" }]);
  }

  function removeDocType(index: number) {
    setDocTypes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDocType(index: number, updates: Partial<IntakeDocTypeConfig>) {
    setDocTypes((prev) => prev.map((dt, i) => (i === index ? { ...dt, ...updates } : dt)));
  }

  function resetToDefaults() {
    if (!confirm("Reset to NPHC default stages and document types? Your current config will be lost.")) return;
    setStages(DEFAULT_INTAKE_STAGES);
    setDocTypes(DEFAULT_DOC_TYPES);
  }

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-content-primary mb-1">Intake Pipeline</h3>
          <p className="text-sm text-content-secondary">
            Configure the stages candidates move through during your intake process. The terminal
            stage represents crossing — it generates an invite code.
          </p>
        </div>
        <button
          onClick={resetToDefaults}
          className="shrink-0 text-xs text-content-muted hover:text-content-secondary underline"
        >
          Reset to defaults
        </button>
      </div>

      {/* Stages */}
      <div>
        <h4 className="text-sm font-semibold text-content-secondary mb-3">Stages</h4>
        {terminalCount !== 1 && (
          <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 px-3 py-2 rounded-lg mb-3">
            Exactly one stage must be marked as terminal. Currently: {terminalCount}.
          </p>
        )}
        <div className="space-y-2 mb-3">
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  onClick={() => moveStage(i, -1)}
                  disabled={i === 0}
                  className="text-content-muted hover:text-content-secondary disabled:opacity-30 leading-none py-0.5 px-1 text-xs"
                  title="Move up"
                >&#9650;</button>
                <button
                  onClick={() => moveStage(i, 1)}
                  disabled={i === stages.length - 1}
                  className="text-content-muted hover:text-content-secondary disabled:opacity-30 leading-none py-0.5 px-1 text-xs"
                  title="Move down"
                >&#9660;</button>
              </div>
              <input
                type="text"
                value={stage.id}
                onChange={(e) => updateStage(i, { id: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                placeholder="id (snake_case)"
                className="w-36 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <input
                type="text"
                value={stage.label}
                onChange={(e) => updateStage(i, { label: e.target.value })}
                placeholder="Label"
                className="flex-1 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <select
                value={stage.color}
                onChange={(e) => updateStage(i, { color: e.target.value as IntakeStageConfig["color"] })}
                className="w-28 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                {STAGE_COLOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-content-secondary whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={stage.is_terminal}
                  onChange={(e) => updateStage(i, { is_terminal: e.target.checked })}
                  className="rounded"
                />
                Terminal
              </label>
              <button
                onClick={() => removeStage(i)}
                className="text-red-400 hover:text-red-300 text-sm shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addStage}
          className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/15"
        >
          Add Stage
        </button>
      </div>

      {/* Document Types */}
      <div>
        <h4 className="text-sm font-semibold text-content-secondary mb-3">Document Types</h4>
        <div className="space-y-2 mb-3">
          {docTypes.map((dt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={dt.id}
                onChange={(e) => updateDocType(i, { id: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                placeholder="id"
                className="w-36 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <input
                type="text"
                value={dt.label}
                onChange={(e) => updateDocType(i, { label: e.target.value })}
                placeholder="Label"
                className="flex-1 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <button
                onClick={() => removeDocType(i)}
                className="text-red-400 hover:text-red-300 text-sm shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addDocType}
          className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/15"
        >
          Add Document Type
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Intake Config"}
      </button>
    </div>
  );
}
