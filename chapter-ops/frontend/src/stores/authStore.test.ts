import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the api module — logout hits POST /auth/logout but we don't need
// the network call in these tests.
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { memberships: [], is_platform_admin: false, user: { active_chapter_id: null } } }),
    post: vi.fn().mockResolvedValue({ data: { user: { id: "u1", active_chapter_id: null }, is_platform_admin: false } }),
  },
  setCsrfToken: vi.fn(),
}));

import { useAuthStore } from "@/stores/authStore";
import { useRegionStore } from "@/stores/regionStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useConfigStore } from "@/stores/configStore";
import { useBrandingStore } from "@/stores/brandingStore";
import { useNotificationStore } from "@/stores/notificationStore";

beforeEach(() => {
  // Reset every store to pristine before each test so cases are independent.
  useRegionStore.getState().reset();
  useWorkflowStore.getState().reset();
  useConfigStore.getState().reset();
  useBrandingStore.getState().reset();
  useNotificationStore.getState().reset();
  vi.clearAllMocks();
});

describe("authStore.logout — cross-session cache cleanup", () => {
  it("clears regionStore state (prevents cross-org region-detail leak)", async () => {
    useRegionStore.setState({
      selectedRegion: {
        region: {
          id: "stale-region",
          organization_id: "other-org",
          name: "Southern Region",
          abbreviation: "SR",
          description: null,
          active: true,
          config: {},
          created_at: "2026-01-01T00:00:00Z",
        },
        chapters: [],
        members: [],
        is_org_admin: false,
        current_user_region_role: null,
      },
      isOrgAdmin: true,
      isRegionalDirector: true,
    });

    await useAuthStore.getState().logout();

    const s = useRegionStore.getState();
    expect(s.selectedRegion).toBeNull();
    expect(s.isOrgAdmin).toBe(false);
    expect(s.isRegionalDirector).toBe(false);
  });

  it("clears workflowStore state (prevents cross-chapter template leak)", async () => {
    useWorkflowStore.setState({
      selectedTemplate: {
        id: "stale-tmpl",
        organization_id: "other-org",
        chapter_id: null,
        created_by: "u1",
        name: "Stale Template",
        description: null,
        trigger_type: "document",
        completion_actions: [],
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        steps: [],
        step_count: 0,
        active_instance_count: 0,
      },
    });

    await useAuthStore.getState().logout();

    expect(useWorkflowStore.getState().selectedTemplate).toBeNull();
  });

  it("clears configStore state (prevents cross-chapter config leak)", async () => {
    useConfigStore.setState({
      chapterId: "stale-chapter-id",
      organizationId: "stale-org-id",
      isLoaded: true,
    });

    await useAuthStore.getState().logout();

    const s = useConfigStore.getState();
    expect(s.chapterId).toBeNull();
    expect(s.organizationId).toBeNull();
    expect(s.isLoaded).toBe(false);
  });

  it("clears brandingStore state (prevents cross-org branding leak)", async () => {
    useBrandingStore.setState({ isInitialized: true });

    await useAuthStore.getState().logout();

    expect(useBrandingStore.getState().isInitialized).toBe(false);
  });

  it("clears notificationStore state and stops polling", async () => {
    useNotificationStore.setState({
      unreadCount: 7,
      isPolling: true,
    });

    await useAuthStore.getState().logout();

    const s = useNotificationStore.getState();
    expect(s.unreadCount).toBe(0);
    expect(s.isPolling).toBe(false);
  });
});

describe("authStore.login — clears prior-session cache before new user loads", () => {
  it("resets regionStore at start of login (covers re-login without explicit logout)", async () => {
    // Simulate: user is already logged in as Someone Else, has a region
    // selected, then logs in as a different user without logging out first.
    useRegionStore.setState({
      selectedRegion: {
        region: {
          id: "stale",
          organization_id: "other-org",
          name: "Unaffiliated",
          abbreviation: null,
          description: null,
          active: true,
          config: {},
          created_at: "2026-01-01T00:00:00Z",
        },
        chapters: [],
        members: [],
        is_org_admin: false,
        current_user_region_role: null,
      },
    });

    await useAuthStore.getState().login({
      email: "new@example.com",
      password: "whatever",
    });

    expect(useRegionStore.getState().selectedRegion).toBeNull();
  });
});
