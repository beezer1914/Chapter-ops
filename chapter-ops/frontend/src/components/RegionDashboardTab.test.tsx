import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import RegionDashboardTab from "./RegionDashboardTab";
import type { RegionDashboardPayload } from "@/types";

const PAYLOAD: RegionDashboardPayload = {
  region: { id: "r1", name: "Southern", abbreviation: "S", description: null },
  kpis: {
    chapter_count: 12, chapter_count_active: 11, chapter_count_suspended: 1,
    member_count: 248, financial_rate: 73.4,
    dues_ytd: "18452.00", invoices_outstanding_total: "3200.00",
  },
  chapters: [],
  invoice_snapshot: {
    draft: 0, sent: 3, paid: 8, overdue: 1, cancelled: 0,
    outstanding_total: "3200.00",
  },
  officer_summary: [
    { user_id: "u1", full_name: "Brandon Holiday", role: "regional_director" },
  ],
  agent_findings: [],
};

describe("RegionDashboardTab", () => {
  it("renders KPI cards", () => {
    render(<RegionDashboardTab payload={PAYLOAD} />);
    expect(screen.getByText("12")).toBeInTheDocument();   // chapter count
    expect(screen.getByText("248")).toBeInTheDocument();  // member count
    expect(screen.getByText("73.4%")).toBeInTheDocument();
    expect(screen.getByText(/\$18,452\.00/)).toBeInTheDocument();
  });

  it("renders officer summary names", () => {
    render(<RegionDashboardTab payload={PAYLOAD} />);
    expect(screen.getByText("Brandon Holiday")).toBeInTheDocument();
  });

  it("renders agent-findings placeholder when array is empty", () => {
    render(<RegionDashboardTab payload={PAYLOAD} />);
    expect(screen.getByText(/no findings yet/i)).toBeInTheDocument();
  });

  it("handles empty chapter list gracefully", () => {
    render(<RegionDashboardTab payload={{ ...PAYLOAD, chapters: [] }} />);
    // ChapterHealthTable renders both desktop (td) and mobile (p) empty-state
    // nodes, so we assert at least one is present rather than exactly one.
    expect(screen.getAllByText(/no chapters match/i).length).toBeGreaterThan(0);
  });
});
