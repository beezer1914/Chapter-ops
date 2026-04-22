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
  clear: () => void;
}

export const useTourStore = create<TourState>((set) => ({
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
    // Preserve the optimistic update even on failure — reverting would cause the
    // tour to re-fire within the same session. If the server write fails we log
    // it; the dismissal is still honored for the current session and can retry
    // on the next mark.
    set((state) => ({
      seen: {
        ...state.seen,
        [tourId]: { seen_at: new Date().toISOString(), role },
      },
    }));
    try {
      const seen = await apiMarkSeen(tourId, role);
      set({ seen });
    } catch (err) {
      console.warn(`[tourStore] Failed to persist tour "${tourId}":`, err);
    }
  },

  reset: async () => {
    set({ seen: {} });
    try {
      const seen = await apiReset();
      set({ seen });
    } catch (err) {
      console.warn("[tourStore] Failed to reset tour state:", err);
    }
  },

  clear: () => set({ seen: {}, loaded: false }),
}));
