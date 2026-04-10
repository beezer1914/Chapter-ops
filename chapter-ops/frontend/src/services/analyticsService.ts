import api from "@/lib/api";
import type { ChapterAnalytics } from "@/types";

export async function fetchChapterAnalytics(periodId?: string): Promise<ChapterAnalytics> {
  const params = periodId ? { period_id: periodId } : {};
  const res = await api.get<ChapterAnalytics>("/analytics/chapter", { params });
  return res.data;
}
