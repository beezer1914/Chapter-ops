import { useEffect, useState } from "react";
import {
  approveChapterRequest,
  fetchPendingChapterRequests,
  rejectChapterRequest,
} from "@/services/chapterRequestService";
import type { ChapterRequest } from "@/types";

interface Props {
  title: string;
  scope: "org_admin" | "platform_admin";
  emptyMessage?: string;
}

export default function PendingChapterRequestsSection({ title, scope, emptyMessage }: Props) {
  const [allRequests, setAllRequests] = useState<ChapterRequest[]>([]);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectingReq, setRejectingReq] = useState<ChapterRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setAllRequests(await fetchPendingChapterRequests());
      } catch {
        /* empty state is fine — user may have no approval authority */
      }
    })();
  }, []);

  const pendingRequests = allRequests.filter((r) => r.approver_scope === scope);

  const handleApprove = async (reqId: string) => {
    setActioningId(reqId);
    try {
      await approveChapterRequest(reqId);
      setAllRequests((rs) => rs.filter((r) => r.id !== reqId));
    } catch (err: any) {
      alert(err?.response?.data?.error ?? "Failed to approve.");
    } finally {
      setActioningId(null);
    }
  };

  const submitRejection = async () => {
    if (!rejectingReq) return;
    if (!rejectReason.trim()) {
      setRejectError("Reason is required.");
      return;
    }
    setActioningId(rejectingReq.id);
    setRejectError(null);
    try {
      await rejectChapterRequest(rejectingReq.id, rejectReason.trim());
      setAllRequests((rs) => rs.filter((r) => r.id !== rejectingReq.id));
      setRejectingReq(null);
      setRejectReason("");
    } catch (err: any) {
      setRejectError(err?.response?.data?.error ?? "Failed to reject.");
    } finally {
      setActioningId(null);
    }
  };

  if (pendingRequests.length === 0) {
    if (!emptyMessage) return null;
    return (
      <section className="border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-6 text-sm text-content-muted">
        {emptyMessage}
      </section>
    );
  }

  return (
    <>
      <section className="border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div className="border-t-2 border-[var(--color-text-heading)] mt-[2px] border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
            {title}
          </div>
          <h2 className="font-heading text-2xl font-black tracking-tight">
            {pendingRequests.length} request{pendingRequests.length === 1 ? "" : "s"} awaiting review
          </h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted border-b border-[var(--color-border)]">
              <th className="text-left px-4 py-2">Requester</th>
              <th className="text-left px-4 py-2">Chapter</th>
              <th className="text-left px-4 py-2">Region</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Scope</th>
              <th className="text-left px-4 py-2">Submitted</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingRequests.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.requester_name}</div>
                  <div className="text-content-muted text-xs">{r.requester_email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-content-muted text-xs">
                    {r.city && r.state ? `${r.city}, ${r.state}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3">{r.region_name}</td>
                <td className="px-4 py-3 capitalize">{r.chapter_type}</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 bg-amber-50 text-amber-700">
                    {r.approver_scope === "platform_admin" ? "Platform" : "Org"}
                  </span>
                </td>
                <td className="px-4 py-3 text-content-muted">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => handleApprove(r.id)}
                    disabled={actioningId === r.id}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setRejectingReq(r);
                      setRejectReason("");
                      setRejectError(null);
                    }}
                    disabled={actioningId === r.id}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* ── Reject Chapter Request Modal ── */}
      {rejectingReq && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setRejectingReq(null)}
        >
          <div
            className="bg-surface-card-solid rounded-2xl shadow-2xl border border-[var(--color-border-brand)] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-base font-heading font-bold text-content-primary">
                  Reject chapter request
                </h3>
                <p className="text-xs text-content-muted mt-0.5">
                  {rejectingReq.name} — {rejectingReq.organization_name}
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-1.5">
                  Reason <span className="font-normal normal-case">(required, visible to the requester)</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="e.g. This chapter is not on our current roster; please verify with IHQ before resubmitting."
                  className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm bg-surface-input focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 resize-none"
                />
              </div>
              {rejectError && (
                <div className="p-3 rounded-lg text-sm bg-red-900/20 border border-red-900/30 text-red-400">
                  {rejectError}
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-[var(--color-border)]">
              <button
                onClick={() => setRejectingReq(null)}
                className="px-4 py-2 text-sm font-medium text-content-secondary border border-[var(--color-border)] rounded-lg hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={actioningId === rejectingReq.id}
                className="px-5 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actioningId === rejectingReq.id ? "Rejecting..." : "Confirm reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
