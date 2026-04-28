# Regional Dashboard — MVP Design

**Status:** Draft
**Date:** 2026-04-28
**Author:** Brandon (with Claude)

## Purpose

Add a Dashboard surface for Regional Directors and other regional officers (1st Vice, 2nd Vice, Secretary, Treasurer) inside the existing Region Detail view in `frontend/src/pages/Regions.tsx`. The dashboard surfaces region-scoped KPIs, a chapter health rollup, regional invoice status, and an officer roster summary, giving regional leadership a single working surface instead of forcing them to navigate to their own chapter dashboard and piece together regional context manually.

A Regional Director interview is being scheduled to validate content choices. This MVP intentionally ships a defensible default so there is something concrete for them to react to.

## Non-Goals

- Login redirect for regional officers (sidebar shortcut only; no automatic landing override)
- Trend charts / time-series visualizations (defer until interview surfaces what trends matter)
- Color-coded chapter health and Ops Agent finding generation (separate backlog item; this design leaves an `agent_findings: []` array as the integration point)
- Multi-region picker UI (a regional officer holding roles in 2+ regions is rare in practice; if it occurs, log a warning and link to the first)
- Comms / broadcast widget (Comms module already exists; no duplication)
- Read-only access for chapter members (officer + admin only)
- Mobile redesign beyond the responsive table pattern already used by the IHQ chapter health table
- CSV export of regional KPIs (already on backlog as part of "Deeper analytics")

## Approach

Single new backend endpoint `GET /api/regions/<region_id>/dashboard` returns all dashboard data in one round-trip. The existing `RegionDetailView` in `Regions.tsx` gains a tab bar with two tabs: **Dashboard** (default) and **Manage** (the existing Region Info / Chapters / Officers / Invoices sections, unchanged). A new shared `<ChapterHealthTable>` component is extracted from the IHQ Dashboard so both dashboards reuse it. A new sidebar nav entry, gated on whether the current user holds any regional officer role, deep-links to their region's dashboard.

This matches the brainstorming Approach A decision: dedicated endpoint, factored shared component, single permission helper. Cleaner permission boundaries, cleaner extension point for the color-coded health work later, minimal surface area to maintain.

## Permission Model

Access to the dashboard requires one of:

1. Platform admin (`is_platform_admin(user)`)
2. Org admin for the region's organization (`OrganizationMembership.role == "admin"` for `region.organization_id`)
3. `RegionMembership.role` for this region in `{regional_director, regional_1st_vice, regional_2nd_vice, regional_secretary, regional_treasurer}` and `active=True`

The `member` role on a region does **not** grant dashboard access. This is a deliberate split: officers run the region; "member" denotes a regular member of a chapter that happens to belong to the region.

The check lives in a single helper:

```python
# app/utils/permissions.py
REGIONAL_OFFICER_ROLES = {
    "regional_director",
    "regional_1st_vice",
    "regional_2nd_vice",
    "regional_secretary",
    "regional_treasurer",
}

def can_view_region_dashboard(user, region) -> bool:
    if is_platform_admin(user):
        return True
    if is_org_admin_for(user, region.organization_id):
        return True
    membership = RegionMembership.query.filter_by(
        user_id=user.id, region_id=region.id, active=True
    ).first()
    return membership is not None and membership.role in REGIONAL_OFFICER_ROLES
```

The helper has three callers:

- The dashboard endpoint itself — returns `403` if `False`
- The user-context endpoint that hydrates `currentUser` — populates a new field `regions_with_dashboard_access: [region_id, ...]` on the response so the frontend can drive sidebar visibility without a probe call
- The frontend route guard that renders the Dashboard tab

## Backend

### New endpoint

```
GET /api/regions/<region_id>/dashboard
```

Response shape (locked now so the future agent-findings work does not break callers):

```json
{
  "region": { "id", "name", "abbreviation", "description" },
  "kpis": {
    "chapter_count": 12,
    "chapter_count_active": 11,
    "chapter_count_suspended": 1,
    "member_count": 248,
    "financial_rate": 73.4,
    "dues_ytd": "18452.00",
    "invoices_outstanding_total": "3200.00"
  },
  "chapters": [
    {
      "id", "name", "designation", "chapter_type", "city", "state",
      "member_count", "financial_rate", "dues_ytd",
      "subscription_tier", "suspended", "deletion_scheduled_at"
    }
  ],
  "invoice_snapshot": {
    "draft": 0, "sent": 3, "paid": 8, "overdue": 1, "cancelled": 0,
    "outstanding_total": "3200.00"
  },
  "officer_summary": [
    { "user_id", "full_name", "role" }
  ],
  "agent_findings": []
}
```

Money fields are JSON strings to match the existing convention for `db.Numeric` columns and avoid float precision drift. The `agent_findings` array is empty for MVP; when the color-coded health feature lands, each finding will be `{ severity, check, summary, detail, chapter_id }`.

### Extracted aggregation helpers

A new module `app/services/dashboard_aggregations.py` houses the math currently inlined in `routes/ihq.py`:

- `compute_chapter_kpis(chapter_id) -> dict` returning `{member_count, financial_rate, dues_ytd}`
- `compute_region_kpis(region_id) -> dict` returning the per-region KPI bundle

`routes/ihq.py` is updated to call these helpers; the IHQ endpoint's response shape and behavior do not change. Existing IHQ tests must pass unchanged after the refactor — that is the regression net.

### Per-chapter resilience

Each chapter's KPI computation in the dashboard endpoint is wrapped in a try block. If one chapter throws, the exception is logged via `logger.exception(...)` (so it surfaces in Sentry), the chapter is included in the response with KPIs nulled (`member_count: null`, etc.), and the frontend renders `—` for null cells. One bad row never 500s the whole dashboard.

Use `logger.exception(...)`, never `logger.error(f"...{e}")`. The latter pattern previously hid an invoice-notification field-name bug for an unknown period because it captured neither the stack trace nor the original exception type.

### Regions list payload

The existing `GET /api/regions` endpoint (which already returns `regions / is_org_admin / is_regional_director` and hydrates `regionStore` on page load) gains a new field on its response:

```ts
regions_with_dashboard_access: string[]  // region IDs
```

This matches the existing pattern: regional state already lives on `regionStore`, and the regions list endpoint already exposes role flags. `regions_with_dashboard_access` is populated by iterating the org's regions and calling `can_view_region_dashboard` for each. For typical users this is empty or length-1.

The existing `is_regional_director` boolean stays — it is still used to gate Incidents access in `Layout.tsx`. Only the new feature uses the new field.

## Frontend

### New shared component: `<ChapterHealthTable>`

Extracted from the existing IHQ Chapter Health table (currently inline in `IHQDashboard.tsx` around lines 347+). Lives at `frontend/src/components/ChapterHealthTable.tsx`. Props:

```ts
interface ChapterHealthTableProps {
  chapters: ChapterHealthRow[];
  regions?: Region[];          // optional; used by region-column rendering
  showRegionColumn?: boolean;  // false on regional dashboard
  onChapterClick?: (chapterId: string) => void;
}
```

Preserves the existing desktop-table + mobile-cards split. The wrapper must use `overflow-x-auto` (NOT `overflow-hidden`) with a `min-w-[Npx]` on the table itself. Wrapping a multi-column table in `overflow-hidden` silently clips rightmost columns on mobile (an earlier incident on the IHQ Region Rollup table).

After extraction, IHQDashboard.tsx imports and uses the shared component. The existing IHQ tests must pass unchanged.

### New component: `<RegionDashboardTab>`

Lives at `frontend/src/components/RegionDashboardTab.tsx`. Renders:

- Top KPI row (5 cards): Chapters (with active/suspended split), Members, Financial Rate, Dues YTD, Outstanding Invoices
- `<ChapterHealthTable>` with `showRegionColumn={false}`
- Invoice snapshot card (`X sent · Y paid · Z overdue · $ outstanding`) with a click-through to the existing Invoices section in the Manage tab
- Officer roster summary card (top 5 officers, name + role) with a click-through to the existing Officers section in the Manage tab
- Agent findings placeholder card (empty state for MVP; reserved layout slot)

### Tabs in `RegionDetailView`

`RegionDetailView` in `Regions.tsx` gains a tab bar at the top: **Dashboard** (default) and **Manage**. The Manage tab contains the four existing sections (Region Info, Chapters, Regional Officers, Regional Invoices) unchanged. Tab selection is reflected in the URL via a `?tab=dashboard|manage` query param so deep links work. Default tab when no query param is present: Dashboard.

### Sidebar navigation

A new "Regional Dashboard" entry is added to the sidebar in `Layout.tsx`, visible iff `currentUser.regions_with_dashboard_access.length > 0`. The entry routes to `/regions/<first-region-id>?tab=dashboard`. If `regions_with_dashboard_access.length > 1`, log a console warning and use index 0; build a real picker only if this scenario materializes.

### New service function

`fetchRegionDashboard(regionId)` in `frontend/src/services/regionService.ts` calling the new endpoint and returning a typed payload.

## Data Flow

1. User clicks the "Regional Dashboard" sidebar entry → routes to `/regions/<id>?tab=dashboard`
2. `Regions.tsx` reads the region id from the route and the tab from the query param
3. The page calls the existing `loadRegionDetail(id)` (drives the Manage tab) AND the new `fetchRegionDashboard(id)` (drives the Dashboard tab) — independent calls, either can succeed/fail without blocking the other
4. `RegionDetailView` renders the tab bar, defaulting to the requested tab
5. `<RegionDashboardTab>` receives the dashboard payload and renders the cards + table + widgets

If the user switches to the Manage tab and back, re-fetch the dashboard payload on tab activation. Cheap, simpler than cache invalidation.

## Error Handling

- **Backend per-chapter exceptions**: caught, logged via `logger.exception`, chapter row nulled, response still 200
- **Region not found**: `404`
- **Region exists but cross-org without platform admin**: `403` (do not leak existence with a 404)
- **Frontend dashboard fetch fails**: render the Dashboard tab in an error state with a Retry button. The Manage tab continues to work; the calls are independent.
- **Permission failure on direct deep link** (e.g., role removed mid-session): redirect to `/dashboard` with toast `"You don't have access to that region."`. Sidebar entry should not appear in the first place if access is missing — this is defense in depth.
- **Empty states**: a region with zero chapters renders zero-valued KPIs, an empty `<ChapterHealthTable>`, and empty invoice/officer cards. No special-casing.

## Testing

### Backend

- `tests/test_region_dashboard_endpoint.py` covers the permission matrix and edge cases:
  - 200 for platform admin, org admin, each of the 5 regional officer roles
  - 403 for `RegionMembership.role == "member"`, for a chapter member not in the region, for an officer of a different region
  - 404 for non-existent region; 403 (not 404) for cross-org access
  - Empty region (zero chapters) returns zero-valued KPIs without erroring
  - Bad-chapter case: synthesize a malformed chapter row, endpoint returns 200 with that chapter's KPIs nulled, exception is logged
- `tests/test_dashboard_aggregations.py` unit-tests `compute_chapter_kpis` and `compute_region_kpis` against fixtures whose IHQ output is already verified, ensuring the refactor does not drift
- `tests/test_can_view_region_dashboard.py` unit-tests the permission helper across the role/admin combinations

### Frontend

- `components/ChapterHealthTable.test.tsx` — sort, search, empty state, the desktop-table/mobile-cards split (verify `overflow-x-auto` + `min-w-` on the wrapper)
- `components/RegionDashboardTab.test.tsx` — KPI card rendering with payload, empty states for chapters/officers/invoices, agent-findings placeholder card present
- `pages/Regions.test.tsx` (extending the existing test file) — tab switching default and on click, sidebar entry visibility based on `regions_with_dashboard_access`

### Refactor regression net

The most important test of the `<ChapterHealthTable>` extraction is that **all existing IHQ Dashboard tests pass after extraction with zero modifications**. If a test needs updating, the refactor is not behavior-equivalent and the discrepancy must be fixed before merging.

## Forward-Compatible Hooks

This design leaves explicit slots for the next backlog items so they integrate without breaking the contract:

- **`agent_findings: []`** in the response body — the color-coded chapter health + Ops Agent surfacing feature plugs in here. Each finding will be `{ severity, check, summary, detail, chapter_id }`. The placeholder card on the Dashboard tab already has reserved layout space.
- **Reclamation Campaigns** — a future "candidates in this region" count card can sit alongside the KPI row without restructuring.
- **Member-Reported Initiatives** — a future "regional rollup of initiative X" card uses the same KPI-card pattern.

## Dependencies

- The Regional Director interview (scheduling in progress) — content may shift after that conversation. The MVP is a defensible starting point, not a final answer. Cards are easy to add or remove; the API contract has slack room.
- No data model changes required. All needed columns/relationships already exist.

## Rip-and-Replace: Existing `RegionDashboard.tsx`

Discovery during plan-writing surfaced a pre-existing `RegionDashboard.tsx` page at the route `/region-dashboard`, fed by `GET /api/regions/my-dashboard`. It is a stub-quality multi-region overview (only `total_regions / total_chapters / total_members` cards) gated to `regional_director` only via the sidebar in `Layout.tsx`. The new per-region dashboard is strictly better in depth and audience coverage.

This work removes:

- Frontend: `frontend/src/pages/RegionDashboard.tsx`
- Frontend: the `/region-dashboard` route registration in `App.tsx` (and any associated lazy-import)
- Frontend: the conditional sidebar entry for `isRegionalDirector` in `Layout.tsx` (replaced by the new gate based on `regions_with_dashboard_access`)
- Backend: the `GET /api/regions/my-dashboard` route handler `my_region_dashboard()` in `routes/regions.py`
- Backend: any test file or test cases targeting `/my-dashboard`
- Frontend types: `RegionDashboardData` in `types/index.ts`, if not used elsewhere

## Open Questions

None blocking. The Regional Director interview will inform whether to:

- Add specific trend charts in a follow-up
- Adjust the visibility line (e.g., should regional `member` role gain read access?)
- Add a CSV export of the chapter health rollup before the broader Deeper Analytics work
