import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ChapterHealthTable from "./ChapterHealthTable";

const SAMPLE_ROWS = [
  {
    id: "c1", name: "Sigma Delta Sigma", designation: "ΣΔΣ",
    region_id: "r1", region_name: "Southern",
    chapter_type: "graduate" as const,
    city: "Huntsville", state: "AL",
    member_count: 24, financial_rate: 75.0, dues_ytd: "1250.00",
    subscription_tier: "starter", suspended: false,
    suspension_reason: null, deletion_scheduled_at: null,
  },
  {
    id: "c2", name: "Alpha Beta", designation: "ΑΒ",
    region_id: "r1", region_name: "Southern",
    chapter_type: "undergraduate" as const,
    city: "Atlanta", state: "GA",
    member_count: 12, financial_rate: 100.0, dues_ytd: "500.00",
    subscription_tier: "starter", suspended: false,
    suspension_reason: null, deletion_scheduled_at: null,
  },
];

describe("ChapterHealthTable", () => {
  // Note: the component renders a desktop table AND mobile cards in the same DOM;
  // CSS (hidden md:block / md:hidden) controls visibility. JSDOM renders both,
  // so chapter names and action labels appear twice — use getAllBy* accordingly.

  it("renders one row per chapter", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} />);
    expect(screen.getAllByText("Sigma Delta Sigma").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alpha Beta").length).toBeGreaterThan(0);
  });

  it("filters by search term", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} />);
    const search = screen.getByPlaceholderText(/search chapters/i);
    fireEvent.change(search, { target: { value: "alpha" } });
    expect(screen.queryByText("Sigma Delta Sigma")).not.toBeInTheDocument();
    expect(screen.getAllByText("Alpha Beta").length).toBeGreaterThan(0);
  });

  it("hides region column when showRegionColumn is false", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} showRegionColumn={false} />);
    expect(screen.queryByRole("columnheader", { name: /region/i })).not.toBeInTheDocument();
  });

  it("renders empty state when no chapters", () => {
    render(<ChapterHealthTable chapters={[]} />);
    expect(screen.getAllByText(/no chapters/i).length).toBeGreaterThan(0);
  });

  it("renders actions column when actions prop is provided", () => {
    render(
      <ChapterHealthTable
        chapters={SAMPLE_ROWS}
        actions={(c) => <button>Action {c.name}</button>}
      />
    );
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeInTheDocument();
    // Actions appear in both desktop table cells and mobile card footers
    expect(screen.getAllByText("Action Sigma Delta Sigma").length).toBeGreaterThan(0);
  });

  it("does NOT render actions column when actions prop is omitted", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} />);
    expect(screen.queryByRole("columnheader", { name: /actions/i })).not.toBeInTheDocument();
  });
});
