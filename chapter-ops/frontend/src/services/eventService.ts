import api from "@/lib/api";
import type {
  ChapterEvent,
  EventAttendance,
  CreateEventRequest,
  RsvpStatus,
  ServiceHoursReport,
} from "@/types";

// ── Chapter events (authenticated) ───────────────────────────────────────────

export async function fetchEvents(params?: {
  past?: boolean;
}): Promise<ChapterEvent[]> {
  const response = await api.get("/events", { params });
  return response.data.events;
}

export async function createEvent(
  data: CreateEventRequest
): Promise<ChapterEvent> {
  const response = await api.post("/events", data);
  return response.data.event;
}

export async function fetchEvent(id: string): Promise<ChapterEvent> {
  const response = await api.get(`/events/${id}`);
  return response.data.event;
}

export async function updateEvent(
  id: string,
  data: Partial<CreateEventRequest>
): Promise<ChapterEvent> {
  const response = await api.patch(`/events/${id}`, data);
  return response.data.event;
}

export async function cancelEvent(id: string): Promise<{ success: boolean }> {
  const response = await api.delete(`/events/${id}`);
  return response.data;
}

// ── Attendees ─────────────────────────────────────────────────────────────────

export async function fetchEventAttendees(
  id: string
): Promise<EventAttendance[]> {
  const response = await api.get(`/events/${id}/attendees`);
  return response.data.attendances;
}

export async function rsvpToEvent(
  id: string,
  rsvp_status: RsvpStatus = "going"
): Promise<EventAttendance> {
  const response = await api.post(`/events/${id}/rsvp`, { rsvp_status });
  return response.data.attendance;
}

export async function cancelRsvp(id: string): Promise<{ success: boolean }> {
  const response = await api.delete(`/events/${id}/rsvp`);
  return response.data;
}

export async function toggleCheckIn(
  eventId: string,
  attendanceId: string
): Promise<EventAttendance> {
  const response = await api.patch(
    `/events/${eventId}/attendees/${attendanceId}`
  );
  return response.data.attendance;
}

export async function createEventCheckout(
  id: string
): Promise<{ checkout_url: string }> {
  const response = await api.post(`/events/${id}/checkout`);
  return response.data;
}

export async function fetchServiceHours(params?: {
  year?: number;
}): Promise<ServiceHoursReport> {
  const response = await api.get("/events/service-hours", { params });
  return response.data;
}

// ── Public event routes (no auth) ─────────────────────────────────────────────

export async function fetchPublicEvent(slug: string): Promise<ChapterEvent> {
  const response = await api.get(`/events/public/${slug}`);
  return response.data.event;
}

export async function rsvpPublicEvent(
  slug: string,
  data: { name: string; email: string }
): Promise<{ success: boolean }> {
  const response = await api.post(`/events/public/${slug}/rsvp`, data);
  return response.data;
}

export async function createPublicCheckout(
  slug: string,
  data: { name: string; email: string }
): Promise<{ checkout_url: string }> {
  const response = await api.post(`/events/public/${slug}/checkout`, data);
  return response.data;
}
