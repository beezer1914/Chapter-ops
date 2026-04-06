import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useRegionStore } from "@/stores/regionStore";
import NotificationBell from "@/components/NotificationBell";
import type { ModuleKey } from "@/types";
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
  organization: ReturnType<typeof useConfigStore>["organization"];
  orgLetters: string;
  orgName: string;
  chapterName: string;
  user: ReturnType<typeof useAuthStore>["user"];
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Org header */}
      <div className="p-5 border-b border-[var(--color-border)]">
        <div className="flex items-center">
          {organization?.logo_url ? (
            <img src={organization.logo_url} alt={orgName} className="w-10 h-10 rounded-[14px] object-cover mr-3 shadow-md" />
          ) : (
            <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-brand-primary-main to-brand-primary-dark flex items-center justify-center mr-3 shadow-[0_4px_20px_rgba(15,82,186,0.3)] shrink-0 relative overflow-hidden">
              <div className="absolute inset-[2px] border border-white/20 rounded-[12px]" />
              <span className="text-white font-heading font-bold text-sm leading-none relative z-10">{orgLetters}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-[1.1rem] font-heading font-semibold text-content-primary tracking-wide leading-tight truncate">{orgName}</h1>
            {chapterName && <p className="text-[0.7rem] text-brand-primary-light uppercase tracking-[0.15em] font-medium truncate mt-0.5">{chapterName}</p>}
          </div>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[10px] font-body font-semibold uppercase tracking-[0.18em] text-content-muted">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `relative flex items-center px-4 py-2.5 rounded-full text-[13px] font-medium transition-all duration-200 group ${
                        isActive
                          ? "bg-[var(--color-primary-glow)] text-brand-primary-light"
                          : "text-content-secondary hover:bg-white/[0.03] hover:text-content-primary"
                      }`
                    }
                  >
                    <Icon className="w-[18px] h-[18px] mr-3 opacity-70 group-hover:opacity-100 transition-opacity" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="flex items-center space-x-3 mb-3 p-2 rounded-[14px] hover:bg-white/[0.03] transition-colors cursor-pointer">
          {user?.profile_picture_url ? (
            <img src={user.profile_picture_url} alt={user.full_name || "User"} className="w-9 h-9 rounded-full object-cover shadow-sm border-[1.5px] border-[var(--color-border-brand)]" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-primary-main to-brand-primary-dark flex items-center justify-center text-white font-bold text-sm shadow-sm border-[1.5px] border-[var(--color-border-brand)]">
              {user?.full_name?.[0] || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[0.8rem] font-medium text-content-primary truncate">{user?.full_name}</p>
            <p className="text-[0.68rem] text-content-muted truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left px-3 py-2 text-[13px] font-medium text-content-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center group"
        >
          <LogOut className="w-4 h-4 mr-2 opacity-60 group-hover:opacity-100 transition-opacity" />
          Sign Out
        </button>
      </div>
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, memberships, logout } = useAuthStore();
  const { organization, chapter } = useConfigStore();
  const { isRegionalDirector, isOrgAdmin, loadRegions } = useRegionStore();
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

  // Inject Region Dashboard for regional directors and IHQ Dashboard for org admins
  const navSections = filteredSections.map((section) => {
    if (section.label === "Overview") {
      const extra = [];
      if (isRegionalDirector) {
        extra.push({ to: "/region-dashboard", label: "Region Dashboard", icon: BarChart3, module: "dashboard" as ModuleKey });
      }
      if (isOrgAdmin) {
        extra.push({ to: "/ihq", label: "IHQ Dashboard", icon: Globe, module: "dashboard" as ModuleKey });
      }
      if (extra.length === 0) return section;
      return { ...section, items: [...section.items, ...extra] };
    }
    return section;
  });

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

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex w-[260px] bg-surface-sidebar backdrop-blur-[30px] saturate-[1.4] text-white flex-col shadow-2xl z-20 shrink-0 relative border-r border-[var(--color-border)]">
        <div className="absolute inset-0 bg-noise pointer-events-none" />
        <div className="relative z-10 flex flex-col h-full">
          <SidebarContent {...sidebarProps} />
        </div>
      </aside>

      {/* ── Mobile drawer overlay ───────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile drawer panel ───────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-surface-sidebar backdrop-blur-[30px] text-white flex flex-col shadow-2xl z-50 md:hidden transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-content-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors z-10"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent {...sidebarProps} onNavigate={() => setMobileMenuOpen(false)} />
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-surface-primary/90 backdrop-blur-xl border-b border-[var(--color-border)] px-4 md:px-8 py-3 md:py-4 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-content-muted hover:text-content-primary hover:bg-white/5 rounded-lg transition-colors shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-heading font-bold text-content-heading tracking-tight leading-tight truncate">
                Welcome back, {user?.first_name}
              </h2>
              {(organization || chapter) && (
                <p className="text-[11px] text-content-muted font-medium mt-0.5 truncate hidden sm:block">
                  {[organization?.name, chapter?.name].filter(Boolean).join(" \u2022 ")}
                </p>
              )}
            </div>
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {/* Background texture: subtle dot grid */}
          <div className="absolute inset-0 bg-dot-grid opacity-[0.02] pointer-events-none" />
          {/* Top gradient wash */}
          <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-brand-primary-main/8 via-brand-primary-main/3 to-transparent pointer-events-none" />
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
