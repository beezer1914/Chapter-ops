import { describe, it, expect } from "vitest";
import { shouldShowTour, ROLE_RANK } from "./shouldShowTour";
import type { TourDefinition, TourSeen } from "@/types/tour";

const chapterDuesTour: TourDefinition = {
  id: "chapter_dues",
  route: "^/chapter-dues$",
  roles: ["treasurer", "vice_president", "president", "admin"],
  steps: [],
};

const myDuesTour: TourDefinition = {
  id: "my_dues",
  route: "^/dues$",
  roles: ["member", "secretary", "treasurer", "vice_president", "president", "admin"],
  steps: [],
};

describe("shouldShowTour", () => {
  it("returns true for a new user who has never seen the tour", () => {
    expect(shouldShowTour(chapterDuesTour, "treasurer", {})).toBe(true);
  });

  it("returns false when the user's role is not in tour.roles", () => {
    expect(shouldShowTour(chapterDuesTour, "member", {})).toBe(false);
  });

  it("returns false when seen at the same role", () => {
    const seen: TourSeen = { chapter_dues: { seen_at: "2026-01-01", role: "treasurer" } };
    expect(shouldShowTour(chapterDuesTour, "treasurer", seen)).toBe(false);
  });

  it("returns true when user has been promoted past seen role", () => {
    const seen: TourSeen = { my_dues: { seen_at: "2026-01-01", role: "member" } };
    expect(shouldShowTour(chapterDuesTour, "treasurer", seen)).toBe(true);
  });

  it("returns false after demotion (seen role was higher)", () => {
    const seen: TourSeen = { chapter_dues: { seen_at: "2026-01-01", role: "president" } };
    expect(shouldShowTour(chapterDuesTour, "treasurer", seen)).toBe(false);
  });

  it("does not re-fire my_dues after promotion from member to treasurer", () => {
    const seen: TourSeen = { my_dues: { seen_at: "2026-01-01", role: "member" } };
    expect(shouldShowTour(myDuesTour, "treasurer", seen)).toBe(false);
  });

  it("admin re-fires officer tour when never seen", () => {
    expect(shouldShowTour(chapterDuesTour, "admin", {})).toBe(true);
  });

  it("admin does NOT re-fire officer tours seen at lower rank", () => {
    const seen: TourSeen = { chapter_dues: { seen_at: "2026-01-01", role: "treasurer" } };
    expect(shouldShowTour(chapterDuesTour, "admin", seen)).toBe(false);
  });

  it("ROLE_RANK has all six roles", () => {
    expect(Object.keys(ROLE_RANK).sort()).toEqual(
      ["admin", "member", "president", "secretary", "treasurer", "vice_president"].sort()
    );
  });
});
