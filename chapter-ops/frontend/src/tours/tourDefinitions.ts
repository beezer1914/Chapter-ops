import type { TourDefinition } from "@/types/tour";
import { TOUR_TARGETS } from "./tourTargets";

export const TOUR_DEFINITIONS: TourDefinition[] = [
  {
    id: "dashboard_member",
    route: "^/$",
    roles: ["member"],
    steps: [
      {
        target: TOUR_TARGETS.DASHBOARD_INBOX,
        label: "STEP 01 / 02",
        heading: "Your action queue",
        body: "Anything that needs your attention — unpaid dues, upcoming events, pending RSVPs — shows up here first.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.DASHBOARD_QUICK_ACTIONS,
        label: "STEP 02 / 02",
        heading: "Jump to what you need",
        body: "Tap any quick action to pay dues, see events, or check your profile without hunting through the menu.",
        placement: "bottom",
      },
    ],
  },
  {
    id: "dashboard_officer",
    route: "^/$",
    roles: ["secretary", "treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.DASHBOARD_INBOX,
        label: "STEP 01 / 03 · OFFICER",
        heading: "Chapter-wide attention items",
        body: "Expense approvals, members behind on dues, pending transfers — everything your role can act on is surfaced here.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.DASHBOARD_QUICK_ACTIONS,
        label: "STEP 02 / 03 · OFFICER",
        heading: "Officer shortcuts",
        body: "Direct links to the pages you'll visit most: dues, members, events, and communications.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.DASHBOARD_ANALYTICS_LINK,
        label: "STEP 03 / 03 · OFFICER",
        heading: "Analytics at a glance",
        body: "Tap here whenever you want the full chapter report — collection rates, member status, trends.",
        placement: "bottom",
      },
    ],
  },
  {
    id: "my_dues",
    route: "^/dues$",
    roles: ["member", "secretary", "treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.MY_DUES_STATUS_BANNER,
        label: "STEP 01 / 03",
        heading: "Your financial standing",
        body: "Green means you're financial — good standing for voting, events, and line activities. Red means something's owed.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.MY_DUES_BREAKDOWN,
        label: "STEP 02 / 03",
        heading: "What you owe, line by line",
        body: "Chapter dues, national, regional — each fee shows what's owed and what's paid for this period.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.MY_DUES_PAY_CTA,
        label: "STEP 03 / 03",
        heading: "Pay when you're ready",
        body: "Tap here to settle any remaining balance through secure Stripe checkout. Partial payments are fine.",
        placement: "top",
      },
    ],
  },
  {
    id: "chapter_dues",
    route: "^/chapter-dues$",
    roles: ["treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.CHAPTER_DUES_COLLECTION_STATS,
        label: "STEP 01 / 04 · TREASURER",
        heading: "Your collection overview",
        body: "Total dues collected, what's still outstanding, and how many members are behind — all for the active period.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.CHAPTER_DUES_PERIOD_PICKER,
        label: "STEP 02 / 04 · TREASURER",
        heading: "Switch between periods",
        body: "Compare current dues against last semester or jump to a custom period — handy for transition meetings.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.CHAPTER_DUES_MATRIX,
        label: "STEP 03 / 04 · TREASURER",
        heading: "Every member, every fee",
        body: "Each row is a member; each column is a fee type. A filled cell means paid; an empty one means outstanding.",
        placement: "top",
      },
      {
        target: TOUR_TARGETS.CHAPTER_DUES_INLINE_EDIT,
        label: "STEP 04 / 04 · TREASURER",
        heading: "Adjust without leaving the page",
        body: "Click any cell to edit amount owed, mark a member exempt, or add a note. Changes recompute financial status immediately.",
        placement: "top",
      },
    ],
  },
  {
    id: "committees",
    route: "^/settings$",
    roles: ["treasurer", "vice_president", "president", "admin"],
    matcher: () => {
      const hash = window.location.hash.replace("#", "");
      const search = new URLSearchParams(window.location.search).get("tab");
      return hash === "committees" || search === "committees";
    },
    steps: [
      {
        target: TOUR_TARGETS.COMMITTEES_CREATE,
        label: "STEP 01 / 03 · PRESIDENT",
        heading: "Spin up a committee",
        body: "Committees organize chapter initiatives — fundraising, programming, service. Create one, then assign a chair.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.COMMITTEES_ASSIGN_CHAIR,
        label: "STEP 02 / 03 · PRESIDENT",
        heading: "Name a chair",
        body: "The chair oversees the committee's budget and activities. No new role tier — they stay in their existing membership.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.COMMITTEES_BUDGET,
        label: "STEP 03 / 03 · PRESIDENT",
        heading: "Budget tracking",
        body: "Set a budget, tag expenses to the committee, and watch spent / pending / remaining update in real time.",
        placement: "top",
      },
    ],
  },
  {
    id: "analytics",
    route: "^/analytics$",
    roles: ["secretary", "treasurer", "vice_president", "president", "admin"],
    steps: [
      {
        target: TOUR_TARGETS.ANALYTICS_PERIOD_COMPARISON,
        label: "STEP 01 / 03",
        heading: "Period-over-period",
        body: "Current period vs. the last — dues collected, members financial, events held — so you can see the trend at a glance.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.ANALYTICS_MEMBER_STATUS,
        label: "STEP 02 / 03",
        heading: "Who's where",
        body: "Active, not financial, neophyte, exempt — the distribution across your active roster for this period.",
        placement: "bottom",
      },
      {
        target: TOUR_TARGETS.ANALYTICS_MONTHLY_TREND,
        label: "STEP 03 / 03",
        heading: "12 months of payments",
        body: "When dues tend to come in, when they dry up — useful for planning reminder campaigns and cash-flow.",
        placement: "top",
      },
    ],
  },
];
