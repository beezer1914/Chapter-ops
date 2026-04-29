import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Store mocks ──────────────────────────────────────────────────────────────
// Stub each store Layout touches so the test has no auth/branding side-effects.

const mockRegionStore = {
  isRegionalDirector: false,
  isOrgAdmin: false,
  regionsWithDashboardAccess: [] as string[],
  loadRegions: vi.fn(),
};

vi.mock("@/stores/regionStore", () => ({
  useRegionStore: vi.fn(() => mockRegionStore),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: "u1",
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
      full_name: "Test User",
    },
    memberships: [],
    isAuthenticated: true,
    isPlatformAdmin: false,
    logout: vi.fn(),
  })),
}));

vi.mock("@/stores/configStore", () => ({
  useConfigStore: vi.fn(() => ({
    organization: null,
    chapter: null,
  })),
}));

vi.mock("@/stores/notificationStore", () => ({
  useNotificationStore: vi.fn(() => ({
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
  })),
}));

// useModuleAccess — allow all modules through so nav items render
vi.mock("@/lib/permissions", () => ({
  useModuleAccess: vi.fn(() => () => true),
}));

// NotificationBell renders nothing in tests (avoids API calls)
vi.mock("@/components/NotificationBell", () => ({
  default: () => null,
}));

// ── Import after mocks are set up ────────────────────────────────────────────
import Layout from "./Layout";

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout>
        <div />
      </Layout>
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Layout sidebar — Regional Dashboard entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults before each test
    mockRegionStore.isRegionalDirector = false;
    mockRegionStore.isOrgAdmin = false;
    mockRegionStore.regionsWithDashboardAccess = [];
    mockRegionStore.loadRegions = vi.fn();
  });

  it("does NOT show Regional Dashboard entry when regionsWithDashboardAccess is empty", () => {
    mockRegionStore.regionsWithDashboardAccess = [];
    renderLayout();
    expect(screen.queryByText(/Regional Dashboard/i)).not.toBeInTheDocument();
  });

  it("shows Regional Dashboard entry linking to the first region's dashboard tab when user has access", () => {
    mockRegionStore.regionsWithDashboardAccess = ["r1"];
    renderLayout();
    // Layout renders both desktop sidebar and mobile sidebar — getAllByText finds both.
    // Both must point to the same correct href.
    const links = screen.getAllByText(/Regional Dashboard/i).map((el) => el.closest("a"));
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/regions/r1?tab=dashboard");
    });
  });
});
