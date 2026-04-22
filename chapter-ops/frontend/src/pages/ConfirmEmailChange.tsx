import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { refreshCsrfToken } from "@/lib/api";

export default function ConfirmEmailChange() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!token) {
      setStatus("error");
      setMessage("This confirmation link is missing a token.");
      return;
    }

    (async () => {
      try {
        await refreshCsrfToken();
        await api.post("/auth/confirm-email-change", { token });
        setStatus("done");
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "This link is invalid or has expired.";
        setStatus("error");
        setMessage(msg);
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center font-body bg-[var(--color-bg-page)] px-4">
      <div className="w-full max-w-md bg-surface-card-solid py-10 px-8 shadow-xl shadow-black/20 rounded-2xl text-center">
        {status === "working" && (
          <>
            <h2 className="text-xl font-heading font-bold text-content-primary mb-2">
              Confirming email change…
            </h2>
            <p className="text-sm text-content-muted">One moment.</p>
          </>
        )}

        {status === "done" && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-900/30 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-heading font-bold text-content-primary mb-2">
              Email updated
            </h2>
            <p className="text-sm text-content-muted mb-6">
              Your ChapterOps account email has been changed successfully.
            </p>
            <Link
              to="/login"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-primary-main to-brand-primary-dark hover:shadow-lg hover:shadow-brand-primary-main/25 transition-all duration-200"
            >
              Sign in
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h2 className="text-xl font-heading font-bold text-content-primary mb-2">
              Couldn't confirm email
            </h2>
            <div className="mb-6 p-4 bg-red-900/30 border-l-4 border-red-500 text-red-400 rounded-lg text-sm font-medium">
              {message}
            </div>
            <Link
              to="/login"
              className="text-sm text-content-muted hover:text-content-primary transition-colors"
            >
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
