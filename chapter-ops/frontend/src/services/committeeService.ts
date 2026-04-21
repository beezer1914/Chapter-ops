import api from "@/lib/api";
import type { Committee, Expense } from "@/types";

export async function fetchCommittees(includeInactive = false): Promise<Committee[]> {
  const params = includeInactive ? { include_inactive: "true" } : {};
  const res = await api.get<{ committees: Committee[] }>("/committees", { params });
  return res.data.committees;
}

export async function createCommittee(data: {
  name: string;
  description?: string;
  budget_amount?: number;
  chair_user_id?: string | null;
}): Promise<Committee> {
  const res = await api.post<{ committee: Committee }>("/committees", data);
  return res.data.committee;
}

export async function updateCommittee(
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    budget_amount: number;
    chair_user_id: string | null;
    is_active: boolean;
  }>
): Promise<Committee> {
  const res = await api.put<{ committee: Committee }>(`/committees/${id}`, data);
  return res.data.committee;
}

export async function deleteCommittee(id: string): Promise<void> {
  await api.delete(`/committees/${id}`);
}

export interface CommitteeStats {
  committee: Committee;
  budget: string;
  spent: string;
  pending: string;
  remaining: string;
  over_budget: boolean;
  utilization_rate: number;
  recent_expenses: Expense[];
}

export async function fetchCommitteeStats(id: string): Promise<CommitteeStats> {
  const res = await api.get<CommitteeStats>(`/committees/${id}/stats`);
  return res.data;
}
