import { describe, it, expect } from "vitest";
import { TOUR_DEFINITIONS } from "./tourDefinitions";
import { TOUR_TARGETS } from "./tourTargets";

const VALID_TARGETS = new Set(Object.values(TOUR_TARGETS));

describe("TOUR_DEFINITIONS", () => {
  it("every step target references a valid TOUR_TARGETS constant", () => {
    for (const tour of TOUR_DEFINITIONS) {
      for (const step of tour.steps) {
        expect(VALID_TARGETS.has(step.target as (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS]))
          .toBe(true);
      }
    }
  });

  it("every tour has at most 4 steps", () => {
    for (const tour of TOUR_DEFINITIONS) {
      expect(tour.steps.length).toBeLessThanOrEqual(4);
    }
  });

  it("tour ids are unique", () => {
    const ids = TOUR_DEFINITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
