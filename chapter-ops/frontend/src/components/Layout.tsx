import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useRegionStore } from "@/stores/regionStore";
import NotificationBell from "@/components/NotificationBell";
import type { ModuleKey, Organization, User } from "@/types";
import { useModuleAccess } from "@/lib/permissions";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CreditCard,
  HeartHandshake,
  Map,
  BarChart3,
  GitMerge,
  Calendar,
  Megaphone,
  FolderOpen,
  BookOpen,
  FileText,
  Receipt,
  GitBranch,
  ShieldCheck,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Globe,
  Wallet,
  TableProperties,
  AlertTriangle,
} from "lucide-react";

type NavSection = {
  label: string;
  items: { to: string; label: string; icon: typeof LayoutDashboard; module: ModuleKey | "settings" }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
    ],
  },
  {
    label: "Chapter",
    items: [
      { to: "/dues",           label: "My Dues",         icon: Wallet,        module: "payments" },
      { to: "/payments",       label: "Payments",        icon: CreditCard,    module: "payments" },
      { to: "/invoices",       label: "Invoices",        icon: FileText,      module: "invoices" },
      { to: "/donations",      label: "Donations",       icon: HeartHandshake, module: "donations" },
      { to: "/expenses",       label: "Expenses",        icon: Receipt,       module: "expenses" },
      { to: "/events",         label: "Events",          icon: Calendar,      module: "events" },
      { to: "/communications", label: "Communications",  icon: Megaphone,     module: "communications" },
      { to: "/documents",      label: "Documents",       icon: FolderOpen,    module: "documents" },
      { to: "/knowledge-base", label: "Knowledge Base",  icon: BookOpen,      module: "knowledge_base" },
      { to: "/lineage",        label: "Lineage & History", icon: GitBranch,   module: "lineage" },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/analytics",    label: "Analytics",    icon: BarChart3,       module: "payments" },
      { to: "/chapter-dues", label: "Chapter Dues", icon: TableProperties, module: "payments" },
      { to: "/members",   label: "Members",     icon: Users,        module: "members" },
      { to: "/invites",   label: "Invites",     icon: UserPlus,     module: "invites" },
      { to: "/intake",    label: "Intake / MIP", icon: ShieldCheck, module: "intake" },
      { to: "/regions",   label: "Regions",     icon: Map,          module: "regions" },
      { to: "/workflows", label: "Workflows",   icon: GitMerge,     module: "workflows" },
      { to: "/settings",  label: "Settings",    icon: SettingsIcon, module: "settings" },
    ],
  },
];

function SidebarContent({
  navSections,
  organization,
  orgLetters,
  orgName,
  chapterName,
  user,
  onNavigate,
  onLogout,
}: {
  navSections: NavSection[];
  organization: Organization | null;
  orgLetters: string;
  orgName: string;
  chapterName: string;
  user: User | null;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Org header — always dark */}
      <div className="px-7 py-8 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          {organization?.logo_url ? (
            <img src={organization.logo_url} alt={orgName} className="w-9 h-9 rounded object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded bg-brand-primary-main flex items-center justify-center shrink-0">
              <span className="text-white font-heading font-bold text-sm leading-none">{orgLetters}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-[1.1rem] font-heading font-bold text-white tracking-tight leading-tight truncate">{orgName}</h1>
            {chapterName && (
              <p className="text-[0.65rem] text-[#999] uppercase tracking-[0.15em] font-medium truncate mt-0.5">{chapterName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 py-5 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="px-7 mb-1.5 text-[9px] font-body font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
              {section.label}
            </p>
            <div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `relative flex items-center h-11 pl-7 pr-5 text-[13px] transition-colors duration-150 group ${
                        isActive
                          ? "bg-white/[0.06] text-white font-medium border-l-[3px] border-brand-primary-main pl-[25px]"
                          : "text-[#666] hover:text-white hover:bg-white/[0.03] border-l-[3px] border-transparent pl-[25px]"
                      }`
                    }
                  >
                    <Icon className="w-[15px] h-[15px] mr-3 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-5 py-4 border-t border-white/[0.08]">
        <div className="flex items-center gap-3 mb-3">
          {user?.profile_picture_url ? (
            <img src={user.profile_picture_url} alt={user.full_name || "User"} className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-primary-main flex items-center justify-center text-white font-bold text-xs shrink-0">
              {user?.full_name?.[0] || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[0.75rem] font-medium text-white truncate leading-tight">{user?.full_name}</p>
            <p className="text-[0.65rem] text-[#555] truncate mt-0.5">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left px-3 py-2 text-[12px] font-medium text-[#555] hover:text-white hover:bg-white/[0.05] rounded transition-colors flex items-center gap-2 group"
        >
          <LogOut className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
          Sign Out
        </button>
      </div>
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, memberships, logout, isPlatformAdmin } = useAuthStore();
  const { organization, chapter } = useConfigStore();
  const { isRegionalDirector, isOrgAdmin, loadRegions } = useRegionStore();

  const activeMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const isPresident = activeMembership?.role === "president" || activeMembership?.role === "admin";
  const canSeeIncidents = isPresident || isRegionalDirector || isOrgAdmin;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (user) {
      loadRegions();
    }
  }, [user, loadRegions]);

  const canAccess = useModuleAccess();

  // Filter nav sections by configured module permissions
  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.module === "settings" || canAccess(item.module as ModuleKey)
    ),
  })).filter((section) => section.items.length > 0);

  // Inject Region Dashboard for regional directors, IHQ Dashboard for org admins,
  // and Platform Dashboard for platform admins
  const navSections = filteredSections.map((section) => {
    if (section.label === "Overview") {
      const extra = [];
      if (isRegionalDirector) {
        extra.push({ to: "/region-dashboard", label: "Region Dashboard", icon: BarChart3, module: "dashboard" as ModuleKey });
      }
      if (isOrgAdmin) {
        extra.push({ to: "/ihq", label: "IHQ Dashboard", icon: Globe, module: "dashboard" as ModuleKey });
      }
      if (isPlatformAdmin) {
        extra.push({ to: "/platform", label: "Platform Dashboard", icon: ShieldCheck, module: "dashboard" as ModuleKey });
      }
      if (extra.length === 0) return section;
      return { ...section, items: [...section.items, ...extra] };
    }
    if (section.label === "Admin" && canSeeIncidents) {
      const incidentsItem = {
        to: "/incidents",
        label: "Incidents",
        icon: AlertTriangle,
        module: "dashboard" as ModuleKey,
      };
      return { ...section, items: [incidentsItem, ...section.items] };
    }
    return section;
  });

  // If user has access but the Admin section was filtered out entirely, restore it with just Incidents
  if (canSeeIncidents && !navSections.some((s) => s.items.some((i) => i.to === "/incidents"))) {
    navSections.push({
      label: "Admin",
      items: [{ to: "/incidents", label: "Incidents", icon: AlertTriangle, module: "dashboard" as ModuleKey }],
    });
  }

  const { startPolling, stopPolling } = useNotificationStore();
  const navigate = useNavigate();

  const orgLetters = organization?.greek_letters || organization?.abbreviation || "CO";
  const orgName = organization?.abbreviation || organization?.name || "ChapterOps";
  const chapterName = chapter?.name || "";

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const sidebarProps = {
    navSections,
    organization,
    orgLetters,
    orgName,
    chapterName,
    user,
    onLogout: handleLogout,
  };

  return (
    <div className="min-h-screen bg-surface-deep flex font-body">

      {/* ── Desktop sidebar — always black regardless of color scheme ── */}
      <aside className="hidden md:flex w-[260px] bg-[#0a0a0a] text-white flex-col z-20 shrink-0 border-r border-white/[0.06]" style={{ minHeight: "100vh" }}>
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ── Mobile drawer overlay ───────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile drawer panel ───────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-[#0a0a0a] text-white flex flex-col z-50 md:hidden transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-[#555] hover:text-white hover:bg-white/[0.06] rounded transition-colors z-10"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent {...sidebarProps} onNavigate={() => setMobileMenuOpen(false)} />
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden min-w-0">
        {/* Editorial topbar */}
        <header className="bg-[var(--color-bg-deep)] border-b border-[var(--color-border)] px-4 md:px-8 py-3 md:py-4 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-content-muted hover:text-content-primary rounded transition-colors shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-content-primary truncate">
                Welcome back, <strong className="font-semibold">{user?.first_name}</strong>
              </p>
              {(organization || chapter) && (
                <p className="text-[11px] text-content-muted mt-0.5 truncate hidden sm:block">
                  {[organization?.name, chapter?.name].filter(Boolean).join(" \u00b7 ")}
                </p>
              )}
            </div>
          </div>
          <NotificationBell />
        </header>

        {/* Extra bottom padding on mobile to clear the bottom nav bar */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 relative">
          {/* Editorial dot grid — very faint on cream */}
          <div className="absolute inset-0 bg-dot-grid opacity-[0.35] pointer-events-none" />
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom navigation bar ─────────────────────────── */}
      {/* Hidden while the drawer is open — otherwise it stacks on top of the
          drawer's user footer and hides the Sign Out button. */}
      {!mobileMenuOpen && <MobileBottomNav onMoreClick={() => setMobileMenuOpen(true)} />}
    </div>
  );
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────

function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const location = useLocation();

  const items = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { to: "/dues",      icon: Wallet,           label: "My Dues" },
    { to: "/events",    icon: Calendar,         label: "Events" },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0a0a0a] border-t border-white/[0.08]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {items.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                active ? "text-white" : "text-[#555] hover:text-[#999]"
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${active ? "scale-110" : ""}`} />
              {label}
              {active && (
                <span className="absolute bottom-0 w-8 h-[2px] bg-brand-primary-main rounded-full" style={{ transform: "translateY(0)" }} />
              )}
            </NavLink>
          );
        })}

        {/* More → opens full sidebar drawer */}
        <button
          onClick={onMoreClick}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#555] hover:text-[#999] transition-colors"
        >
          <Menu className="w-5 h-5" />
          More
        </button>
      </div>
    </nav>
  );
}
