import { useState } from "react";
import { useConfigStore } from "@/stores/configStore";
import api from "@/lib/api";

export default function CloseChapterSection({
  setError,
  setSuccess,
}: {
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const { chapter } = useConfigStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [chapterNameConfirm, setChapterNameConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(
    chapter?.deletion_scheduled_at ?? null
  );
  const [cancelling, setCancelling] = useState(false);

  const chapterName = chapter?.name ?? "";

  async function handleRequestDeletion(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post("/config/chapter/delete", {
        password,
        chapter_name: chapterNameConfirm,
      });
      setScheduledAt(res.data.deletion_scheduled_at);
      setModalOpen(false);
      setPassword("");
      setChapterNameConfirm("");
      setSuccess(
        "Chapter deletion scheduled. A data export has been sent to your email. You have 30 days to cancel."
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to schedule deletion.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelDeletion() {
    setCancelling(true);
    setError(null);
    try {
      await api.delete("/config/chapter/delete");
      setScheduledAt(null);
      setSuccess("Chapter deletion cancelled.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to cancel deletion.";
      setError(message);
    } finally {
      setCancelling(false);
    }
  }

  const deletionDate = scheduledAt
    ? new Date(scheduledAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <>
      <div className="bg-surface-card-solid rounded-lg shadow border border-red-900/40 p-6">
        <h3 className="text-lg font-semibold text-red-400 mb-1">Danger Zone</h3>

        {scheduledAt ? (
          <>
            <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 rounded-lg text-sm text-red-300">
              <strong>Chapter deletion scheduled for {deletionDate}.</strong><br />
              A data export was sent to your email. All chapter data will be permanently deleted on this date.
              You can cancel before then.
            </div>
            <button
              onClick={handleCancelDeletion}
              disabled={cancelling}
              className="px-4 py-2 text-sm font-medium text-content-secondary border border-[var(--color-border)] rounded-lg hover:bg-white/5 disabled:opacity-50"
            >
              {cancelling ? "Cancelling..." : "Cancel Deletion"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-content-secondary mb-4">
              Permanently close this chapter and delete all associated data. A 30-day grace period
              allows you to cancel and retrieve your data export. Financial records are retained for
              7 years and cannot be removed.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors"
            >
              Close This Chapter
            </button>
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-card-solid rounded-xl shadow-xl border border-red-900/40 w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Close Chapter</h3>
            <p className="text-sm text-content-secondary mb-1">
              This will schedule <strong className="text-content-primary">permanent deletion</strong> of your chapter in 30 days. It will:
            </p>
            <ul className="text-sm text-content-secondary mb-4 list-disc list-inside space-y-0.5">
              <li>Send a data export (members, payments, donations) to your email</li>
              <li>Give you 30 days to cancel before data is wiped</li>
              <li>Delete all members, events, documents, and settings</li>
              <li>Retain financial records for 7 years (accounting requirement)</li>
            </ul>
            <form onSubmit={handleRequestDeletion} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Type the chapter name to confirm: <span className="text-content-primary font-semibold">{chapterName}</span>
                </label>
                <input
                  type="text"
                  value={chapterNameConfirm}
                  onChange={(e) => setChapterNameConfirm(e.target.value)}
                  required
                  placeholder={chapterName}
                  className="w-full rounded-lg border border-red-900/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Confirm your password
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
                  onClick={() => { setModalOpen(false); setPassword(""); setChapterNameConfirm(""); }}
                  className="px-4 py-2 text-sm font-medium text-content-secondary border border-[var(--color-border)] rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !password || chapterNameConfirm.toLowerCase() !== chapterName.toLowerCase()}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? "Scheduling..." : "Schedule Chapter Deletion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
