import api from "@/lib/api";
import type { ActionItem } from "@/types";

export async function fetchDashboardInbox(): Promise<ActionItem[]> {
  const res = await api.get<{ items: ActionItem[] }>("/dashboard/inbox");
  return res.data.items;
}
