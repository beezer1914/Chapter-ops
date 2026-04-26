# Platform Admin Dashboard — Pass 1 Design

**Status:** Draft
**Date:** 2026-04-25
**Author:** Brandon (with Claude)

## Purpose

Expand the Platform Admin Dashboard (`/platform`, visible only to Blue Column Systems staff) from its current minimal state — a header plus pending unaffiliated-org chapter requests — into a real founder dashboard that answers "is the business working?"

Pass 1 covers the highest-signal metrics: how many real organizations, chapters, and members exist on the platform; how dues are flowing; and the subscription-tier mix. Pass 2 (deferred) will add activity, dormant-org detection, geographic spread, and operational health.

## Non-Goals

- Charts and trend visualization (Pass 2)
- Drill-down navigation (clicking a tile to see a filtered list)
- CSV export
- Caching layer (premature at current scale; trivial to add later)
- Real-time updates (page-reload to refresh is fine for a once-or-twice-a-day check-in)
- Tracking beta → paid conversion rate (no paid orgs yet during beta period; metric is meaningless until conversion has happened)

## Approach

Single new endpoint `GET /api/platform/dashboard` returns all metrics in one JSON payload. The existing `PlatformDashboard.tsx` page is expanded to render new sections above the existing pending requests component. A small schema change adds `is_demo: bool` to the `Organization` model so the demo org (DGLO) can be excluded from platform metrics by default.

This matches the "Approach A" decision in brainstorming: smallest surface, fits the existing route idiom, easy to evolve into modular endpoints or a cached layer later if dashboard load times become a problem.

## Data Layer Changes

### Schema: `is_demo` flag on Organization

Add a new column to `Organization`:

```python
is_demo: Mapped[bool] = mapped_column(
    db.Boolean,
    nullable=False,
    default=False,
    server_default=db.text("false"),
)
```

Alembic migration generated via `flask db migrate -m "add is_demo flag to organization"` and reviewed before applying. The `server_default` ensures existing rows (Sigma Delta Sigma, any other production orgs) get `False` automatically.

### Seed update

The demo seed (`chapter-ops/backend/app/cli/seed_demo.py`) sets `is_demo=True` when creating DGLO. Idempotent: re-running the seed updates the flag if it was somehow set wrong on a prior insert.

### Why a flag instead of an abbreviation match

Treating "DGLO" as a magic string in metrics queries would couple the metrics layer to a specific demo identifier. A flag is the right abstraction for "exclude this org from platform-wide aggregates" and supports future demo orgs (e.g., a sorority demo) without changing query code.

## API Endpoint

### `GET /api/platform/dashboard`

**Authorization:** platform admin only — `current_user.email.lower() == os.environ["PLATFORM_ADMIN_EMAIL"].lower()`. Returns 403 otherwise. Implemented as a `@platform_admin_required` decorator (or reuses an existing equivalent if one is found during implementation; otherwise new and added to `app/utils/decorators.py`). Applied via `@bp.before_request` on the new `/api/platform/*` blueprint so future platform routes inherit the gate without restating it.

**Response shape:**

```json
{
  "summary": {
    "organizations": {"total": 1, "new_30d": 0},
    "chapters":      {"total": 4, "new_30d": 1},
    "members":       {"total": 47, "new_30d": 5},
    "dues_ytd":      "12450.00"
  },
  "tier_breakdown": {
    "organizations": [
      {"tier": "beta",        "count": 1},
      {"tier": "starter",     "count": 0},
      {"tier": "pro",         "count": 0},
      {"tier": "elite",       "count": 0},
      {"tier": "organization","count": 0}
    ],
    "chapters": [
      {"tier": "starter",     "count": 4},
      {"tier": "pro",         "count": 0},
      {"tier": "elite",       "count": 0},
      {"tier": "organization","count": 0}
    ]
  },
  "top_chapters_by_dues": [
    {
      "id": "uuid",
      "name": "Sigma Delta Sigma",
      "organization_name": "Phi Beta Sigma Fraternity, Inc.",
      "dues_ytd": "12450.00"
    }
  ]
}
```

`dues_ytd` is serialized as a string (matching the existing pattern for monetary values; preserves Decimal precision client-side). The `top_chapters_by_dues` list is capped at 5 rows.

### Counting Subtleties

These are the queries that matter, with the gotchas that bit comparable dashboards:

| Metric | Query (essence) | Why it matters |
|---|---|---|
| Organizations total | `Organization.query.filter_by(is_demo=False, active=True).count()` | Soft-deletion via `active=False` honored. |
| Organizations new_30d | Same plus `created_at >= today - 30d`. | UTC `created_at` from BaseModel — acceptable. |
| Chapters total | `Chapter.query.join(Organization).filter(Organization.is_demo==False, Chapter.active==True).count()` | Joins org so DGLO chapters are excluded. |
| Chapters new_30d | Same plus `Chapter.created_at >= today - 30d`. | |
| **Members total** | `func.count(distinct(ChapterMembership.user_id))` joined to Chapter+Organization with `is_demo=False`, `ChapterMembership.active=True`, `Chapter.active=True`. | **DISTINCT user_id is critical** — defensive against any user with multiple active memberships (BGLO rules forbid this within an org but defensive coding still matters). |
| Members new_30d | Same query but filtered on `User.created_at >= today - 30d`. | New *accounts* created in the window, not new memberships — captures genuine new humans. |
| Dues YTD | `func.coalesce(func.sum(Payment.amount), 0)` joined to Chapter+Organization with `is_demo=False`, `extract('year', Payment.created_at) == today.year`. | Year boundary uses UTC `created_at`. Switch to fiscal year later if requested. |
| Tier breakdown — orgs | `db.session.query(Organization.plan, func.count(Organization.id)).filter_by(is_demo=False, active=True).group_by(Organization.plan).all()` | Returns only tiers with ≥1 org. Frontend fills missing tiers with 0. |
| Tier breakdown — chapters | Same shape but for `Chapter.subscription_tier`, joined to Organization for is_demo filter. | |
| Top chapters by dues | Subquery summing `Payment.amount` per chapter (current calendar year), joined back to Chapter + Organization, `is_demo=False` filter, ordered DESC, LIMIT 5. | YTD only, matches the headline tile. |

Approximately 8 queries per dashboard load. Uncached load time at current scale (1-2 real orgs, handful of chapters): expected <100ms. Caching deferred.

## UI Layout

The existing `PlatformDashboard.tsx` page expands top-to-bottom:

1. **Header** (existing, unchanged) — "Platform Admin" eyebrow, "Platform Dashboard" h1, descriptive paragraph.
2. **Summary tiles** (new) — 4-up grid on desktop (`md:grid-cols-4`), 2x2 on mobile (`grid-cols-2`). Each tile shows the metric label, the big number, and the 30-day delta as `(+N last 30d)` in muted text. Uses the same card styling as IHQ Dashboard's KPI tiles for visual consistency (`bg-surface-card-solid rounded-xl border ...` per the editorial theme).
3. **Tier mix** (new) — section header "Tier Mix", followed by two cards side-by-side on desktop (`md:grid-cols-2`), stacked on mobile. Each card has a heading ("Organizations by Plan", "Chapters by Tier") and lists each tier with a count. Counts shown with subtle inline bars proportional to the largest count in the breakdown (similar to the `RateBar` pattern from IHQDashboard.tsx).
4. **Top chapters by dues** (new) — section header "Top Chapters by Dues YTD", followed by a 3-column table: Chapter, Organization, Dues YTD. Maximum 5 rows. Wrapped for mobile per the established pattern (feedback memory `feedback_mobile_table_overflow`): `overflow-x-auto` on the wrapper div, `min-w-[640px]` on the table itself, so columns stay readable when horizontally scrolled on mobile.
5. **Pending Chapter Requests** (existing, unchanged) — `<PendingChapterRequestsSection>` component at the bottom.

### Empty States

- **Summary tiles:** if `total = 0`, the tile renders showing `0` and `(+0 last 30d)` in the delta. No special "empty" treatment — zeros are valid data.
- **Tier breakdown:** all tiers render with their counts (zero rows included). The proportion bars all read 0%.
- **Top chapters table:** if no chapter has recorded dues YTD, the table shows a single row with "No chapters with recorded dues yet" centered, similar to the existing pattern in IHQDashboard's Chapter Health table.

### Visual Treatment Rules

- Match existing editorial theme — cream surfaces, sharp corners (no rounded), Playfair Display headings, no glassmorphism, all colors via CSS custom property tokens (per `chapter-ops/CLAUDE.md` Editorial Theme Token Reference).
- Big-number tiles use `font-heading font-black` for the numeric values, `text-content-muted` for delta text.
- Currency formatted via the existing `formatDollars` helper (currently inline in IHQDashboard.tsx — extract to `frontend/src/lib/format.ts` as a shared utility during implementation).

## File Layout

| File | Status | Responsibility |
|---|---|---|
| `chapter-ops/backend/app/models/organization.py` | Modify | Add `is_demo: bool` column |
| `chapter-ops/backend/migrations/versions/XXX_add_is_demo_to_organization.py` | Create | Alembic migration |
| `chapter-ops/backend/app/cli/seed_demo.py` | Modify | Set `is_demo=True` on DGLO during seed |
| `chapter-ops/backend/app/utils/decorators.py` | Modify (or reuse) | `@platform_admin_required` decorator |
| `chapter-ops/backend/app/routes/platform.py` | Create | `/api/platform/dashboard` endpoint + blueprint |
| `chapter-ops/backend/app/__init__.py` | Modify | Register the new blueprint + CSRF exempt if needed |
| `chapter-ops/frontend/src/services/platformService.ts` | Create | `fetchPlatformDashboard()` |
| `chapter-ops/frontend/src/types/platform.ts` (or extend `index.ts`) | Modify | TypeScript types for the response |
| `chapter-ops/frontend/src/pages/PlatformDashboard.tsx` | Modify | Add the four new sections above the existing requests section |
| `chapter-ops/frontend/src/lib/format.ts` | Create (extract) | Shared `formatDollars` helper |

## Operational Notes

- **Where it runs:** production. Brandon is the only consumer of this dashboard at current scale. Loads on demand when he visits `/platform`.
- **Deploy ordering:** the migration must run before the new endpoint is reachable. Render's standard deploy pipeline handles this if the migration is part of the release command. Verify before pushing.
- **Effect on existing routes:** zero. The new blueprint is additive. No existing route signatures change.
- **Effect on the demo:** the DGLO seed grows by one line (`is_demo=True`); teardown is unaffected since we only delete by `abbreviation == "DGLO"`.

## Open Questions for Implementation Plan

1. Whether `@platform_admin_required` already exists somewhere in the codebase or needs to be created. Likely needs creation — the existing `_is_org_admin` helper is for organization-level admin, not platform-level.
2. Whether `Payment.amount` is `Numeric(10,2)` (returns Decimal in Python) or `Float` — matters for sum precision. Verified during planning by reading the Payment model.
3. Whether the existing `PendingChapterRequestsSection` component renders cleanly when its container has additional siblings above it (it should — it's a self-contained component — but worth a quick eyeball during implementation).

## Success Criteria

After implementation and deploy to production:

1. Logging in as the platform admin (`bholi1914@gmail.com` per the env var) and visiting `/platform` shows:
   - Header (unchanged)
   - 4 summary tiles with non-zero `total` for at least Organizations (Sigma Delta Sigma) and Chapters
   - Tier Mix cards showing the actual plan/tier distribution
   - Top Chapters by Dues table (likely showing Sigma Delta Sigma if any dues have been collected)
   - Existing pending requests section
2. The DGLO seed org does NOT appear in any count, table, or breakdown — confirmed by checking that `Organizations: 1` (not 2) when only Sigma Delta Sigma + DGLO exist.
3. A non-platform-admin user (e.g., the IHQ admin of any organization) hitting `/api/platform/dashboard` directly receives a 403.
4. The dashboard loads in <500ms on production hardware.
5. On mobile (375px viewport), all sections render readably: tiles in a 2x2 grid, tier mix cards stacked, top chapters table horizontally scrollable, existing requests section unchanged.
