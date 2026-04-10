import api from "@/lib/api";
import type { ChapterPeriod, ChapterPeriodDues, PeriodType } from "@/types";

export async function fetchPeriods(): Promise<ChapterPeriod[]> {
  const res = await api.get<{ periods: ChapterPeriod[] }>("/periods");
  return res.data.periods;
}

export async function createPeriod(data: {
  name: string;
  period_type: PeriodType;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  notes?: string;
}): Promise<ChapterPeriod> {
  const res = await api.post<{ period: ChapterPeriod }>("/periods", data);
  return res.data.period;
}

export async function updatePeriod(
  id: string,
  data: Partial<{ name: string; period_type: PeriodType; start_date: string; end_date: string; notes: string }>
): Promise<ChapterPeriod> {
  const res = await api.put<{ period: ChapterPeriod }>(`/periods/${id}`, data);
  return res.data.period;
}

export async function deletePeriod(id: string): Promise<void> {
  await api.delete(`/periods/${id}`);
}

export async function activatePeriod(
  id: string,
  options: { rolloverUnpaid?: boolean } = {}
): Promise<{ period: ChapterPeriod; rolloverCount?: number }> {
  const body = options.rolloverUnpaid ? { rollover_unpaid: true } : {};
  const res = await api.post<{ period: ChapterPeriod; rollover_count?: number }>(
    `/periods/${id}/activate`,
    body
  );
  return { period: res.data.period, rolloverCount: res.data.rollover_count };
}

export async function fetchMyDues(
  periodId: string
): Promise<{ dues: ChapterPeriodDues[]; financial_status: string | null }> {
  const res = await api.get<{ dues: ChapterPeriodDues[]; financial_status: string | null }>(
    `/periods/${periodId}/my-dues`
  );
  return { dues: res.data.dues, financial_status: res.data.financial_status };
}

export async function fetchPeriodDues(
  periodId: string,
  userId?: string
): Promise<ChapterPeriodDues[]> {
  const params = userId ? { user_id: userId } : {};
  const res = await api.get<{ dues: ChapterPeriodDues[] }>(`/periods/${periodId}/dues`, { params });
  return res.data.dues;
}

export async function updateDuesRecord(
  periodId: string,
  duesId: string,
  data: Partial<{ amount_owed: number; status: string; notes: string }>
): Promise<ChapterPeriodDues> {
  const res = await api.put<{ dues: ChapterPeriodDues }>(`/periods/${periodId}/dues/${duesId}`, data);
  return res.data.dues;
}
