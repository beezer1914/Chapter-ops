import api from "@/lib/api";
import type { IHQDashboardData } from "@/types";

export async function fetchIHQDashboard(): Promise<IHQDashboardData> {
  const res = await api.get("/ihq/dashboard");
  return res.data;
}

export async function broadcastAnnouncement(payload: {
  title: string;
  body: string;
  is_pinned?: boolean;
  expires_at?: string | null;
}): Promise<{ success: boolean; chapters_targeted: number }> {
  const res = await api.post("/ihq/broadcast", payload);
  return res.data;
}

export async function suspendChapter(chapterId: string, reason?: string): Promise<void> {
  await api.post(`/ihq/chapters/${chapterId}/suspend`, { reason: reason ?? "" });
}

export async function unsuspendChapter(chapterId: string): Promise<void> {
  await api.post(`/ihq/chapters/${chapterId}/unsuspend`);
}
