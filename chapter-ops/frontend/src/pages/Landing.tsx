import { Link } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Navigate } from "react-router-dom";
import {
  CreditCard,
  Users,
  Calendar,
  Shield,
  BarChart3,
  Megaphone,
  ArrowRight,
  ChevronRight,
  Zap,
  Globe,
  Lock,
} from "lucide-react";

const FEATURES = [
  {
    icon: CreditCard,
    title: "Dues & Payments",
    description:
      "Stripe-powered payment processing with installment plans, auto-tracking, and real-time financial status for every member.",
  },
  {
    icon: Users,
    title: "Member Management",
    description:
      "Complete roster management with roles, custom fields, chapter transfers, and a searchable regional directory.",
  },
  {
    icon: Calendar,
    title: "Event Operations",
    description:
      "Public event pages with ticketing, RSVP tracking, manual check-in, and attendance analytics — all branded to your org.",
  },
  {
    icon: Megaphone,
    title: "Communications Hub",
    description:
      "Chapter announcements with pinning and expiry, plus targeted email blasts with audience filters.",
  },
  {
    icon: BarChart3,
    title: "Regional Oversight",
    description:
      "Multi-chapter dashboards for regional directors with cross-chapter visibility, comparative analytics, and directory search.",
  },
  {
    icon: Shield,
    title: "Workflow Automation",
    description:
      "Build custom approval workflows — onboarding checklists, reimbursement pipelines, or any multi-step process your chapter needs.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Register Your Organization",
    description:
      "Set up your organization with custom branding — colors, fonts, logo — applied automatically to every chapter underneath.",
  },
  {
    num: "02",
    title: "Create Your Chapter",
    description:
      "Onboard your chapter in minutes. Configure dues structures, invite officers, and optionally override org-level branding.",
  },
  {
    num: "03",
    title: "Invite & Operate",
    description:
      "Generate invite codes, onboard members, collect dues via Stripe, manage events, and run your chapter from a single dashboard.",
  },
];

const STATS = [
  { value: "80+", label: "API Endpoints" },
  { value: "21", label: "Data Models" },
  { value: "100%", label: "Multi-Tenant" },
  { value: "All", label: "Councils" },
];

export default function Landing() {
  const { user } = useAuthStore();

  // If already logged in, redirect to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen font-body bg-[#060e1a] text-white overflow-x-hidden">
      {/* ── Sticky Nav ───────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#060e1a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1">
            <span className="text-xl font-heading font-bold tracking-tight">
              Chapter<span className="text-brand-accent-main">Ops</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#platform" className="hover:text-white transition-colors">
              Platform
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-semibold text-gray-300 hover:text-white transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold bg-brand-accent-main text-[#060e1a] px-5 py-2.5 rounded-xl hover:bg-brand-accent-light transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ─────────────────────────────────────────── */}
      <section className="relative min-h-[100vh] flex items-center justify-center pt-16 overflow-hidden">
        {/* Layered background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060e1a] via-brand-primary-dark/40 to-[#060e1a]" />
        <div className="absolute inset-0 bg-mesh-diagonal" />

        {/* Radial glows */}
        <div className="absolute top-1/3 left-1/4 w-[700px] h-[700px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-brand-primary-main/20 via-transparent to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-brand-accent-main/10 via-transparent to-transparent blur-3xl rounded-full" />

        {/* Floating Greek letters */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
          <span className="absolute top-[15%] left-[5%] text-[120px] font-heading font-bold text-white/[0.02] float-slow">&#931;</span>
          <span className="absolute top-[55%] left-[10%] text-[80px] font-heading font-bold text-white/[0.025] float-medium" style={{ animationDelay: "1s" }}>&#934;</span>
          <span className="absolute top-[20%] right-[8%] text-[100px] font-heading font-bold text-white/[0.02] float-medium" style={{ animationDelay: "2s" }}>&#913;</span>
          <span className="absolute bottom-[20%] right-[15%] text-[140px] font-heading font-bold text-white/[0.015] float-slow" style={{ animationDelay: "3s" }}>&#916;</span>
          <span className="absolute top-[40%] left-[40%] text-[60px] font-heading font-bold text-white/[0.02] float-slow" style={{ animationDelay: "1.5s" }}>&#928;</span>
          <span className="absolute bottom-[30%] left-[60%] text-[90px] font-heading font-bold text-white/[0.02] float-medium" style={{ animationDelay: "0.5s" }}>&#937;</span>
          <span className="absolute top-[70%] left-[30%] text-[70px] font-heading font-bold text-white/[0.015] float-medium" style={{ animationDelay: "2.5s" }}>&#922;</span>
          <span className="absolute top-[10%] left-[55%] text-[50px] font-heading font-bold text-white/[0.02] float-slow" style={{ animationDelay: "4s" }}>&#918;</span>
        </div>

        {/* Hero content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 text-center">
          <div className="anim-card-reveal">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8 text-xs font-medium text-gray-400 backdrop-blur-sm">
              <Zap className="w-3.5 h-3.5 text-brand-accent-main" />
              Built for every letter on the yard
            </div>
          </div>

          <h1 className="anim-card-reveal text-5xl sm:text-6xl lg:text-7xl font-heading font-bold tracking-tight leading-[1.1] mb-6" style={{ animationDelay: "100ms" }}>
            The Modern Platform for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary-light via-brand-primary-main to-brand-accent-main">
              Greek Excellence
            </span>
          </h1>

          <p className="anim-card-reveal max-w-2xl mx-auto text-lg sm:text-xl text-gray-400 leading-relaxed mb-10" style={{ animationDelay: "200ms" }}>
            Dues collection, member management, events, communications, and
            chapter operations — unified in one white-label platform built
            specifically for Greek letter organizations.
          </p>

          <div className="anim-card-reveal flex flex-col sm:flex-row items-center justify-center gap-4" style={{ animationDelay: "300ms" }}>
            <Link
              to="/register"
              className="group flex items-center gap-2 bg-gradient-to-r from-brand-primary-main to-brand-primary-dark text-white font-semibold text-base px-8 py-4 rounded-xl hover:shadow-lg hover:shadow-brand-primary-main/25 transition-all duration-200"
            >
              Start Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 text-gray-400 hover:text-white font-medium text-base px-6 py-4 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all duration-200"
            >
              See Features
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#060e1a] to-transparent" />
      </section>

      {/* ── Stats Strip ──────────────────────────────────────────── */}
      <section className="relative py-12 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat, i) => (
              <div
                key={stat.label}
                className="text-center anim-card-reveal"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <p className="text-3xl lg:text-4xl font-heading font-bold text-white mb-1">
                  {stat.value}
                </p>
                <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────────── */}
      <section id="features" className="relative py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16 anim-card-reveal">
            <p className="text-xs font-heading font-semibold uppercase tracking-[0.2em] text-brand-accent-main mb-3">
              Capabilities
            </p>
            <h2 className="text-3xl lg:text-4xl font-heading font-bold tracking-tight mb-4">
              Everything Your Chapter Needs
            </h2>
            <p className="max-w-xl mx-auto text-gray-400 leading-relaxed">
              From finances to communications, ChapterOps replaces the
              spreadsheets, Venmo requests, and group texts with a single
              purpose-built platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group relative p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300 card-lift anim-card-reveal"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-brand-primary-main/15 flex items-center justify-center mb-4 group-hover:bg-brand-primary-main/25 transition-colors">
                    <Icon className="w-5 h-5 text-brand-primary-light" />
                  </div>

                  <h3 className="text-base font-heading font-bold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────── */}
      <section id="how-it-works" className="relative py-24 lg:py-32">
        {/* Subtle background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-primary-dark/10 to-transparent" />

        <div className="relative max-w-5xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16 anim-card-reveal">
            <p className="text-xs font-heading font-semibold uppercase tracking-[0.2em] text-brand-accent-main mb-3">
              Getting Started
            </p>
            <h2 className="text-3xl lg:text-4xl font-heading font-bold tracking-tight mb-4">
              Live in Three Steps
            </h2>
            <p className="max-w-lg mx-auto text-gray-400 leading-relaxed">
              From zero to a fully operational chapter dashboard in under ten
              minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className="relative anim-card-reveal"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                {/* Connector line (desktop) */}
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] w-[calc(100%-40px)] h-px bg-gradient-to-r from-white/10 to-transparent" />
                )}

                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary-main/20 to-brand-primary-dark/20 border border-white/5 mb-5">
                    <span className="text-xl font-heading font-bold text-brand-primary-light">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="text-lg font-heading font-bold text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Highlights ───────────────────────────────────── */}
      <section id="platform" className="relative py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — text */}
            <div className="anim-card-reveal">
              <p className="text-xs font-heading font-semibold uppercase tracking-[0.2em] text-brand-accent-main mb-3">
                Built Different
              </p>
              <h2 className="text-3xl lg:text-4xl font-heading font-bold tracking-tight mb-6">
                Designed for Greek Organizations,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary-light to-brand-accent-main">
                  Not Adapted From Generic Tools
                </span>
              </h2>
              <p className="text-gray-400 leading-relaxed mb-8">
                Every feature was built with Greek letter organizations in mind —
                from the terminology to the role hierarchy to the multi-chapter
                architecture. No workarounds, no compromises.
              </p>

              <div className="space-y-4">
                {[
                  {
                    icon: Globe,
                    title: "White-Label Branding",
                    desc: "Each org gets its own colors, fonts, and logos. Fully customizable to match your letters.",
                  },
                  {
                    icon: Lock,
                    title: "Multi-Tenant Isolation",
                    desc: "Chapter data is fully isolated at the database level. No cross-chapter leakage, ever.",
                  },
                  {
                    icon: Zap,
                    title: "Regional Oversight",
                    desc: "Regional directors get cross-chapter dashboards without chapter-level access.",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex gap-4 group">
                      <div className="w-9 h-9 rounded-lg bg-brand-primary-main/10 flex items-center justify-center shrink-0 group-hover:bg-brand-primary-main/20 transition-colors">
                        <Icon className="w-4 h-4 text-brand-primary-light" />
                      </div>
                      <div>
                        <h4 className="text-sm font-heading font-bold text-white mb-0.5">
                          {item.title}
                        </h4>
                        <p className="text-sm text-gray-500 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right — visual card mockup */}
            <div className="anim-card-reveal relative" style={{ animationDelay: "200ms" }}>
              <div className="relative">
                {/* Glow behind card */}
                <div className="absolute -inset-4 bg-gradient-to-br from-brand-primary-main/20 via-transparent to-brand-accent-main/10 rounded-3xl blur-2xl" />

                <div className="relative rounded-2xl border border-white/10 bg-[#0a1628] overflow-hidden shadow-2xl">
                  {/* Mock dashboard header */}
                  <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/60" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                      <div className="w-3 h-3 rounded-full bg-green-500/60" />
                    </div>
                    <div className="flex-1 mx-8">
                      <div className="h-6 bg-white/5 rounded-lg max-w-xs mx-auto" />
                    </div>
                  </div>

                  {/* Mock dashboard content */}
                  <div className="p-6 space-y-4">
                    {/* Stat cards row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/10 p-4">
                        <div className="text-[10px] uppercase tracking-wider text-emerald-400/60 mb-1">Financial</div>
                        <div className="text-lg font-heading font-bold text-emerald-400">$4,250</div>
                      </div>
                      <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/10 p-4">
                        <div className="text-[10px] uppercase tracking-wider text-blue-400/60 mb-1">Members</div>
                        <div className="text-lg font-heading font-bold text-blue-400">47</div>
                      </div>
                      <div className="rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/10 p-4">
                        <div className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">Events</div>
                        <div className="text-lg font-heading font-bold text-amber-400">12</div>
                      </div>
                    </div>

                    {/* Mock table */}
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/5">
                        <div className="text-xs font-heading font-semibold text-gray-400">Recent Payments</div>
                      </div>
                      {[1, 2, 3].map((row) => (
                        <div key={row} className="px-4 py-3 border-b border-white/[0.03] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-brand-primary-main/20" />
                            <div>
                              <div className="h-3 w-24 bg-white/10 rounded" />
                              <div className="h-2 w-16 bg-white/5 rounded mt-1.5" />
                            </div>
                          </div>
                          <div className="h-3 w-14 bg-emerald-500/20 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Section ──────────────────────────────────────────── */}
      <section className="relative py-24 lg:py-32 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary-dark via-brand-primary-main/30 to-[#060e1a]" />
        <div className="absolute inset-0 bg-mesh-diagonal" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse,_var(--tw-gradient-stops))] from-brand-accent-main/10 via-transparent to-transparent blur-3xl" />

        <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-5xl font-heading font-bold tracking-tight mb-6 anim-card-reveal">
            Ready to Modernize Your Chapter?
          </h2>
          <p className="text-lg text-gray-400 leading-relaxed mb-10 max-w-xl mx-auto anim-card-reveal" style={{ animationDelay: "100ms" }}>
            Join the next generation of Greek organization management. Set up
            your chapter in minutes, not months.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 anim-card-reveal" style={{ animationDelay: "200ms" }}>
            <Link
              to="/register"
              className="group flex items-center gap-2 bg-brand-accent-main text-[#060e1a] font-bold text-base px-8 py-4 rounded-xl hover:bg-brand-accent-light transition-all duration-200 shadow-lg shadow-brand-accent-main/20"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="text-gray-300 hover:text-white font-medium text-base px-6 py-4 transition-colors"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="relative border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="text-lg font-heading font-bold tracking-tight">
                Chapter<span className="text-brand-accent-main">Ops</span>
              </span>
              <span className="text-xs text-gray-600 ml-2">
                &copy; {new Date().getFullYear()}
              </span>
            </div>

            <div className="flex items-center gap-8 text-sm text-gray-500">
              <a href="#features" className="hover:text-gray-300 transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="hover:text-gray-300 transition-colors">
                How It Works
              </a>
              <Link to="/login" className="hover:text-gray-300 transition-colors">
                Sign In
              </Link>
              <Link to="/register" className="hover:text-gray-300 transition-colors">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
