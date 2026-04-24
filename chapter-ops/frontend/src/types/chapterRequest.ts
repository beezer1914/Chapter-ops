export type ChapterRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type ChapterRequestApproverScope = "org_admin" | "platform_admin";

export type ChapterRequestFounderRole =
  | "member"
  | "secretary"
  | "treasurer"
  | "vice_president"
  | "president";

export interface ChapterRequest {
  id: string;
  requester_user_id: string;
  requester_name: string | null;
  requester_email: string | null;
  organization_id: string;
  organization_name: string | null;
  region_id: string;
  region_name: string | null;
  name: string;
  designation: string | null;
  chapter_type: "undergraduate" | "graduate";
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  founder_role: ChapterRequestFounderRole;
  status: ChapterRequestStatus;
  approver_scope: ChapterRequestApproverScope;
  approved_by_user_id: string | null;
  rejected_reason: string | null;
  resulting_chapter_id: string | null;
  acted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitChapterRequestPayload {
  organization_id: string;
  region_id: string;
  name: string;
  designation?: string;
  chapter_type: "undergraduate" | "graduate";
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  founder_role: ChapterRequestFounderRole;
}
