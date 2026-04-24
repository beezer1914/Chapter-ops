# Payment Flows Expansion — Multi-Tier Invoicing & Stripe Connect

**Date:** 2026-04-24
**Author:** Brandon Holiday (designed w/ Claude)
**Status:** Approved — ready for implementation plan

## Problem

Payment and invoicing today are chapter-centric:

- `Payment` requires both `chapter_id` and `user_id` — there is no way to record money flowing to or from a non-chapter entity.
- `Invoice` supports exactly two shapes via a `scope` enum: `"member"` (chapter→member dues) and `"chapter"` (region→chapter head tax).
- Stripe Connect is wired **only** to `Chapter.stripe_account_id`. Regions and the parent Organization have no way to accept card payments.
- Regional head-tax invoices exist but carry no payment rail — they're tracked and manually marked paid.
- Nothing exists at the Organization (HQ/IHQ) level at all: no invoicing, no Stripe, no billing authority.

Real-world Greek letter organizations collect money at all three tiers — national dues, regional conference fees, chapter dues — so the current model only addresses a third of the actual money flows. Any growth past a pilot chapter will require this.

## Goals

- Support four invoicing flows at Region and Organization tiers: Region→Member (new), Region→Chapter (existing, adding Stripe rail), Organization→Chapter (new), Organization→Member (new).
- Give each billing tier (Organization, Region, Chapter) its own Stripe Connect account so money lands directly with the entity that billed for it — no chapter-held national dues.
- Unify the member's view: one inbox at `/bills` showing every outstanding invoice across all three tiers, labeled by issuer, each paying into the correct connected account at checkout.
- Extend `financial_status` to reflect the real BGLO rule — a member is only "fully financial" when chapter dues *and* regional invoices *and* national invoices are all current.
- Land safely against the existing data. This spec staggers across 4 incremental deploys plus a cleanup deploy.

## Non-goals

- Recurring billing templates at the Region/Org tiers (roadmapped — annual national dues will ship as bulk ad-hoc invoicing first).
- Dues periods / per-fee-type dues rows at Region/Org tiers. Invoices only.
- A dedicated `org_treasurer` role. `OrganizationMembership.admin` covers billing authority until a national org actually onboards.
- Platform `application_fee_amount` on any tier. Monetization is flat-rate subscription.
- Life-membership semantics. Disabled from UI pending org-specific rules (see Scope additions).
- A "platform holds money" fallback for orgs that can't open a Stripe account. If they don't have one, their invoices show "Pay by Check" instructions only.

## Architecture

Three tiers of billing entities, each with its own Stripe Connect account. A single polymorphic `Invoice` model represents any legal billing relationship; a single polymorphic `Payment` model records any resulting payment.

```
Organization (HQ)
 │  • stripe_account_id (NEW)
 │  • can issue invoices to: chapters, users
 │  • billing authority: OrganizationMembership.admin
 ▼
Region
 │  • stripe_account_id (NEW)
 │  • can issue invoices to: chapters, users
 │  • billing authority: RegionMembership.regional_treasurer
 ▼
Chapter
    • stripe_account_id (existing)
    • can issue invoices to: users
    • billing authority: ChapterMembership.treasurer
```

**Legal `(issuer, target)` combinations** — anything else is rejected at validation:

| Issuer | Target | Example use case |
|---|---|---|
| `chapter` | `user` | Chapter dues, late fees, adjustments |
| `region` | `chapter` | Regional head tax |
| `region` | `user` | Regional conference registration, regional dues |
| `organization` | `chapter` | National head tax, charter fees |
| `organization` | `user` | National dues, convention tickets |

## Data model changes

### `Invoice` — add polymorphic columns

Legacy columns are retained through migration and dropped in the final cleanup deploy.

**New columns:**
- `issuer_type: str` — `"organization" | "region" | "chapter"`
- `issuer_id: str` — UUID of issuing entity (polymorphic, validated in app code)
- `target_type: str` — `"chapter" | "user"`
- `target_id: str` — UUID of billed entity

**Legacy columns (kept through Deploy 4, dropped in Deploy 5):**
- `scope`, `chapter_id`, `billed_user_id`, `region_id`, `billed_chapter_id`, `fee_type_id`

**Validation invariant** (enforced in the create route and covered by tests):

```
Valid (issuer_type, target_type) tuples:
  ("chapter", "user")
  ("region", "chapter")
  ("region", "user")
  ("organization", "chapter")
  ("organization", "user")
All others → 400.
```

**Invoice number prefix** by issuer tier:
- `ORG-YYYY-####` for organization-issued
- `RGN-YYYY-####` for region-issued
- `INV-YYYY-####` for chapter-issued

### `Payment` — add polymorphic columns

**New columns:**
- `payer_type: str` — `"user" | "chapter"`
- `payer_id: str`
- `receiver_type: str` — `"organization" | "region" | "chapter"`
- `receiver_id: str`

**Legacy columns** (`chapter_id`, `user_id`) become nullable during migration, dropped in Deploy 5.

### `Organization` — add Stripe fields

- `stripe_account_id: str | None`
- `stripe_onboarding_complete: bool` (default `False`)

### `Region` — add Stripe fields

Same two fields as Organization.

### No new fee type catalog at Region/Org

Per the invoice-only decision, Region and Org billing uses free-text `description`. Structured categorization is a follow-up if anyone needs it.

### Scope addition: disable life membership

- Remove `"life"` from the member_type dropdown in Members page and Member edit modal.
- Remove the `member_type != "life"` filter from `bulk_create_invoices` (becomes a no-op since no new life members can be created; keeps code surface smaller).
- **Do not** migrate existing `member_type='life'` rows. They remain in the DB; they behave as regular members going forward. Officers can manually re-categorize if they want.
- Re-enabling life membership becomes a future feature tied to per-org exemption rules.

## Stripe Connect onboarding

Three parallel OAuth flows, all routed through a shared `stripe_connect_service.complete_oauth(entity)` helper to avoid triplicating logic.

**Chapter (existing):**
```
POST /api/stripe/connect         treasurer+
POST /api/stripe/callback
GET  /api/stripe/account
DELETE /api/stripe/disconnect    president
```

**Region (NEW):**
```
POST /api/stripe/region/<region_id>/connect      regional_treasurer+
POST /api/stripe/region/<region_id>/callback
GET  /api/stripe/region/<region_id>/account
DELETE /api/stripe/region/<region_id>/disconnect
```

**Organization (NEW):**
```
POST /api/stripe/org/connect     org admin
POST /api/stripe/org/callback
GET  /api/stripe/org/account
DELETE /api/stripe/org/disconnect
```

Entities without Stripe connected continue to function for invoicing — their invoices simply cannot be paid by card, only via check/bank transfer (recorded manually).

## Webhook routing

Single `/webhook` endpoint continues to receive all Stripe events across all connected accounts (endpoint is registered with Stripe as "Connected and v2 accounts" — unchanged).

**New entity lookup at webhook entry:**

```python
def _find_receiving_entity(stripe_account_id: str) -> tuple[str, str] | None:
    """Returns (receiver_type, receiver_id) or None if not found."""
    chapter = Chapter.query.filter_by(stripe_account_id=stripe_account_id).first()
    if chapter:
        return ("chapter", chapter.id)
    region = Region.query.filter_by(stripe_account_id=stripe_account_id).first()
    if region:
        return ("region", region.id)
    org = Organization.query.filter_by(stripe_account_id=stripe_account_id).first()
    if org:
        return ("organization", org.id)
    return None
```

Per-table unique index on `stripe_account_id` guards against accidental double-assignment within one tier. Stripe account IDs are globally unique, so cross-tier collisions cannot occur.

**`checkout.session.completed` handling:**
- Read `invoice_id` from Session metadata (set when creating the Session).
- Create `Payment` with `(payer_type, payer_id, receiver_type, receiver_id)` derived from the invoice.
- Dual-write legacy `chapter_id` / `user_id` columns during the migration window.
- If `receiver_type == "chapter"`: run existing dues-apply logic (`apply_payment`, `recompute_financial_status`).
- If `receiver_type` is `"region"` or `"organization"`: mark Invoice paid, then `recompute_financial_status` for any of the user's chapter memberships so the cross-tier clause fires.

## Routes and permissions

### Chapter → Member (existing)

No API surface change. Internals refactor to write polymorphic columns.

```
POST   /api/invoices                             treasurer+
GET    /api/invoices
GET    /api/invoices/<id>
PATCH  /api/invoices/<id>
POST   /api/invoices/<id>/send
POST   /api/invoices/bulk
POST   /api/invoices/bulk-send
GET    /api/invoices/summary
GET    /api/invoices/chapter-bills               treasurer+ (bills owed by chapter)
```

### Region → Chapter (existing)

No API surface change. Internals refactor.

```
GET    /api/invoices/regional/<region_id>        regional member+
POST   /api/invoices/regional/<region_id>        regional_treasurer+
POST   /api/invoices/regional/<region_id>/bulk
PATCH  /api/invoices/regional/<region_id>/<id>
```

### Region → Member (NEW)

```
POST   /api/invoices/regional/<region_id>/member           regional_treasurer+
POST   /api/invoices/regional/<region_id>/member/bulk      regional_treasurer+
```

`bulk` invoices every active member across every chapter in the region (regional dues use case).

### Org → Chapter (NEW)

```
GET    /api/invoices/org/<org_id>                          org admin
POST   /api/invoices/org/<org_id>/chapter                  org admin
POST   /api/invoices/org/<org_id>/chapter/bulk             org admin
PATCH  /api/invoices/org/<org_id>/<id>                     org admin
```

### Org → Member (NEW)

```
POST   /api/invoices/org/<org_id>/member                   org admin
POST   /api/invoices/org/<org_id>/member/bulk              org admin
```

### Member-facing unified view (NEW)

```
GET    /api/invoices/mine                                  any authenticated user
```

Returns all invoices where `target_type='user' AND target_id=current_user.id`, enriched with issuer name and type. Powers the `/bills` frontend page.

### Pay flow (NEW for non-chapter)

```
POST   /api/invoices/<id>/pay
```

- For `target_type='user'` invoices: must be the billed user.
- For `target_type='chapter'` invoices: must be treasurer+ of the billed chapter.
- Creates a Stripe Checkout Session against the issuer's `stripe_account_id`, passes `invoice_id` in metadata.

### Permission summary

| Action | Required role |
|---|---|
| Create `chapter → user` invoice | `ChapterMembership.treasurer+` |
| Create `region → chapter` invoice | `RegionMembership.regional_treasurer+` |
| Create `region → user` invoice | `RegionMembership.regional_treasurer+` |
| Create `organization → chapter` invoice | `OrganizationMembership.admin` |
| Create `organization → user` invoice | `OrganizationMembership.admin` |
| View own invoices | authenticated user, filtered by `target_id=self` |
| Pay invoice with `target_type='user'` | the billed user themselves |
| Pay invoice with `target_type='chapter'` | treasurer+ of the billed chapter |
| Cross-entity view (all invoices everywhere) | existing `isOrgAdmin` / platform admin |

### Module gate (Option A)

Mirroring the chapter pattern, add module gates on Region and Organization:
- `region.config.permissions.invoices`
- `organization.config.permissions.invoices`

An org can globally disable invoicing at its tier if it never uses the module. Region/Org routes check their entity's config, not the chapter's.

## Financial status cross-tier

`dues_service.recompute_financial_status(chapter, user)` extended. A member is `financial` only if **all three** hold:

1. All active-period `ChapterPeriodDues` rows satisfied (existing logic, unchanged).
2. No outstanding `sent`/`overdue` Region invoices targeting the user within the user's organization.
3. No outstanding `sent`/`overdue` Organization invoices targeting the user in the user's organization.

```python
def _has_outstanding_external_invoices(user_id: str, org_id: str) -> bool:
    return db.session.query(Invoice).filter(
        Invoice.target_type == "user",
        Invoice.target_id == user_id,
        Invoice.issuer_type.in_(("region", "organization")),
        Invoice.status.in_(("sent", "overdue")),
        or_(
            and_(Invoice.issuer_type == "organization", Invoice.issuer_id == org_id),
            and_(Invoice.issuer_type == "region", Invoice.issuer_id.in_(
                db.session.query(Region.id).filter_by(organization_id=org_id)
            )),
        ),
    ).first() is not None
```

Cross-org isolation is critical: an invoice issued by Org B must never affect a member's financial status within Org A.

**New trigger points** (added to existing invoice handlers):
- Invoice status → `sent`: call `recompute_financial_status` for `target` user (could flip `financial → not_financial`).
- Invoice status → `paid`: call `recompute_financial_status` (could flip `not_financial → financial`).
- Invoice status → `cancelled`: call `recompute_financial_status` (cancellation treated as forgiveness).

**Edge cases:**
- **Member with no active chapter membership:** `recompute_financial_status` is a no-op (no `ChapterMembership` to update). Outstanding invoices still show on `/bills`, just no status to flip.
- **Neophyte member type:** existing short-circuit holds — never flips regardless of invoice state.

## Frontend: unified member inbox

### New page: `/bills`

Distinct from `/dues` — that remains the per-fee-type periodic dues breakdown. `/bills` is the ad-hoc invoice inbox.

- Lists all invoices from `GET /api/invoices/mine`.
- Each row shows: issuer name, issuer tier badge (ORG / REGION / CHAPTER), description, amount, due date, status.
- Left-border color strip keyed to issuer tier.
- Rows follow the editorial theme: cream surfaces, sharp corners, no rounded-xl or backdrop-blur.
- "Pay with Card" CTA when the issuer has Stripe connected; otherwise "Pay by Check" with issuer-configured instructions.

### Chapter officer view: bills owed by chapter

Extend existing `/regional/bills` page (rename to "Bills Owed by Chapter" or similar) to show both region-issued-to-chapter AND org-issued-to-chapter invoices. Query:
```
target_type='chapter' AND target_id=current_chapter.id
```

### Dashboard inbox additions

Extend `GET /api/dashboard/inbox`:
- `bill_outstanding` — sent, not yet overdue (`warning`)
- `bill_overdue` — overdue (`critical`)

Both link to `/bills`. Existing `dues_overdue` is separate and continues to link to `/dues`.

### Settings additions

- **Settings → Organization → Billing** (admin only): connect/disconnect Stripe, set check-payment instructions.
- **Settings → Region → Billing** (regional_treasurer only, per region): same controls.
- Reuses the existing chapter Stripe connect component with entity context passed in — one React component, three mount points.

### Notifications

Extend `Notification.notification_type` to include `bill_org` and `bill_region`. Sending an invoice (status → sent) creates both an in-app notification and a Resend email with a deep link to `/bills`.

## Migration strategy

Five deploys, each independently reversible.

### Deploy 1 — Additive schema + Stripe Connect at new tiers

1. Alembic: add polymorphic columns to `Invoice` (nullable) and `Payment` (nullable).
2. Alembic: add `stripe_account_id`, `stripe_onboarding_complete` to `Organization` and `Region`.
3. Extract shared Stripe OAuth helper.
4. Ship new `/api/stripe/org/*` and `/api/stripe/region/<id>/*` routes.
5. **Behavior unchanged** — existing chapter flow still reads/writes legacy columns.
6. **Ship gate:** existing chapter invoicing and payments unaffected in smoke test.

### Deploy 2 — Backfill + dual-write

1. Alembic data migration: populate new polymorphic columns for every existing Invoice and Payment row.
   - `scope="member"` → `(issuer=chapter, target=user)`
   - `scope="chapter"` → `(issuer=region, target=chapter)`
   - `Payment` rows → `(payer=user, receiver=chapter)`
2. Update invoice/payment create handlers and webhook to dual-write (legacy AND polymorphic columns).
3. **Ship gate:** backfill SQL spot-check; new rows verified dual-writing; reads still serve off legacy columns.

### Deploy 3 — Cut reads over to polymorphic columns

1. Update all queries reading `scope`, `chapter_id`, `region_id`, `billed_user_id`, `billed_chapter_id` to read `issuer_type/id` and `target_type/id`.
2. Legacy columns still written, no longer read.
3. Extend `recompute_financial_status` with the Region/Org outstanding-invoice clauses.
4. Add trigger points on invoice status transitions.
5. **Riskiest deploy** — new columns become authoritative. Mitigation: canary or 24h close monitoring post-deploy. Backup DB immediately before.

### Deploy 4 — New billing flows + member UI

1. Land Region→Member, Org→Chapter, Org→Member invoice endpoints and bulk variants.
2. Land `/bills` page and `GET /api/invoices/mine` API.
3. Land dashboard inbox item types (`bill_outstanding`, `bill_overdue`).
4. Settings tabs: Organization Billing, Region Billing.
5. Disable life membership UI; remove bulk-invoice life filter.
6. **Ship gate:** all legal `(issuer, target)` combinations tested end-to-end via automation.

### Deploy 5 — Cleanup (can be deferred indefinitely)

1. Alembic: set polymorphic columns `NOT NULL`, drop legacy columns, remove dual-write code paths.
2. Pure housekeeping — no user-visible change.

### Feature flags

Skipped. Region→Member, Org→Chapter, Org→Member are net-new surfaces that don't exist until Deploy 4; there's nothing to gate. If we want a soft-launch, we can limit new routes to a specific `organization_id` before wide availability.

## Testing strategy

Given that financial test coverage is a known top concern, this spec materially expands backend test coverage as part of the work — there is currently no `test_invoices.py` at all.

### New test files

**`tests/test_invoices.py`** (backfills missing coverage):
- Chapter→member lifecycle: create, send, mark paid, cancel.
- Region→chapter head tax: flat amount, per-member rate, bulk, member count snapshot correctness.
- Permission boundaries: member can't create; Chapter A treasurer can't touch Chapter B; regional_treasurer can't issue chapter invoices.
- Status transitions: invalid transitions return 400.
- Invoice number uniqueness under concurrent creation (seeded single-threaded; bulk offset correctness).

**`tests/test_invoices_polymorphic.py`** (new flows):
- Region→user, Org→chapter, Org→user: create, send, pay (webhook-mocked), status transitions.
- Polymorphic invariant: all illegal `(issuer, target)` combos rejected.
- Cross-org isolation: Org A user never sees Org B invoices; Org B admin can't target Org A users.
- `GET /api/invoices/mine` returns the union from all three issuer tiers with correct issuer metadata enrichment.

**`tests/test_stripe_connect_multi_tier.py`**:
- Organization OAuth happy path, role-gated to admin.
- Region OAuth happy path, region-scoped.
- `_find_receiving_entity` webhook router correctness across all three tables.
- Checkout Session builder picks the correct `stripe_account` per invoice issuer.
- Issuer without Stripe connected: pay-by-card path returns 400 with the right error.

**`tests/test_dues_service.py`** (backfills missing coverage on the most critical service):
- `recompute_financial_status` cross-tier: outstanding region invoice → `not_financial`; outstanding org invoice → `not_financial`; all three tiers paid → `financial`.
- Invoice `sent` trigger flips status; `paid` reverses; `cancelled` treated as forgiveness.
- Neophyte short-circuit holds regardless of pending invoices at any tier.
- Cross-org isolation: Org B invoice outstanding doesn't affect member's status in Org A.
- Legacy life-member rows behave as regular members for status calculations.

### Test fixtures (conftest.py)

- `factory_organization_with_stripe` — org with a fake connected `stripe_account_id`.
- `factory_region_with_stripe` — region with fake connected `stripe_account_id`.
- `factory_invoice(issuer, target, **kwargs)` — polymorphic helper to create any legal shape.
- `mock_stripe_webhook_event(event_type, account_id, ...)` — reusable webhook event fixture.

### Migration tests

Each Alembic migration (1, 2, 3, 4, 5) gets `upgrade()`/`downgrade()` reversibility coverage against a seeded database. The Deploy 2 backfill migration specifically seeds a DB with legacy rows, runs the backfill, and asserts polymorphic columns populated correctly.

### Out of scope for automated tests

- Stripe's own API: mocked at the boundary. End-to-end against live Stripe is a manual acceptance step before each production deploy.
- Frontend component snapshots: TypeScript and build gates are the only checks.
- Load testing: no meaningful load yet.

## Open questions

None as of 2026-04-24. All design decisions confirmed with Brandon during brainstorming.

## Scope summary

| # | Decision |
|---|---|
| 1 | Support Region→Chapter, Region→Member, Org→Chapter, Org→Member flows. |
| 2 | Each billing entity owns its own Stripe Connect account. No platform fee. |
| 3 | Polymorphic `Invoice` and `Payment` models with `issuer_type/id` + `target_type/id` and `payer_type/id` + `receiver_type/id`. |
| 4 | Unified `/bills` page for members, one API (`GET /api/invoices/mine`), issuer-labeled rows. |
| 5 | Invoice-only at Region/Org tiers; no dues periods. Recurring templates on roadmap. |
| 6 | Cross-tier financial_status: any outstanding invoice at any tier → `not_financial`. |
| 7 | Org billing authority uses existing `admin` role. `org_treasurer` deferred. |
| 8 | Life membership disabled in UI; existing rows untouched; per-org semantics deferred. |
| 9 | 4-deploy staged migration + 5th cleanup deploy. No global feature flag. |
| 10 | Net-new test files: `test_invoices.py`, `test_invoices_polymorphic.py`, `test_stripe_connect_multi_tier.py`, `test_dues_service.py`. |
