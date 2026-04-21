import type { MemberRole } from "@/types";

export const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
  regional_director: 5, regional_1st_vice: 4,
};
