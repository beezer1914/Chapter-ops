/** Response shape for GET /api/platform/dashboard */
export interface PlatformDashboardData {
  summary: {
    organizations: { total: number; new_30d: number };
    chapters:      { total: number; new_30d: number };
    members:       { total: number; new_30d: number };
    dues_ytd:      string;
  };
  tier_breakdown: {
    organizations: TierCount[];
    chapters:      TierCount[];
  };
  top_chapters_by_dues: TopChapterRow[];
}

export interface TierCount {
  tier: string;
  count: number;
}

export interface TopChapterRow {
  id: string;
  name: string;
  organization_name: string;
  dues_ytd: string;
}
