import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex font-body bg-[var(--color-bg-page)]">
      {/* Left brand pane */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-primary-dark relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary-main via-brand-primary-dark to-[#020810]" />
        <div className="absolute inset-0 bg-mesh-diagonal" />
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-brand-accent-main/15 via-transparent to-transparent blur-3xl rounded-full" />
        <div className="relative z-10 text-center text-white px-12 anim-card-reveal">
          <h1 className="text-5xl font-heading font-bold mb-4 tracking-tight">
            Chapter<span className="text-brand-accent-main">Ops</span>
          </h1>
          <div className="w-12 h-0.5 bg-brand-accent-main/60 mx-auto mb-6" />
          <p className="text-lg font-light text-white/60 max-w-sm mx-auto leading-relaxed">
            The premium platform for modern greek organization management.
          </p>
        </div>
      </div>

      {/* Right form pane */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-primary-light/30 via-[var(--color-bg-page)] to-[var(--color-bg-page)]" />

        <div className="relative z-10 mx-auto w-full max-w-sm lg:max-w-md anim-card-reveal" style={{ animationDelay: "200ms" }}>
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-heading font-bold text-content-primary">
              Chapter<span className="text-brand-primary-main">Ops</span>
            </h1>
          </div>

          <div className="bg-surface-card-solid py-10 px-8 lg:px-12 shadow-xl shadow-black/20 rounded-2xl">
            {sent ? (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-900/30 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-heading font-bold text-content-primary mb-2">Check your inbox</h2>
                <p className="text-sm text-content-muted mb-6">
                  If an account exists for <span className="text-content-primary font-medium">{email}</span>, you'll receive a reset link within a few minutes.
                </p>
                <Link to="/login" className="text-sm font-semibold text-brand-primary-main hover:text-brand-primary-dark transition-colors">
                  ← Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-heading font-bold text-content-primary mb-1">Forgot your password?</h2>
                  <p className="text-sm text-content-muted">Enter your email and we'll send you a reset link.</p>
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-red-900/30 border-l-4 border-red-500 text-red-400 rounded-lg text-sm font-medium">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-content-primary placeholder-content-muted focus:border-brand-primary-main focus:ring-2 focus:ring-brand-primary-light/50 transition-all duration-200 outline-none"
                      placeholder="name@example.com"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-primary-main to-brand-primary-dark hover:shadow-lg hover:shadow-brand-primary-main/25 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary-main transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      "Send Reset Link"
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <Link to="/login" className="text-sm text-content-muted hover:text-content-primary transition-colors">
                    ← Back to sign in
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
