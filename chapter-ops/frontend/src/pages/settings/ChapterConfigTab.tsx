import { useState } from "react";
import { updateChapterConfig } from "@/services/configService";
import { ROLE_HIERARCHY } from "./shared";
import PeriodsSection from "./PeriodsSection";
import CommitteesSection from "./CommitteesSection";
import IntakeStagesSection from "./IntakeStagesSection";
import TransferApprovalsSection from "./TransferApprovalsSection";
import CloseChapterSection from "./CloseChapterSection";
import type { ChapterConfig, FeeType, MemberRole } from "@/types";

export default function ChapterConfigTab({
  config,
  isAdmin,
  currentRole,
  setError,
  setSuccess,
  onSave,
}: {
  config: ChapterConfig;
  isAdmin: boolean;
  currentRole: MemberRole;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
  onSave: (c: ChapterConfig) => void;
}) {
  const [feeTypes, setFeeTypes] = useState<FeeType[]>(config.fee_types ?? []);
  const [settings, setSettings] = useState(config.settings ?? {});
  const [saving, setSaving] = useState(false);

  // Treasurer+ can manage fee types (financial config is their domain)
  const canEditFees = isAdmin || ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"];

  async function handleSaveFeeTypes() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChapterConfig({ fee_types: feeTypes });
      onSave(updated);
      setSuccess("Fee types updated.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update fee types.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChapterConfig({ settings });
      onSave(updated);
      setSuccess("Settings updated.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update settings.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePassFees(next: boolean) {
    const prev = settings.pass_stripe_fees_to_payer ?? false;
    const nextSettings = { ...settings, pass_stripe_fees_to_payer: next };
    setSettings(nextSettings);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChapterConfig({ settings: nextSettings });
      onSave(updated);
      setSuccess(next ? "Members will now cover Stripe fees." : "Chapter will now cover Stripe fees.");
    } catch (err: unknown) {
      setSettings((s) => ({ ...s, pass_stripe_fees_to_payer: prev }));
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error || "Failed to update fee policy.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function addFeeType() {
    setFeeTypes((prev) => [...prev, { id: "", label: "", default_amount: 0 }]);
  }

  function removeFeeType(index: number) {
    setFeeTypes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFeeType(index: number, updates: Partial<FeeType>) {
    setFeeTypes((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  }

  return (
    <div className="space-y-8">
      {/* Fee Types */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Fee Types</h3>
        <p className="text-sm text-content-secondary mb-4">
          Define the types of fees your chapter collects (dues, initiation fees, etc.).
        </p>
        {feeTypes.length === 0 ? (
          <p className="text-sm text-content-muted mb-4">No fee types defined.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {feeTypes.map((ft, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="text"
                  value={ft.id}
                  onChange={(e) => updateFeeType(i, { id: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                  disabled={!canEditFees}
                  placeholder="id"
                  className="w-32 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                />
                <input
                  type="text"
                  value={ft.label}
                  onChange={(e) => updateFeeType(i, { label: e.target.value })}
                  disabled={!canEditFees}
                  placeholder="Label"
                  className="flex-1 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm text-content-secondary">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ft.default_amount}
                    onChange={(e) => updateFeeType(i, { default_amount: parseFloat(e.target.value) || 0 })}
                    disabled={!canEditFees}
                    className="w-24 rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
                  />
                </div>
                {canEditFees && (
                  <button
                    onClick={() => removeFeeType(i)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEditFees && (
          <div className="flex gap-3">
            <button
              onClick={addFeeType}
              className="px-4 py-2 text-sm font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10"
            >
              Add Fee Type
            </button>
            <button
              onClick={handleSaveFeeTypes}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Fee Types"}
            </button>
          </div>
        )}
      </div>

      {/* Chapter Settings */}
      <div className="bg-surface-card-solid rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-content-primary mb-1">Chapter Settings</h3>
        <p className="text-sm text-content-secondary mb-4">
          Operational configuration for your chapter.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Fiscal Year Start Month
            </label>
            <select
              value={settings.fiscal_year_start_month ?? 1}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  fiscal_year_start_month: parseInt(e.target.value),
                }))
              }
              disabled={!isAdmin}
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
            >
              {["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December",
              ].map((month, i) => (
                <option key={i + 1} value={i + 1}>{month}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Payment Deadline Day
            </label>
            <input
              type="number"
              min="1"
              max="28"
              value={settings.payment_deadline_day ?? ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  payment_deadline_day: parseInt(e.target.value) || undefined,
                }))
              }
              disabled={!isAdmin}
              placeholder="Day of month (1-28)"
              className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-[var(--color-bg-input)]"
            />
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={settings.allow_payment_plans ?? true}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    allow_payment_plans: e.target.checked,
                  }))
                }
                disabled={!isAdmin}
                className="rounded"
              />
              Allow Payment Plans
            </label>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        )}
      </div>

      {/* Payment Processing — treasurer+ */}
      {canEditFees && (
        <div className="bg-surface-card-solid rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-content-primary mb-1">Payment Processing</h3>
          <p className="text-sm text-content-secondary mb-4">
            Control how Stripe processing fees are handled on card payments.
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.pass_stripe_fees_to_payer ?? false}
              onChange={(e) => handleSavePassFees(e.target.checked)}
              disabled={saving}
              className="mt-1 rounded"
            />
            <div>
              <p className="text-sm font-medium text-content-primary">
                Pass Stripe fees to the payer
              </p>
              <p className="text-xs text-content-secondary mt-0.5">
                When on, members see a gross-up (2.9% + $0.30) at checkout so the chapter receives the full dues amount. When off, the chapter absorbs the fee.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Billing Periods — visible to treasurer+ */}
      {ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"] && (
        <PeriodsSection setError={setError} setSuccess={setSuccess} />
      )}

      {/* Committees — visible to treasurer+ */}
      {ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["treasurer"] && (
        <CommitteesSection setError={setError} setSuccess={setSuccess} />
      )}

      {/* Intake Pipeline Config — visible to presidents */}
      {ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"] && (
        <IntakeStagesSection config={config} onSave={onSave} setError={setError} setSuccess={setSuccess} />
      )}

      {/* Transfer Approvals — visible to presidents */}
      {ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"] && (
        <TransferApprovalsSection setError={setError} setSuccess={setSuccess} />
      )}

      {/* Danger Zone — close chapter (presidents only) */}
      {ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["president"] && (
        <CloseChapterSection setError={setError} setSuccess={setSuccess} />
      )}
    </div>
  );
}
