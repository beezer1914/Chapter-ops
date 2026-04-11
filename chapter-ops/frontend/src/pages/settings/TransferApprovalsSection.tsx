import { useEffect, useState } from "react";
import {
  fetchChapterTransfers,
  approveTransfer,
  denyTransfer,
} from "@/services/transferService";
import type { ChapterTransferRequest } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending both approvals",
  approved_by_from: "Approved by sending chapter",
};

export default function TransferApprovalsSection({
  setError,
  setSuccess,
}: {
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [transfers, setTransfers] = useState<ChapterTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchChapterTransfers()
      .then((data) => setTransfers(data.filter((t) => t.status === "pending" || t.status === "approved_by_from")))
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleApprove(id: string) {
    setProcessing(true);
    try {
      const updated = await approveTransfer(id);
      if (updated.status === "approved") {
        setTransfers((prev) => prev.filter((t) => t.id !== id));
        setSuccess("Transfer approved. Member has been moved to the new chapter.");
      } else {
        setTransfers((prev) => prev.map((t) => (t.id === id ? updated : t)));
        setSuccess("Your approval recorded. Waiting for the other chapter president.");
      }
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to approve transfer.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleDeny(id: string) {
    setProcessing(true);
    try {
      await denyTransfer(id, { reason: denyReason.trim() || undefined });
      setTransfers((prev) => prev.filter((t) => t.id !== id));
      setDenyId(null);
      setDenyReason("");
      setSuccess("Transfer request denied.");
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to deny transfer.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="bg-surface-card-solid rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-content-primary mb-1">Chapter Transfer Requests</h3>
      <p className="text-sm text-content-secondary mb-4">
        Pending transfer requests involving your chapter. Both chapter presidents must approve.
      </p>

      {loading ? (
        <p className="text-sm text-content-muted">Loading...</p>
      ) : transfers.length === 0 ? (
        <p className="text-sm text-content-muted">No pending transfer requests.</p>
      ) : (
        <div className="space-y-4">
          {transfers.map((t) => (
            <div key={t.id} className="border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-content-primary">{t.requesting_user_name}</p>
                  <p className="text-sm text-content-secondary mt-0.5">{t.from_chapter_name} → {t.to_chapter_name}</p>
                  {t.reason && <p className="text-sm text-content-secondary mt-1 italic">"{t.reason}"</p>}
                  <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.status === "approved_by_from" ? "bg-blue-900/30 text-blue-400" : "bg-yellow-900/30 text-yellow-400"
                  }`}>
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(t.id)} disabled={processing}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => setDenyId(t.id)} disabled={processing}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                    Deny
                  </button>
                </div>
              </div>

              {denyId === t.id && (
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Reason for denial (optional)
                  </label>
                  <input type="text" value={denyReason} onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="e.g. Dues outstanding"
                    className="w-full rounded-lg border border-[var(--color-border-brand)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-2" />
                  <div className="flex gap-2">
                    <button onClick={() => handleDeny(t.id)} disabled={processing}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                      Confirm Denial
                    </button>
                    <button onClick={() => { setDenyId(null); setDenyReason(""); }}
                      className="px-3 py-1.5 text-xs font-medium text-content-secondary bg-white/10 rounded-lg hover:bg-white/10">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
