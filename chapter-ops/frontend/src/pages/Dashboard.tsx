import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { fetchDashboardInbox } from "@/services/dashboardService";
import { fetchPaymentSummary } from "@/services/paymentService";
import { fetchMembers } from "@/services/chapterService";
import { fetchPeriods } from "@/services/periodService";
import { TOUR_TARGETS } from "@/tours/tourTargets";
import type { ActionItem, ActionItemPriority, ChapterPeriod, MemberRole, MemberWithUser, PaymentSummary } from "@/types";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  ArrowRight,
  CreditCard,
  DollarSign,
  Users,
  Calendar,
  Inbox,
} from "lucide-react";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

// ── Priority visual config ────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<ActionItemPriority, {
  borderColor: string;
  iconBg: string;
  icon: typeof AlertTriangle;
  iconColor: string;
  labelColor: string;
  label: string;
}> = {
  critical: {
    borderColor: "border-l-red-600",
    iconBg: "bg-red-50",
    icon: AlertTriangle,
    iconColor: "text-red-600",
    labelColor: "text-red-700",
    label: "Critical",
  },
  warning: {
    borderColor: "border-l-amber-500",
    iconBg: "bg-amber-50",
    icon: AlertTriangle,
    iconColor: "text-amber-600",
    labelColor: "text-amber-700",
    label: "Action needed",
  },
  info: {
    borderColor: "border-l-brand-primary-main",
    iconBg: "bg-[var(--color-primary-glow)]",
    icon: Info,
    iconColor: "text-brand-primary-main",
    labelColor: "text-brand-primary-dark",
    label: "For your attention",
  },
};

const SECTION_CONFIG: Array<{
  priority: ActionItemPriority;
  heading: string;
}> = [
  { priority: "critical", heading: "Critical" },
  { priority: "warning", heading: "Action Needed" },
  { priority: "info", heading: "For Your Attention" },
];

// ── Inbox item component ──────────────────────────────────────────────────────

function InboxItem({ item, onNavigate }: { item: ActionItem; onNavigate: (url: string) => void }) {
  const cfg = PRIORITY_CONFIG[item.priority];
  const Icon = cfg.icon;

  return (
    <div
      className={`flex items-start gap-4 px-6 py-4 border-l-4 ${cfg.borderColor} hover:bg-[var(--color-bg-card-hover)] transition-colors cursor-pointer group`}
      onClick={() => onNavigate(item.cta_url)}
    >
      <div className={`shrink-0 w-8 h-8 rounded-full ${cfg.iconBg} flex items-center justify-center mt-0.5`}>
        <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-content-primary leading-snug">{item.title}</p>
        <p className="text-xs text-content-muted mt-0.5 leading-relaxed">{item.description}</p>
      </div>
      <button
        className={`shrink-0 flex items-center gap-1 text-xs font-semibold mt-0.5 ${cfg.labelColor} sm:opacity-0 sm:group-hover:opacity-100 transition-opacity whitespace-nowrap`}
        onClick={(e) => { e.stopPropagation(); onNavigate(item.cta_url); }}
      >
        {item.cta_label}
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, memberships } = useAuthStore();
  const { organization, chapter, getCustomFields } = useConfigStore();
  const customFieldDefs = getCustomFields();
  const navigate = useNavigate();

  const [inbox, setInbox] = useState<ActionItem[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [activePeriod, setActivePeriod] = useState<ChapterPeriod | null>(null);
  const [loading, setLoading] = useState(true);

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const isOfficer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];
  const financialStatus = currentMembership?.financial_status ?? "not_financial";

  useEffect(() => {
    async function load() {
      try {
        const [items, periods] = await Promise.all([fetchDashboardInbox(), fetchPeriods()]);
        setInbox(items);
        setActivePeriod(periods.find((p) => p.is_active) ?? null);

        if (isOfficer) {
          const [sum, mems] = await Promise.all([fetchPaymentSummary(), fetchMembers()]);
          setSummary(sum);
          setMembers(mems);
        }
      } catch {
        // Dashboard degrades gracefully
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOfficer]);

  const activeMembers = members.filter((m) => m.active);
  const financialMembers = members.filter((m) => m.active && m.financial_status === "financial").length;
  const collectionRate = activeMembers.length > 0
    ? Math.round((financialMembers / activeMembers.length) * 100)
    : 0;

  // Group inbox items by priority section (preserve sort order within each group)
  const grouped = SECTION_CONFIG.reduce<Record<ActionItemPriority, ActionItem[]>>(
    (acc, { priority }) => {
      acc[priority] = inbox.filter((i) => i.priority === priority);
      return acc;
    },
    { critical: [], warning: [], info: [] }
  );
  const totalItems = inbox.length;

  // Editorial greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto relative z-10">

        {/* ── Editorial Page Header ─────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-content-muted">
                  {chapter?.name ?? "Chapter"} · {organization?.abbreviation ?? ""}
                </p>
                {activePeriod && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 bg-brand-primary-main/10 text-brand-primary-dark border border-brand-primary-main/20">
                    {activePeriod.name}
                  </span>
                )}
              </div>
              <h1 className="font-heading text-3xl md:text-4xl font-black text-content-heading tracking-tight">
                {greeting}, {user?.first_name}.
              </h1>
            </div>
            <p className="text-xs text-content-muted font-body hidden sm:block shrink-0">{todayStr}</p>
          </div>
          <div className="border-t-2 border-content-heading" />
          <div className="border-t border-[var(--color-border)] mt-[2px]" />
        </div>

        {/* ── Mobile quick-action strip — member-facing, phone only ── */}
        <div data-tour-target={TOUR_TARGETS.DASHBOARD_QUICK_ACTIONS} className="sm:hidden grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => navigate("/dues")}
            className={`flex flex-col items-start px-4 py-4 border ${
              financialStatus === "not_financial"
                ? "border-red-300 bg-red-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${
              financialStatus === "not_financial" ? "text-red-600" : "text-emerald-600"
            }`}>
              {financialStatus === "not_financial" ? "Dues Owed" : "Dues"}
            </span>
            <span className={`font-heading font-black text-lg leading-tight ${
              financialStatus === "not_financial" ? "text-red-700" : "text-emerald-700"
            }`}>
              {financialStatus === "financial" ? "Financial" :
               financialStatus === "neophyte" ? "Neophyte" :
               financialStatus === "exempt" ? "Exempt" : "Not Financial"}
            </span>
            <span className={`text-[10px] mt-1 flex items-center gap-1 ${
              financialStatus === "not_financial" ? "text-red-500" : "text-emerald-500"
            }`}>
              View details <ArrowRight className="w-3 h-3" />
            </span>
          </button>
          <button
            onClick={() => navigate("/events")}
            className="flex flex-col items-start px-4 py-4 border border-[var(--color-border)] bg-[var(--color-bg-card)]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1">Events</span>
            <span className="font-heading font-black text-lg leading-tight text-content-heading">Upcoming</span>
            <span className="text-[10px] mt-1 flex items-center gap-1 text-content-muted">
              See schedule <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        </div>

        {/* ── Main layout ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Inbox ───────────────────────────────────────── */}
          <div data-tour-target={TOUR_TARGETS.DASHBOARD_INBOX} className="lg:col-span-2">

            {loading ? (
              <div className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)]">
                <div className="px-6 py-4 border-b border-[var(--color-border)]">
                  <div className="h-4 w-24 bg-[var(--color-bg-surface)] animate-pulse" />
                </div>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-start gap-4 px-6 py-4 border-b border-[var(--color-border)]">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-bg-surface)] animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-3/4 bg-[var(--color-bg-surface)] animate-pulse" />
                      <div className="h-3 w-full bg-[var(--color-bg-surface)] animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : totalItems === 0 ? (
              /* ── Empty state: all caught up ── */
              <div className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] px-8 py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="font-heading text-xl font-bold text-content-heading mb-1">You're all caught up.</p>
                <p className="text-sm text-content-muted">No pending actions right now. Check back later.</p>
              </div>
            ) : (
              /* ── Inbox sections ── */
              <div className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)]">
                {/* Inbox header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Inbox className="w-3.5 h-3.5 text-content-muted" />
                    <h2 className="text-[11px] font-body font-semibold uppercase tracking-[0.15em] text-content-secondary">
                      Your Inbox
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-content-muted tabular-nums">
                    {totalItems} item{totalItems !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Priority sections */}
                {SECTION_CONFIG.map(({ priority, heading }) => {
                  const sectionItems = grouped[priority];
                  if (sectionItems.length === 0) return null;
                  return (
                    <div key={priority}>
                      {/* Section label */}
                      <div className="px-6 py-2 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)]">
                        <p className={`text-[9px] font-body font-bold uppercase tracking-[0.25em] ${PRIORITY_CONFIG[priority].labelColor}`}>
                          {heading}
                        </p>
                      </div>
                      {/* Items */}
                      <div className="divide-y divide-[var(--color-border)]">
                        {sectionItems.map((item) => (
                          <InboxItem key={item.id} item={item} onNavigate={navigate} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: Sidebar ────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Member profile card */}
            <div className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)]">
              <div className="px-6 pt-5 pb-4 border-b border-[var(--color-border)] flex items-center gap-3">
                {user?.profile_picture_url ? (
                  <img
                    src={user.profile_picture_url}
                    alt={user.full_name ?? ""}
                    className="w-10 h-10 rounded-full object-cover shrink-0 border border-[var(--color-border)]"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-brand-primary-main flex items-center justify-center text-white font-heading font-bold text-base shrink-0">
                    {user?.full_name?.[0] ?? "U"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-heading font-bold text-content-primary text-[15px] truncate leading-tight">
                    {user?.full_name}
                  </p>
                  <p className="text-xs text-content-muted capitalize">
                    {currentMembership?.role?.replace("_", " ") ?? "Member"}
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-content-muted">Financial Status</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    financialStatus === "financial"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : financialStatus === "not_financial"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : financialStatus === "neophyte"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {financialStatus === "not_financial" ? "Not Financial" :
                     financialStatus === "neophyte" ? "Neophyte" :
                     financialStatus === "exempt" ? "Exempt" : "Financial"}
                  </span>
                </div>
                {currentMembership?.initiation_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-content-muted">Initiated</span>
                    <span className="text-xs font-medium text-content-secondary">
                      {new Date(currentMembership.initiation_date).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-content-muted">Chapter</span>
                  <span className="text-xs font-medium text-content-secondary truncate max-w-[140px]">
                    {chapter?.name ?? "—"}
                  </span>
                </div>
                {customFieldDefs
                  .filter((f) => currentMembership?.custom_fields?.[f.key] != null && currentMembership.custom_fields[f.key] !== "")
                  .map((f) => (
                    <div key={f.key} className="flex justify-between items-center">
                      <span className="text-xs text-content-muted">{f.label}</span>
                      <span className="text-xs font-medium text-content-secondary truncate max-w-[140px]">
                        {String(currentMembership!.custom_fields[f.key])}
                      </span>
                    </div>
                  ))}
              </div>
              {financialStatus === "not_financial" && (
                <div className="px-6 pb-5">
                  <button
                    onClick={() => navigate("/dues")}
                    className="w-full py-2.5 text-sm font-semibold bg-brand-primary-main text-white hover:bg-brand-primary-dark transition-colors"
                  >
                    Pay Dues Now
                  </button>
                </div>
              )}
            </div>

            {/* Chapter overview — officer only */}
            {!loading && isOfficer && summary && (
              <div data-tour-target={TOUR_TARGETS.DASHBOARD_ANALYTICS_LINK} className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)]">
                <div className="px-6 py-4 border-b border-[var(--color-border)]">
                  <h2 className="text-[11px] font-body font-semibold uppercase tracking-[0.15em] text-content-muted">
                    Chapter Overview
                  </h2>
                </div>
                <div className="px-6 py-4 space-y-4">
                  <div>
                    <p className="text-[9px] font-body font-semibold uppercase tracking-[0.2em] text-content-muted mb-0.5">
                      Total Collected
                    </p>
                    <p className="font-heading text-2xl font-black text-content-heading">
                      ${parseFloat(summary.total_collected).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-content-muted">
                      <span className="text-emerald-700 font-semibold">
                        ${parseFloat(summary.total_this_month).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>{" "}this month
                    </p>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-[9px] font-body font-semibold uppercase tracking-[0.2em] text-content-muted">
                        Collection Rate
                      </p>
                      <span className="font-heading text-base font-bold text-content-heading">{collectionRate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)]">
                      <div
                        className="h-full bg-brand-primary-main transition-all duration-700"
                        style={{ width: `${collectionRate}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-content-muted">
                      <span>{financialMembers} financial</span>
                      <span>{activeMembers.length} active</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)]">
              <div className="px-6 py-4 border-b border-[var(--color-border)]">
                <h2 className="text-[11px] font-body font-semibold uppercase tracking-[0.15em] text-content-muted">
                  Quick Actions
                </h2>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {[
                  { icon: CreditCard, label: "Pay Dues", to: "/payments" },
                  { icon: DollarSign, label: "Make a Donation", to: "/donations" },
                  { icon: Calendar, label: "View Events", to: "/events" },
                  { icon: Users, label: "Update Profile", to: "/settings" },
                ].map((action) => (
                  <button
                    key={action.to}
                    onClick={() => navigate(action.to)}
                    className="w-full flex items-center gap-3 px-6 py-3 text-[13px] text-content-secondary hover:bg-[var(--color-bg-card-hover)] hover:text-content-primary transition-colors text-left group"
                  >
                    <action.icon className="w-3.5 h-3.5 text-content-muted group-hover:text-brand-primary-main transition-colors shrink-0" />
                    {action.label}
                    <ArrowRight className="w-3 h-3 ml-auto text-content-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
