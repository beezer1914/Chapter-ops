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
import { useRegionStore } from "@/stores/regionStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useBrandingStore } from "@/stores/brandingStore";
import { useNotificationStore } from "@/stores/notificationStore";

export type LoginResult =
  | { kind: "success"; requires_enrollment?: boolean }
  | { kind: "requires_mfa"; mfa_token: string };

interface AuthState {
  user: User | null;
  memberships: ChapterMembership[];
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (data: LoginRequest) => Promise<LoginResult>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  switchChapter: (chapterId: string) => Promise<void>;
  clearError: () => void;
  setSessionFromMFAVerify: (response: {
    user: User;
    is_platform_admin?: boolean;
    csrf_token?: string;
  }) => Promise<void>;
}

/**
 * Reset every per-user Zustand store to its pristine state.
 *
 * Called on any auth identity transition — login, register, logout — so an
 * in-memory cache from a prior session can never leak into a new one (the
 * original report: a ZphiB region detail rendering under a PBS session).
 */
function resetPerUserStores() {
  useTourStore.getState().clear();
  useRegionStore.getState().reset();
  useWorkflowStore.getState().reset();
  useConfigStore.getState().reset();
  useBrandingStore.getState().reset();
  useNotificationStore.getState().reset();
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
    // Clear any in-memory state from a prior session BEFORE the new user
    // data arrives. Covers the case where someone logs in while already
    // authenticated as another user (the frontend never explicitly logs
    // them out; the backend rotates the session).
    resetPerUserStores();
    try {
      const response = await api.post("/auth/login", data);

      if (response.data.requires_mfa) {
        return { kind: "requires_mfa", mfa_token: response.data.mfa_token };
      }

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
      return {
        kind: "success",
        requires_enrollment: !!response.data.requires_enrollment,
      };
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        "Login failed. Please try again.";
      set({ error: message });
      throw err;
    }
  },

  setSessionFromMFAVerify: async (response) => {
    if (response.csrf_token) {
      setCsrfToken(response.csrf_token);
    }
    set({
      user: response.user,
      isPlatformAdmin: response.is_platform_admin ?? false,
      isAuthenticated: true,
    });
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
  },

  register: async (data) => {
    set({ error: null });
    // Same rationale as login: clear any prior-session cache before the new
    // user is established.
    resetPerUserStores();
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
      resetPerUserStores();
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
      // Switching chapters can move the user across orgs. Drop per-chapter
      // caches so the next page load fetches fresh data for the new tenant,
      // then reload config (which reinitializes branding).
      useRegionStore.getState().reset();
      useWorkflowStore.getState().reset();
      useConfigStore.getState().reset();
      useBrandingStore.getState().reset();
      useConfigStore.getState().loadConfig();
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
