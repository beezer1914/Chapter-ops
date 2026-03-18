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

const ALL_NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "member" as MemberRole },
  { to: "/payments", label: "Payments", icon: CreditCard, minRole: "member" as MemberRole },
  { to: "/donations", label: "Donations", icon: HeartHandshake, minRole: "member" as MemberRole },
  { to: "/events", label: "Events", icon: Calendar, minRole: "member" as MemberRole },
  { to: "/communications", label: "Communications", icon: Megaphone, minRole: "member" as MemberRole },
  { to: "/documents", label: "Documents", icon: FolderOpen, minRole: "member" as MemberRole },
  { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen, minRole: "member" as MemberRole },
  { to: "/members", label: "Members", icon: Users, minRole: "secretary" as MemberRole },
  { to: "/invites", label: "Invites", icon: UserPlus, minRole: "secretary" as MemberRole },
  { to: "/regions", label: "Regions", icon: Map, minRole: "member" as MemberRole },
  { to: "/workflows", label: "Workflows", icon: GitMerge, minRole: "secretary" as MemberRole },
  { to: "/settings", label: "Settings", icon: SettingsIcon, minRole: "member" as MemberRole },
];

// Sidebar content extracted for reuse in both desktop and mobile drawer
function SidebarContent({
  navItems,
  organization,
  orgLetters,
  orgName,
  chapterName,
  user,
  onNavigate,
  onLogout,
}: {
  navItems: typeof ALL_NAV_ITEMS;
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
      <div className="p-4 border-b border-white/5 bg-white/5 backdrop-blur-md">
        <div className="flex items-center mb-1">
          {organization?.logo_url ? (
            <img src={organization.logo_url} alt={orgName} className="w-9 h-9 rounded object-cover mr-3 shadow-glass" />
          ) : (
            <div className="w-9 h-9 rounded bg-gradient-to-br from-brand-primary-light to-brand-primary-main flex items-center justify-center mr-3 shadow-glass shrink-0">
              <span className="text-brand-primary-dark font-heading font-bold text-sm leading-none">{orgLetters}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-heading font-extrabold text-white tracking-wide leading-tight truncate">{orgName}</h1>
            {chapterName && <p className="text-xs text-gray-400 truncate">{chapterName}</p>}
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? "bg-brand-primary-main/20 text-brand-primary-light border border-brand-primary-main/30 shadow-inner"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon className="w-5 h-5 mr-3 opacity-80 group-hover:opacity-100 transition-opacity" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5 bg-[#070e1a]">
        <div className="flex items-center space-x-3 mb-4">
          {user?.profile_picture_url ? (
            <img src={user.profile_picture_url} alt={user.full_name || "User"} className="w-10 h-10 rounded-full object-cover shadow-soft border border-white/20" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand-primary-main flex items-center justify-center text-white font-bold shadow-soft border border-white/20">
              {user?.full_name?.[0] || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-gray-400 truncate mt-0.5">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center group"
        >
          <LogOut className="w-4 h-4 mr-2 opacity-70 group-hover:opacity-100 transition-opacity" />
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Load regions once on mount to determine regional director status
  useEffect(() => {
    if (user) {
      loadRegions();
    }
  }, [user, loadRegions]);

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";

  const baseNavItems = ALL_NAV_ITEMS.filter(
    (item) => ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[item.minRole]
  );

  // Inject Region Dashboard nav item right after Dashboard when user is a regional director
  const navItems = isRegionalDirector
    ? [
        baseNavItems[0],
        { to: "/region-dashboard", label: "Region Dashboard", icon: BarChart3, minRole: "member" as MemberRole },
        ...baseNavItems.slice(1),
      ]
    : baseNavItems;

  const { startPolling, stopPolling } = useNotificationStore();
  const navigate = useNavigate();

  const orgLetters = organization?.greek_letters || organization?.abbreviation || "CO";
  const orgName = organization?.abbreviation || organization?.name || "ChapterOps";
  const chapterName = chapter?.name || "";

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Lock body scroll when mobile menu is open
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
    navItems,
    organization,
    orgLetters,
    orgName,
    chapterName,
    user,
    onLogout: handleLogout,
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-body">

      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────── */}
      <aside className="hidden md:flex w-64 bg-[#0a1526] text-white flex-col shadow-2xl z-20 shrink-0">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ── Mobile drawer overlay ───────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile drawer panel ─────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-[#0a1526] text-white flex flex-col shadow-2xl z-50 md:hidden transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent {...sidebarProps} onNavigate={() => setMobileMenuOpen(false)} />
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60 px-4 md:px-8 py-3 md:py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-base md:text-xl font-heading font-extrabold text-gray-900 tracking-tight leading-tight truncate">
                Welcome back, {user?.first_name}!
              </h2>
              {(organization || chapter) && (
                <p className="text-xs text-gray-400 font-medium mt-0.5 truncate hidden sm:block">
                  {[organization?.name, chapter?.name].filter(Boolean).join(" \u2022 ")}
                </p>
              )}
            </div>
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand-primary-light/30 to-transparent pointer-events-none -z-10" />
          {children}
        </main>
      </div>
    </div>
  );
}
