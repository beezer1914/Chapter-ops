import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock Layout to avoid pulling in its auth/branding dependencies.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock RegionDashboardTab to keep the tab default test simple — we only care
// that the dashboard tab is active and fetchRegionDashboard was called.
vi.mock("@/components/RegionDashboardTab", () => ({
  default: () => <div data-testid="region-dashboard-tab">Dashboard Content</div>,
}));

// Mock region service functions used by RegionDetailView to avoid network calls
// if the page tries to render a stale detail view.
vi.mock("@/services/regionService", () => ({
  updateRegion: vi.fn(),
  reassignChapter: vi.fn(),
  assignRegionMember: vi.fn(),
  updateRegionMember: vi.fn(),
  removeRegionMember: vi.fn(),
  searchEligibleUsers: vi.fn(),
  searchDirectory: vi.fn(),
  fetchDirectoryMemberDetail: vi.fn(),
  fetchRegionDashboard: vi.fn(),
}));

vi.mock("@/services/invoiceService", () => ({
  fetchRegionalInvoices: vi.fn().mockResolvedValue({ invoices: [] }),
  createRegionalInvoice: vi.fn(),
  bulkCreateRegionalInvoices: vi.fn(),
  updateRegionalInvoice: vi.fn(),
}));

const mockLoadRegions = vi.fn();
const mockLoadRegionDetail = vi.fn();
const mockClearSelectedRegion = vi.fn();
const mockClearError = vi.fn();

let mockSelectedRegion: unknown = null;

vi.mock("@/stores/regionStore", () => ({
  useRegionStore: vi.fn(() => ({
    regions: [],
    selectedRegion: mockSelectedRegion,
    isOrgAdmin: false,
    isRegionalDirector: false,
    loading: false,
    error: null,
    loadRegions: mockLoadRegions,
    loadRegionDetail: mockLoadRegionDetail,
    clearSelectedRegion: mockClearSelectedRegion,
    clearError: mockClearError,
  })),
}));

import Regions from "@/pages/Regions";
import * as regionService from "@/services/regionService";

function renderRegions() {
  return render(
    <MemoryRouter>
      <Regions />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectedRegion = null;
  // Provide a default resolved value so any test that renders RegionDetailView
  // (which fetches the dashboard on mount) doesn't throw "Cannot read properties
  // of undefined (reading 'then')" after vi.clearAllMocks() clears the impl.
  vi.mocked(regionService.fetchRegionDashboard).mockResolvedValue({
    region: { id: "r1", name: "S", abbreviation: null, description: null },
    kpis: { chapter_count: 0, chapter_count_active: 0, chapter_count_suspended: 0, member_count: 0, financial_rate: 0, dues_ytd: "0.00", invoices_outstanding_total: "0.00" },
    chapters: [],
    invoice_snapshot: { draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0, outstanding_total: "0.00" },
    officer_summary: [],
    agent_findings: [],
  });
});

const STALE_REGION_DETAIL = {
  region: {
    id: "stale-region-id",
    organization_id: "other-org",
    name: "Southern Region",
    abbreviation: "SR",
    description: null,
    active: true,
    config: {},
    created_at: null,
  },
  chapters: [],
  members: [],
  is_org_admin: false,
  current_user_region_role: null,
};

describe("Regions page — cross-org state leak guard", () => {
  it("clears any stale selectedRegion on mount", () => {
    // Simulate a stale selection carried over from a prior chapter/org session.
    mockSelectedRegion = STALE_REGION_DETAIL;

    renderRegions();

    // The mount effect must clear the stale selection so the user does not
    // see a region detail that belongs to a different org.
    expect(mockClearSelectedRegion).toHaveBeenCalled();
  });

  it("calls loadRegions on mount", () => {
    renderRegions();
    expect(mockLoadRegions).toHaveBeenCalled();
  });
});

describe("RegionDetailView — tab integration", () => {
  it("defaults to the Dashboard tab when entering Region Detail with no tab param", async () => {
    const dashboardMock = vi.mocked(regionService.fetchRegionDashboard);
    dashboardMock.mockResolvedValue({
      region: { id: "r1", name: "Southern", abbreviation: null, description: null },
      kpis: {
        chapter_count: 0,
        chapter_count_active: 0,
        chapter_count_suspended: 0,
        member_count: 0,
        financial_rate: 0,
        dues_ytd: "0.00",
        invoices_outstanding_total: "0.00",
      },
      chapters: [],
      invoice_snapshot: { draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0, outstanding_total: "0.00" },
      officer_summary: [],
      agent_findings: [],
    });

    mockSelectedRegion = {
      region: { id: "r1", name: "Southern", abbreviation: null, description: null, active: true, config: {}, created_at: null, organization_id: "org1" },
      chapters: [],
      members: [],
      is_org_admin: false,
      current_user_region_role: null,
    };

    renderRegions();

    // fetchRegionDashboard should be called immediately (dashboard is the default tab)
    await waitFor(() => {
      expect(dashboardMock).toHaveBeenCalledWith("r1");
    });

    // The mocked RegionDashboardTab should be rendered once the payload resolves
    await waitFor(() => {
      expect(screen.getByTestId("region-dashboard-tab")).toBeInTheDocument();
    });
  });
});
