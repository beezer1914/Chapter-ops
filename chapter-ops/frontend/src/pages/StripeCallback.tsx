/**
 * StripeCallback — handles the OAuth redirect from Stripe Connect.
 *
 * Stripe redirects users here after they authorize the platform. This page
 * extracts the ?code and ?state query params and calls the backend to complete
 * the OAuth handshake, then redirects to /settings.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { handleStripeCallback } from "@/services/stripeService";

export default function StripeCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    if (error) {
      setErrorMsg(errorDesc ?? "Stripe authorization was denied.");
      setStatus("error");
      return;
    }

    if (!code || !state) {
      setErrorMsg("Missing authorization parameters from Stripe.");
      setStatus("error");
      return;
    }

    handleStripeCallback(code, state)
      .then(() => {
        setStatus("success");
        setTimeout(() => navigate("/settings"), 2000);
      })
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } }).response?.data
            ?.error ?? "Failed to connect Stripe account.";
        setErrorMsg(msg);
        setStatus("error");
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">
              Connecting your Stripe account...
            </h2>
            <p className="text-sm text-gray-500 mt-2">Please wait a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Stripe connected successfully!
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Redirecting you to Settings...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Connection failed
            </h2>
            <p className="text-sm text-red-600 mt-2">{errorMsg}</p>
            <button
              onClick={() => navigate("/settings")}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-brand-primary-dark"
            >
              Back to Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}
