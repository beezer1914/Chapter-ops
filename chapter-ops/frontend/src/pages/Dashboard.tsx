import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import {
  fetchMyPayments,
  fetchPaymentPlans,
  fetchPaymentSummary,
} from "@/services/paymentService";
import { fetchMembers } from "@/services/chapterService";
import { fetchAnnouncements } from "@/services/commsService";
import { fetchMyWorkflowTasks, type WorkflowTask } from "@/services/workflowService";
import type { Payment, PaymentPlanWithUser, PaymentSummary, MemberWithUser, MemberRole, Announcement } from "@/types";
import {
  DollarSign,
  CreditCard,
  Activity,
  Users,
  TrendingUp,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  Megaphone,
  Pin,
  ClipboardList,
} from "lucide-react";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", check: "Check", bank_transfer: "Bank Transfer",
  zelle: "Zelle", venmo: "Venmo", cashapp: "Cash App", manual: "Other",
};

const METHOD_COLORS: Record<string, string> = {
  stripe: "bg-violet-500",
  cash: "bg-emerald-500",
  check: "bg-amber-500",
  bank_transfer: "bg-sky-500",
  zelle: "bg-purple-500",
  venmo: "bg-blue-500",
  cashapp: "bg-green-500",
  manual: "bg-gray-400",
};

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

const FINANCIAL_STATUS_CONFIG = {
  financial: {
    label: "Financial",
    bg: "bg-emerald-500",
    gradient: "from-emerald-500 to-emerald-600",
    badge: "bg-emerald-900/30 text-emerald-400 border-emerald-800/30",
    icon: CheckCircle,
    iconColor: "text-emerald-600",
    cardBg: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    cardText: "text-white",
    cardSub: "text-emerald-100",
  },
  not_financial: {
    label: "Not Financial",
    bg: "bg-red-500",
    gradient: "from-red-500 to-red-600",
    badge: "bg-red-900/30 text-red-400 border-red-800/30",
    icon: AlertTriangle,
    iconColor: "text-red-600",
    cardBg: "bg-gradient-to-br from-red-500 to-red-700",
    cardText: "text-white",
    cardSub: "text-red-100",
  },
  neophyte: {
    label: "Neophyte",
    bg: "bg-blue-500",
    gradient: "from-blue-500 to-blue-600",
    badge: "bg-blue-900/30 text-blue-400 border-blue-800/30",
    icon: CheckCircle,
    iconColor: "text-blue-600",
    cardBg: "bg-gradient-to-br from-blue-500 to-blue-700",
    cardText: "text-white",
    cardSub: "text-blue-100",
  },
  exempt: {
    label: "Exempt",
    bg: "bg-gray-400",
    gradient: "from-gray-400 to-gray-500",
    badge: "bg-gray-800/50 text-gray-400 border-gray-700/30",
    icon: CheckCircle,
    iconColor: "text-content-secondary",
    cardBg: "bg-gradient-to-br from-gray-500 to-gray-700",
    cardText: "text-white",
    cardSub: "text-gray-200",
  },
};

export default function Dashboard() {
  const { user, memberships } = useAuthStore();
  const { organization, chapter, getCustomFields } = useConfigStore();
  const customFieldDefs = getCustomFields();
  const navigate = useNavigate();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<PaymentPlanWithUser[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [workflowTasks, setWorkflowTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const isOfficer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];
  const financialStatus = currentMembership?.financial_status ?? "not_financial";
  const statusConfig = FINANCIAL_STATUS_CONFIG[financialStatus];
  const StatusIcon = statusConfig.icon;

  useEffect(() => {
    async function load() {
      try {
        const [p, pl, ann, tasks] = await Promise.all([
          fetchMyPayments(),
          fetchPaymentPlans(true),
          fetchAnnouncements(),
          fetchMyWorkflowTasks(),
        ]);
        setPayments(p);
        setPlans(pl);
        setAnnouncements(ann.slice(0, 3));
        setWorkflowTasks(tasks);

        if (isOfficer) {
          const [sum, mems] = await Promise.all([
            fetchPaymentSummary(),
            fetchMembers(),
          ]);
          setSummary(sum);
          setMembers(mems);
        }
      } catch {
        // Silently fail — dashboard should still render
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOfficer]);

  const activePlans = plans.filter((p) => p.status === "active" && !p.is_complete);
  const recentPayments = payments.slice(0, 5);
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const notFinancialCount = members.filter((m) => m.financial_status === "not_financial").length;

  // Progress ring helpers
  const planProgress = activePlans.length > 0
    ? activePlans.reduce((acc, p) => {
        const paid = parseFloat(p.total_paid);
        const total = parseFloat(p.total_amount);
        return total > 0 ? acc + (paid / total) : acc;
      }, 0) / activePlans.length * 100
    : 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto relative z-10 space-y-8">

        {/* ── Stat Cards ──────────────────────────────────────────────── */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">

            {/* Card 1: Financial Status — HERO CARD (brand gradient bg) */}
            <div className={`anim-card-reveal anim-delay-1 relative overflow-hidden rounded-2xl ${statusConfig.cardBg} p-5 flex flex-col gap-3 shadow-lg card-lift`}>
              {/* Decorative circle */}
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${statusConfig.cardSub}`}>Status</p>
                  <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <StatusIcon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className={`text-2xl font-heading font-bold mt-2 ${statusConfig.cardText}`}>{statusConfig.label}</p>
                <p className={`text-xs mt-0.5 capitalize ${statusConfig.cardSub}`}>{currentMembership?.role?.replace("_", " ") ?? "Member"}</p>
              </div>
              {financialStatus === "not_financial" && (
                <button
                  onClick={() => navigate("/payments")}
                  className="relative z-10 mt-auto text-xs font-semibold text-white/90 hover:text-white flex items-center gap-1 transition-colors"
                >
                  Pay dues now <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Card 2: Total Paid/Collected — with large number emphasis */}
            <div className="anim-card-reveal anim-delay-2 relative overflow-hidden bg-surface-card-solid rounded-2xl border border-[var(--color-border)] p-5 flex flex-col gap-2 shadow-sm card-lift">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                {isOfficer ? "Collected" : "Total Paid"}
              </p>
              <p className="text-3xl font-heading font-bold text-content-primary tracking-tight">
                <span className="text-lg text-content-muted font-normal">$</span>
                {isOfficer && summary
                  ? parseFloat(summary.total_collected).toLocaleString("en-US", { minimumFractionDigits: 2 })
                  : totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              {isOfficer && summary ? (
                <p className="text-xs text-content-muted">
                  <span className="text-emerald-600 font-medium">${parseFloat(summary.total_this_month).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> this month
                </p>
              ) : (
                <p className="text-xs text-content-muted">{payments.length} payment{payments.length !== 1 ? "s" : ""}</p>
              )}
              {/* Subtle accent line */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-primary-main via-brand-primary-light to-transparent" />
            </div>

            {/* Card 3: Plans/Outstanding — with progress ring */}
            <div className="anim-card-reveal anim-delay-3 relative overflow-hidden bg-surface-card-solid rounded-2xl border border-[var(--color-border)] p-5 flex flex-col gap-2 shadow-sm card-lift">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                {isOfficer ? "Outstanding" : "Plans"}
              </p>
              <div className="flex items-center gap-3">
                {/* Mini progress ring */}
                <svg className="w-11 h-11 shrink-0 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3" stroke="rgba(255,255,255,0.06)" />
                  <circle
                    cx="18" cy="18" r="14" fill="none" strokeWidth="3"
                    stroke={isOfficer ? "#f59e0b" : "var(--color-primary-main)"}
                    strokeLinecap="round"
                    strokeDasharray={`${isOfficer ? Math.min((notFinancialCount / Math.max(members.length, 1)) * 100, 100) : planProgress} 100`}
                    className="progress-ring-animate"
                  />
                </svg>
                <div>
                  {isOfficer ? (
                    <>
                      <p className="text-2xl font-heading font-bold text-content-primary">{notFinancialCount}</p>
                      <p className="text-xs text-content-muted">not financial</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-heading font-bold text-content-primary">{activePlans.length}</p>
                      <p className="text-xs text-content-muted">{activePlans.length === 0 ? "no plans" : "active"}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 via-amber-200 to-transparent" />
            </div>

            {/* Card 4: Members/Since — with icon emphasis */}
            <div className="anim-card-reveal anim-delay-4 relative overflow-hidden bg-surface-card-solid rounded-2xl border border-[var(--color-border)] p-5 flex flex-col gap-2 shadow-sm card-lift">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                {isOfficer ? "Members" : "Joined"}
              </p>
              {isOfficer ? (
                <>
                  <p className="text-3xl font-heading font-bold text-content-primary">{members.filter(m => m.active).length}</p>
                  <p className="text-xs text-content-muted">active chapter members</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-heading font-bold text-content-primary">
                    {currentMembership?.join_date
                      ? new Date(currentMembership.join_date).toLocaleDateString(undefined, { month: "short", year: "numeric" })
                      : "—"}
                  </p>
                  <p className="text-xs text-content-muted">
                    {currentMembership?.join_date
                      ? new Date(currentMembership.join_date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
                      : "Join date unknown"}
                  </p>
                </>
              )}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-400 via-indigo-200 to-transparent" />
            </div>
          </div>
        )}

        {/* ── Main Content Grid ────────────────────────────────────────── */}
        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left / Main column */}
            <div className="lg:col-span-2 space-y-6">

              {/* Active Payment Plans */}
              {activePlans.length > 0 && (
                <div className="anim-section-reveal bg-surface-card-solid rounded-2xl border border-[var(--color-border)] shadow-glass overflow-hidden" style={{ animationDelay: "300ms" }}>
                  <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-primary-main" />
                    <h3 className="text-sm font-heading font-semibold text-content-primary">
                      {isOfficer ? "Chapter Payment Plans" : "Your Active Payment Plans"}
                    </h3>
                  </div>
                  <div className="divide-y divide-white/5">
                    {activePlans.map((plan) => {
                      const paid = parseFloat(plan.total_paid);
                      const total = parseFloat(plan.total_amount);
                      const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
                      return (
                        <div key={plan.id} className="px-6 py-4 row-slide">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              {isOfficer && plan.user && (
                                <p className="text-xs font-semibold text-content-secondary">{plan.user.full_name}</p>
                              )}
                              <p className="text-xs text-content-secondary capitalize">{plan.frequency} plan • ${total.toFixed(2)} total</p>
                            </div>
                            <span className="text-sm font-bold text-brand-primary-main">
                              ${paid.toFixed(2)} <span className="text-xs text-content-muted font-normal">paid</span>
                            </span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-brand-primary-main to-brand-accent-main h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-content-muted mt-1 text-right font-medium">{pct.toFixed(0)}%</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pending Workflow Approvals */}
              {workflowTasks.length > 0 && (
                <div className="anim-section-reveal bg-surface-card-solid rounded-2xl border border-amber-900/30 shadow-glass overflow-hidden" style={{ animationDelay: "380ms" }}>
                  <div className="px-6 py-4 border-b border-amber-900/20 flex items-center justify-between bg-amber-900/10">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-heading font-semibold text-amber-300">
                        Pending Approvals
                      </h3>
                      <span className="text-xs bg-amber-900/30 text-amber-400 font-bold px-1.5 py-0.5 rounded-md">{workflowTasks.length}</span>
                    </div>
                    <button
                      onClick={() => navigate("/workflows")}
                      className="text-xs text-amber-400 hover:underline font-medium"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="divide-y divide-white/5">
                    {workflowTasks.map((task) => (
                      <div
                        key={task.id}
                        className="px-6 py-4 flex items-start justify-between gap-4 row-slide cursor-pointer"
                        onClick={() => navigate("/workflows")}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-content-primary truncate">
                            {task.step?.name ?? "Approval Step"}
                          </p>
                          <p className="text-xs text-content-secondary mt-0.5 truncate">
                            {task.trigger_title}
                          </p>
                          {task.assigned_to_role && (
                            <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded-full capitalize">
                              {task.assigned_to_role.replace("_", " ")}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs px-2 py-1 rounded-full font-medium bg-amber-900/30 text-amber-400 pulse-dot">
                          Action needed
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <div className="anim-section-reveal bg-surface-card-solid rounded-2xl border border-[var(--color-border)] shadow-glass overflow-hidden" style={{ animationDelay: "460ms" }}>
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-brand-primary-main" />
                  <h3 className="text-sm font-heading font-semibold text-content-primary">Recent Transactions</h3>
                </div>
                {recentPayments.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                      <CreditCard className="w-6 h-6 text-content-muted" />
                    </div>
                    <p className="text-sm text-content-muted font-medium">No transactions yet</p>
                    {financialStatus === "not_financial" && (
                      <button
                        onClick={() => navigate("/payments")}
                        className="mt-3 text-sm font-semibold text-brand-primary-main hover:text-brand-primary-dark transition-colors"
                      >
                        Make your first payment →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {recentPayments.map((p) => (
                      <div key={p.id} className="px-6 py-3.5 flex items-center justify-between row-slide">
                        <div className="flex items-center gap-3">
                          {/* Color-coded method dot */}
                          <div className={`w-2 h-2 rounded-full shrink-0 ${METHOD_COLORS[p.method] ?? "bg-gray-400"}`} />
                          <div>
                            <p className="text-sm font-medium text-content-primary capitalize">
                              {p.payment_type.replace("_", " ")}
                            </p>
                            <p className="text-xs text-content-muted mt-0.5">
                              {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}{METHOD_LABELS[p.method] ?? p.method}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-content-primary tabular-nums">
                          ${parseFloat(p.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Announcements */}
              {announcements.length > 0 && (
                <div className="anim-section-reveal bg-surface-card-solid rounded-2xl border border-[var(--color-border)] shadow-glass overflow-hidden" style={{ animationDelay: "540ms" }}>
                  <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-brand-primary-main" />
                      <h3 className="text-sm font-heading font-semibold text-content-primary">Announcements</h3>
                    </div>
                    <button
                      onClick={() => navigate("/communications")}
                      className="text-xs text-brand-primary-dark hover:underline font-medium"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="divide-y divide-white/5">
                    {announcements.map((a) => (
                      <div key={a.id} className="px-6 py-4 row-slide">
                        <div className="flex items-start gap-2">
                          {a.is_pinned && (
                            <Pin className="w-3.5 h-3.5 text-brand-primary-main shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-content-primary truncate">{a.title}</p>
                            <p className="text-xs text-content-secondary mt-0.5 line-clamp-2">{a.body}</p>
                            <p className="text-xs text-content-muted mt-1.5">
                              {a.author ? `${a.author.first_name} ${a.author.last_name}` : ""} · {new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right / Sidebar column */}
            <div className="space-y-6">

              {/* Member Info Card */}
              <div className="anim-section-reveal bg-surface-card-solid rounded-2xl border border-[var(--color-border)] shadow-glass overflow-hidden" style={{ animationDelay: "350ms" }}>
                {/* Header band */}
                <div className="h-16 bg-gradient-to-r from-brand-primary-main to-brand-primary-dark relative">
                  <div className="absolute inset-0 bg-mesh-diagonal" />
                </div>
                <div className="px-6 pb-6 -mt-8 relative z-10">
                  <div className="flex items-end gap-3 mb-4">
                    {user?.profile_picture_url ? (
                      <img
                        src={user.profile_picture_url}
                        alt={user.full_name ?? ""}
                        className="w-14 h-14 rounded-xl object-cover shrink-0 border-4 border-surface-card-solid shadow-md"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-primary-main to-brand-primary-dark flex items-center justify-center text-white font-heading font-bold text-xl shrink-0 border-4 border-surface-card-solid shadow-md">
                        {user?.full_name?.[0] ?? "U"}
                      </div>
                    )}
                    <div className="min-w-0 pb-0.5">
                      <p className="font-heading font-bold text-content-primary truncate">{user?.full_name}</p>
                      <p className="text-xs text-content-muted capitalize truncate">{currentMembership?.role?.replace("_", " ") ?? "Member"}</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-content-secondary">Financial</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusConfig.badge}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                    {currentMembership?.initiation_date && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-content-secondary">Initiated</span>
                        <span className="text-content-secondary font-medium text-xs">
                          {new Date(currentMembership.initiation_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-content-secondary">Chapter</span>
                      <span className="text-content-secondary font-medium text-xs truncate max-w-[120px]">{chapter?.name ?? "—"}</span>
                    </div>
                    {customFieldDefs.filter((f) => currentMembership?.custom_fields?.[f.key] != null && currentMembership.custom_fields[f.key] !== "").map((f) => (
                      <div key={f.key} className="flex justify-between items-center text-sm">
                        <span className="text-content-secondary">{f.label}</span>
                        <span className="text-content-secondary font-medium text-xs truncate max-w-[120px]">{String(currentMembership!.custom_fields[f.key])}</span>
                      </div>
                    ))}
                  </div>
                  {financialStatus === "not_financial" && (
                    <button
                      onClick={() => navigate("/payments")}
                      className="mt-5 w-full py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 hover:shadow-md"
                    >
                      Pay Dues Now
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="anim-section-reveal bg-surface-card-solid rounded-2xl border border-[var(--color-border)] shadow-glass p-5" style={{ animationDelay: "430ms" }}>
                <h3 className="text-xs font-heading font-semibold text-content-muted uppercase tracking-wider mb-3">Quick Actions</h3>
                <div className="space-y-1">
                  {[
                    { icon: CreditCard, label: "Pay Dues", to: "/payments" },
                    { icon: DollarSign, label: "Make a Donation", to: "/donations" },
                    { icon: Calendar, label: "View Events", to: "/events" },
                    { icon: Users, label: "Update Profile", to: "/settings" },
                  ].map((action) => (
                    <button
                      key={action.to}
                      onClick={() => navigate(action.to)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-content-secondary hover:bg-white/5 hover:text-content-primary transition-all duration-200 text-left group"
                    >
                      <action.icon className="w-4 h-4 text-content-muted group-hover:text-brand-primary-main transition-colors shrink-0" />
                      {action.label}
                      <ArrowUpRight className="w-3 h-3 ml-auto text-content-muted group-hover:text-brand-primary-main transition-all duration-200 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-36 bg-white/5 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-64 bg-white/5 rounded-2xl animate-pulse" />
              <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
