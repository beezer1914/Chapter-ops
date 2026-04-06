import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import type { MemberRole, ModuleKey } from "@/types";

export const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0,
  secretary: 1,
  treasurer: 2,
  vice_president: 3,
  president: 4,
  admin: 5,
  regional_director: 3,
  regional_1st_vice: 2,
};

// Modules that are always accessible regardless of permission config
const ALWAYS_ACCESSIBLE = new Set<ModuleKey>(["dashboard"]);

// Default minimum role per module — chapter admin can override these upward or downward
export const DEFAULT_PERMISSIONS: Record<ModuleKey, MemberRole> = {
  dashboard:      "member",
  payments:       "member",
  expenses:       "member",
  events:         "member",
  knowledge_base: "member",
  lineage:        "member",
  documents:      "member",
  communications: "member",
  regions:        "member",
  members:        "secretary",
  invites:        "secretary",
  intake:         "secretary",
  workflows:      "secretary",
  invoices:       "treasurer",
  donations:      "treasurer",
};

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard:      "Dashboard",
  payments:       "Payments",
  invoices:       "Invoices",
  donations:      "Donations",
  expenses:       "Expenses",
  events:         "Events",
  communications: "Communications",
  documents:      "Documents",
  knowledge_base: "Knowledge Base",
  lineage:        "Lineage & History",
  members:        "Members",
  invites:        "Invites",
  intake:         "Intake / MIP",
  regions:        "Regions",
  workflows:      "Workflows",
};

/**
 * Returns a `canAccess(module)` checker based on the current user's role
 * and the chapter's configured permission overrides.
 *
 * Usage:
 *   const canAccess = useModuleAccess();
 *   if (!canAccess("payments")) return <Navigate to="/dashboard" />;
 */
export function useModuleAccess() {
  const { user, memberships } = useAuthStore();
  const { chapterConfig } = useConfigStore();

  const currentMembership = memberships.find(
    (m) => m.chapter_id === user?.active_chapter_id
  );
  const currentRole = (currentMembership?.role ?? "member") as MemberRole;
  const roleLevel = ROLE_HIERARCHY[currentRole] ?? 0;
  const isAdmin = roleLevel >= ROLE_HIERARCHY["admin"];
  const isIntakeOfficer = currentMembership?.is_intake_officer ?? false;
  const permissions = chapterConfig.permissions ?? {};

  return (module: ModuleKey): boolean => {
    if (ALWAYS_ACCESSIBLE.has(module)) return true;
    if (isAdmin) return true;
    if (module === "intake" && isIntakeOfficer) return true;

    const minRole = (permissions[module] ?? DEFAULT_PERMISSIONS[module]) as MemberRole;
    const minLevel = ROLE_HIERARCHY[minRole] ?? 0;
    return roleLevel >= minLevel;
  };
}
