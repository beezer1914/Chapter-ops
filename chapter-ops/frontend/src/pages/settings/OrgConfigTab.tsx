import { useState } from "react";
import { updateOrgConfig } from "@/services/configService";
import type { OrganizationConfig, CustomFieldDefinition, MemberRole } from "@/types";

const INTERNAL_ROLES: MemberRole[] = ["president", "vice_president", "treasurer", "secretary", "member"];

export default function OrgConfigTab({
  config,
  isAdmin,
  setError,
  setSuccess,
  onSave,
}: {
  config: OrganizationConfig;
  isAdmin: boolean;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
  onSave: (c: OrganizationConfig) => void;
}) {
  const [roleTitles, setRoleTitles] = useState<Record<string, string>>(config.role_titles ?? {});
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(config.custom_member_fields ?? []);
  const [saving, setSaving] = useState(false);

  async function handleSaveRoleTitles() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgConfig({ role_titles: roleTitles });
      onSave(updated);
      setSuccess("Role titles updated.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to update role titles.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFields() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgConfig({ custom_member_fields: customFields });
      onSave(updated);
      setSuccess("Custom fields updated.");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to update custom fields.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function addField() {
    setCustomFields((prev) => [...prev, { key: "", label: "", type: "text", required: false }]);
  }

  function removeField(index: number) {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateField(index: number, updates: Partial<CustomFieldDefinition>) {
    setCustomFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  }

  return (
    <div className="space-y-8">
      {/* Role Titles */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Role Titles</h3>
        <p className="text-sm text-content-secondary mb-4">
          Customize how role names appear throughout the platform. Internal permissions remain unchanged.
        </p>
        <div className="space-y-3">
          {INTERNAL_ROLES.map((role) => (
            <div key={role} className="flex items-center gap-4">
              <span className="text-sm text-content-secondary w-32 capitalize">
                {role.replace("_", " ")}
              </span>
              <input
                type="text"
                value={roleTitles[role] ?? ""}
                onChange={(e) => setRoleTitles((prev) => ({ ...prev, [role]: e.target.value }))}
                disabled={!isAdmin}
                placeholder={role.replace("_", " ")}
                className="flex-1 max-w-xs rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)] disabled:text-content-secondary"
              />
            </div>
          ))}
        </div>
        {isAdmin && (
          <button onClick={handleSaveRoleTitles} disabled={saving}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
            {saving ? "Saving..." : "Save Role Titles"}
          </button>
        )}
      </div>

      {/* Custom Member Fields */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Custom Member Fields</h3>
        <p className="text-sm text-content-secondary mb-4">
          Define additional fields for member profiles (e.g., line number, crossing date).
        </p>
        {customFields.length === 0 ? (
          <p className="text-sm text-content-muted mb-4">No custom fields defined.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {customFields.map((field, i) => (
              <div key={i} className="flex items-center gap-3">
                <input type="text" value={field.key}
                  onChange={(e) => updateField(i, { key: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                  disabled={!isAdmin} placeholder="key"
                  className="w-32 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]" />
                <input type="text" value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  disabled={!isAdmin} placeholder="Label"
                  className="flex-1 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]" />
                <select value={field.type}
                  onChange={(e) => updateField(i, { type: e.target.value as "text" | "number" | "date" })}
                  disabled={!isAdmin}
                  className="w-28 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]">
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
                <label className="flex items-center gap-1 text-sm text-content-secondary">
                  <input type="checkbox" checked={field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                    disabled={!isAdmin} className="rounded" />
                  Req
                </label>
                {isAdmin && (
                  <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-3">
            <button onClick={addField}
              className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10">
              Add Field
            </button>
            <button onClick={handleSaveFields} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50">
              {saving ? "Saving..." : "Save Custom Fields"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
