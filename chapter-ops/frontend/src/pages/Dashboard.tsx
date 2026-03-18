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
  cash: "Cash", check: "Check", bank_transfer: "Bank Transfer", manual: "Manual",
};

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

const FINANCIAL_STATUS_CONFIG = {
  financial: {
    label: "Financial",
    bg: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: CheckCircle,
    iconColor: "text-emerald-600",
  },
  not_financial: {
    label: "Not Financial",
    bg: "bg-red-500",
    badge: "bg-red-100 text-red-800 border-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-600",
  },
  neophyte: {
    label: "Neophyte",
    bg: "bg-blue-500",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    icon: CheckCircle,
    iconColor: "text-blue-600",
  },
  exempt: {
    label: "Exempt",
    bg: "bg-gray-400",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    icon: CheckCircle,
    iconColor: "text-gray-500",
  },
};

export default function Dashboard() {
  const { user, memberships } = useAuthStore();
  const { organization, chapter, getCustomFields } = useConfigStore();
  const customFieldDefs = getCustomFields();
  const navigate = useNavigate();

  // Personal data (all users)
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<PaymentPlanWithUser[]>([]);

  // Officer data (secretary+)
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);

  // Announcements (all users)
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Pending workflow tasks (all users)
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

  return (
    <Layout>
      <div className="max-w-6xl mx-auto animate-fade-in relative z-10 space-y-8">

        {/* ── Stat Cards ──────────────────────────────────────────────── */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Card 1: Financial Status */}
            <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Financial Status</p>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${statusConfig.badge} border`}>
                  <StatusIcon className={`w-4 h-4 ${statusConfig.iconColor}`} />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{statusConfig.label}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{currentMembership?.role ?? "Member"}</p>
              </div>
              {financialStatus === "not_financial" && (
                <button
                  onClick={() => navigate("/payments")}
                  className="mt-auto text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  Pay dues now <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
              {/* Bottom accent bar */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${statusConfig.bg}`} />
            </div>

            {/* Card 2: Total Paid (member) OR Total Collected (officer) */}
            <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {isOfficer ? "Total Collected" : "Total Paid"}
                </p>
                <div className="w-8 h-8 rounded-full bg-brand-primary-light flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-brand-primary-main" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  ${isOfficer && summary
                    ? parseFloat(summary.total_collected).toLocaleString("en-US", { minimumFractionDigits: 2 })
                    : totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                {isOfficer && summary && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    ${parseFloat(summary.total_this_month).toLocaleString("en-US", { minimumFractionDigits: 2 })} this month
                  </p>
                )}
                {!isOfficer && (
                  <p className="text-xs text-gray-400 mt-0.5">{payments.length} payment{payments.length !== 1 ? "s" : ""} made</p>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-primary-main" />
            </div>

            {/* Card 3: Active Plans (member) OR Not Financial Members (officer) */}
            <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {isOfficer ? "Outstanding Dues" : "Active Plans"}
                </p>
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                  {isOfficer
                    ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                    : <Activity className="w-4 h-4 text-amber-500" />
                  }
                </div>
              </div>
              <div>
                {isOfficer ? (
                  <>
                    <p className="text-2xl font-bold text-gray-900">{notFinancialCount}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {notFinancialCount === 1 ? "member" : "members"} not financial
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-gray-900">{activePlans.length}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {activePlans.length === 0 ? "No active plans" : `${activePlans.length} active`}
                    </p>
                  </>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400" />
            </div>

            {/* Card 4: Member Since (member) OR Active Members (officer) */}
            <div className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {isOfficer ? "Active Members" : "Member Since"}
                </p>
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                  {isOfficer
                    ? <Users className="w-4 h-4 text-indigo-500" />
                    : <Calendar className="w-4 h-4 text-indigo-500" />
                  }
                </div>
              </div>
              <div>
                {isOfficer ? (
                  <>
                    <p className="text-2xl font-bold text-gray-900">{members.filter(m => m.active).length}</p>
                    <p className="text-xs text-gray-400 mt-0.5">total chapter members</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-gray-900">
                      {currentMembership?.join_date
                        ? new Date(currentMembership.join_date).getFullYear()
                        : "—"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {currentMembership?.join_date
                        ? new Date(currentMembership.join_date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
                        : "Join date unknown"}
                    </p>
                  </>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-400" />
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
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-primary-main" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      {isOfficer ? "Chapter Payment Plans" : "Your Active Payment Plans"}
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {activePlans.map((plan) => {
                      const paid = parseFloat(plan.total_paid);
                      const total = parseFloat(plan.total_amount);
                      const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
                      return (
                        <div key={plan.id} className="px-6 py-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              {isOfficer && plan.user && (
                                <p className="text-xs font-semibold text-gray-700">{plan.user.full_name}</p>
                              )}
                              <p className="text-xs text-gray-500 capitalize">{plan.frequency} plan • ${total.toFixed(2)} total</p>
                            </div>
                            <span className="text-sm font-bold text-brand-primary-main">
                              ${paid.toFixed(2)} <span className="text-xs text-gray-400 font-normal">paid</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-brand-primary-main to-brand-primary-light h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-1 text-right">{pct.toFixed(0)}% complete</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pending Workflow Approvals */}
              {workflowTasks.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-amber-100 flex items-center justify-between bg-amber-50">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-semibold text-amber-900">
                        Pending Approvals ({workflowTasks.length})
                      </h3>
                    </div>
                    <button
                      onClick={() => navigate("/workflows")}
                      className="text-xs text-amber-700 hover:underline font-medium"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {workflowTasks.map((task) => (
                      <div
                        key={task.id}
                        className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => navigate("/workflows")}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {task.step?.name ?? "Approval Step"}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {task.trigger_title}
                          </p>
                          {task.assigned_to_role && (
                            <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full capitalize">
                              {task.assigned_to_role.replace("_", " ")}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
                          Action needed
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-brand-primary-main" />
                  <h3 className="text-sm font-semibold text-gray-900">Recent Transactions</h3>
                </div>
                {recentPayments.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <CreditCard className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No transactions yet</p>
                    {financialStatus === "not_financial" && (
                      <button
                        onClick={() => navigate("/payments")}
                        className="mt-3 text-sm font-medium text-brand-primary-main hover:underline"
                      >
                        Make your first payment →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {recentPayments.map((p) => (
                      <div key={p.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">
                            {p.payment_type.replace("_", " ")}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            {" · "}{METHOD_LABELS[p.method] ?? p.method}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-brand-primary-dark bg-brand-primary-light/30 px-2.5 py-1 rounded-lg">
                          ${parseFloat(p.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Announcements */}
              {announcements.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-brand-primary-main" />
                      <h3 className="text-sm font-semibold text-gray-900">Announcements</h3>
                    </div>
                    <button
                      onClick={() => navigate("/communications")}
                      className="text-xs text-brand-primary-dark hover:underline font-medium"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {announcements.map((a) => (
                      <div key={a.id} className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          {a.is_pinned && (
                            <Pin className="w-3.5 h-3.5 text-brand-primary-main shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.body}</p>
                            <p className="text-xs text-gray-400 mt-1">
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
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-4 mb-4">
                  {user?.profile_picture_url ? (
                    <img
                      src={user.profile_picture_url}
                      alt={user.full_name ?? ""}
                      className="w-12 h-12 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-brand-primary-main flex items-center justify-center text-white font-bold text-lg shrink-0">
                      {user?.full_name?.[0] ?? "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{user?.full_name}</p>
                    <p className="text-xs text-gray-400 capitalize truncate">{currentMembership?.role?.replace("_", " ") ?? "Member"}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Financial Status</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusConfig.badge}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  {currentMembership?.initiation_date && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Initiated</span>
                      <span className="text-gray-700 font-medium text-xs">
                        {new Date(currentMembership.initiation_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Chapter</span>
                    <span className="text-gray-700 font-medium text-xs truncate max-w-[120px]">{chapter?.name ?? "—"}</span>
                  </div>
                  {customFieldDefs.filter((f) => currentMembership?.custom_fields?.[f.key] != null && currentMembership.custom_fields[f.key] !== "").map((f) => (
                    <div key={f.key} className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">{f.label}</span>
                      <span className="text-gray-700 font-medium text-xs truncate max-w-[120px]">{String(currentMembership!.custom_fields[f.key])}</span>
                    </div>
                  ))}
                </div>
                {financialStatus === "not_financial" && (
                  <button
                    onClick={() => navigate("/payments")}
                    className="mt-4 w-full py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Pay Dues Now
                  </button>
                )}
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate("/payments")}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors text-left"
                  >
                    <CreditCard className="w-4 h-4 text-brand-primary-main shrink-0" />
                    Pay Dues
                  </button>
                  <button
                    onClick={() => navigate("/donations")}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors text-left"
                  >
                    <DollarSign className="w-4 h-4 text-brand-primary-main shrink-0" />
                    Make a Donation
                  </button>
                  <button
                    onClick={() => navigate("/settings")}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors text-left"
                  >
                    <Users className="w-4 h-4 text-brand-primary-main shrink-0" />
                    Update Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-2xl" />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
