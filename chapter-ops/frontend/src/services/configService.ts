import api from "@/lib/api";
import type { OrganizationConfig, ChapterConfig, Organization, Chapter } from "@/types";

export interface ConfigResponse {
  organization_config: OrganizationConfig;
  chapter_config: ChapterConfig;
  organization_id: string;
  chapter_id: string;
  organization: Organization;
  chapter: Chapter;
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const response = await api.get("/config");
  return response.data;
}

export async function updateOrgConfig(
  data: Partial<OrganizationConfig>
): Promise<OrganizationConfig> {
  const response = await api.put("/config/organization", data);
  return response.data.organization_config;
}

export async function updateChapterConfig(
  data: Partial<ChapterConfig>
): Promise<ChapterConfig> {
  const response = await api.put("/config/chapter", data);
  return response.data.chapter_config;
}
