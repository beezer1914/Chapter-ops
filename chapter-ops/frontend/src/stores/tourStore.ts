import { create } from "zustand";
import type { Role, TourSeen } from "@/types/tour";
import {
  fetchTourState,
  markTourSeen as apiMarkSeen,
  resetTourState as apiReset,
} from "@/services/tourService";

interface TourState {
  seen: TourSeen;
  loaded: boolean;
  loadSeen: () => Promise<void>;
  markSeen: (tourId: string, role: Role) => Promise<void>;
  reset: () => Promise<void>;
}

export const useTourStore = create<TourState>((set, get) => ({
  seen: {},
  loaded: false,

  loadSeen: async () => {
    try {
      const seen = await fetchTourState();
      set({ seen, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  markSeen: async (tourId, role) => {
    const prev = get().seen;
    set({
      seen: {
        ...prev,
        [tourId]: { seen_at: new Date().toISOString(), role },
      },
    });
    try {
      const seen = await apiMarkSeen(tourId, role);
      set({ seen });
    } catch {
      set({ seen: prev });
    }
  },

  reset: async () => {
    const prev = get().seen;
    set({ seen: {} });
    try {
      const seen = await apiReset();
      set({ seen });
    } catch {
      set({ seen: prev });
    }
  },
}));
