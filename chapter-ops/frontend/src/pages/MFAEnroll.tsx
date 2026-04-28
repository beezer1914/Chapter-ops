import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { enrollStart, enrollVerify } from "@/services/mfaService";
import type { MFAEnrollStartResponse } from "@/types/mfa";

type Step = 1 | 2 | 3;

export default function MFAEnroll() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [enrollment, setEnrollment] = useState<MFAEnrollStartResponse | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleStart() {
    setError(null);
    setSubmitting(true);
    try {
      const data = await enrollStart();
      setEnrollment(data);
      setStep(2);
    } catch {
      setError("Failed to start enrollment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    setError(null);
    setSubmitting(true);
    try {
      const { backup_codes } = await enrollVerify(code);
      setBackupCodes(backup_codes);
      setStep(3);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? "Invalid verification code.");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadBackupCodes() {
    if (!backupCodes) return;
    const blob = new Blob([backupCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chapterops-mfa-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyBackupCodes() {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="font-heading text-3xl font-black tracking-tight mb-2">
          Set up Two-Factor Authentication
        </h1>
        <p className="text-content-secondary mb-8">
          Step {step} of 3
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-content-primary">
              Two-factor authentication adds a second layer of security to your account.
              You'll need an authenticator app like Google Authenticator, Authy, 1Password,
              or your built-in iOS / Android password manager.
            </p>
            <button
              onClick={handleStart}
              disabled={submitting}
              className="bg-brand-primary-main text-white px-5 py-2.5 font-medium hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {submitting ? "Starting…" : "Get Started"}
            </button>
          </div>
        )}

        {step === 2 && enrollment && (
          <div className="space-y-6">
            <p className="text-content-primary">
              Scan this QR code with your authenticator app.
            </p>
            <img
              src={enrollment.qr_code_data_uri}
              alt="MFA QR code"
              className="w-56 h-56 border border-[var(--color-border)]"
            />
            <details className="text-sm text-content-secondary">
              <summary className="cursor-pointer">Can't scan? Enter manually</summary>
              <div className="mt-2 font-mono break-all">{enrollment.secret_base32}</div>
            </details>
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1">
                Enter the 6-digit code from your authenticator
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="w-32 text-center text-2xl tracking-widest font-mono border border-[var(--color-border)] px-3 py-2"
                placeholder="000000"
              />
            </div>
            <button
              onClick={handleVerify}
              disabled={submitting || code.length !== 6}
              className="bg-brand-primary-main text-white px-5 py-2.5 font-medium hover:bg-brand-primary-dark disabled:opacity-50"
            >
              {submitting ? "Verifying…" : "Verify and Enable"}
            </button>
          </div>
        )}

        {step === 3 && backupCodes && (
          <div className="space-y-6">
            <div className="bg-amber-50 border-l-4 border-l-amber-500 border border-amber-200 p-4 text-amber-800">
              <strong>Save these now. You won't see them again.</strong>
              <p className="text-sm mt-1">
                Each code can be used once if you lose access to your authenticator. Store
                them somewhere safe (password manager, printed and locked away).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-base bg-[var(--color-bg-card-solid)] p-4 border border-[var(--color-border)]">
              {backupCodes.map((c) => (
                <div key={c} className="px-2 py-1 text-content-primary">{c}</div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={downloadBackupCodes}
                className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] text-content-primary px-4 py-2 hover:bg-[var(--color-bg-card-hover)]"
              >
                Download as .txt
              </button>
              <button
                onClick={copyBackupCodes}
                className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] text-content-primary px-4 py-2 hover:bg-[var(--color-bg-card-hover)]"
              >
                Copy to clipboard
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
              onClick={() => navigate("/dashboard")}
              disabled={!savedConfirmed}
              className="bg-brand-primary-main text-white px-5 py-2.5 font-medium hover:bg-brand-primary-dark disabled:opacity-50"
            >
              Continue to Dashboard
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
