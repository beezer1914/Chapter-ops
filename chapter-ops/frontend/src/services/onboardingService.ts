import api from "@/lib/api";
import type {
  Organization,
  Region,
  CreateOrganizationRequest,
  CreateRegionRequest,
} from "@/types";

export async function fetchOrganizations(): Promise<Organization[]> {
  const response = await api.get<{ organizations: Organization[] }>(
    "/onboarding/organizations"
  );
  return response.data.organizations;
}

export async function createOrganization(
  data: CreateOrganizationRequest
): Promise<Organization> {
  const response = await api.post<{ success: boolean; organization: Organization }>(
    "/onboarding/organizations",
    data
  );
  return response.data.organization;
}

export async function fetchRegions(organizationId: string): Promise<Region[]> {
  const response = await api.get<{ regions: Region[] }>(
    `/onboarding/regions?organization_id=${organizationId}`
  );
  return response.data.regions;
}

export async function createRegion(data: CreateRegionRequest): Promise<Region> {
  const response = await api.post<{ success: boolean; region: Region }>(
    "/onboarding/regions",
    data
  );
  return response.data.region;
}
