// ============================================================================
// Auth types
// ============================================================================

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  profile_picture_url: string | null;
  active: boolean;
  active_chapter_id: string | null;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  invite_code?: string;
  initiation_date?: string;
}

export interface AuthResponse {
  success: boolean;
  user: User;
}

// ============================================================================
// Onboarding types
// ============================================================================

export interface CreateOrganizationRequest {
  name: string;
  abbreviation: string;
  org_type: "fraternity" | "sorority";
  greek_letters?: string;
  council?: string;
  founded_year?: number;
  motto?: string;
  website?: string;
}

export interface CreateRegionRequest {
  organization_id: string;
  name: string;
  abbreviation?: string;
  description?: string;
}

export interface CreateChapterRequest {
  organization_id: string;
  region_id: string;
  name: string;
  chapter_type: "undergraduate" | "graduate";
  designation?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
}

// ============================================================================
// Config types
// ============================================================================

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  required: boolean;
}

// ============================================================================
// Branding types
// ============================================================================

export interface ColorPalette {
  light: string;
  main: string;
  dark: string;
}

export interface BrandColors {
  primary: ColorPalette;
  secondary: ColorPalette;
  accent: ColorPalette;
}

export interface Typography {
  heading_font: string;
  body_font: string;
  font_source: "google" | "system";
}

export interface BrandingConfig {
  favicon_url?: string | null;
  colors?: BrandColors;
  typography?: Typography;
}

export interface ResolvedBranding {
  logo_url: string | null;
  favicon_url: string | null;
  colors: BrandColors;
  typography: Typography;
  custom_css: string | null;
}

export interface OrganizationConfig {
  role_titles?: Record<string, string>;
  custom_member_fields?: CustomFieldDefinition[];
  branding?: BrandingConfig;
}

export interface FeeType {
  id: string;
  label: string;
  default_amount: number;
}

export interface ChapterSettings {
  default_dues_amount?: number;
  fiscal_year_start_month?: number;
  payment_deadline_day?: number;
  allow_payment_plans?: boolean;
}

export interface ChapterConfig {
  fee_types?: FeeType[];
  settings?: ChapterSettings;
  branding?: BrandingConfig & { enabled?: boolean };
}

// ============================================================================
// Organization types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  abbreviation: string;
  greek_letters: string | null;
  org_type: "fraternity" | "sorority";
  council: string | null;
  founded_year: number | null;
  motto: string | null;
  logo_url: string | null;
  website: string | null;
  active: boolean;
  config: OrganizationConfig;
  created_at: string;
}

// ============================================================================
// Region types
// ============================================================================

export interface Region {
  id: string;
  organization_id: string;
  name: string;
  abbreviation: string | null;
  description: string | null;
  active: boolean;
  config: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// Region management types
// ============================================================================

export type RegionRole =
  | "member"
  | "regional_director"
  | "regional_1st_vice"
  | "regional_2nd_vice"
  | "regional_secretary"
  | "regional_treasurer";

export interface RegionMembership {
  id: string;
  user_id: string;
  region_id: string;
  role: RegionRole;
  active: boolean;
  join_date: string;
  created_at: string;
}

export interface RegionMembershipWithUser extends RegionMembership {
  user: MemberUser;
}

export interface RegionWithStats extends Region {
  chapter_count: number;
  member_count: number;
}

export interface ChapterWithMemberCount extends Chapter {
  member_count: number;
}

export interface RegionDetail {
  region: Region;
  chapters: ChapterWithMemberCount[];
  members: RegionMembershipWithUser[];
  is_org_admin: boolean;
  current_user_region_role: RegionRole | null;
}

export interface RegionsListResponse {
  regions: RegionWithStats[];
  is_org_admin: boolean;
}

export interface OrgDirectoryChapter {
  id: string;
  name: string;
  abbreviation: string | null;
  member_count: number;
}

export interface OrgDirectoryMember {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  profile_picture_url: string | null;
  chapter_name: string;
  chapter_id: string;
  role: string;
  financial_status: string;
}

export interface OrgDirectoryResult {
  chapters: OrgDirectoryChapter[];
  members: OrgDirectoryMember[];
}

export interface OrgDirectoryMemberDetail {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  profile_picture_url: string | null;
  created_at: string | null;
  chapter_name: string;
  chapter_id: string;
  chapter_designation: string | null;
  chapter_city: string | null;
  chapter_state: string | null;
  role: string;
  financial_status: string;
  initiation_date: string | null;
  join_date: string | null;
  custom_fields: Record<string, unknown>;
  custom_field_definitions: { key: string; label: string; type: string; required: boolean }[];
}

export interface UpdateRegionRequest {
  name?: string;
  abbreviation?: string;
  description?: string;
}

export interface AssignRegionMemberRequest {
  user_id: string;
  role: RegionRole;
}

export interface UpdateRegionMemberRequest {
  role: RegionRole;
}

// ============================================================================
// Chapter types
// ============================================================================

export interface Chapter {
  id: string;
  organization_id: string;
  region_id: string | null;
  name: string;
  designation: string | null;
  chapter_type: "undergraduate" | "graduate";
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  active: boolean;
  logo_url: string | null;
  stripe_onboarding_complete: boolean;
  subscription_tier: "starter" | "pro" | "elite" | "organization";
  config: ChapterConfig;
  created_at: string;
}

// ============================================================================
// Membership types
// ============================================================================

export type MemberRole =
  | "member"
  | "secretary"
  | "treasurer"
  | "vice_president"
  | "president"
  | "admin"
  | "regional_director"
  | "regional_1st_vice";

export type FinancialStatus =
  | "financial"
  | "not_financial"
  | "neophyte"
  | "exempt";

export type MemberType = "collegiate" | "graduate" | "life";

export interface ChapterMembership {
  id: string;
  user_id: string;
  chapter_id: string;
  role: MemberRole;
  financial_status: FinancialStatus;
  member_type: MemberType;
  is_intake_officer: boolean;
  big_id: string | null;
  line_season: string | null;
  line_number: number | null;
  line_name: string | null;
  initiation_date: string | null;
  join_date: string;
  active: boolean;
  custom_fields: Record<string, string | number | null>;
  created_at: string;
}

export interface UserWithMembership extends User {
  membership?: ChapterMembership;
}

// ============================================================================
// Payment types
// ============================================================================

export interface Payment {
  id: string;
  chapter_id: string;
  user_id: string;
  amount: string;
  payment_type: "one-time" | "installment";
  method: string;
  notes: string | null;
  fee_type_id: string | null;
  plan_id: string | null;
  created_at: string;
}

export interface PaymentPlan {
  id: string;
  chapter_id: string;
  user_id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  start_date: string;
  end_date: string;
  total_amount: string;
  installment_amount: string;
  status: "active" | "completed" | "cancelled";
  expected_installments: number | null;
  total_paid: string;
  is_complete: boolean;
  created_at: string;
}

// ============================================================================
// Invite types
// ============================================================================

export interface InviteCode {
  id: string;
  chapter_id: string;
  code: string;
  role: MemberRole;
  used: boolean;
  used_by: string | null;
  created_by: string;
  created_by_name: string;
  used_by_name?: string;
  expires_at: string | null;
  used_at: string | null;
  is_valid: boolean;
  created_at: string;
}

export interface CreateInviteRequest {
  role?: MemberRole;
  expires_in_days?: number;
}

// ============================================================================
// Member roster types
// ============================================================================

export interface MemberUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
}

export interface MemberWithUser extends ChapterMembership {
  user: MemberUser;
}

export interface UpdateMemberRequest {
  role?: MemberRole;
  financial_status?: FinancialStatus;
  member_type?: MemberType;
  is_intake_officer?: boolean;
  custom_fields?: Record<string, string | number | null>;
}

// ============================================================================
// Intake / MIP types
// ============================================================================

export type IntakeStage =
  | "interested"
  | "applied"
  | "under_review"
  | "chapter_vote"
  | "national_submission"
  | "approved"
  | "crossed";

export type IntakeDocType =
  | "transcript"
  | "background_check"
  | "recommendation"
  | "other";

export interface IntakeCandidate {
  id: string;
  chapter_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  stage: IntakeStage;
  semester: string | null;
  gpa: number | null;
  notes: string | null;
  assigned_to_id: string | null;
  assigned_to: { id: string; full_name: string } | null;
  line_name: string | null;
  line_number: number | null;
  crossed_at: string | null;
  user_id: string | null;
  invite_code_id: string | null;
  active: boolean;
  document_count: number;
  documents?: IntakeDocument[];
  created_at: string;
}

export interface IntakeDocument {
  id: string;
  chapter_id: string;
  candidate_id: string;
  uploaded_by_id: string;
  uploader: { id: string; full_name: string } | null;
  document_type: IntakeDocType;
  title: string;
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface IntakePipelineResponse {
  candidates: IntakeCandidate[];
  by_stage: Record<IntakeStage, IntakeCandidate[]>;
  stages: IntakeStage[];
}

export interface CreateCandidateRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  stage?: IntakeStage;
  semester?: string;
  gpa?: number;
  notes?: string;
  assigned_to_id?: string;
}

export interface UpdateCandidateRequest {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  stage?: IntakeStage;
  semester?: string;
  gpa?: number | null;
  notes?: string;
  assigned_to_id?: string | null;
  line_name?: string;
  line_number?: number | null;
}

export interface CrossCandidateRequest {
  line_name?: string;
  line_number?: number;
}

export interface CrossCandidateResponse {
  success: boolean;
  candidate: IntakeCandidate;
  invite_code: string;
  message: string;
}

// ============================================================================
// Payment extended types (with user info from API)
// ============================================================================

export interface PaymentWithUser extends Payment {
  user: MemberUser;
}

export interface PaymentPlanWithUser extends PaymentPlan {
  user: MemberUser;
  payments?: Payment[];
}

export interface CreatePaymentRequest {
  user_id: string;
  amount: number;
  method: string;
  payment_type?: "one-time" | "installment";
  fee_type_id?: string;
  notes?: string;
  plan_id?: string;
}

export interface CreatePaymentPlanRequest {
  user_id: string;
  frequency: "weekly" | "biweekly" | "monthly";
  start_date: string;
  end_date: string;
  total_amount: number;
  expected_installments: number;
}

export interface PaymentSummary {
  total_collected: string;
  total_this_month: string;
  by_method: Record<string, string>;
}

// ============================================================================
// Donation types
// ============================================================================

export interface Donation {
  id: string;
  chapter_id: string;
  donor_name: string;
  donor_email: string | null;
  amount: string;
  method: string;
  notes: string | null;
  user_id: string | null;
  created_at: string;
}

export interface DonationWithUser extends Donation {
  user?: { id: string; full_name: string; email: string };
}

export interface CreateDonationRequest {
  donor_name: string;
  donor_email?: string;
  amount: number;
  method: string;
  notes?: string;
  user_id?: string;
}

// ============================================================================
// API response wrappers
// ============================================================================

export interface ApiError {
  error: string;
}

export interface ApiSuccess {
  success: boolean;
}

// ============================================================================
// Workflow types
// ============================================================================

export type WorkflowTriggerType =
  | "document"
  | "expense"
  | "event"
  | "member_application";

export type WorkflowStatus =
  | "pending"
  | "in_progress"
  | "approved"
  | "rejected"
  | "cancelled";

export type WorkflowApproverType = "role" | "specific_user";

export type WorkflowStepStatus =
  | "pending"
  | "waiting"
  | "in_progress"
  | "approved"
  | "rejected"
  | "skipped";

export interface WorkflowCondition {
  field: string;
  operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
  value: number | string;
}

export interface WorkflowCompletionAction {
  type:
    | "notify_submitter"
    | "update_trigger_status"
    | "trigger_workflow"
    | "webhook"
    | "notify_role";
  [key: string]: unknown;
}

export interface WorkflowStep {
  id: string;
  template_id: string;
  step_order: number;
  name: string;
  description: string | null;
  parallel_group: string | null;
  approver_type: WorkflowApproverType;
  approver_role: string | null;
  approver_user_id: string | null;
  condition_json: WorkflowCondition | null;
  is_required: boolean;
  created_at: string;
}

export interface WorkflowTemplate {
  id: string;
  organization_id: string;
  chapter_id: string | null;
  created_by: string;
  name: string;
  description: string | null;
  trigger_type: WorkflowTriggerType;
  is_active: boolean;
  completion_actions: WorkflowCompletionAction[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateWithStats extends WorkflowTemplate {
  step_count: number;
  active_instance_count: number;
}

export interface WorkflowTemplateDetail extends WorkflowTemplate {
  steps: WorkflowStep[];
  step_count: number;
  active_instance_count: number;
}

export interface WorkflowStepInstance {
  id: string;
  instance_id: string;
  step_id: string;
  status: WorkflowStepStatus;
  assigned_to_role: string | null;
  assigned_to_user_id: string | null;
  action_taken_by: string | null;
  action_taken_at: string | null;
  comments: string | null;
  created_at: string;
  step?: WorkflowStep;
}

export interface WorkflowInstance {
  id: string;
  template_id: string;
  chapter_id: string;
  initiated_by: string;
  trigger_type: WorkflowTriggerType;
  trigger_id: string;
  trigger_metadata: Record<string, unknown>;
  trigger_title?: string;
  status: WorkflowStatus;
  completed_at: string | null;
  created_at: string;
}

export interface WorkflowInstanceDetail extends WorkflowInstance {
  step_instances: WorkflowStepInstance[];
  template: WorkflowTemplate;
}

// ── Request types ─────────────────────────────────────────────────────────────

export interface CreateWorkflowTemplateRequest {
  name: string;
  description?: string;
  trigger_type: WorkflowTriggerType;
  chapter_id?: string | null;
  completion_actions?: WorkflowCompletionAction[];
}

export interface UpdateWorkflowTemplateRequest {
  name?: string;
  description?: string;
  trigger_type?: WorkflowTriggerType;
  is_active?: boolean;
  completion_actions?: WorkflowCompletionAction[];
}

export interface AddWorkflowStepRequest {
  name: string;
  description?: string;
  step_order?: number;
  parallel_group?: string | null;
  approver_type: WorkflowApproverType;
  approver_role?: string | null;
  approver_user_id?: string | null;
  condition_json?: WorkflowCondition | null;
  is_required?: boolean;
}

export interface UpdateWorkflowStepRequest
  extends Partial<AddWorkflowStepRequest> {}

export interface ReorderStepsRequest {
  steps: Array<{ id: string; step_order: number }>;
}

export interface StartWorkflowRequest {
  template_id: string;
  trigger_type: WorkflowTriggerType;
  trigger_id: string;
  trigger_metadata?: Record<string, unknown>;
}

export interface StepActionRequest {
  action: "approve" | "reject";
  comments?: string;
}

// ============================================================================
// Stripe Connect types
// ============================================================================

export interface StripeAccountStatus {
  connected: boolean;
  stripe_account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  display_name?: string;
}

export interface StripeDuesCheckoutRequest {
  amount: number;
  fee_type_id?: string;
  notes?: string;
  invoice_id?: string;
}

export interface StripeDonationCheckoutRequest {
  amount: number;
  donor_name?: string;
  donor_email?: string;
  notes?: string;
}

// ============================================================================
// File Upload types
// ============================================================================

export interface FileUploadResponse {
  success: boolean;
  url: string;
  user?: User;
  chapter?: Chapter;
  organization?: Organization;
}

// ============================================================================
// Notification types
// ============================================================================

export type NotificationType = "payment" | "workflow" | "member" | "invite" | "event";

export interface Notification {
  id: string;
  chapter_id: string;
  recipient_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnreadCountResponse {
  unread_count: number;
}

// ============================================================================
// Chapter Transfer Request types
// ============================================================================

export type TransferStatus =
  | "pending"
  | "approved_by_from"
  | "approved"
  | "denied";

// ============================================================================
// Event types
// ============================================================================

export type EventType = "social" | "fundraiser" | "community_service";
export type EventStatus = "draft" | "published" | "cancelled";
export type RsvpStatus = "going" | "not_going" | "maybe";
export type AttendancePaymentStatus = "free" | "pending" | "paid";

export interface ChapterEvent {
  id: string;
  chapter_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  event_type: EventType;
  start_datetime: string;
  end_datetime: string | null;
  location: string | null;
  capacity: number | null;
  is_paid: boolean;
  ticket_price: string | null;
  is_public: boolean;
  public_slug: string | null;
  status: EventStatus;
  service_hours: string | null;
  banner_image_url: string | null;
  created_at: string;
  updated_at: string;
  // Enriched fields
  attendee_count?: number;
  my_attendance?: EventAttendance | null;
  chapter_name?: string;
  workflow_instance_id?: string | null;
}

export interface EventAttendance {
  id: string;
  event_id: string;
  chapter_id: string;
  user_id: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  rsvp_status: RsvpStatus;
  checked_in: boolean;
  checked_in_at: string | null;
  payment_status: AttendancePaymentStatus;
  stripe_session_id: string | null;
  ticket_price_paid: string | null;
  notes: string | null;
  created_at: string;
  // Enriched
  user?: {
    id: string;
    full_name: string;
    email: string;
    profile_picture_url: string | null;
  };
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  event_type: EventType;
  start_datetime: string;
  end_datetime?: string;
  location?: string;
  capacity?: number;
  is_paid?: boolean;
  ticket_price?: number;
  is_public?: boolean;
  status?: EventStatus;
  service_hours?: number;
}

// ============================================================================
// Communications types
// ============================================================================

export interface Announcement {
  id: string;
  chapter_id: string;
  created_by_id: string;
  author: {
    id: string;
    first_name: string;
    last_name: string;
    profile_picture_url: string | null;
  } | null;
  title: string;
  body: string;
  is_pinned: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementRequest {
  title: string;
  body: string;
  is_pinned?: boolean;
  expires_at?: string | null;
}

export type EmailBlastAudience =
  | "all"
  | "financial"
  | "not_financial"
  | "member"
  | "secretary"
  | "treasurer"
  | "vice_president"
  | "president";

export interface EmailBlastRequest {
  subject: string;
  body: string;
  audience: EmailBlastAudience;
}

export interface EmailBlastResult {
  sent: number;
  failed: number;
  total: number;
}

export interface ChapterTransferRequest {
  id: string;
  requesting_user_id: string;
  requesting_user_name: string;
  from_chapter_id: string;
  from_chapter_name: string;
  to_chapter_id: string;
  to_chapter_name: string;
  reason: string | null;
  status: TransferStatus;
  from_chapter_approved_by: string | null;
  from_chapter_approved_at: string | null;
  to_chapter_approved_by: string | null;
  to_chapter_approved_at: string | null;
  denied_by: string | null;
  denied_at: string | null;
  denial_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTransferRequest {
  to_chapter_id: string;
  reason?: string;
}

export interface DenyTransferRequest {
  reason?: string;
}

// ============================================================================
// Document Vault
// ============================================================================

export type DocumentCategory = "minutes" | "bylaws" | "financials" | "forms" | "other";

export interface Document {
  id: string;
  chapter_id: string;
  uploaded_by_id: string;
  uploader: {
    id: string;
    first_name: string;
    last_name: string;
    profile_picture_url: string | null;
  } | null;
  title: string;
  description: string | null;
  category: DocumentCategory;
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
  workflow_instance_id?: string;
}

export interface UploadDocumentRequest {
  title: string;
  description?: string;
  category: DocumentCategory;
  file: File;
}

export interface UpdateDocumentRequest {
  title?: string;
  description?: string;
  category?: DocumentCategory;
}

// ============================================================================
// Region Dashboard types
// ============================================================================

export interface RegionDashboardChapter {
  id: string;
  name: string;
  abbreviation: string | null;
  member_count: number;
}

export interface RegionDashboardRegion {
  id: string;
  name: string;
  abbreviation: string | null;
  description: string | null;
  chapter_count: number;
  total_members: number;
  chapters: RegionDashboardChapter[];
}

export interface RegionDashboardData {
  regions: RegionDashboardRegion[];
  total_regions: number;
  total_chapters: number;
  total_members: number;
}

// ============================================================================
// Knowledge Base
// ============================================================================

export type KbCategory = "general" | "policy" | "procedure" | "faq" | "how_to";
export type KbScope = "organization" | "chapter";
export type KbStatus = "draft" | "published" | "archived";

export interface KnowledgeArticle {
  id: string;
  scope: KbScope;
  organization_id: string;
  chapter_id: string | null;
  created_by_id: string;
  author: {
    id: string;
    first_name: string;
    last_name: string;
    profile_picture_url: string | null;
  } | null;
  article_number: string;
  title: string;
  body?: string;
  category: KbCategory;
  status: KbStatus;
  is_featured: boolean;
  view_count: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateArticleRequest {
  title: string;
  body: string;
  category: KbCategory;
  scope: KbScope;
  status: KbStatus;
  is_featured?: boolean;
  tags?: string[];
}

export interface UpdateArticleRequest {
  title?: string;
  body?: string;
  category?: KbCategory;
  status?: KbStatus;
  is_featured?: boolean;
  tags?: string[];
}

// ============================================================================
// Expense types
// ============================================================================

export type ExpenseCategory =
  | "travel"
  | "supplies"
  | "equipment"
  | "food_beverage"
  | "venue"
  | "other";

export type ExpenseStatus = "pending" | "approved" | "paid" | "denied";

export interface Expense {
  id: string;
  chapter_id: string;
  submitted_by_id: string;
  submitted_by: { id: string; full_name: string; email: string } | null;
  title: string;
  amount: string;
  category: ExpenseCategory;
  category_label: string;
  expense_date: string;
  notes: string | null;
  status: ExpenseStatus;
  reviewer_id: string | null;
  reviewer: { id: string; full_name: string } | null;
  reviewed_at: string | null;
  denial_reason: string | null;
  paid_at: string | null;
  receipt_url: string | null;
  receipt_name: string | null;
  receipt_size: number | null;
  receipt_mime: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSummary {
  pending_count: number;
  pending_amount: string;
  approved_amount: string;
  paid_amount: string;
}

export interface ExpenseListResponse {
  expenses: Expense[];
  is_officer: boolean;
  summary: ExpenseSummary | null;
}

export interface CreateExpenseRequest {
  title: string;
  amount: number;
  category: ExpenseCategory;
  expense_date: string;
  notes?: string;
}

export interface UpdateExpenseRequest {
  title?: string;
  amount?: number;
  category?: ExpenseCategory;
  expense_date?: string;
  notes?: string;
  action?: "approve" | "deny" | "mark_paid" | "reopen";
  denial_reason?: string;
}

// ============================================================================
// Lineage & Chapter History types
// ============================================================================

export type MilestoneType =
  | "founding"
  | "charter"
  | "recharter"
  | "suspended"
  | "reactivated"
  | "award"
  | "achievement"
  | "other";

export interface ChapterMilestone {
  id: string;
  chapter_id: string;
  created_by_id: string;
  created_by: { id: string; full_name: string } | null;
  title: string;
  description: string | null;
  milestone_type: MilestoneType;
  milestone_type_label: string;
  date: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface LineageMember {
  membership_id: string;
  user_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  role: MemberRole;
  member_type: MemberType;
  initiation_date: string | null;
  big_id: string | null;
  line_season: string | null;
  line_number: number | null;
  line_name: string | null;
}

export interface LineageResponse {
  members: LineageMember[];
  lines: Record<string, LineageMember[]>;
}

export interface MilestonesResponse {
  milestones: ChapterMilestone[];
}

export interface UpdateLineageRequest {
  big_id?: string | null;
  line_season?: string | null;
  line_number?: number | null;
  line_name?: string | null;
}

export interface CreateMilestoneRequest {
  title: string;
  date: string;
  milestone_type: MilestoneType;
  description?: string;
  is_public?: boolean;
}

export interface UpdateMilestoneRequest {
  title?: string;
  date?: string;
  milestone_type?: MilestoneType;
  description?: string;
  is_public?: boolean;
}

// ============================================================================
// Invoice types
// ============================================================================

export type InvoiceScope = "member" | "chapter";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface Invoice {
  id: string;
  scope: InvoiceScope;
  chapter_id: string | null;
  billed_user_id: string | null;
  fee_type_id: string | null;
  region_id: string | null;
  billed_chapter_id: string | null;
  per_member_rate: string | null;
  member_count: number | null;
  invoice_number: string;
  description: string;
  amount: string;
  status: InvoiceStatus;
  due_date: string;
  sent_at: string | null;
  paid_at: string | null;
  notes: string | null;
  payment_id: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithUser extends Invoice {
  billed_user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface InvoiceWithChapter extends Invoice {
  billed_chapter?: {
    id: string;
    name: string;
    designation: string;
  };
}

export interface ChapterBillInvoice extends Invoice {
  region?: {
    id: string;
    name: string;
  };
}

export interface CreateInvoiceRequest {
  billed_user_id: string;
  amount: number;
  description: string;
  due_date: string;
  fee_type_id?: string;
  notes?: string;
}

export interface BulkCreateInvoiceRequest {
  amount: number;
  description: string;
  due_date: string;
  fee_type_id?: string;
  notes?: string;
  user_ids?: string[];
  exclude_statuses?: string[];
}

export interface CreateRegionalInvoiceRequest {
  billed_chapter_id: string;
  description: string;
  due_date: string;
  per_member_rate?: number;
  amount?: number;
  notes?: string;
}

export interface BulkRegionalInvoiceRequest {
  per_member_rate: number;
  description: string;
  due_date: string;
  notes?: string;
}

// ============================================================================
// Service Hours types
// ============================================================================

export interface MemberServiceHours {
  user_id: string;
  full_name: string;
  profile_picture_url: string | null;
  total_hours: number;
  events_count: number;
  events: {
    id: string;
    title: string;
    date: string;
    hours: number;
    checked_in: boolean;
  }[];
}

export interface ServiceHoursReport {
  chapter_total_hours: number;
  total_events: number;
  members: MemberServiceHours[];
  available_years: number[];
}

export interface InvoiceSummary {
  total_invoiced: string;
  total_count: number;
  by_status: Record<string, { count: number; amount: string }>;
}
