# Interactive Onboarding Tours — Design Spec

**Status:** Approved (brainstorm)
**Date:** 2026-04-19
**Owner:** Brandon Holiday

## Problem

New users — especially officers who inherit roles with zero training — land in ChapterOps without knowing where to start on their role-specific pages. The existing `SuccessStep.tsx` progressive checklist handles initial chapter setup, but once users are inside the app there is no in-context guidance. Treasurers hitting `/chapter-dues` for the first time, presidents opening the Committees tab, and members visiting `/dues` for the first time all benefit from 2–4 targeted tooltips pointing at the meaningful controls on that page.

## Goals

1. First-login welcome modal that greets users with a role-aware one-liner.
2. Per-page contextual tooltips on high-value pages that fire once per user (per role).
3. Automatically re-fire tours after role promotions so that an officer transition (member → treasurer, treasurer → president) surfaces the right guidance at the right moment.
4. Native look and feel: editorial theme, Playfair Display headings, sharp corners, spotlight dim + cream card.
5. Minimal maintenance burden so tours don't rot as the UI evolves.

## Non-Goals

- Forced multi-page tours on first login (rejected — users skip them).
- Coverage of every officer page (scope creep; only high-value pages).
- Tour completion analytics in MVP (can be added later).
- Per-tenant tour policy (YAGNI).
- End-to-end Playwright test coverage (not worth the infrastructure for this feature).

## Scope — MVP Tour Inventory

| Tour ID | Route | Roles | Steps | What it covers |
|---|---|---|---|---|
| `welcome` | any (modal, not a page tour) | all | 1 modal | Role-aware greeting |
| `dashboard_member` | `/` | member | 2 | Inbox/action queue, "your next action" |
| `dashboard_officer` | `/` | secretary+ | 3 | Chapter inbox, quick actions, analytics shortcut |
| `my_dues` | `/dues` | member | 3 | Fee breakdown, pay CTA, financial status banner |
| `chapter_dues` | `/chapter-dues` | treasurer+ | 4 | Collection stats, member × fee matrix, inline edit, period picker |
| `committees` | `/settings` (committees tab) | treasurer+ | 3 | Create committee, assign chair, budget tracking |
| `analytics` | `/analytics` | secretary+ | 3 | Period comparison, member status, monthly trend |

Every page tour is capped at 4 steps. If more would be needed, the page itself needs simplification.

## Architecture

### Data Model

New model `UserTourState` (one row per user, upserted):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK, from `BaseModel` |
| `user_id` | UUID, FK → `user.id`, unique | One row per user |
| `seen` | JSONB | Example: `{"welcome": {"seen_at": "...", "role": "treasurer"}, "chapter_dues": {"seen_at": "...", "role": "treasurer"}}` |
| `created_at`, `updated_at` | timestamps | from `BaseModel` |

**Rationale:**
- **Separate table, not a column on `User`** — isolates tour bookkeeping; `User` is already wide and shared across tenants.
- **JSONB, not a child table** — tour IDs are a frontend concern that evolves quickly; letting the frontend be the source of truth avoids migrations for every new tour.
- **Row created lazily** on first `PATCH` write, not on `GET`.
- **Not chapter-scoped** — tour state belongs to the user identity, not the chapter membership. Keeps the mental model simple; can revisit if multi-chapter users surface a real complaint.

### Backend API

New blueprint `app/routes/tours.py`, registered + CSRF-exempted only where appropriate.

#### `GET /api/tours/state`
- Auth: `@login_required`
- Returns: `{ "seen": { "<tour_id>": { "seen_at": "<iso>", "role": "<role>" }, ... } }`
- New users get `{"seen": {}}`. Row is NOT created on read.

#### `PATCH /api/tours/state`
- Auth: `@login_required`
- Body: `{ "tour_id": "<id>", "role": "<role>" }`
- Behavior: upserts `seen[tour_id] = {"seen_at": now_utc_iso, "role": role}`. Creates row if missing.
- Validation: `tour_id` matches `^[a-z_]{1,50}$`; `role` ∈ `{member, secretary, treasurer, vice_president, president, admin}`. Invalid → 400.
- Returns: `{ "seen": <full_updated_seen_object> }`

#### `POST /api/tours/reset`
- Auth: `@login_required`
- Clears `seen` to `{}`.
- Returns: `{ "seen": {} }`

**Rate limiting:** `PATCH` 60/min/user (spam guard), `GET` unlimited, `POST /reset` 5/hour/user.

### Frontend Components

All new, co-located under `src/tours/`:

```
frontend/src/
├── tours/
│   ├── TourProvider.tsx       # Context + route-aware orchestrator
│   ├── Tooltip.tsx            # Spotlight overlay + cream card (Radix Popover)
│   ├── WelcomeModal.tsx       # One-shot first-login greeting
│   ├── tourDefinitions.ts     # Source of truth: tour IDs, routes, roles, steps
│   ├── useTour.ts             # Consumer hook (start, next, skip, complete)
│   └── tourTargets.ts         # Stable data-attribute selector constants
├── services/
│   └── tourService.ts         # GET / PATCH / POST → /api/tours/*
└── stores/
    └── tourStore.ts           # Zustand mirror of server state, optimistic updates
```

**Component responsibilities:**

- **`TourProvider`** — mounted once above the router in `App.tsx`. On mount, fetches `GET /api/tours/state`. Subscribes to `useLocation`; on route change, after a 500ms delay (lets target elements mount), evaluates `shouldShowTour(tour, role, seen)` for the matching route. If true, starts the tour. Aborts silently if any step's target element is not in the DOM within 2s.

- **`Tooltip`** — Radix `Popover` with a custom content wrapper. Visual: spotlight dim via a sibling `fixed inset-0 bg-black/35` div; target element gets temporary `data-tour-active` attribute with CSS `outline: 3px solid #0a0a0a; outline-offset: 2px`. Card: cream background, 3px top black rule, 1px border on remaining three sides. Contents: step label (`STEP 01 / 04 · TREASURER` in editorial uppercase label style), Playfair Display Black heading, Instrument Sans body, Skip + Next buttons (Skip = ghost, Next = solid black).

- **`WelcomeModal`** — separate component (not a tour step). Fires once per user before any page tour, when `seen["welcome"]` is missing and user has `active_chapter_id`. Single "Got it" button.

- **`tourTargets.ts`** — exports constants (e.g., `TOUR_TARGETS.COLLECTION_STATS = "collection-stats"`). Pages reference them via `data-tour-target={TOUR_TARGETS.COLLECTION_STATS}`. Tour definitions reference them by the same constant. Renaming a target updates both ends via TypeScript imports.

- **`tourStore` (Zustand)** — mirrors the server `seen` object. `markSeen(tourId, role)` performs optimistic update + `PATCH`. On failure, rolls back + logs (silent; broken tour state must not break the app).

**Re-trigger affordance:** "Replay tours" link in Settings → Profile. Calls `POST /api/tours/reset`, then reloads the page.

### Role-Change Replay Logic

Role hierarchy (highest → lowest):

```ts
const ROLE_RANK = {
  admin: 5,
  president: 4,
  vice_president: 3,
  treasurer: 2,
  secretary: 1,
  member: 0,
};
```

Decision function, invoked on every route change inside `TourProvider`:

```ts
function shouldShowTour(tour, currentRole, seen): boolean {
  if (!tour.roles.includes(currentRole)) return false;
  const prior = seen[tour.id];
  if (!prior) return true;
  // Re-fire only when the user was promoted INTO the eligibility tier —
  // i.e., the prior role was not eligible for this tour. Intra-tier
  // promotions (e.g. treasurer → president for chapter_dues) do NOT re-fire,
  // because the page content is the same across eligible roles.
  if (!tour.roles.includes(prior.role) && ROLE_RANK[currentRole] > ROLE_RANK[prior.role]) {
    return true;
  }
  return false;
}
```

**Semantics:**
- Promotion INTO the eligibility tier (e.g. member → treasurer for `chapter_dues`) → re-fire.
- Promotion WITHIN the eligibility tier (e.g. treasurer → president for `chapter_dues`) → do NOT re-fire. The page content is the same across eligible roles, so repeating the tour adds no value.
- Seen at the same or a higher role already in the eligibility tier → do not re-fire.
- Demotion → no re-fire; seen state is preserved.
- Admin is rank 5 and is already in the eligibility tier for officer tours (for platform admins walking through a chapter demo) — so promotion to admin from treasurer/president does not re-fire officer tours.
- **Skip mid-tour** marks the entire `seen[tour.id]` as complete at the current role. No re-prompt unless promoted INTO eligibility or the user clicks Replay.
- **Multi-chapter users** — tour state is per-user, not per chapter-role. Switching active chapter does not re-fire. (Simplification; revisit if it becomes a user complaint.)

### Tour Content Authoring

`tourDefinitions.ts` shape:

```ts
type TourStep = {
  target: string;              // must be a value from TOUR_TARGETS
  label: string;               // e.g. "STEP 01 / 04"
  heading: string;             // Playfair Display Black
  body: string;                // Instrument Sans, 15-25 words
  placement?: "top" | "bottom" | "left" | "right";
};

type TourDefinition = {
  id: string;                        // matches seen[id]
  route: string;                     // pathname regex (e.g. "^/chapter-dues$")
  roles: Role[];                     // who sees this tour
  matcher?: () => boolean;           // optional additional gate beyond pathname
  steps: TourStep[];
};
```

The optional `matcher` handles tours that need more than a pathname match — e.g., the `committees` tour lives on `/settings` but only on a specific tab. Its `matcher` returns `true` only when the committees tab is active.

**Authoring approach: draft-first.** An initial opinionated copy pass will be written during implementation based on what the code does. Brandon edits anything that doesn't fit the voice.

### Tour-Rot Defense

1. **`TOUR_TARGETS` constants** — every selector lives in one place; renames break at TypeScript compile, not at runtime.
2. **Vitest check** — a test iterates every `TourDefinition.steps[].target` and asserts the value exists in `TOUR_TARGETS`. Catches stale references whenever the frontend test suite runs.
3. **Graceful DOM abort** — if a step's target element isn't found within 2s of the tour starting, the tour silently marks itself seen and exits. User never sees a broken overlay.

## Testing

### Backend (`backend/tests/test_tours.py`, new file)

- `GET /api/tours/state` → empty for new user.
- `PATCH /api/tours/state` → creates row on first write.
- `PATCH /api/tours/state` → upserts second tour_id without clobbering first.
- `PATCH` with invalid `tour_id` regex → 400.
- `PATCH` with invalid `role` value → 400.
- `POST /api/tours/reset` → clears `seen`.
- All three endpoints → 401 when unauthenticated.

Uses existing `client`, `db_session`, `make_user` fixtures from `conftest.py`. `gen-test` skill is a reasonable starting scaffold.

### Frontend (Vitest)

- **`tours.test.ts`** — pure-function unit tests for `shouldShowTour`. Each scenario from the replay-logic table becomes a test case. ~10 tests, no mocks.
- **`TourProvider.test.tsx`** — integration test with a mocked `tourStore`. Navigate between routes; assert expected tour activates. ~3 tests.
- **`Tooltip.test.tsx`** — smoke test: renders step label, heading, body, Skip/Next buttons.

### Not Tested (Intentional)

- Pixel positioning of tooltip — Radix responsibility.
- Spotlight overlay CSS — visual, not logic.
- Exact tour copy — content, lives separately.
- End-to-end click-through flows — no Playwright infrastructure in this project.

### Manual Verification Checklist

Part of the implementation plan, not automated:

1. First login as a new member → welcome modal fires.
2. Navigate to `/dues` → `my_dues` tour fires.
3. Skip mid-tour → marked seen, does not re-fire on refresh.
4. Promote test user to treasurer in DB → visit `/chapter-dues` → `chapter_dues` tour fires.
5. Click "Replay tours" in Settings → welcome modal fires on next navigation.
6. Viewport-edge: tooltip near the right edge of the screen is not cut off.

## Rollout

- New `.env` flag: none required; feature is on by default once shipped.
- Migration: one Alembic migration for `user_tour_state` table.
- No impact on existing users (empty `seen` = everyone sees tours once).

## Open Questions

None remaining. All design decisions resolved during brainstorm.
