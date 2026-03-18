import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

export default function Login() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      await login({ email, password });
      const user = useAuthStore.getState().user;
      if (user?.active_chapter_id) {
        navigate("/dashboard");
      } else {
        navigate("/onboarding");
      }
    } catch {
      // Error is handled by the store
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex font-body bg-gray-50">
      {/* Left Pane - Branding & Geometric Background */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-primary-dark relative overflow-hidden items-center justify-center">
        {/* Abstract gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary-main to-brand-primary-dark opacity-95"></div>
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-brand-accent-main/20 via-transparent to-transparent blur-3xl rounded-full transform translate-x-1/3 -translate-y-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-brand-primary-light/10 via-transparent to-transparent blur-3xl rounded-full transform -translate-x-1/4 translate-y-1/4"></div>

        <div className="relative z-10 text-center text-white px-12 animate-fade-in">
          <h1 className="text-5xl font-heading font-bold mb-6 tracking-tight drop-shadow-md">ChapterOps</h1>
          <p className="text-xl font-light text-brand-primary-light max-w-md mx-auto leading-relaxed">
            The premium platform for modern greek organization management.
          </p>
        </div>
      </div>

      {/* Right Pane - Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-sm lg:max-w-md animate-slide-up">
          <div className="bg-white py-10 px-8 lg:px-12 shadow-glass border border-gray-100 rounded-3xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-heading font-extrabold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-sm text-gray-500">Sign in to access your workspace</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm font-medium animate-fade-in">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-gray-200 px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-brand-primary-main focus:ring-2 focus:ring-brand-primary-light transition-all duration-200 outline-none"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-gray-200 px-4 py-3 bg-gray-50 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-brand-primary-main focus:ring-2 focus:ring-brand-primary-light transition-all duration-200 outline-none"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-soft text-sm font-semibold text-white bg-brand-primary-main hover:bg-brand-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary-main transition-colors duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {submitting ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                Don't have an account?{" "}
                <Link to="/register" className="font-semibold text-brand-primary-main hover:text-brand-primary-dark transition-colors">
                  Create one now
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
