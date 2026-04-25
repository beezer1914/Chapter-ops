# Demo Organization Seed — Design

**Status:** Draft
**Date:** 2026-04-25
**Author:** Brandon (with Claude)

## Purpose

Stand up a persistent, fictional, fully populated organization in the production database that Brandon can use during prospect demos. The demo must show every role tier (general member → chapter officer → regional officer → IHQ admin) and surface enough data that dashboards, analytics, and inboxes look "lived-in" rather than empty.

The script is also useful as a regression sanity check: if seeding fails, something material has changed in the data model.

## Non-Goals

- Not a generic test fixture for unit tests (those should mock at a finer grain).
- Not a multi-org demo. One org, end of story.
- Not a way to demo real Stripe payment flow end-to-end (Stripe Connect is stubbed).
- Not used in CI.

## Approach

Single CLI module — `app/cli/seed_demo.py` — exposing two commands wired up in `app/__init__.py`:

- `flask seed-demo-org` — idempotent create/upsert.
- `flask teardown-demo-org [--confirm]` — destructive reset, dry-run by default.

Mirrors the existing `make-org-admin` / `send-dues-reminders` CLI idiom. No new abstractions, no new dependencies, no fixture file format. Just imperative Python that calls existing models and services.

## What Gets Seeded

### Organization

- **Name:** Demo Greek Letter Organization
- **Abbreviation:** DGLO
- **Branding:** default editorial theme (no custom colors)
- **Status:** active, pre-approved (bypasses the chapter-approval flow — we are inserting trusted seed records, not exercising the approval workflow)

### Regions (2)

| Name |
|---|
| Eastern Region |
| Western Region |

### Chapters (6)

| Name | Region | Type | Stripe |
|---|---|---|---|
| Alpha Chapter | Eastern | collegiate | stubbed (`acct_demo_alpha`) |
| Beta Chapter | Eastern | collegiate | stubbed (`acct_demo_beta`) |
| Eastern Graduate Chapter | Eastern | graduate | stubbed (`acct_demo_east_grad`) |
| Gamma Chapter | Western | collegiate | stubbed (`acct_demo_gamma`) |
| Delta Chapter | Western | collegiate | stubbed (`acct_demo_delta`) |
| Western Graduate Chapter | Western | graduate | stubbed (`acct_demo_west_grad`) |

Each chapter receives:
- 1 active billing period — "Spring 2026" (semester type, today-anchored start/end so it stays current as the script is re-run over months).
- 2 fee types — "Chapter Dues" $200, "National & Regional" $225.
- Dues rows seeded for every member × fee type via the existing `dues_service.seed_period_dues`.

### People (53 total user accounts)

All emails follow the pattern `bholi1914+demo-<slug>@gmail.com` so they route to Brandon's real Gmail inbox via plus-addressing. All accounts share password `DemoChapter2026!` (meets the 12+ char + uppercase + lowercase + digit + special requirement and is hashed via the User model's normal bcrypt path).

| Tier | Count | Email slug pattern | Role anchoring |
|---|---|---|---|
| IHQ admin | 1 | `+demo-ihq` | `OrganizationMembership.role = "admin"` on DGLO; also a general member of Eastern Graduate Chapter (`member_type=graduate`) |
| Eastern Regional Director | 1 | `+demo-east-rd` | `RegionMembership.role = "regional_director"` on Eastern; also **President** of Eastern Graduate Chapter |
| Eastern Regional Treasurer | 1 | `+demo-east-rt` | `RegionMembership.role = "regional_treasurer"` on Eastern; also **Treasurer** of Eastern Graduate Chapter |
| Western Regional Director | 1 | `+demo-west-rd` | `RegionMembership.role = "regional_director"` on Western; also **President** of Western Graduate Chapter |
| Western Regional Treasurer | 1 | `+demo-west-rt` | `RegionMembership.role = "regional_treasurer"` on Western; also **Treasurer** of Western Graduate Chapter |
| Graduate-chapter VP + Secretary | 4 | `+demo-east-grad-vp`, `+demo-east-grad-sec`, `+demo-west-grad-vp`, `+demo-west-grad-sec` | Officer roles in their grad chapter; `member_type=graduate` |
| Extra graduate members | 4 | `+demo-east-grad-m1`, `+demo-east-grad-m2`, `+demo-west-grad-m1`, `+demo-west-grad-m2` | General members of their grad chapter; `member_type=graduate` |
| Collegiate chapter officers | 16 | `+demo-{alpha,beta,gamma,delta}-{pres,vp,treas,sec}` | Full officer slate; `member_type=collegiate` |
| Collegiate general members | 24 | `+demo-{alpha,beta,gamma,delta}-m{1..6}` | General members; `member_type=collegiate` |

### Financial Status Distribution

To populate dashboards realistically:
- **~70% of all members are financial** (paid up — dues rows have `amount_paid == amount_owed`, status="paid").
- **~30% are not_financial** (dues rows have `amount_paid = 0`, status="unpaid"; member's `financial_status="not_financial"`).
- Distribution per chapter targets at least 2 not_financial members so officer dashboards have a populated "Members not financial" inbox item.
- Implementation note: applied via the existing `dues_service.apply_payment` helper for the financial members so the path matches a real treasurer recording payment, not a direct DB write.

## Engineering Details

### Idempotency

Every insert uses find-or-create on a stable unique key:

| Entity | Unique key |
|---|---|
| Organization | `abbreviation` |
| User | `email` |
| Region | `(organization_id, name)` |
| Chapter | `(organization_id, name)` |
| ChapterMembership | `(user_id, chapter_id)` |
| RegionMembership | `(user_id, region_id)` |
| OrganizationMembership | `(user_id, organization_id)` |
| ChapterPeriod | `(chapter_id, name)` |

ChapterPeriodDues are handled by the existing `dues_service.seed_period_dues` and `seed_member_dues`, which are already idempotent.

A single `db.session.commit()` is issued at the end of each phase (org → users → memberships → period → dues) rather than per-row, so partial failures roll back cleanly. Each phase prints a summary line.

### Stripe Stub

For each chapter:
- `chapter.stripe_account_id = f"acct_demo_{slug}"`
- `chapter.stripe_onboarding_complete = True` (or whatever the equivalent "is connected" flag is on the Chapter model)

**Verification needed during implementation:** confirm the exact field names on the Chapter model and the exact "is Stripe connected" check used by the frontend (`Pay Now` button visibility logic). The implementation plan will read the Chapter model and Stripe Connect routes before applying the stub.

Result: Pay Now buttons appear, dues system functions, but a real checkout attempt will fail at the Stripe API call. This is documented in the script's success output so it is not surprising during a demo.

### Output

On successful seed:

```
✅ Demo organization seeded.

  Organization:  Demo Greek Letter Organization (DGLO)
  Regions:       2 (Eastern, Western)
  Chapters:      6 (Alpha, Beta, Eastern Graduate, Gamma, Delta, Western Graduate)
  Users:         53

  Login URL:     https://chapterops.bluecolumnsystems.com/login
  Password:      DemoChapter2026!  (same for all demo users)

  Quick-pick accounts:
    IHQ admin:               bholi1914+demo-ihq@gmail.com
    Eastern Reg. Director:   bholi1914+demo-east-rd@gmail.com
    Eastern Reg. Treasurer:  bholi1914+demo-east-rt@gmail.com
    Western Reg. Director:   bholi1914+demo-west-rd@gmail.com
    Western Reg. Treasurer:  bholi1914+demo-west-rt@gmail.com
    Collegiate president:    bholi1914+demo-alpha-pres@gmail.com
    Collegiate treasurer:    bholi1914+demo-alpha-treas@gmail.com
    Collegiate member:       bholi1914+demo-alpha-m1@gmail.com
    Graduate member:         bholi1914+demo-east-grad-m1@gmail.com

  Note: Stripe is stubbed for all demo chapters — Pay Now buttons appear
  but actual checkout will fail at the Stripe API. Use the demo to walk
  prospects through the flow up to the payment screen.
```

On re-run with no changes:
```
✅ Demo organization already present — 0 new entities created, 53 existing users skipped, 6 existing chapters skipped, 6 existing periods reconciled.
```

Each phase prints `created` or `exists` per entity so the operator can tell what changed.

## Teardown

`flask teardown-demo-org` — destructive command for resetting the demo.

### Safety Rails (Non-Negotiable)

1. **Hard-coded org gate.** Operates on `abbreviation = "DGLO"` only. There is no `--org` argument and no way to point it at a different organization. Refuses to run if the DGLO record does not exist.
2. **`--confirm` flag required.** Without it, prints what *would* be deleted (counts per table) and exits 0 without touching anything. With it, the deletion runs.
3. **User deletion is double-gated.** Only deletes `User` rows whose email starts with `bholi1914+demo-` AND who have no surviving memberships in any non-DGLO chapter, region, or organization.
4. **Refuses to run if any DGLO chapter has a real Stripe charge.** If any `Payment` row tied to a DGLO chapter has a non-null Stripe charge ID (`stripe_charge_id` or equivalent — exact field name verified during implementation), the command aborts with an error message. The seed only ever creates manually-recorded Payments via `apply_payment`, which has no charge ID, so any non-null value means a real Stripe payment happened against the demo and a human should investigate before wiping it.
5. **Single transaction.** All deletions in one DB transaction — partial failures roll back, no orphaned data.

### Deletion Order

Respects FK constraints:

1. ChapterPeriodDues
2. ChapterPeriod
3. Payment, PaymentPlan, Donation, Invoice, Expense
4. EventAttendance → Event
5. WorkflowStepInstance → WorkflowInstance → WorkflowStep → Workflow
6. Notification
7. Document, KnowledgeArticle, Announcement
8. Committee
9. ChapterTransferRequest (where `from_chapter` or `to_chapter` is DGLO)
10. ChapterMembership
11. RegionMembership
12. OrganizationMembership
13. Chapter (where `organization_id = DGLO.id`)
14. Region (where `organization_id = DGLO.id`)
15. Organization (DGLO)
16. User (where `email LIKE 'bholi1914+demo-%'` AND no surviving memberships)

**Verification needed during implementation:** walk the actual model relationships and confirm this list is complete. Likely additions to investigate: `Intake` candidates, `Lineage` records, `AuthEvent` rows, `AgentRun` / `AgentApproval` rows, `IncidentReport` rows.

### Output

```
$ flask teardown-demo-org
DRY RUN — no changes made. Pass --confirm to actually delete.

Would delete from DGLO:
  Organizations:      1
  Regions:            2
  Chapters:           6
  ChapterMemberships: 53
  RegionMemberships:  4
  OrgMemberships:     1
  Users:              53
  ChapterPeriods:     6
  ChapterPeriodDues:  106 (members × fee types, summed across chapters)
  Payments:           ~74 (one per fee type for each financial member)
  Notifications:      0
  ...

$ flask teardown-demo-org --confirm
Deleting demo data for DGLO...
  ✓ Removed 106 ChapterPeriodDues
  ✓ Removed 74 Payments
  ...
  ✓ Removed organization DGLO
  ✓ Removed 53 demo users

✅ Demo organization torn down. Re-run `flask seed-demo-org` to recreate.
```

## File Layout

```
chapter-ops/backend/
└── app/
    ├── __init__.py            # register seed-demo-org and teardown-demo-org commands
    └── cli/
        ├── __init__.py        # new package
        └── seed_demo.py       # all seed/teardown logic, ~300 lines
```

The `app/cli/` package is new. Existing CLI commands live inline in `app/__init__.py`; for this larger script we extract to a dedicated module to keep `__init__.py` readable. The extraction does not move the existing inline commands — they stay where they are.

## Operational Notes

- **Where it runs:** Production. Brandon SSHes into Render or runs via Render's shell. Local dev is also supported (same command, points at local DB).
- **Run frequency:** Once for initial seed, then occasionally for teardown + reseed if the demo data drifts.
- **Effect on real users:** Zero. The demo org is fully isolated. The `bholi1914+demo-` email pattern guarantees no collision with real accounts.
- **Effect on platform metrics:** The DGLO org will appear in any cross-org analytics or reports. If that becomes a problem (e.g., skews KPIs in a future investor deck), add a `is_demo: bool` flag on Organization and exclude demo orgs from such reports. Not building that now.

## Cultural Considerations

- **Never use "Omega" as a chapter name.** Reserved in BGLO culture for deceased members. Geographic descriptors ("Eastern Graduate Chapter") used instead.
- **Member types are honored.** Graduate-chapter members are correctly typed `member_type=graduate`. Regional and IHQ officers are anchored to graduate chapters as their home, matching real BGLO governance structure.
- **Demo data is clearly labeled.** Org name "Demo Greek Letter Organization" and abbreviation "DGLO" make the fictional nature obvious to anyone viewing the data.

## Open Questions for Implementation Plan

1. Exact Chapter model field names for the Stripe stub (`stripe_account_id`, `stripe_onboarding_complete`, or different).
2. Complete list of FK-dependent tables for teardown (the listed 16 may not be exhaustive).
3. Whether `seed_period_dues` requires the period to be activated in a specific order relative to member creation, or whether the helper handles both orders.
4. Whether any chapter-level config defaults need to be set explicitly (e.g., `chapter.config.permissions`) for the demo to look correct, or whether the model's defaults suffice.

These will be resolved by reading the relevant code during the implementation-plan phase.

## Success Criteria

After running `flask seed-demo-org` for the first time on a fresh database:

1. Logging in as `bholi1914+demo-ihq@gmail.com` lands on the IHQ Dashboard with 6 chapters and 53 members visible.
2. Logging in as `bholi1914+demo-east-rd@gmail.com` lands on the Region Dashboard for Eastern showing 3 chapters.
3. Logging in as `bholi1914+demo-alpha-pres@gmail.com` shows the Alpha Chapter dashboard with the inbox populated by the "members not financial" item, the financial-status banner reading "Financial," and the chapter sidebar showing all standard officer-level nav items.
4. Logging in as `bholi1914+demo-alpha-m1@gmail.com` shows the member view with My Dues populated and the Pay Now button visible (it will fail at Stripe checkout — expected).
5. Re-running `flask seed-demo-org` reports 0 new entities and exits 0.
6. Running `flask teardown-demo-org` (no flag) prints the dry-run summary and exits 0 without touching the database.
7. Running `flask teardown-demo-org --confirm` removes every DGLO row and every `bholi1914+demo-*` user, leaving zero residue.
