import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { executeRecaptcha, preloadRecaptcha } from "@/lib/recaptcha";
import { verifyMFA } from "@/services/mfaService";
import type { User } from "@/types";

export default function Login() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    preloadRecaptcha();
  }, []);

  const redirectAfterAuth = (user: User | null | undefined) => {
    if (user?.active_chapter_id) {
      navigate("/dashboard");
    } else {
      navigate("/onboarding");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      const recaptcha_token = await executeRecaptcha("login");
      const result = await login({ email, password, recaptcha_token });
      if (result.kind === "requires_enrollment") {
        navigate("/mfa/enroll", {
          state: { enrollment_token: result.enrollment_token },
        });
        return;
      }
      if (result.kind === "requires_mfa") {
        setMfaToken(result.mfa_token);
        return;
      }
      redirectAfterAuth(useAuthStore.getState().user);
    } catch {
      // Error is handled by the store
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyMfa = async () => {
    if (!mfaToken) return;
    setMfaError(null);
    setVerifying(true);
    try {
      const payload = useBackupCode
        ? { mfa_token: mfaToken, backup_code: mfaCode }
        : { mfa_token: mfaToken, code: mfaCode };
      const response = await verifyMFA(payload);
      await useAuthStore.getState().setSessionFromMFAVerify({
        user: response.user as User,
        is_platform_admin: response.is_platform_admin,
        csrf_token: response.csrf_token,
      });
      redirectAfterAuth(useAuthStore.getState().user);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setMfaError(
        err.response?.data?.error ??
          (useBackupCode ? "Invalid backup code." : "Invalid code.")
      );
      setMfaCode("");
    } finally {
      setVerifying(false);
    }
  };

  if (mfaToken) {
    return (
      <div className="min-h-screen flex items-center justify-center font-body bg-[var(--color-bg-page)] px-4">
        <div className="w-full max-w-md bg-surface-card-solid rounded-2xl shadow-xl shadow-black/20 p-10">
          <h1 className="text-2xl font-heading font-bold text-content-primary mb-1">
            Two-factor authentication
          </h1>
          <p className="text-sm text-content-muted mb-6">
            {useBackupCode
              ? "Enter one of your backup codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>

          {mfaError && (
            <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm">
              {mfaError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyMfa();
            }}
            className="space-y-4"
          >
            {!useBackupCode ? (
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                autoFocus
                className="w-full text-center text-2xl tracking-widest font-mono border border-[var(--color-border)] px-3 py-3 rounded-xl bg-[var(--color-bg-input)]"
              />
            ) : (
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoFocus
                className="w-full text-center text-lg tracking-widest font-mono border border-[var(--color-border)] px-3 py-3 rounded-xl bg-[var(--color-bg-input)]"
              />
            )}

            <button
              type="submit"
              disabled={verifying || mfaCode.length === 0}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-primary-main to-brand-primary-dark hover:shadow-lg disabled:opacity-50"
            >
              {verifying ? "Verifying…" : "Verify"}
            </button>

            <button
              type="button"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setMfaCode("");
                setMfaError(null);
              }}
              className="w-full text-sm text-content-muted hover:text-brand-primary-main"
            >
              {useBackupCode
                ? "Back to authenticator code"
                : "Use a backup code instead"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex font-body bg-[var(--color-bg-page)]">
      {/* Left Pane — Immersive brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-primary-dark relative overflow-hidden items-center justify-center">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary-main via-brand-primary-dark to-[#020810]" />

        {/* Diagonal mesh overlay */}
        <div className="absolute inset-0 bg-mesh-diagonal" />

        {/* Radial accent glow */}
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-brand-accent-main/15 via-transparent to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-brand-primary-light/8 via-transparent to-transparent blur-3xl rounded-full" />

        {/* Floating Greek letters — ambient decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
          <span className="absolute top-[12%] left-[8%] text-7xl font-heading font-bold text-white/[0.04] float-slow">&#931;</span>
          <span className="absolute top-[60%] left-[15%] text-5xl font-heading font-bold text-white/[0.03] float-medium" style={{ animationDelay: "1s" }}>&#934;</span>
          <span className="absolute top-[25%] right-[12%] text-6xl font-heading font-bold text-white/[0.04] float-medium" style={{ animationDelay: "2s" }}>&#913;</span>
          <span className="absolute bottom-[15%] right-[20%] text-8xl font-heading font-bold text-white/[0.03] float-slow" style={{ animationDelay: "3s" }}>&#916;</span>
          <span className="absolute top-[45%] left-[45%] text-5xl font-heading font-bold text-white/[0.025] float-slow" style={{ animationDelay: "1.5s" }}>&#928;</span>
          <span className="absolute bottom-[35%] left-[55%] text-6xl font-heading font-bold text-white/[0.03] float-medium" style={{ animationDelay: "0.5s" }}>&#937;</span>
        </div>

        {/* Content */}
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

      {/* Right Pane — Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 relative">
        {/* Soft radial gradient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-primary-light/30 via-[var(--color-bg-page)] to-[var(--color-bg-page)]" />

        <div className="relative z-10 mx-auto w-full max-w-sm lg:max-w-md anim-card-reveal" style={{ animationDelay: "200ms" }}>
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-heading font-bold text-content-primary">
              Chapter<span className="text-brand-primary-main">Ops</span>
            </h1>
          </div>

          <div className="bg-surface-card-solid py-10 px-8 lg:px-12 shadow-xl shadow-black/20 rounded-2xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-heading font-bold text-content-primary mb-1">Welcome back</h2>
              <p className="text-sm text-content-muted">Sign in to your workspace</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-900/30 border-l-4 border-red-500 text-red-400 rounded-lg text-sm font-medium anim-card-reveal">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="anim-card-reveal" style={{ animationDelay: "300ms" }}>
                <label htmlFor="email" className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-[var(--color-border)] px-4 py-3 bg-[var(--color-bg-input)] text-content-primary placeholder-content-muted focus:bg-[var(--color-bg-input)] focus:border-brand-primary-main focus:ring-2 focus:ring-brand-primary-light/50 transition-all duration-200 outline-none"
                  placeholder="name@example.com"
                />
              </div>

              <div className="anim-card-reveal" style={{ animationDelay: "380ms" }}>
                <label htmlFor="password" className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[var(--color-border)] px-4 py-3 bg-[var(--color-bg-input)] text-content-primary placeholder-content-muted focus:bg-[var(--color-bg-input)] focus:border-brand-primary-main focus:ring-2 focus:ring-brand-primary-light/50 transition-all duration-200 outline-none"
                  placeholder="Enter your password"
                />
              </div>

              <div className="anim-card-reveal" style={{ animationDelay: "460ms" }}>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-primary-main to-brand-primary-dark hover:shadow-lg hover:shadow-brand-primary-main/25 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary-main transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>Sign In<span className="ml-2">→</span></>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-4 text-center anim-card-reveal" style={{ animationDelay: "500ms" }}>
              <Link to="/forgot-password" className="text-sm text-content-muted hover:text-brand-primary-main transition-colors">
                Forgot your password?
              </Link>
            </div>

            <p className="mt-4 text-[11px] text-content-muted text-center leading-relaxed">
              This site is protected by reCAPTCHA and the Google{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-primary-main">Privacy Policy</a>
              {" "}and{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-primary-main">Terms of Service</a>{" "}apply.
            </p>

            <div className="mt-4 text-center anim-card-reveal" style={{ animationDelay: "540ms" }}>
              <p className="text-sm text-content-muted">
                Don't have an account?{" "}
                <Link to="/register" className="font-semibold text-brand-primary-main hover:text-brand-primary-dark transition-colors">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
