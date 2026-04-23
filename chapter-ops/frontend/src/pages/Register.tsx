import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/authStore";
import { executeRecaptcha, preloadRecaptcha } from "@/lib/recaptcha";

const registerSchema = z
  .object({
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[a-z]/, "Must contain at least one lowercase letter")
      .regex(/\d/, "Must contain at least one digit")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Must contain at least one special character"),
    confirm_password: z.string(),
    phone: z.string().optional(),
    invite_code: z.string().optional(),
    initiation_date: z.string().optional(),
    accept_terms: z.boolean().refine((val) => val === true, {
      message: "You must agree to the Terms of Service and Privacy Policy to continue.",
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

const passwordRequirements = [
  { label: "At least 12 characters", test: (pw: string) => pw.length >= 12 },
  { label: "One uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "One digit", test: (pw: string) => /\d/.test(pw) },
  { label: "One special character", test: (pw: string) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
];

export default function Register() {
  const navigate = useNavigate();
  const { register: registerUser, error, clearError } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      confirm_password: "",
      phone: "",
      invite_code: "",
      initiation_date: "",
      accept_terms: false,
    },
  });

  const password = watch("password", "");

  useEffect(() => {
    preloadRecaptcha();
  }, []);

  const onSubmit = async (data: RegisterFormData) => {
    clearError();
    setSubmitting(true);
    try {
      const recaptcha_token = await executeRecaptcha("register");
      await registerUser({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        password: data.password,
        phone: data.phone || undefined,
        invite_code: data.invite_code || undefined,
        initiation_date: data.initiation_date || undefined,
        recaptcha_token,
      });
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
    <div className="min-h-screen flex items-center justify-center bg-white/5 py-12 px-4">
      <div className="max-w-md w-full bg-surface-card-solid shadow-glass rounded-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-content-primary">ChapterOps</h1>
          <p className="text-sm text-content-secondary mt-1">Create your account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-[var(--color-border)] text-red-400 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-content-secondary">
                First Name
              </label>
              <input
                id="first_name"
                type="text"
                {...register("first_name")}
                className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {errors.first_name && (
                <p className="mt-1 text-xs text-red-400">{errors.first_name.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-content-secondary">
                Last Name
              </label>
              <input
                id="last_name"
                type="text"
                {...register("last_name")}
                className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {errors.last_name && (
                <p className="mt-1 text-xs text-red-400">{errors.last_name.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-content-secondary">
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-content-secondary">
              Password
            </label>
            <input
              id="password"
              type="password"
              {...register("password")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
            )}
            <ul className="mt-2 space-y-1">
              {passwordRequirements.map((req) => {
                const met = req.test(password);
                return (
                  <li key={req.label} className="flex items-center gap-2 text-xs">
                    <span className={met ? "text-green-400" : "text-content-muted"}>
                      {met ? "\u2713" : "\u25CB"}
                    </span>
                    <span className={met ? "text-green-400" : "text-content-secondary"}>
                      {req.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label htmlFor="confirm_password" className="block text-sm font-medium text-content-secondary">
              Confirm Password
            </label>
            <input
              id="confirm_password"
              type="password"
              {...register("confirm_password")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {errors.confirm_password && (
              <p className="mt-1 text-xs text-red-400">{errors.confirm_password.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-content-secondary">
              Phone <span className="text-content-muted font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              {...register("phone")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="initiation_date" className="block text-sm font-medium text-content-secondary">
              Initiation Date <span className="text-content-muted font-normal">(optional)</span>
            </label>
            <input
              id="initiation_date"
              type="date"
              {...register("initiation_date")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-content-secondary">
              When were you initiated into your organization? This helps us set your membership status.
            </p>
          </div>

          <div>
            <label htmlFor="invite_code" className="block text-sm font-medium text-content-secondary">
              Invite Code <span className="text-content-muted font-normal">(optional)</span>
            </label>
            <input
              id="invite_code"
              type="text"
              {...register("invite_code")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border-brand)] px-3 py-2 shadow-glass focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-content-secondary">
              Have an invite code from your chapter? Enter it here to join automatically.
            </p>
          </div>

          <div>
            <label htmlFor="accept_terms" className="flex items-start gap-2 cursor-pointer">
              <input
                id="accept_terms"
                type="checkbox"
                {...register("accept_terms")}
                className="mt-1 shrink-0"
              />
              <span className="text-xs text-content-secondary leading-relaxed">
                I agree to the{" "}
                <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  Terms of Service
                </Link>
                ,{" "}
                <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  Privacy Policy
                </Link>
                , and{" "}
                <Link to="/legal/cookies" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  Cookie Policy
                </Link>
                .
              </span>
            </label>
            {errors.accept_terms && (
              <p className="mt-1 text-xs text-red-400">{errors.accept_terms.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating account..." : "Create Account"}
          </button>

          <p className="text-[11px] text-content-muted text-center leading-relaxed">
            This site is protected by reCAPTCHA and the Google{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-600">Privacy Policy</a>
            {" "}and{" "}
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-600">Terms of Service</a>{" "}apply.
          </p>
        </form>

        <p className="text-sm text-content-secondary mt-6 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-primary-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
