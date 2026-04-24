import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock Layout to avoid pulling in its auth/branding dependencies.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
});

describe("Regions page — cross-org state leak guard", () => {
  it("clears any stale selectedRegion on mount", () => {
    // Simulate a stale selection carried over from a prior chapter/org session.
    mockSelectedRegion = {
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
