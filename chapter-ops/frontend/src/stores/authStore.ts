import { create } from "zustand";
import api, { setCsrfToken } from "@/lib/api";
import type {
  User,
  ChapterMembership,
  LoginRequest,
  RegisterRequest,
} from "@/types";
import { useConfigStore } from "@/stores/configStore";
import { useTourStore } from "@/stores/tourStore";

interface AuthState {
  user: User | null;
  memberships: ChapterMembership[];
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  switchChapter: (chapterId: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  memberships: [],
  isAuthenticated: false,
  isPlatformAdmin: false,
  isLoading: true,
  error: null,

  login: async (data) => {
    set({ error: null });
    try {
      const response = await api.post("/auth/login", data);
      // The backend rotates the session on login, invalidating the old CSRF
      // token. It returns a fresh token in the response so subsequent
      // mutations don't have to round-trip through the 400/refresh/retry path.
      if (response.data.csrf_token) {
        setCsrfToken(response.data.csrf_token);
      }
      set({
        user: response.data.user,
        isPlatformAdmin: response.data.is_platform_admin ?? false,
        isAuthenticated: true,
      });
      // Fetch memberships + config — don't let this break the login flow
      try {
        const userResponse = await api.get("/auth/user");
        set({
          memberships: userResponse.data.memberships,
          isPlatformAdmin: userResponse.data.is_platform_admin ?? false,
        });
        if (userResponse.data.user.active_chapter_id) {
          useConfigStore.getState().loadConfig();
        }
      } catch {
        // Non-critical: memberships can be fetched later
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Login failed. Please try again.";
      set({ error: message });
      throw err;
    }
  },

  register: async (data) => {
    set({ error: null });
    try {
      const response = await api.post("/auth/register", data);
      if (response.data.csrf_token) {
        setCsrfToken(response.data.csrf_token);
      }
      set({
        user: response.data.user,
        isPlatformAdmin: response.data.is_platform_admin ?? false,
        isAuthenticated: true,
      });
      // Fetch memberships + config — don't let this break the register flow
      try {
        const userResponse = await api.get("/auth/user");
        set({
          memberships: userResponse.data.memberships,
          isPlatformAdmin: userResponse.data.is_platform_admin ?? false,
        });
        if (userResponse.data.user.active_chapter_id) {
          useConfigStore.getState().loadConfig();
        }
      } catch {
        // Non-critical: memberships can be fetched later
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Registration failed. Please try again.";
      set({ error: message });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      set({
        user: null,
        memberships: [],
        isAuthenticated: false,
        isPlatformAdmin: false,
        isLoading: false,
        error: null,
      });
      useTourStore.getState().clear();
    }
  },

  initializeAuth: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get("/auth/user");
      set({
        user: response.data.user,
        memberships: response.data.memberships,
        isPlatformAdmin: response.data.is_platform_admin ?? false,
        isAuthenticated: true,
        isLoading: false,
      });
      // Load config if user has an active chapter
      if (response.data.user.active_chapter_id) {
        useConfigStore.getState().loadConfig();
      }
    } catch {
      set({
        user: null,
        memberships: [],
        isAuthenticated: false,
        isPlatformAdmin: false,
        isLoading: false,
      });
    }
  },

  switchChapter: async (chapterId) => {
    try {
      await api.post("/auth/switch-chapter", { chapter_id: chapterId });
      set((state) => ({
        user: state.user ? { ...state.user, active_chapter_id: chapterId } : null,
      }));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Failed to switch chapter.";
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
