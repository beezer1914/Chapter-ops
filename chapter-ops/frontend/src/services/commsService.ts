import api from "@/lib/api";
import type {
  Announcement,
  CreateAnnouncementRequest,
  EmailBlastAudience,
  EmailBlastRequest,
  EmailBlastResult,
} from "@/types";

// ── Announcements ─────────────────────────────────────────────────────────────

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data } = await api.get<Announcement[]>("/comms/announcements");
  return data;
}

export async function createAnnouncement(
  payload: CreateAnnouncementRequest
): Promise<Announcement> {
  const { data } = await api.post<Announcement>("/comms/announcements", payload);
  return data;
}

export async function updateAnnouncement(
  id: string,
  payload: Partial<CreateAnnouncementRequest>
): Promise<Announcement> {
  const { data } = await api.patch<Announcement>(`/comms/announcements/${id}`, payload);
  return data;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await api.delete(`/comms/announcements/${id}`);
}

// ── Email Blast ───────────────────────────────────────────────────────────────

export async function previewEmailBlast(
  audience: EmailBlastAudience
): Promise<{ count: number; audience_label: string }> {
  const { data } = await api.post("/comms/email-blast/preview", { audience });
  return data;
}

export async function sendEmailBlast(payload: EmailBlastRequest): Promise<EmailBlastResult> {
  const { data } = await api.post<EmailBlastResult>("/comms/email-blast", payload);
  return data;
}
