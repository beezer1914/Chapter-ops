# Chapter Approval Guardrails — Design Spec

**Date:** 2026-04-23
**Author:** Brandon Holiday (designed w/ Claude)
**Status:** Approved — ready for implementation plan

## Problem

Today any authenticated user can:

1. `POST /api/onboarding/organizations` and become the "admin" of any org name they submit — including impersonating real NPHC orgs (Phi Beta Sigma, Alpha Kappa Alpha, etc.).
2. `POST /api/onboarding/chapters` under any existing org and instantly become that chapter's president, with no approval, no dedup, and no verification of their relationship to the org.

There are no guardrails. The reputational blast radius for a fake NPHC chapter is high — these orgs police their brand aggressively, and a fraudulent "Alpha Chapter of ΦΒΣ" operating on ChapterOps would be a serious incident.

## Goals

- Prevent org impersonation by removing public org-creation.
- Require human approval before a new chapter goes live under an existing org.
- Block obvious duplicate registrations (race-to-claim a real chapter's name).
- Support **grassroots adoption** — individual chapters using the tool without their IHQ onboard — without creating a permanent bottleneck.
- Ship today.

## Non-goals

- Org "claim" flow (how an IHQ takes over a seeded org record). Manual SQL / one-off script during beta.
- Auto-verification signals (email domain, payment-as-proof, etc.). Future-features.
- Bulk approve/reject. Future.
- Retroactive changes to existing orgs/chapters in the production database. This spec covers new creation only; data migration for existing records is called out where relevant but kept surgical.

## Architecture

Three moving pieces:

### 1. Org seeding + locked org creation

- A new Alembic data migration seeds the nine NPHC ("Divine Nine") organizations as canonical org records with `name`, `abbreviation`, `greek_letters`, `org_type`, `council="NPHC"`, `founded_year`, and `motto`. No `OrganizationMembership` rows are created — seeded orgs are **unclaimed** until a real IHQ user is manually promoted to admin.
- `POST /api/onboarding/organizations` becomes gated behind `current_user.role == "admin"` (platform admin). The endpoint continues to work — it's just no longer reachable to general users. Self-serve org creation for non-NPHC groups is deferred.
- **Existing data concern:** Brandon's production database already contains a Phi Beta Sigma org record (from the Sigma Finance era) with Brandon as `OrganizationMembership(role="admin")`. The seed migration **must detect** existing orgs by `abbreviation` and skip them rather than creating duplicates or overwriting the admin row.

### 2. `ChapterRequest` entity

Separate from `Chapter`. Captures a pending ask; on approval, creates the real `Chapter`, initial `ChapterPeriod`, and founder `ChapterMembership` atomically.

#### Model

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `requester_user_id` | UUID FK → user | Required |
| `organization_id` | UUID FK → organization | Pre-validated at submit |
| `region_id` | UUID FK → region | Pre-validated at submit |
| `name` | str | Chapter name |
| `designation` | str, nullable | e.g. "Beta Zeta" |
| `chapter_type` | enum | `undergraduate` / `graduate` |
| `city` | str, nullable | |
| `state` | str, nullable | |
| `country` | str, default "United States" | |
| `timezone` | str, default "America/New_York" | |
| `founder_role` | enum | `member` / `secretary` / `treasurer` / `vice_president` / `president` |
| `status` | enum | `pending` / `approved` / `rejected` / `cancelled` |
| `approver_scope` | enum | `org_admin` / `platform_admin` — resolved at submit time |
| `approved_by_user_id` | UUID FK → user, nullable | Populated on approve or reject |
| `rejected_reason` | text, nullable | **Required** on reject |
| `resulting_chapter_id` | UUID FK → chapter, nullable | Populated on approve — traceability |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `acted_at` | timestamp, nullable | When approved or rejected |

#### Indexes

- `(organization_id, region_id, name_normalized)` **partial unique index WHERE status = 'pending'** — prevents two concurrent pending requests for the same name.
- `(requester_user_id, status)` — fast lookup for "does this user have a pending request?"
- `(approver_scope, status)` — fast lookup for approver queues.

`name_normalized` is computed (Python-side, stored in a separate column): lowercase, strip whitespace and non-alphanumerics. Dedup check also runs against the `Chapter` table with the same normalization.

#### No changes to `Chapter`

The `Chapter` model stays exactly as-is. A chapter row exists if and only if the chapter is real and active. Rejected/cancelled/pending requests never pollute the chapter space.

### 3. Approval routing

Resolved at submit time and stored on the request row:

```
if OrganizationMembership.query.filter_by(
    organization_id=org.id, role="admin"
).exists():
    approver_scope = "org_admin"
else:
    approver_scope = "platform_admin"
```

Approve/reject endpoints validate the caller's authority matches `approver_scope` — an org admin for the relevant org, OR a platform admin if scope is `platform_admin`. Platform admins also have implicit authority over `org_admin`-scoped requests for oversight (deferred — not exposed in UI day one).

### 4. "Unaffiliated" default region for grassroots chapters

The seed migration creates one `Region` per seeded org with `name="Unaffiliated"`, `description="Default region for chapters operating outside a formal IHQ regional structure."`. Grassroots chapter requests default into it during the region-selection step.

If an IHQ later claims the org and creates real regions, existing chapters in "Unaffiliated" can be moved via the existing region-transfer flow.

## API surface

### New — requester endpoints (`/api/onboarding/chapter-requests/*`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/onboarding/chapter-requests` | `@login_required` | Submit request. Runs dedup check against both `ChapterRequest` (pending) and `Chapter` tables. Resolves `approver_scope`. Stores request. Returns `{ request_id, status, approver_scope }`. |
| `GET` | `/api/onboarding/chapter-requests/mine` | `@login_required` | Returns the user's current pending/recent request (holding screen polls this). |
| `DELETE` | `/api/onboarding/chapter-requests/<id>` | requester only, status = pending | Cancels the request. Sets `status="cancelled"`. |

### New — approver endpoints (`/api/chapter-requests/*`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/chapter-requests/pending` | org admin OR platform admin | Returns pending requests the caller is authorized to act on (scoped by `approver_scope` + caller's authority). Includes requester name/email for context. |
| `POST` | `/api/chapter-requests/<id>/approve` | scoped by `approver_scope` | Executes creation transaction. |
| `POST` | `/api/chapter-requests/<id>/reject` | scoped by `approver_scope` | Body: `{ reason: string }` — required, non-empty. |

### Modified

- `POST /api/onboarding/organizations` — gated behind `current_user.role == "admin"`. Returns 403 for non-platform-admins.
- `POST /api/onboarding/chapters` — **removed**. Frontend is updated to call `/api/onboarding/chapter-requests` instead. No compatibility shim — this is an internal API and all callers are ours.

### Blueprint registration

- New `chapter_requests_bp` registered and CSRF-exempted per project convention in [app/__init__.py](chapter-ops/backend/app/__init__.py).

## Approval transaction

On `POST /api/chapter-requests/<id>/approve`:

Two concurrency defenses before the creation block:

1. **Row lock on the request** (`SELECT ... FOR UPDATE` on the `ChapterRequest` row) to prevent two approvers racing on the same request. If `status != "pending"` after the lock is acquired, return 409.
2. **Re-check dedup against `Chapter`** at approve time. Between submit and approve, another chapter with the same `(organization_id, region_id, name_normalized)` may have been created. If found, return 409 and surface an error to the approver — do not create a duplicate chapter silently.

Then the creation transaction:

```
with db.session.begin():
    chapter = Chapter(...)  # populated from ChapterRequest fields
    db.session.add(chapter)
    db.session.flush()  # obtain chapter.id

    period = ChapterPeriod(...)  # same auto-period logic currently in create_chapter
    db.session.add(period)

    membership = ChapterMembership(
        user_id=request.requester_user_id,
        chapter_id=chapter.id,
        role=request.founder_role,
        member_type=ChapterMembership.default_member_type_for(chapter),
    )
    db.session.add(membership)

    # Requester's active chapter flips to the new one
    requester = db.session.get(User, request.requester_user_id)
    requester.active_chapter_id = chapter.id

    request.status = "approved"
    request.approved_by_user_id = current_user.id
    request.resulting_chapter_id = chapter.id
    request.acted_at = datetime.utcnow()
```

Emits notification + email to requester (see Notifications section). Returns `{ success: true, chapter: chapter.to_dict() }`.

The logic is lifted from the current [onboarding.py:195-265](chapter-ops/backend/app/routes/onboarding.py#L195-L265) into a reusable service function (`chapter_service.create_chapter_from_request(request)`) so approve is the single caller.

## Rejection

On `POST /api/chapter-requests/<id>/reject`:

- Body requires `reason` (non-empty string).
- Sets `status="rejected"`, `rejected_reason=reason`, `approved_by_user_id=current_user.id`, `acted_at=now()`.
- Fires email + in-app notification to requester.
- Request row retained for audit.

The requester can submit a new request immediately — no cooldown, no auto-expiry during beta. A new request is a new row, not a resurrection of the old one.

## Notifications

All via the existing [notification_service.py](chapter-ops/backend/app/services/notification_service.py) + [email.py](chapter-ops/backend/app/utils/email.py) infrastructure.

### On submit

- **Approvers:** email + in-app notification to all users whose authority matches `approver_scope`:
  - `org_admin` scope → all `OrganizationMembership(org_id, role="admin")` users
  - `platform_admin` scope → all `User(role="admin")` users
- Subject: `New chapter request: {chapter_name} ({org.abbreviation})`
- Body: requester name/email, chapter details, CTA link to `/ihq`.

### On approve

- **Requester:** email + in-app notification.
- Subject: `Your chapter has been approved — welcome to ChapterOps`
- Body: chapter name, login CTA.

### On reject

- **Requester:** email + in-app notification.
- Subject: `Your chapter request was not approved`
- Body: rejection reason, CTA to submit a new request.

## UX

### Onboarding flow — [frontend/src/pages/onboarding/ChapterStep.tsx](chapter-ops/frontend/src/pages/onboarding/ChapterStep.tsx)

- Submit handler changes from `POST /api/onboarding/chapters` → `POST /api/onboarding/chapter-requests`.
- Response includes `approver_scope`. Frontend routes the user:
  - Always to a "Pending Approval" holding screen after submit. (There's no longer a path where submit → chapter exists immediately.)

### Pending screen — new component

Replaces the progressive-checklist success flow for users with a pending request.

- Displays request summary (org, region, chapter name, city/state, submitted date).
- Displays approver context:
  - `org_admin` scope → "Waiting on {org.name} IHQ to review."
  - `platform_admin` scope → "Waiting on ChapterOps platform admin to review."
- [Cancel Request] button (calls DELETE endpoint, returns user to onboarding step 1).
- Polls `GET /api/onboarding/chapter-requests/mine` every 30s for status changes. On `approved`, reloads the page and redirects into the new chapter dashboard (auth store refresh picks up `active_chapter_id`). On `rejected`, shows the rejection reason and a [Start New Request] button.

### `ProtectedRoute` gate

A user with `status="pending"` on their latest request and no active chapter membership must land on the pending screen. They cannot navigate to `/dashboard`, `/dues`, etc. until approved.

### `SuccessStep.tsx` (existing progressive checklist)

Retained for the approved path — the 6-step checklist renders once the user lands in their brand-new chapter dashboard after approval.

### Approver UI — [frontend/src/pages/IHQDashboard.tsx](chapter-ops/frontend/src/pages/IHQDashboard.tsx)

Extend with a new top section: **"Pending Chapter Requests"**.

- Table of requests the current user is authorized to act on. Columns: requester (name + email), chapter name, region, city/state, type, founder_role, submitted date, actions.
- `[Approve]` button — POSTs to approve endpoint, row disappears from list on success.
- `[Reject]` button — opens modal with required textarea for rejection reason. POSTs on submit.
- Platform admins see an additional **"Platform Queue"** subsection showing `platform_admin`-scoped requests.
- Empty state: "No pending chapter requests."

### Frontend service + types

- New `chapterRequestService.ts` with `submitChapterRequest`, `fetchMyRequest`, `cancelRequest`, `fetchPendingApprovals`, `approveRequest`, `rejectRequest`.
- New TypeScript types in [frontend/src/types/](chapter-ops/frontend/src/types/).

### 401 interceptor allowlist

Per project memory, new public-adjacent routes must be added to the 401 interceptor allowlist in [frontend/src/lib/api.ts](chapter-ops/frontend/src/lib/api.ts). In this case, the chapter-request endpoints are auth-required, so **no allowlist changes needed** — noting here so reviewers don't miss it.

## Data migration

A single Alembic migration delivers all schema + seed changes atomically. Chronological order:

1. Create `chapter_request` table with all columns + indexes.
2. Seed 9 NPHC orgs. For each: check by `abbreviation`, insert only if missing. Records created with canonical names, NPHC council, founded years, Greek letters, and mottos.
3. For each seeded org (including any that already existed like PBS), upsert one `Region(name="Unaffiliated")` if no region with that name exists for that org.

Downgrade reverses in the opposite order but **does not delete seeded orgs or regions** if they have dependent data — prints a warning instead. (Standard safe-downgrade pattern for data migrations.)

## Testing

Unit tests (pytest, existing test infrastructure) covering:

- **Model:** `ChapterRequest` dedup normalization (case + whitespace + punctuation).
- **Submit endpoint:**
  - Happy path for claimed org → `approver_scope="org_admin"`.
  - Happy path for unclaimed org → `approver_scope="platform_admin"`.
  - Duplicate name (active chapter) → 409.
  - Duplicate name (pending request) → 409.
  - Invalid founder_role / chapter_type → 400.
- **Approve endpoint:**
  - Creates chapter + period + membership + flips `active_chapter_id`.
  - Request marked approved with `resulting_chapter_id` set.
  - Org admin cannot approve a `platform_admin`-scoped request.
  - Platform admin cannot approve org-admin-scoped request (for day one).
  - Idempotent guard: re-approving a non-pending request returns 409.
- **Reject endpoint:**
  - Missing reason → 400.
  - Authority check same as approve.
  - Requester can submit new request after rejection.
- **Org creation gating:** non-platform-admin → 403.
- **Seed migration:** running twice does not duplicate orgs or regions (idempotency).

Manual smoke:

- Grassroots flow end-to-end (create account, pick AKA, submit request, approve as platform admin, land in new chapter dashboard).
- IHQ flow end-to-end (create account under PBS, request goes to Brandon as org admin, approve via IHQ dashboard).
- Rejection with reason, requester sees reason, requester resubmits.

## Rollout

- Feature ships behind no flag — it's a security fix, should go live immediately on deploy.
- Existing chapters are unaffected (this is creation-flow only).
- Existing org records are unaffected (seed migration skips by abbreviation).
- No downtime required.

## Deferred (follow-ups, not part of this spec)

- Org claim flow — how an IHQ user is promoted to `OrganizationMembership(role="admin")` for their org. Manual SQL during beta.
- Auto-verification signals to reduce platform-admin load at scale (email domain checks, Stripe payment as proof, etc.).
- Bulk approve/reject UI.
- Platform admin oversight view of all `org_admin`-scoped requests across the platform.
- Request expiry (auto-reject after N days of inaction).
- Notification preference toggle for approvers who don't want per-request emails.
- Rate limiting on submit endpoint (prevent spam — not urgent at beta volume, existing Flask-Limiter infra can layer on trivially later).

## Open questions

None remaining at spec time. Any decisions uncovered during implementation will be recorded in the implementation plan.
