import { useState } from "react";
import { updateChapterConfig } from "@/services/configService";
import { DEFAULT_PERMISSIONS, MODULE_LABELS, ROLE_HIERARCHY as PERM_ROLE_HIERARCHY } from "@/lib/permissions";
import type { ModuleKey, MemberRole, ChapterConfig } from "@/types";

const MODULE_SECTIONS: { label: string; modules: ModuleKey[] }[] = [
  {
    label: "Member Modules",
    modules: ["payments", "expenses", "events", "communications", "documents", "knowledge_base", "lineage"],
  },
  {
    label: "Admin Modules",
    modules: ["members", "invites", "intake", "workflows", "donations", "invoices", "regions"],
  },
];

const SELECTABLE_ROLES: { value: MemberRole; label: string }[] = [
  { value: "member",         label: "Member" },
  { value: "secretary",      label: "Secretary" },
  { value: "treasurer",      label: "Treasurer" },
  { value: "vice_president", label: "Vice President" },
  { value: "president",      label: "President" },
];

export default function AccessControlTab({
  config,
  isAdmin,
  setError,
  setSuccess,
  onSave,
}: {
  config: ChapterConfig;
  isAdmin: boolean;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
  onSave: (c: ChapterConfig) => void;
}) {
  const [permissions, setPermissions] = useState<Partial<Record<ModuleKey, MemberRole>>>(
    config.permissions ?? {}
  );
  const [saving, setSaving] = useState(false);

  function getEffectiveRole(module: ModuleKey): MemberRole {
    return permissions[module] ?? DEFAULT_PERMISSIONS[module];
  }

  function handleChange(module: ModuleKey, role: MemberRole) {
    setPermissions((prev) => ({ ...prev, [module]: role }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChapterConfig({ permissions });
      onSave(updated);
      setSuccess("Access permissions saved.");
    } catch {
      setError("Failed to save permissions.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setPermissions(config.permissions ?? {});
  }

  const hasChanges = JSON.stringify(permissions) !== JSON.stringify(config.permissions ?? {});

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-content-primary mb-1">Access Control</h3>
        <p className="text-sm text-content-muted">
          Set the minimum role required to access each module. Members below the minimum will not see it in their sidebar and cannot navigate to it directly.
        </p>
      </div>

      {!isAdmin && (
        <div className="p-3 bg-yellow-900/20 text-yellow-400 rounded-lg text-sm">
          You are viewing access settings in read-only mode. Only the President or Admin can edit these.
        </div>
      )}

      {MODULE_SECTIONS.map((section) => (
        <div key={section.label}>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-content-muted mb-3">
            {section.label}
          </h4>
          <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] overflow-hidden">
            {section.modules.map((module, idx) => {
              const effectiveRole = getEffectiveRole(module);
              const isDefault = !permissions[module];
              const effectiveLevel = PERM_ROLE_HIERARCHY[effectiveRole] ?? 0;

              return (
                <div
                  key={module}
                  className={`flex items-center justify-between px-5 py-3.5 gap-4 ${
                    idx < section.modules.length - 1 ? "border-b border-[var(--color-border)]" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary">{MODULE_LABELS[module]}</p>
                    {isDefault && (
                      <p className="text-[11px] text-content-muted mt-0.5">Default</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Visual role fill bar */}
                    <div className="hidden sm:flex items-center gap-1">
                      {SELECTABLE_ROLES.map((r) => (
                        <div
                          key={r.value}
                          className={`h-1.5 w-5 rounded-full transition-colors ${
                            PERM_ROLE_HIERARCHY[r.value] >= effectiveLevel
                              ? "bg-brand-primary-main"
                              : "bg-white/10"
                          }`}
                        />
                      ))}
                    </div>

                    <select
                      value={effectiveRole}
                      onChange={(e) => handleChange(module, e.target.value as MemberRole)}
                      disabled={!isAdmin}
                      className="text-sm rounded-lg px-3 py-1.5 border border-[var(--color-border)] text-content-primary disabled:opacity-50 disabled:cursor-not-allowed focus:border-brand-primary-main focus:ring-1 focus:ring-brand-primary-light/50 outline-none"
                    >
                      {SELECTABLE_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}+
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {isAdmin && (
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-card-solid border border-[var(--color-border)] rounded-lg hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Discard Changes
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-primary-main rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Permissions"}
          </button>
        </div>
      )}
    </div>
  );
}
