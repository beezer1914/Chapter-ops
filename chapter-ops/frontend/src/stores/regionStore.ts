import { create } from "zustand";
import type { RegionWithStats, RegionDetail } from "@/types";
import { fetchRegions, fetchRegionDetail } from "@/services/regionService";

interface RegionState {
  regions: RegionWithStats[];
  selectedRegion: RegionDetail | null;
  isOrgAdmin: boolean;
  isRegionalDirector: boolean;
  loading: boolean;
  error: string | null;

  loadRegions: () => Promise<void>;
  loadRegionDetail: (regionId: string) => Promise<void>;
  clearSelectedRegion: () => void;
  clearError: () => void;
}

export const useRegionStore = create<RegionState>((set) => ({
  regions: [],
  selectedRegion: null,
  isOrgAdmin: false,
  isRegionalDirector: false,
  loading: false,
  error: null,

  loadRegions: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchRegions();
      set({
        regions: data.regions,
        isOrgAdmin: data.is_org_admin,
        isRegionalDirector: data.is_regional_director ?? false,
        loading: false,
      });
    } catch {
      set({ error: "Failed to load regions.", loading: false });
    }
  },

  loadRegionDetail: async (regionId: string) => {
    set({ loading: true, error: null });
    try {
      const detail = await fetchRegionDetail(regionId);
      set({ selectedRegion: detail, loading: false });
    } catch {
      set({ error: "Failed to load region details.", loading: false });
    }
  },

  clearSelectedRegion: () => set({ selectedRegion: null }),
  clearError: () => set({ error: null }),
}));
