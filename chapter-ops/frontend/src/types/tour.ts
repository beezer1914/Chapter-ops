export type Role =
  | "member"
  | "secretary"
  | "treasurer"
  | "vice_president"
  | "president"
  | "admin";

export type TourSeenEntry = {
  seen_at: string;
  role: Role;
};

export type TourSeen = Record<string, TourSeenEntry>;

export type TourStep = {
  target: string;
  label: string;
  heading: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

export type TourDefinition = {
  id: string;
  route: string;
  roles: Role[];
  matcher?: () => boolean;
  steps: TourStep[];
};
