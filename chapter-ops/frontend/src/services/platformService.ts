import api from "@/lib/api";
import type { PlatformDashboardData } from "@/types/platform";

export async function fetchPlatformDashboard(): Promise<PlatformDashboardData> {
  const { data } = await api.get<PlatformDashboardData>("/platform/dashboard");
  return data;
}
