import type { Role, TourDefinition, TourSeen } from "@/types/tour";

export const ROLE_RANK: Record<Role, number> = {
  admin: 5,
  president: 4,
  vice_president: 3,
  treasurer: 2,
  secretary: 1,
  member: 0,
};

export function shouldShowTour(
  tour: TourDefinition,
  currentRole: Role,
  seen: TourSeen,
): boolean {
  if (!tour.roles.includes(currentRole)) return false;
  const prior = seen[tour.id];
  if (!prior) return true;
  // Only re-fire if the user was promoted INTO eligibility for the first time
  // (prior role was not in tour.roles). If already seen while eligible, don't repeat.
  if (!tour.roles.includes(prior.role) && ROLE_RANK[currentRole] > ROLE_RANK[prior.role]) {
    return true;
  }
  return false;
}
