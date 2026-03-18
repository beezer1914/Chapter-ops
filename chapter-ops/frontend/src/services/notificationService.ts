import api from "@/lib/api";
import type { Notification, UnreadCountResponse } from "@/types";

/**
 * Fetch all notifications for the current user in the current chapter.
 * Returns most recent 50 notifications, ordered by created_at descending.
 */
export async function fetchNotifications(): Promise<Notification[]> {
  const response = await api.get("/notifications");
  return response.data.notifications;
}

/**
 * Fetch count of unread notifications for the current user.
 * Used for polling to update the notification badge.
 */
export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  const response = await api.get("/notifications/unread-count");
  return response.data;
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId: string): Promise<Notification> {
  const response = await api.post(`/notifications/${notificationId}/read`);
  return response.data;
}

/**
 * Mark all unread notifications for the current user as read.
 */
export async function markAllAsRead(): Promise<{ success: boolean; count: number }> {
  const response = await api.post("/notifications/read-all");
  return response.data;
}

/**
 * Delete a notification.
 */
export async function deleteNotification(notificationId: string): Promise<{ success: boolean }> {
  const response = await api.delete(`/notifications/${notificationId}`);
  return response.data;
}
