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
    deletion_scheduled_at: null,
  },
  {
    id: "c2", name: "Alpha Beta", designation: "ΑΒ",
    region_id: "r1", region_name: "Southern",
    chapter_type: "undergraduate" as const,
    city: "Atlanta", state: "GA",
    member_count: 12, financial_rate: 100.0, dues_ytd: "500.00",
    subscription_tier: "starter", suspended: false,
    deletion_scheduled_at: null,
  },
];

describe("ChapterHealthTable", () => {
  it("renders one row per chapter", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} />);
    expect(screen.getByText("Sigma Delta Sigma")).toBeInTheDocument();
    expect(screen.getByText("Alpha Beta")).toBeInTheDocument();
  });

  it("filters by search term", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} />);
    const search = screen.getByPlaceholderText(/search chapters/i);
    fireEvent.change(search, { target: { value: "alpha" } });
    expect(screen.queryByText("Sigma Delta Sigma")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha Beta")).toBeInTheDocument();
  });

  it("hides region column when showRegionColumn is false", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} showRegionColumn={false} />);
    expect(screen.queryByRole("columnheader", { name: /region/i })).not.toBeInTheDocument();
  });

  it("renders empty state when no chapters", () => {
    render(<ChapterHealthTable chapters={[]} />);
    expect(screen.getByText(/no chapters/i)).toBeInTheDocument();
  });
});
