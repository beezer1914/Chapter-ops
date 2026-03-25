import api from "@/lib/api";
import type {
  LineageResponse,
  MilestonesResponse,
  LineageMember,
  ChapterMilestone,
  UpdateLineageRequest,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
} from "@/types";

export async function fetchLineage(): Promise<LineageResponse> {
  const { data } = await api.get("/lineage");
  return data;
}

export async function updateMemberLineage(
  membershipId: string,
  payload: UpdateLineageRequest
): Promise<LineageMember> {
  const { data } = await api.patch(`/lineage/members/${membershipId}`, payload);
  return data;
}

export async function fetchMilestones(): Promise<MilestonesResponse> {
  const { data } = await api.get("/lineage/milestones");
  return data;
}

export async function createMilestone(
  payload: CreateMilestoneRequest
): Promise<ChapterMilestone> {
  const { data } = await api.post("/lineage/milestones", payload);
  return data;
}

export async function updateMilestone(
  id: string,
  payload: UpdateMilestoneRequest
): Promise<ChapterMilestone> {
  const { data } = await api.patch(`/lineage/milestones/${id}`, payload);
  return data;
}

export async function deleteMilestone(id: string): Promise<void> {
  await api.delete(`/lineage/milestones/${id}`);
}
