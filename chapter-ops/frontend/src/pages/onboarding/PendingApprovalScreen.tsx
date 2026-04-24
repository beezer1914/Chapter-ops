import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  cancelMyChapterRequest,
  fetchMyChapterRequest,
} from "@/services/chapterRequestService";
import type { ChapterRequest } from "@/types/chapterRequest";
import { useAuthStore } from "@/stores/authStore";

const POLL_INTERVAL_MS = 30_000;

interface Props {
  initialRequest: ChapterRequest;
  onStartOver?: () => void;
}

export default function PendingApprovalScreen({ initialRequest, onStartOver }: Props) {
  const [req, setReq] = useState<ChapterRequest>(initialRequest);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const tick = async () => {
      try {
        const latest = await fetchMyChapterRequest();
        if (!latest) return;
        setReq(latest);
        if (latest.status === "approved") {
          try {
            await useAuthStore.getState().initializeAuth();
          } catch {
            // Non-fatal — ProtectedRoute will re-check on next navigation.
          }
          navigate("/dashboard", { replace: true });
        }
      } catch {
        // Silent — polling continues.
      }
    };
    tick();  // fire once immediately on mount
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [navigate]);

  const approverLabel =
    req.approver_scope === "org_admin"
      ? `${req.organization_name} IHQ`
      : "a ChapterOps platform admin";

  const handleCancel = async () => {
    if (!confirm("Cancel this chapter request? You can submit a new one afterward.")) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelMyChapterRequest(req.id);
      onStartOver?.();
      navigate("/onboarding", { replace: true });
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          "Failed to cancel. Please try again."
      );
      setCancelling(false);
    }
  };

  const handleStartOver = () => {
    onStartOver?.();
    navigate("/onboarding", { replace: true });
  };

  if (req.status === "rejected") {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <h1 className="font-heading text-4xl font-black tracking-tight mb-4">
          Your chapter request wasn't approved
        </h1>
        <div className="border-l-4 border-red-500 bg-red-50 text-red-900 px-4 py-3 mb-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-1">
            Reason
          </div>
          <div>{req.rejected_reason}</div>
        </div>
        <button
          onClick={handleStartOver}
          className="px-4 py-2.5 bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] font-semibold"
        >
          Start a new request
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-16 px-6">
      <h1 className="font-heading text-4xl font-black tracking-tight mb-2">
        Chapter request pending
      </h1>
      <p className="text-content-secondary mb-8">
        Waiting on {approverLabel} to review your request. We'll email you when
        a decision is made.
      </p>
      <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 mb-8">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-content-muted">Chapter</dt>
            <dd className="font-semibold">{req.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-muted">Organization</dt>
            <dd>{req.organization_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-muted">Region</dt>
            <dd>{req.region_name}</dd>
          </div>
          {req.city && req.state && (
            <div className="flex justify-between">
              <dt className="text-content-muted">Location</dt>
              <dd>
                {req.city}, {req.state}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-content-muted">Submitted</dt>
            <dd>{new Date(req.created_at).toLocaleString()}</dd>
          </div>
        </dl>
      </div>
      {error && (
        <div className="border-l-4 border-red-500 bg-red-50 text-red-900 px-4 py-3 mb-4">
          {error}
        </div>
      )}
      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="text-sm text-content-muted underline hover:text-content-primary disabled:opacity-50"
      >
        {cancelling ? "Cancelling…" : "Cancel this request"}
      </button>
    </div>
  );
}
