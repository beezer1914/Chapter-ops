import { describe, it, expect, vi, beforeEach } from "vitest";
import { useOnboardingStore } from "@/stores/onboardingStore";
import type { Organization, Region } from "@/types";

// Mock the onboarding service
vi.mock("@/services/onboardingService", () => ({
  fetchOrganizations: vi.fn(),
  createOrganization: vi.fn(),
  fetchRegions: vi.fn(),
  createRegion: vi.fn(),
}));

import {
  fetchOrganizations,
  createOrganization,
  fetchRegions,
  createRegion,
} from "@/services/onboardingService";

const mockFetchOrgs = vi.mocked(fetchOrganizations);
const mockCreateOrg = vi.mocked(createOrganization);
const mockFetchRegions = vi.mocked(fetchRegions);
const mockCreateRegion = vi.mocked(createRegion);

const mockOrg: Organization = {
  id: "org-1",
  name: "Phi Beta Sigma Fraternity, Inc.",
  abbreviation: "PBS",
  greek_letters: "ΦΒΣ",
  org_type: "fraternity",
  council: "NPHC",
  founded_year: 1914,
  motto: null,
  logo_url: null,
  website: null,
  active: true,
  created_at: "2025-01-01T00:00:00Z",
  config: {},
};

const mockRegion: Region = {
  id: "region-1",
  organization_id: "org-1",
  name: "Southern Region",
  abbreviation: "SR",
  description: null,
  active: true,
  config: {},
  created_at: "2025-01-01T00:00:00Z",
};

beforeEach(() => {
  useOnboardingStore.getState().reset();
  vi.clearAllMocks();
});

describe("onboardingStore", () => {
  describe("initial state", () => {
    it("starts at step 1 with empty data", () => {
      const state = useOnboardingStore.getState();
      expect(state.currentStep).toBe(1);
      expect(state.organizations).toEqual([]);
      expect(state.selectedOrganization).toBeNull();
      expect(state.regions).toEqual([]);
      expect(state.selectedRegion).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("loadOrganizations", () => {
    it("fetches and stores organizations", async () => {
      mockFetchOrgs.mockResolvedValue([mockOrg]);

      await useOnboardingStore.getState().loadOrganizations();

      const state = useOnboardingStore.getState();
      expect(state.organizations).toHaveLength(1);
      expect(state.organizations[0]!.name).toBe("Phi Beta Sigma Fraternity, Inc.");
      expect(state.isLoading).toBe(false);
    });

    it("handles fetch error", async () => {
      mockFetchOrgs.mockRejectedValue(new Error("Network error"));

      await useOnboardingStore.getState().loadOrganizations();

      const state = useOnboardingStore.getState();
      expect(state.error).toBe("Failed to load organizations.");
      expect(state.isLoading).toBe(false);
    });
  });

  describe("selectOrganization", () => {
    it("sets selected org and advances to step 2", () => {
      useOnboardingStore.getState().selectOrganization(mockOrg);

      const state = useOnboardingStore.getState();
      expect(state.selectedOrganization).toEqual(mockOrg);
      expect(state.currentStep).toBe(2);
    });
  });

  describe("submitNewOrganization", () => {
    it("creates org, sets it as selected, advances to step 2", async () => {
      mockCreateOrg.mockResolvedValue(mockOrg);

      await useOnboardingStore.getState().submitNewOrganization({
        name: "Phi Beta Sigma Fraternity, Inc.",
        abbreviation: "PBS",
        org_type: "fraternity",
      });

      const state = useOnboardingStore.getState();
      expect(state.selectedOrganization).toEqual(mockOrg);
      expect(state.currentStep).toBe(2);
      expect(state.organizations).toContainEqual(mockOrg);
    });

    it("sets error on failure", async () => {
      const error = { response: { data: { error: "Abbreviation already exists." } } };
      mockCreateOrg.mockRejectedValue(error);

      await expect(
        useOnboardingStore.getState().submitNewOrganization({
          name: "Dup",
          abbreviation: "PBS",
          org_type: "fraternity",
        })
      ).rejects.toBeDefined();

      expect(useOnboardingStore.getState().error).toBe("Abbreviation already exists.");
    });
  });

  describe("loadRegions", () => {
    it("fetches and stores regions", async () => {
      mockFetchRegions.mockResolvedValue([mockRegion]);

      await useOnboardingStore.getState().loadRegions("org-1");

      const state = useOnboardingStore.getState();
      expect(state.regions).toHaveLength(1);
      expect(state.regions[0]!.name).toBe("Southern Region");
      expect(state.isLoading).toBe(false);
    });

    it("handles fetch error", async () => {
      mockFetchRegions.mockRejectedValue(new Error("Network error"));

      await useOnboardingStore.getState().loadRegions("org-1");

      const state = useOnboardingStore.getState();
      expect(state.error).toBe("Failed to load regions.");
      expect(state.isLoading).toBe(false);
    });
  });

  describe("selectRegion", () => {
    it("sets selected region and advances to step 3", () => {
      useOnboardingStore.getState().selectRegion(mockRegion);

      const state = useOnboardingStore.getState();
      expect(state.selectedRegion).toEqual(mockRegion);
      expect(state.currentStep).toBe(3);
    });
  });

  describe("submitNewRegion", () => {
    it("creates region, sets it as selected, advances to step 3", async () => {
      mockCreateRegion.mockResolvedValue(mockRegion);

      await useOnboardingStore.getState().submitNewRegion({
        organization_id: "org-1",
        name: "Southern Region",
      });

      const state = useOnboardingStore.getState();
      expect(state.selectedRegion).toEqual(mockRegion);
      expect(state.currentStep).toBe(3);
      expect(state.regions).toContainEqual(mockRegion);
    });

    it("sets error on failure", async () => {
      const error = { response: { data: { error: "Region already exists." } } };
      mockCreateRegion.mockRejectedValue(error);

      await expect(
        useOnboardingStore.getState().submitNewRegion({
          organization_id: "org-1",
          name: "Dup Region",
        })
      ).rejects.toBeDefined();

      expect(useOnboardingStore.getState().error).toBe("Region already exists.");
    });
  });

  describe("setStep", () => {
    it("allows navigating back to step 1", () => {
      useOnboardingStore.getState().selectOrganization(mockOrg);
      expect(useOnboardingStore.getState().currentStep).toBe(2);

      useOnboardingStore.getState().setStep(1);
      expect(useOnboardingStore.getState().currentStep).toBe(1);
      // Org should still be selected
      expect(useOnboardingStore.getState().selectedOrganization).toEqual(mockOrg);
    });
  });

  describe("reset", () => {
    it("clears all state back to initial", () => {
      useOnboardingStore.getState().selectOrganization(mockOrg);
      useOnboardingStore.getState().selectRegion(mockRegion);
      useOnboardingStore.getState().reset();

      const state = useOnboardingStore.getState();
      expect(state.currentStep).toBe(1);
      expect(state.selectedOrganization).toBeNull();
      expect(state.selectedRegion).toBeNull();
      expect(state.organizations).toEqual([]);
      expect(state.regions).toEqual([]);
    });
  });
});
