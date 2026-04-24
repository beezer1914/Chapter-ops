import api from "@/lib/api";
import type {
  ChapterRequest,
  SubmitChapterRequestPayload,
} from "@/types/chapterRequest";

interface ChapterApprovedResponse {
  success: true;
  chapter: { id: string; name: string; [k: string]: unknown };
  request: ChapterRequest;
}

export async function submitChapterRequest(
  payload: SubmitChapterRequestPayload
): Promise<ChapterRequest> {
  const { data } = await api.post<{ success: true; request: ChapterRequest }>(
    "/onboarding/chapter-requests",
    payload
  );
  return data.request;
}

export async function fetchMyChapterRequest(): Promise<ChapterRequest | null> {
  const { data } = await api.get<{ request: ChapterRequest | null }>(
    "/onboarding/chapter-requests/mine"
  );
  return data.request;
}

export async function cancelMyChapterRequest(requestId: string): Promise<void> {
  await api.delete(`/onboarding/chapter-requests/${requestId}`);
}

export async function fetchPendingChapterRequests(): Promise<ChapterRequest[]> {
  const { data } = await api.get<{ requests: ChapterRequest[] }>(
    "/chapter-requests/pending"
  );
  return data.requests;
}

export async function approveChapterRequest(
  requestId: string
): Promise<ChapterApprovedResponse> {
  const { data } = await api.post<ChapterApprovedResponse>(
    `/chapter-requests/${requestId}/approve`
  );
  return data;
}

export async function rejectChapterRequest(
  requestId: string,
  reason: string
): Promise<ChapterRequest> {
  const { data } = await api.post<{ success: true; request: ChapterRequest }>(
    `/chapter-requests/${requestId}/reject`,
    { reason }
  );
  return data.request;
}
