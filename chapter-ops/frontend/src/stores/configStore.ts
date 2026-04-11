import { create } from "zustand";
import type {
  OrganizationConfig,
  ChapterConfig,
  CustomFieldDefinition,
  FeeType,
  IntakeStageConfig,
  IntakeDocTypeConfig,
  MemberRole,
  Organization,
  Chapter,
} from "@/types";
import { fetchConfig } from "@/services/configService";
import { useBrandingStore } from "@/stores/brandingStore";

const DEFAULT_ROLE_LABELS: Record<string, string> = {
  president: "President",
  vice_president: "Vice President",
  treasurer: "Treasurer",
  secretary: "Secretary",
  member: "Member",
  admin: "Admin",
};

interface ConfigState {
  orgConfig: OrganizationConfig;
  chapterConfig: ChapterConfig;
  organizationId: string | null;
  chapterId: string | null;
  organization: Organization | null;
  chapter: Chapter | null;
  isLoaded: boolean;

  loadConfig: () => Promise<void>;
  setOrgConfig: (config: OrganizationConfig) => void;
  setChapterConfig: (config: ChapterConfig) => void;
  getRoleLabel: (role: MemberRole) => string;
  getFeeTypes: () => FeeType[];
  getCustomFields: () => CustomFieldDefinition[];
  getIntakeStages: () => IntakeStageConfig[];
  getIntakeDocTypes: () => IntakeDocTypeConfig[];
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  orgConfig: {},
  chapterConfig: {},
  organizationId: null,
  chapterId: null,
  organization: null,
  chapter: null,
  isLoaded: false,

  loadConfig: async () => {
    try {
      const data = await fetchConfig();
      set({
        orgConfig: data.organization_config,
        chapterConfig: data.chapter_config,
        organizationId: data.organization_id,
        chapterId: data.chapter_id,
        organization: data.organization,
        chapter: data.chapter,
        isLoaded: true,
      });

      // Initialize branding after config is loaded
      useBrandingStore.getState().initializeBranding(
        data.organization_config,
        data.chapter_config
      );
    } catch {
      // Config load failure is non-fatal — use defaults
      set({ isLoaded: true });

      // Initialize with default branding
      useBrandingStore.getState().initializeBranding(undefined, undefined);
    }
  },

  setOrgConfig: (config) => set({ orgConfig: config }),
  setChapterConfig: (config) => set({ chapterConfig: config }),

  getRoleLabel: (role: MemberRole): string => {
    const { orgConfig } = get();
    return orgConfig.role_titles?.[role] ?? DEFAULT_ROLE_LABELS[role] ?? role;
  },

  getFeeTypes: (): FeeType[] => {
    const { chapterConfig } = get();
    return chapterConfig.fee_types ?? [];
  },

  getCustomFields: (): CustomFieldDefinition[] => {
    const { orgConfig } = get();
    return orgConfig.custom_member_fields ?? [];
  },

  getIntakeStages: (): IntakeStageConfig[] => {
    const { chapterConfig } = get();
    return chapterConfig.intake_stages ?? [
      { id: "interested",          label: "Interested",          color: "slate",   is_terminal: false },
      { id: "applied",             label: "Applied",             color: "sky",     is_terminal: false },
      { id: "under_review",        label: "Under Review",        color: "amber",   is_terminal: false },
      { id: "chapter_vote",        label: "Chapter Vote",        color: "orange",  is_terminal: false },
      { id: "national_submission", label: "National Submission", color: "purple",  is_terminal: false },
      { id: "approved",            label: "Approved",            color: "emerald", is_terminal: false },
      { id: "crossed",             label: "Crossed",             color: "brand",   is_terminal: true  },
    ];
  },

  getIntakeDocTypes: (): IntakeDocTypeConfig[] => {
    const { chapterConfig } = get();
    return chapterConfig.intake_doc_types ?? [
      { id: "transcript",       label: "Transcript" },
      { id: "background_check", label: "Background Check" },
      { id: "recommendation",   label: "Recommendation Letter" },
      { id: "other",            label: "Other" },
    ];
  },
}));
