export const TOUR_TARGETS = {
  // Dashboard
  DASHBOARD_INBOX: "dashboard-inbox",
  DASHBOARD_QUICK_ACTIONS: "dashboard-quick-actions",
  DASHBOARD_ANALYTICS_LINK: "dashboard-analytics-link",

  // MyDues
  MY_DUES_BREAKDOWN: "my-dues-breakdown",
  MY_DUES_PAY_CTA: "my-dues-pay-cta",
  MY_DUES_STATUS_BANNER: "my-dues-status-banner",

  // TreasurerDues
  CHAPTER_DUES_COLLECTION_STATS: "chapter-dues-collection-stats",
  CHAPTER_DUES_MATRIX: "chapter-dues-matrix",
  CHAPTER_DUES_INLINE_EDIT: "chapter-dues-inline-edit",
  CHAPTER_DUES_PERIOD_PICKER: "chapter-dues-period-picker",

  // Committees (inside Settings)
  COMMITTEES_CREATE: "committees-create",
  COMMITTEES_ASSIGN_CHAIR: "committees-assign-chair",
  COMMITTEES_BUDGET: "committees-budget",

  // Analytics
  ANALYTICS_PERIOD_COMPARISON: "analytics-period-comparison",
  ANALYTICS_MEMBER_STATUS: "analytics-member-status",
  ANALYTICS_MONTHLY_TREND: "analytics-monthly-trend",
} as const;

export type TourTargetId = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];
