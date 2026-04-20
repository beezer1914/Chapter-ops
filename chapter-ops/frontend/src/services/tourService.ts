import api from "@/lib/api";
import type { Role, TourSeen } from "@/types/tour";

export async function fetchTourState(): Promise<TourSeen> {
  const res = await api.get<{ seen: TourSeen }>("/tours/state");
  return res.data.seen;
}

export async function markTourSeen(tourId: string, role: Role): Promise<TourSeen> {
  const res = await api.patch<{ seen: TourSeen }>("/tours/state", {
    tour_id: tourId,
    role,
  });
  return res.data.seen;
}

export async function resetTourState(): Promise<TourSeen> {
  const res = await api.post<{ seen: TourSeen }>("/tours/reset");
  return res.data.seen;
}
