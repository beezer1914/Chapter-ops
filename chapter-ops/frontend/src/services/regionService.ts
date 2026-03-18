import api from "@/lib/api";
import type {
  RegionWithStats,
  RegionDetail,
  RegionMembershipWithUser,
  UpdateRegionRequest,
  AssignRegionMemberRequest,
  UpdateRegionMemberRequest,
  MemberUser,
  Region,
  OrgDirectoryResult,
  OrgDirectoryMemberDetail,
} from "@/types";

export async function fetchRegions(): Promise<{
  regions: RegionWithStats[];
  is_org_admin: boolean;
  is_regional_director: boolean;
}> {
  const response = await api.get("/regions");
  return response.data;
}

export async function fetchRegionDetail(
  regionId: string,
): Promise<RegionDetail> {
  const response = await api.get(`/regions/${regionId}`);
  return response.data;
}

export async function updateRegion(
  regionId: string,
  data: UpdateRegionRequest,
): Promise<Region> {
  const response = await api.put(`/regions/${regionId}`, data);
  return response.data.region;
}

export async function fetchRegionMembers(
  regionId: string,
): Promise<RegionMembershipWithUser[]> {
  const response = await api.get(`/regions/${regionId}/members`);
  return response.data.members;
}

export async function assignRegionMember(
  regionId: string,
  data: AssignRegionMemberRequest,
): Promise<RegionMembershipWithUser> {
  const response = await api.post(`/regions/${regionId}/members`, data);
  return response.data.membership;
}

export async function updateRegionMember(
  regionId: string,
  membershipId: string,
  data: UpdateRegionMemberRequest,
): Promise<RegionMembershipWithUser> {
  const response = await api.patch(
    `/regions/${regionId}/members/${membershipId}`,
    data,
  );
  return response.data.membership;
}

export async function removeRegionMember(
  regionId: string,
  membershipId: string,
): Promise<void> {
  await api.delete(`/regions/${regionId}/members/${membershipId}`);
}

export async function reassignChapter(
  regionId: string,
  chapterId: string,
): Promise<void> {
  await api.patch(`/regions/${regionId}/chapters/${chapterId}`);
}

export async function searchEligibleUsers(
  regionId: string,
  query: string,
): Promise<MemberUser[]> {
  const response = await api.get(`/regions/${regionId}/users`, {
    params: { q: query },
  });
  return response.data.users;
}

export async function searchDirectory(query: string): Promise<OrgDirectoryResult> {
  const response = await api.get("/regions/directory", { params: { q: query } });
  return response.data;
}

export async function fetchDirectoryMemberDetail(
  userId: string,
  chapterId: string,
): Promise<OrgDirectoryMemberDetail> {
  const response = await api.get(`/regions/directory/members/${userId}`, {
    params: { chapter_id: chapterId },
  });
  return response.data.member;
}
