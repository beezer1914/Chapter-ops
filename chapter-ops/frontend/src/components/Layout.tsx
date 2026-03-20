import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useRegionStore } from "@/stores/regionStore";
import NotificationBell from "@/components/NotificationBell";
import type { MemberRole } from "@/types";
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
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

type NavSection = {
  label: string;
  items: { to: string; label: string; icon: typeof LayoutDashboard; minRole: MemberRole }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "member" },
    ],
  },
  {
    label: "Chapter",
    items: [
      { to: "/payments", label: "Payments", icon: CreditCard, minRole: "member" },
      { to: "/donations", label: "Donations", icon: HeartHandshake, minRole: "member" },
      { to: "/events", label: "Events", icon: Calendar, minRole: "member" },
      { to: "/communications", label: "Communications", icon: Megaphone, minRole: "member" },
      { to: "/documents", label: "Documents", icon: FolderOpen, minRole: "member" },
      { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen, minRole: "member" },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/members", label: "Members", icon: Users, minRole: "secretary" },
      { to: "/invites", label: "Invites", icon: UserPlus, minRole: "secretary" },
      { to: "/regions", label: "Regions", icon: Map, minRole: "member" },
      { to: "/workflows", label: "Workflows", icon: GitMerge, minRole: "secretary" },
      { to: "/settings", label: "Settings", icon: SettingsIcon, minRole: "member" },
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
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center">
          {organization?.logo_url ? (
            <img src={organization.logo_url} alt={orgName} className="w-9 h-9 rounded-lg object-cover mr-3 shadow-md" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-primary-light to-brand-primary-main flex items-center justify-center mr-3 shadow-md shrink-0">
              <span className="text-brand-primary-dark font-heading font-bold text-sm leading-none">{orgLetters}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-heading font-bold text-white tracking-wide leading-tight truncate">{orgName}</h1>
            {chapterName && <p className="text-[11px] text-gray-500 truncate mt-0.5">{chapterName}</p>}
          </div>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[10px] font-heading font-semibold uppercase tracking-[0.15em] text-gray-600">
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
                      `relative flex items-center px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group ${
                        isActive
                          ? "nav-glow-active bg-brand-primary-main/15 text-brand-primary-light"
                          : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
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
      <div className="p-4 border-t border-white/5 bg-black/20">
        <div className="flex items-center space-x-3 mb-3">
          {user?.profile_picture_url ? (
            <img src={user.profile_picture_url} alt={user.full_name || "User"} className="w-9 h-9 rounded-lg object-cover shadow-sm border border-white/10" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-primary-main to-brand-primary-dark flex items-center justify-center text-white font-bold text-sm shadow-sm border border-white/10">
              {user?.full_name?.[0] || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user?.full_name}</p>
            <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left px-3 py-2 text-[13px] font-medium text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center group"
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
  const { isRegionalDirector, loadRegions } = useRegionStore();
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

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";

  // Filter nav sections by role
  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[item.minRole]
    ),
  })).filter((section) => section.items.length > 0);

  // Inject Region Dashboard if user is a regional director
  const navSections = isRegionalDirector
    ? filteredSections.map((section) => {
        if (section.label === "Overview") {
          return {
            ...section,
            items: [
              ...section.items,
              { to: "/region-dashboard", label: "Region Dashboard", icon: BarChart3, minRole: "member" as MemberRole },
            ],
          };
        }
        return section;
      })
    : filteredSections;

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
    <div className="min-h-screen bg-[#f8f9fb] flex font-body">

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex w-[260px] bg-[#060e1a] text-white flex-col shadow-2xl z-20 shrink-0 relative">
        {/* Noise overlay */}
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
        className={`fixed inset-y-0 left-0 w-72 bg-[#060e1a] text-white flex flex-col shadow-2xl z-50 md:hidden transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors z-10"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent {...sidebarProps} onNavigate={() => setMobileMenuOpen(false)} />
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-white/90 backdrop-blur-xl border-b border-gray-200/50 px-4 md:px-8 py-3 md:py-4 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-heading font-bold text-gray-900 tracking-tight leading-tight truncate">
                Welcome back, {user?.first_name}
              </h2>
              {(organization || chapter) && (
                <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate hidden sm:block">
                  {[organization?.name, chapter?.name].filter(Boolean).join(" \u2022 ")}
                </p>
              )}
            </div>
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {/* Background texture: subtle dot grid */}
          <div className="absolute inset-0 bg-dot-grid opacity-[0.03] pointer-events-none" />
          {/* Top gradient wash */}
          <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-brand-primary-light/20 via-brand-primary-light/5 to-transparent pointer-events-none" />
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
