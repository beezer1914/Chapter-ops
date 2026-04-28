import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchMFAStatus,
  regenerateBackupCodes,
  disableMFA,
} from "@/services/mfaService";
import type { MFAStatus } from "@/types/mfa";

interface Props {
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}

export default function SecurityTab({ setError, setSuccess }: Props) {
  const [status, setStatus] = useState<MFAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  useEffect(() => {
    fetchMFAStatus()
      .then((s) => setStatus(s))
      .catch(() => setError("Failed to load MFA status."))
      .finally(() => setLoading(false));
  }, [setError]);

  async function handleRegenerate() {
    setBusy(true);
    setError(null);
    try {
      const { backup_codes } = await regenerateBackupCodes();
      setNewCodes(backup_codes);
      setSavedConfirmed(false);
      setShowRegenModal(true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Could not regenerate backup codes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!confirm("Disable two-factor authentication? Your account will be less secure.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await disableMFA();
      setSuccess("Two-factor authentication disabled.");
      const refreshed = await fetchMFAStatus();
      setStatus(refreshed);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Could not disable MFA.");
    } finally {
      setBusy(false);
    }
  }

  function downloadCodes() {
    if (!newCodes) return;
    const blob = new Blob([newCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chapterops-mfa-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyCodes() {
    if (!newCodes) return;
    navigator.clipboard.writeText(newCodes.join("\n"));
  }

  if (loading) return <p className="text-content-muted">Loading…</p>;
  if (!status) return null;

  return (
    <div className="space-y-6">
      <section className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] p-5">
        <h3 className="font-heading text-lg font-bold text-content-primary mb-2">
          Two-Factor Authentication
        </h3>

        {status.enabled ? (
          <>
            <p className="text-emerald-700 mb-1">
              ✓ Enabled
            </p>
            {status.last_used_at && (
              <p className="text-sm text-content-muted mb-4">
                Last used {new Date(status.last_used_at).toLocaleDateString()}
              </p>
            )}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleRegenerate}
                disabled={busy}
                className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] text-content-primary px-4 py-2 hover:bg-[var(--color-bg-card-hover)] disabled:opacity-50"
              >
                Regenerate backup codes
              </button>
              {!status.role_requires && (
                <button
                  onClick={handleDisable}
                  disabled={busy}
                  className="border border-red-300 text-red-700 px-4 py-2 hover:bg-red-50 disabled:opacity-50"
                >
                  Disable
                </button>
              )}
            </div>
            {status.role_requires && (
              <p className="text-xs text-content-muted mt-3">
                MFA is required for your role and cannot be disabled.
              </p>
            )}
          </>
        ) : status.role_requires ? (
          <>
            <p className="text-content-primary mb-3">
              <strong>Required for your role.</strong> Set up two-factor authentication
              to protect your account.
            </p>
            <Link
              to="/mfa/enroll"
              className="inline-block bg-brand-primary-main text-white px-5 py-2.5 font-medium hover:bg-brand-primary-dark"
            >
              Enroll Now
            </Link>
          </>
        ) : (
          <>
            <p className="text-content-primary mb-3">
              Add an extra layer of security with an authenticator app.
            </p>
            <Link
              to="/mfa/enroll"
              className="inline-block bg-brand-primary-main text-white px-5 py-2.5 font-medium hover:bg-brand-primary-dark"
            >
              Enable Two-Factor Authentication
            </Link>
          </>
        )}
      </section>

      {showRegenModal && newCodes && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] max-w-lg w-full p-6 space-y-4">
            <h3 className="font-heading text-xl font-bold">New backup codes</h3>
            <div className="bg-amber-50 border-l-4 border-l-amber-500 border border-amber-200 p-3 text-sm text-amber-800">
              <strong>Save these now. You won't see them again.</strong> Your old backup codes
              are no longer valid.
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-base bg-[var(--color-bg-card)] p-4 border border-[var(--color-border)]">
              {newCodes.map((c) => (
                <div key={c} className="px-2 py-1 text-content-primary">{c}</div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={downloadCodes}
                className="border border-[var(--color-border)] text-content-primary px-4 py-2 hover:bg-[var(--color-bg-card-hover)]"
              >
                Download .txt
              </button>
              <button
                onClick={copyCodes}
                className="border border-[var(--color-border)] text-content-primary px-4 py-2 hover:bg-[var(--color-bg-card-hover)]"
              >
                Copy
              </button>
            </div>
            <label className="flex items-center gap-2 text-content-primary cursor-pointer">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
              />
              I've saved these somewhere safe
            </label>
            <button
              onClick={() => {
                setShowRegenModal(false);
                setNewCodes(null);
              }}
              disabled={!savedConfirmed}
              className="bg-brand-primary-main text-white px-5 py-2.5 font-medium hover:bg-brand-primary-dark disabled:opacity-50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
