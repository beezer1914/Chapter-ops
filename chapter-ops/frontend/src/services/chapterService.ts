import api from "@/lib/api";
import type {
  InviteCode,
  CreateInviteRequest,
  MemberWithUser,
  UpdateMemberRequest,
} from "@/types";

// ── Members ──────────────────────────────────────────────────────────────────

export async function fetchMembers(): Promise<MemberWithUser[]> {
  const response = await api.get("/members");
  return response.data.members;
}

export async function updateMember(
  membershipId: string,
  data: UpdateMemberRequest
): Promise<MemberWithUser> {
  const response = await api.patch(`/members/${membershipId}`, data);
  return response.data.member;
}

export async function deactivateMember(membershipId: string): Promise<void> {
  await api.delete(`/members/${membershipId}`);
}

export async function suspendMember(membershipId: string, reason?: string): Promise<MemberWithUser> {
  const response = await api.post(`/members/${membershipId}/suspend`, { reason: reason ?? "" });
  return response.data.member;
}

export async function unsuspendMember(membershipId: string): Promise<MemberWithUser> {
  const response = await api.post(`/members/${membershipId}/unsuspend`);
  return response.data.member;
}

// ── Invites ──────────────────────────────────────────────────────────────────

export async function fetchInvites(): Promise<InviteCode[]> {
  const response = await api.get("/invites");
  return response.data.invites;
}

export async function createInvite(
  data: CreateInviteRequest
): Promise<InviteCode> {
  const response = await api.post("/invites", data);
  return response.data.invite;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await api.delete(`/invites/${inviteId}`);
}
