import { create } from "zustand";
import type { Organization, Region, CreateOrganizationRequest, CreateRegionRequest } from "@/types";
import type { ChapterRequest } from "@/types/chapterRequest";
import {
  fetchOrganizations,
  createOrganization,
  fetchRegions,
  createRegion,
} from "@/services/onboardingService";

interface OnboardingState {
  currentStep: number;
  organizations: Organization[];
  selectedOrganization: Organization | null;
  regions: Region[];
  selectedRegion: Region | null;
  isLoading: boolean;
  error: string | null;
  pendingRequest: ChapterRequest | null;

  setStep: (step: number) => void;
  loadOrganizations: () => Promise<void>;
  selectOrganization: (org: Organization) => void;
  submitNewOrganization: (data: CreateOrganizationRequest) => Promise<void>;
  loadRegions: (organizationId: string) => Promise<void>;
  selectRegion: (region: Region) => void;
  submitNewRegion: (data: CreateRegionRequest) => Promise<void>;
  goToPendingApproval: (request: ChapterRequest) => void;
  clearError: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 1,
  organizations: [],
  selectedOrganization: null,
  regions: [],
  selectedRegion: null,
  isLoading: false,
  error: null,
  pendingRequest: null,

  setStep: (step) => set({ currentStep: step }),

  loadOrganizations: async () => {
    set({ isLoading: true, error: null });
    try {
      const organizations = await fetchOrganizations();
      set({ organizations, isLoading: false });
    } catch {
      set({ error: "Failed to load organizations.", isLoading: false });
    }
  },

  selectOrganization: (org) => set({ selectedOrganization: org, currentStep: 2 }),

  submitNewOrganization: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const org = await createOrganization(data);
      set((state) => ({
        organizations: [...state.organizations, org],
        selectedOrganization: org,
        currentStep: 2,
        isLoading: false,
      }));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to create organization.";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  loadRegions: async (organizationId) => {
    set({ isLoading: true, error: null });
    try {
      const regions = await fetchRegions(organizationId);
      set({ regions, isLoading: false });
    } catch {
      set({ error: "Failed to load regions.", isLoading: false });
    }
  },

  selectRegion: (region) => set({ selectedRegion: region, currentStep: 3 }),

  submitNewRegion: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const region = await createRegion(data);
      set((state) => ({
        regions: [...state.regions, region],
        selectedRegion: region,
        currentStep: 3,
        isLoading: false,
      }));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to create region.";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  goToPendingApproval: (request) =>
    set({ pendingRequest: request, currentStep: 5 }),

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      currentStep: 1,
      organizations: [],
      selectedOrganization: null,
      regions: [],
      selectedRegion: null,
      isLoading: false,
      error: null,
      pendingRequest: null,
    }),
}));
