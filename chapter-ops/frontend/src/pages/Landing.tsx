import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import CookieBanner from "@/components/CookieBanner";
import {
  ArrowRight,
  Users,
  Calendar,
  Megaphone,
  FolderOpen,
  BookOpen,
  CreditCard,
  ShieldCheck,
  GitBranch,
  GitMerge,
  BarChart3,
  Receipt,
  FileText,
  LayoutDashboard,
  Globe,
  Palette,
  ShieldBan,
  AlertTriangle,
  Inbox,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

const NAV_LINKS = [
  { href: "#problem",  label: "Why ChapterOps" },
  { href: "#modules",  label: "Platform" },
  { href: "#audience", label: "Who It's For" },
];

const FRAGMENTED_TOOLS = [
  "Google Docs for rosters",
  "A separate system for intake",
  "Spreadsheets for finances",
  "Another platform for events",
  "Email chains for decisions",
];

const MODULES = [
  { icon: CreditCard,  label: "Dues & Payments",      desc: "Stripe-powered collection with payment plans, auto-tracking, and real-time financial status." },
  { icon: Users,       label: "Member Management",     desc: "Full roster with roles, chapter transfers, lineage tracking, and invite-only onboarding." },
  { icon: ShieldCheck, label: "Intake Pipeline",       desc: "Stage-by-stage candidate tracking from prospect to crossing, all in one place." },
  { icon: Calendar,    label: "Events",                desc: "RSVP, ticketing, check-in, and public event pages — branded to your organization." },
  { icon: Megaphone,   label: "Communications",        desc: "Chapter announcements, pinned posts, and targeted email blasts with audience filters." },
  { icon: FolderOpen,  label: "Document Vault",        desc: "R2-backed secure storage for bylaws, minutes, financials — searchable and always accessible." },
  { icon: BookOpen,    label: "Knowledge Base",        desc: "WYSIWYG articles scoped to your org or chapter — from Robert's Rules to officer handbooks." },
  { icon: GitMerge,    label: "Workflow Automation",   desc: "Custom approval flows for reimbursements, onboarding steps, or any multi-stage process." },
  { icon: GitBranch,   label: "Lineage & History",     desc: "Family tree visualization, line tracking, and chapter milestone records." },
  { icon: Receipt,     label: "Expense Tracking",      desc: "Submit, review, and approve chapter expenses with full audit trails." },
  { icon: FileText,    label: "Invoicing",             desc: "Bill members or chapters at the regional level with status tracking and email delivery." },
  { icon: BarChart3,   label: "Regional Dashboard",    desc: "Cross-chapter visibility for directors — analytics, directory search, and oversight." },
  { icon: Globe,       label: "IHQ Dashboard",         desc: "Org-wide KPIs, per-chapter health scoring, and broadcast messaging for national leadership." },
  { icon: ShieldBan,   label: "Access Controls",       desc: "Suspend members or chapters with reason tracking — reversible controls that preserve all data." },
  { icon: Palette,     label: "Custom Branding",       desc: "White-label theming with org colors, logos, fonts, and light/dark scheme per organization." },
];

const AUDIENCES = [
  {
    type: "Undergraduate Chapters",
    headline: "The full platform, built for semester speed.",
    body: "Undergraduate chapters run fast. Leadership turns over every year, intake has a strict season, and officers are balancing coursework alongside chapter responsibilities. ChapterOps gives your chapter the complete platform so that when officers change, the chapter does not miss a beat.",
    points: ["Intake & MIP pipeline tracking", "Semester dues cycles with payment plans", "Event management, RSVP & ticketing", "Officer handoff workflows & document vault"],
  },
  {
    type: "Graduate & Alumni Chapters",
    headline: "The full platform, built for year-round operations.",
    body: "Graduate and alumni chapters operate differently. No semester clock, no annual leadership reset. You manage finances like a small business, run events year-round, and hold institutional knowledge that spans decades. ChapterOps gives you the complete platform to match that level of operation.",
    points: ["Year-round dues & financial management", "Expense tracking & regional invoicing", "Document vault for bylaws, minutes & records", "Knowledge base for history, policy & handbooks"],
  },
  {
    type: "National / IHQ Leadership",
    headline: "Org-wide visibility without the spreadsheet.",
    body: "National leadership needs a view above the chapter level — financial health across regions, chapter activity at a glance, and the ability to broadcast critical updates instantly. ChapterOps gives IHQ administrators a dedicated dashboard that surfaces what matters without requiring manual reports from every chapter.",
    points: ["IHQ dashboard with per-chapter health scores", "Org-wide financial and dues collection KPIs", "Instant broadcast to all active chapters", "Chapter suspension controls with reason tracking"],
  },
];

const TRUST_ITEMS = [
  { stat: "Stripe",        label: "PCI-compliant payments" },
  { stat: "Invite-only",   label: "Controlled member access" },
  { stat: "Role-based",    label: "Granular permissions" },
  { stat: "RLS-backed",    label: "Row-level data isolation" },
  { stat: "White-label",   label: "Full org branding control" },
];

const SECTION_LABEL = "text-[11px] font-medium uppercase tracking-[0.2em] text-brand-primary-light mb-5";

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function Landing() {
  const { user } = useAuthStore();
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div
      className="min-h-screen font-body bg-surface-deep text-white overflow-x-hidden"
      style={{
        "--color-bg-deep": "#07101e",
        "--color-text-primary": "rgba(255, 255, 255, 0.88)",
        "--color-text-secondary": "rgba(255, 255, 255, 0.68)",
        "--color-text-muted": "rgba(255, 255, 255, 0.50)",
        "--color-text-heading": "#ffffff",
        "--color-border": "rgba(255, 255, 255, 0.07)",
      } as React.CSSProperties}
    >

      {/* ── NAV ─────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-surface-deep/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1">
            <span className="text-xl font-heading font-semibold tracking-tight text-white">
              Chapter<span className="text-brand-primary-light">Ops</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-[13px] font-medium text-content-muted">
            {NAV_LINKS.map(({ href, label }) => (
              <a key={href} href={href} className="hover:text-white transition-colors">{label}</a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login"    className="text-[13px] font-medium text-content-muted hover:text-white transition-colors px-4 py-2">Sign In</Link>
            <Link to="/register" className="text-[13px] font-semibold bg-brand-primary-main text-white px-5 py-2.5 rounded-lg hover:bg-brand-primary-dark transition-colors">
              Request Access
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────── */}
      <section className="relative min-h-[100vh] flex items-center pt-20 pb-16 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary-dark/25 via-surface-deep to-surface-deep" />
        <div className="absolute inset-0 bg-mesh-diagonal opacity-40" />
        {/* Ambient glow — left side behind text */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 w-[500px] h-[600px] rounded-full bg-brand-primary-main/[0.07] blur-3xl pointer-events-none" />

        {/* Floating Greek letters — background texture */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
          {["Σ","Φ","Α","Δ","Π","Ω","Κ","Ζ","Β","Θ"].map((l, i) => (
            <span
              key={l}
              className="absolute font-heading font-bold text-white/[0.012]"
              style={{
                fontSize: `${80 + (i % 4) * 30}px`,
                top: `${10 + (i * 17) % 75}%`,
                left: `${(i * 23) % 90}%`,
                animation: `floatSlow ${6 + (i % 4)}s ease-in-out infinite`,
                animationDelay: `${i * 0.7}s`,
              }}
            >{l}</span>
          ))}
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 xl:gap-20 items-center">

          {/* ── Left: copy ── */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-1.5 mb-8 text-[11px] font-medium text-content-muted tracking-widest uppercase backdrop-blur-sm anim-card-reveal">
              Chapter Operations Platform
            </div>

            <h1
              className="text-4xl sm:text-5xl lg:text-[3.75rem] font-heading font-bold tracking-tight leading-[1.08] mb-6 anim-card-reveal"
              style={{ animationDelay: "80ms" }}
            >
              Your chapter runs<br />
              <span className="italic text-transparent bg-clip-text bg-gradient-to-br from-brand-primary-light via-[#6B8FEA] to-brand-primary-light">
                on one platform.
              </span>
            </h1>

            <p
              className="text-[1.05rem] text-content-muted leading-relaxed mb-8 max-w-lg anim-card-reveal"
              style={{ animationDelay: "160ms" }}
            >
              Most chapters manage their operations across five disconnected tools — and the overhead falls on already-busy officers. ChapterOps converges everything into one platform built specifically for Greek organizations.
            </p>

            <div
              className="flex flex-col sm:flex-row items-start gap-4 mb-10 anim-card-reveal"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                to="/register"
                className="group flex items-center gap-2 bg-brand-primary-main text-white font-bold text-[15px] px-8 py-3.5 rounded-xl hover:bg-brand-primary-dark transition-all duration-200 shadow-lg shadow-brand-primary-main/20"
              >
                Request Access
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#problem"
                className="text-[14px] font-medium text-content-muted hover:text-white transition-colors py-3.5"
              >
                See how it works ↓
              </a>
            </div>

          </div>

          {/* ── Right: Dashboard mockup ── */}
          <div className="relative hidden lg:block anim-card-reveal" style={{ animationDelay: "200ms" }}>
            {/* Glow behind the mockup */}
            <div className="absolute -inset-8 bg-gradient-to-br from-brand-primary-main/25 via-brand-primary-dark/10 to-transparent rounded-[40px] blur-3xl pointer-events-none" />

            {/* Mockup frame — perspective tilt */}
            <div
              className="relative rounded-2xl border border-white/[0.12] overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.05)]"
              style={{ transform: "perspective(1100px) rotateY(-8deg) rotateX(3deg)", transformOrigin: "60% 50%" }}
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 bg-[#050c1a] border-b border-white/[0.06]">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                <div className="ml-3 flex-1 bg-white/[0.04] rounded-md px-3 py-1 text-[11px] text-content-muted font-body">
                  app.chapterops.com/dashboard
                </div>
              </div>

              {/* App layout */}
              <div className="flex bg-[#060b18]">

                {/* Narrow sidebar */}
                <div className="w-[56px] bg-[#050a16] border-r border-white/[0.05] flex flex-col items-center py-4 gap-2 shrink-0">
                  <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-brand-primary-main to-brand-primary-dark flex items-center justify-center mb-2 shadow-sm">
                    <span className="text-white font-bold text-[9px] font-body">CO</span>
                  </div>
                  {[LayoutDashboard, CreditCard, Users, Calendar, FolderOpen].map((Icon, i) => (
                    <div
                      key={i}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        i === 0
                          ? "bg-brand-primary-main/20"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <Icon
                        className={`w-[15px] h-[15px] ${
                          i === 0 ? "text-brand-primary-light" : "text-content-muted"
                        }`}
                      />
                    </div>
                  ))}
                </div>

                {/* Main content */}
                <div className="flex-1 p-3 bg-[#07101e]">
                  {/* Top bar — editorial kicker + greeting */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-content-muted">
                          Lambda Chapter · ΦΒΣ
                        </p>
                        <span className="text-[7px] font-semibold uppercase tracking-wider px-1 py-0.5 bg-brand-primary-main/15 text-brand-primary-light border border-brand-primary-main/25">
                          Spring 2026
                        </span>
                      </div>
                      <p className="text-[13px] font-heading font-bold text-white leading-tight">Good morning, Brandon.</p>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center relative shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-primary-light" />
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-[#07101e]" />
                    </div>
                  </div>

                  {/* Double-rule divider */}
                  <div className="border-t-2 border-white/20 mb-[2px]" />
                  <div className="border-t border-white/[0.06] mb-2" />

                  {/* Inbox card */}
                  <div className="rounded-xl border border-white/[0.06] bg-[#0f1a3a] overflow-hidden">
                    {/* Inbox header */}
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05]">
                      <div className="flex items-center gap-1.5">
                        <Inbox className="w-3 h-3 text-content-muted" />
                        <p className="text-[10px] font-heading font-semibold text-white">Your Inbox</p>
                      </div>
                      <span className="text-[9px] font-semibold text-content-muted tabular-nums">3 items</span>
                    </div>

                    {/* ── Critical ── */}
                    <div className="px-3 py-0.5 bg-white/[0.02] border-b border-white/[0.04]">
                      <p className="text-[7px] font-bold uppercase tracking-[0.25em] text-red-400">Critical</p>
                    </div>
                    <div className="flex items-start gap-2 px-3 py-1.5 border-l-2 border-l-red-600 border-b border-white/[0.03]">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center mt-0.5">
                        <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-white leading-tight">2 members past due on dues</p>
                        <p className="text-[9px] text-content-muted mt-0.5 leading-snug">Collection is at risk for this period.</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    </div>

                    {/* ── Action Needed ── */}
                    <div className="px-3 py-0.5 bg-white/[0.02] border-b border-white/[0.04]">
                      <p className="text-[7px] font-bold uppercase tracking-[0.25em] text-amber-400">Action Needed</p>
                    </div>
                    <div className="flex items-start gap-2 px-3 py-1.5 border-l-2 border-l-amber-500 border-b border-white/[0.03]">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center mt-0.5">
                        <Receipt className="w-2.5 h-2.5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-white leading-tight">Expense report awaits approval</p>
                        <p className="text-[9px] text-content-muted mt-0.5 leading-snug">$125 · Submitted by M. Carter</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                    </div>

                    {/* ── For Your Attention ── */}
                    <div className="px-3 py-0.5 bg-white/[0.02] border-b border-white/[0.04]">
                      <p className="text-[7px] font-bold uppercase tracking-[0.25em] text-brand-primary-light">For Your Attention</p>
                    </div>
                    <div className="flex items-start gap-2 px-3 py-1.5 border-l-2 border-l-brand-primary-main">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-brand-primary-main/15 flex items-center justify-center mt-0.5">
                        <Calendar className="w-2.5 h-2.5 text-brand-primary-light" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-white leading-tight">Chapter meeting Friday at 7pm</p>
                        <p className="text-[9px] text-content-muted mt-0.5 leading-snug">24 invited · 18 responded</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-brand-primary-light mt-0.5 shrink-0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Shine overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Floating stat badge — bottom-left */}
            <div className="absolute -bottom-5 -left-6 bg-[#0f1a3a] border border-brand-primary-main/25 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-sm">
              <p className="text-[10px] text-content-muted uppercase tracking-widest">Everything in one place</p>
              <p className="text-[20px] font-heading font-bold text-white leading-tight">15 modules</p>
            </div>

            {/* Floating stat badge — top-right */}
            <div className="absolute -top-4 -right-4 bg-emerald-900/50 border border-emerald-700/40 rounded-xl px-3 py-2 shadow-lg backdrop-blur-sm">
              <p className="text-[10px] text-emerald-300 font-semibold">Stripe-powered</p>
              <p className="text-[10px] text-emerald-400/70">PCI compliant</p>
            </div>
          </div>

        </div>

        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-surface-deep to-transparent pointer-events-none" />
      </section>

      {/* ── THE PROBLEM ─────────────────────────────── */}
      <section id="problem" className="relative py-24 lg:py-36 px-6">
        <div className="max-w-6xl mx-auto">

          <p className={SECTION_LABEL}>The Problem</p>

          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">

            <div>
              <h2 className="text-3xl lg:text-[2.6rem] font-heading font-bold leading-[1.15] tracking-tight mb-6">
                Most chapters don't have a people problem. They have a{" "}
                <span className="italic text-brand-primary-light">tooling problem.</span>
              </h2>
              <p className="text-content-muted leading-relaxed mb-8 text-[1.05rem]">
                As a member of the executive board, I grew frustrated with the way we handled our business. We conducted business in a very fragmented way: a Google Doc here, a spreadsheet there, a separate system for intake, another for payments. Every officer piecing things together from different places, duplicating work, and losing information in the handoff between terms.
              </p>
              <p className="text-content-muted leading-relaxed text-[1.05rem]">
                It wasn't a people problem. It was a tooling problem. So I built ChapterOps; one platform to converge everything a chapter needs to operate, from the first prospect in the intake pipeline to the financial report at the end of the year.
              </p>

              <div className="mt-8 pt-8 border-t border-white/[0.07] flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-brand-primary-main/20 border border-brand-primary-main/30 flex items-center justify-center">
                  <span className="text-brand-primary-light font-heading font-bold text-sm">B</span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-content-primary">Brandon Holiday</p>
                  <p className="text-[12px] text-content-muted">Founder, ChapterOps · Phi Beta Sigma Fraternity, Inc.</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-br from-brand-primary-main/10 to-transparent rounded-3xl blur-2xl" />
              <div className="relative rounded-2xl border border-white/[0.08] bg-[#0a1025] p-8">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-content-muted mb-6">The Patchwork Problem</p>

                <div className="space-y-3 mb-8">
                  {FRAGMENTED_TOOLS.map((tool, i) => (
                    <div key={tool} className="flex items-center gap-3 opacity-0 anim-card-reveal" style={{ animationDelay: `${200 + i * 100}ms` }}>
                      <div className="w-2 h-2 rounded-full bg-red-400/60 shrink-0" />
                      <span className="text-[14px] text-content-secondary line-through decoration-red-400/50">{tool}</span>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-white/[0.06] mb-6" />

                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-[14px] text-emerald-400 font-medium">ChapterOps — everything, converged.</span>
                </div>

                <div className="mt-8 grid grid-cols-4 gap-2">
                  {["Members","Payments","Intake","Events","Docs","Comms","Lineage","Expenses","Reports","IHQ","Access","Themes"].map((label) => (
                    <div key={label} className="rounded-lg bg-brand-primary-main/[0.08] border border-brand-primary-main/10 px-2 py-2 text-center">
                      <span className="text-[10px] text-brand-primary-light font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ONE LINER BREAK ──────────────────────────── */}
      <div className="py-4 border-y border-white/[0.05] bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="font-heading text-xl sm:text-2xl text-content-secondary italic tracking-tight">
            "Your chapter operates like an organization. Now your tools can too."
          </p>
        </div>
      </div>

      {/* ── MODULE GRID ─────────────────────────────── */}
      <section id="modules" className="relative py-24 lg:py-36 px-6">
        <div className="max-w-7xl mx-auto">

          <div className="max-w-2xl mb-16">
            <p className={SECTION_LABEL}>The Platform</p>
            <h2 className="text-3xl lg:text-[2.6rem] font-heading font-bold leading-[1.15] tracking-tight mb-5">
              Everything your chapter runs on,<br />finally in one place.
            </h2>
            <p className="text-content-muted leading-relaxed text-[1.05rem]">
              No more swivel-chairing between systems. No more losing data in handoffs. Every module is built for Greek organizations and works together out of the box.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MODULES.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.label}
                  className="group relative p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-brand-primary-main/[0.06] hover:border-brand-primary-main/20 transition-all duration-300 anim-card-reveal"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-primary-main/10 flex items-center justify-center mb-4 group-hover:bg-brand-primary-main/20 transition-colors">
                    <Icon className="w-[18px] h-[18px] text-brand-primary-light" />
                  </div>
                  <h3 className="text-[14px] font-heading font-bold text-white mb-1.5">{mod.label}</h3>
                  <p className="text-[13px] text-content-muted leading-relaxed">{mod.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── AUDIENCE SPLIT ──────────────────────────── */}
      <section id="audience" className="relative py-24 lg:py-36 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-primary-dark/[0.08] to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">

          <div className="text-center mb-16">
            <p className={SECTION_LABEL}>Who It's For</p>
            <h2 className="text-3xl lg:text-[2.6rem] font-heading font-bold leading-[1.15] tracking-tight mb-4">
              One platform. Every chapter type. No exceptions.
            </h2>
            <p className="text-content-muted text-[0.95rem] max-w-xl mx-auto">
              Whether you're running intake season on a college campus or managing a graduate chapter with a full operating budget, every chapter gets the complete platform. All 15 modules. Zero feature gates. Here's how each chapter type puts it to work.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {AUDIENCES.map((aud, i) => (
              <div
                key={aud.type}
                className="rounded-2xl border border-white/[0.07] bg-[#0a1025] p-8 lg:p-10 anim-card-reveal"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="inline-block text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary-light bg-brand-primary-main/[0.1] border border-brand-primary-main/20 px-3 py-1.5 rounded-full mb-6">
                  {aud.type}
                </div>
                <h3 className="text-2xl font-heading font-bold text-white mb-4 leading-tight">{aud.headline}</h3>
                <p className="text-content-muted leading-relaxed mb-7 text-[1rem]">{aud.body}</p>
                <ul className="space-y-2.5">
                  {aud.points.map((pt) => (
                    <li key={pt} className="flex items-center gap-3 text-[14px] text-content-secondary">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-primary-light shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY STRIP ──────────────────────────── */}
      <section className="py-16 px-6 border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-8 text-center">
            {TRUST_ITEMS.map(({ stat, label }) => (
              <div key={stat}>
                <p className="font-heading font-bold text-2xl text-white mb-1">{stat}</p>
                <p className="text-[12px] text-content-muted uppercase tracking-widest">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section className="relative py-32 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary-dark/40 via-surface-deep to-surface-deep" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-brand-primary-main/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 className="text-4xl lg:text-5xl font-heading font-bold tracking-tight mb-6 leading-tight">
            Stop piecing it together.<br />
            <span className="italic text-brand-primary-light">Start running your chapter.</span>
          </h2>
          <p className="text-content-muted leading-relaxed mb-10 text-[1.05rem] max-w-xl mx-auto">
            ChapterOps is currently in early access. Apply now to be among the first chapters onboarded.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="group flex items-center gap-2 bg-brand-primary-main text-white font-bold text-[15px] px-8 py-4 rounded-xl hover:bg-brand-primary-dark transition-all duration-200 shadow-lg shadow-brand-primary-main/20"
            >
              Request Access
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/login" className="text-[14px] text-content-muted hover:text-white transition-colors">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold text-lg text-white">
                Chapter<span className="text-brand-primary-light">Ops</span>
              </span>
              <span className="text-[12px] text-content-muted">© {CURRENT_YEAR} Blue Column Systems LLC</span>
            </div>
            <div className="flex items-center gap-8 text-[13px] text-content-muted">
              {NAV_LINKS.map(({ href, label }) => (
                <a key={href} href={href} className="hover:text-white transition-colors">{label}</a>
              ))}
              <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-white/[0.04] text-[12px] text-content-muted">
            <span>A Blue Column Systems product.</span>
            <div className="flex items-center gap-6">
              <Link to="/legal/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/legal/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/legal/cookies" className="hover:text-white transition-colors">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </footer>

      <CookieBanner />
    </div>
  );
}
