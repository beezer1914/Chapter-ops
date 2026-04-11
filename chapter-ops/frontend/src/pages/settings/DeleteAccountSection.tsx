import { useState } from "react";
import api from "@/lib/api";

export default function DeleteAccountSection({
  setError,
}: {
  setError: (e: string | null) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.delete("/auth/account", { data: { password } });
      // Redirect to login — account is gone
      window.location.href = "/login";
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to delete account.";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="bg-surface-card-solid rounded-lg shadow border border-red-900/40 p-6">
        <h3 className="text-lg font-semibold text-red-400 mb-1">Danger Zone</h3>
        <p className="text-sm text-content-secondary mb-4">
          Permanently delete your account. Your name, email, and profile data will be anonymized
          immediately. Financial records are retained for 7 years per accounting regulations and
          cannot be removed.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-sm font-medium text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors"
        >
          Delete My Account
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-card-solid rounded-xl shadow-xl border border-red-900/40 w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Delete Your Account</h3>
            <p className="text-sm text-content-secondary mb-1">This action is <strong className="text-content-primary">irreversible</strong>. It will:</p>
            <ul className="text-sm text-content-secondary mb-4 list-disc list-inside space-y-0.5">
              <li>Anonymize your name and email address immediately</li>
              <li>Deactivate all chapter memberships</li>
              <li>End your access to ChapterOps permanently</li>
            </ul>
            <p className="text-xs text-content-muted mb-4">
              Financial records associated with your account are retained for 7 years and cannot be removed.
            </p>
            <form onSubmit={handleDelete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Confirm your password to continue
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Your current password"
                  className="w-full rounded-lg border border-red-900/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setModalOpen(false); setPassword(""); }}
                  className="px-4 py-2 text-sm font-medium text-content-secondary border border-[var(--color-border)] rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !password}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? "Deleting..." : "Permanently Delete Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
