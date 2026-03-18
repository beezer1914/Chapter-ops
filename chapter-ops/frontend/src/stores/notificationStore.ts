import { create } from "zustand";
import type { Notification } from "@/types";
import * as notificationService from "@/services/notificationService";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isPolling: boolean;
  error: string | null;

  loadNotifications: () => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

// Module-level variable for the polling interval
let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isPolling: false,
  error: null,

  loadNotifications: async () => {
    set({ isLoading: true, error: null });
    try {
      const notifications = await notificationService.fetchNotifications();
      set({ notifications, isLoading: false });
    } catch (error) {
      console.error("Failed to load notifications:", error);
      set({ error: "Failed to load notifications", isLoading: false });
    }
  },

  loadUnreadCount: async () => {
    try {
      const { unread_count } = await notificationService.fetchUnreadCount();
      set({ unreadCount: unread_count });
    } catch (error) {
      // Don't set error state for background polling failures
      console.error("Failed to load unread count:", error);
    }
  },

  markAsRead: async (id: string) => {
    try {
      const updated = await notificationService.markAsRead(id);

      // Optimistically update local state
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? updated : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
      set({ error: "Failed to mark as read" });
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationService.markAllAsRead();

      // Optimistically update local state
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          is_read: true,
          read_at: new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      set({ error: "Failed to mark all as read" });
    }
  },

  deleteNotification: async (id: string) => {
    try {
      await notificationService.deleteNotification(id);

      // Optimistically update local state
      set((state) => {
        const notification = state.notifications.find((n) => n.id === id);
        const wasUnread = notification && !notification.is_read;

        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount: wasUnread
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        };
      });
    } catch (error) {
      console.error("Failed to delete notification:", error);
      set({ error: "Failed to delete notification" });
    }
  },

  startPolling: () => {
    if (pollInterval) {
      return; // Already polling
    }

    // Poll immediately
    get().loadUnreadCount();

    // Then poll every 30 seconds (only when tab is visible)
    pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        get().loadUnreadCount();
      }
    }, 30000);

    set({ isPolling: true });
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    set({ isPolling: false });
  },
}));
