# ChapterOps — System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CHAPTEROPS PLATFORM                          │
│                                                                         │
│  Multi-tenant SaaS for Greek Letter Organization Management             │
│  "One platform, every chapter"                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────────────┐
│   Browser    │  HTTPS  │   Frontend   │  /api   │      Backend         │
│   (React)    │◄───────►│  Vite Dev /  │◄───────►│   Flask + Gunicorn   │
│              │         │  Static Host │         │                      │
└──────────────┘         └──────────────┘         └──────────┬───────────┘
                                                             │
                          ┌──────────────────────────────────┼──────────┐
                          │                                  │          │
                    ┌─────▼─────┐  ┌──────────┐  ┌──────────▼────────┐ │
                    │ PostgreSQL│  │  Redis    │  │ External Services │ │
                    │ (Primary) │  │ (Cache/  │  │                   │ │
                    │           │  │  Limiter) │  │ Stripe · SendGrid│ │
                    └───────────┘  └──────────┘  │ Cloudflare R2     │ │
                                                  │ Twilio (future)  │ │
                                                  └──────────────────┘ │
                                                                        │
                          └─────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer         | Technology                                         |
|---------------|-----------------------------------------------------|
| Frontend      | React 19, TypeScript, Vite, Tailwind CSS            |
| State Mgmt    | Zustand                                             |
| Forms         | React Hook Form + Zod validation                   |
| Rich Text     | Tiptap                                              |
| HTTP Client   | Axios (session cookies, `withCredentials: true`)    |
| Backend       | Flask 3.1, Python, Gunicorn (WSGI)                  |
| ORM           | SQLAlchemy 2.0 + Alembic migrations                 |
| Database      | PostgreSQL                                          |
| Cache         | Redis (Flask-Caching)                               |
| Rate Limiting | Flask-Limiter (Redis-backed)                        |
| Auth          | Flask-Login (session-based) + bcrypt                |
| Payments      | Stripe (Connect per chapter)                        |
| Email         | SendGrid                                            |
| File Storage  | Cloudflare R2 (S3-compatible)                       |
| Scheduling    | APScheduler (background jobs in-process)            |
| Testing       | pytest (backend), Vitest + RTL (frontend)           |

---

## Multi-Tenant Hierarchy

```
┌───────────────────────────────────────────────────────────────────┐
│                    ORGANIZATION                                    │
│            (e.g., Phi Beta Sigma Fraternity)                      │
│                                                                    │
│  ← IHQ Dashboard: org-wide visibility for org admins              │
│                                                                    │
│   ┌──────────────────┐    ┌──────────────────┐                    │
│   │     REGION       │    │     REGION       │   ...              │
│   │  (e.g., Eastern) │    │  (e.g., Southern)│                    │
│   │                  │    │                  │                    │
│   │  ┌────────────┐  │    │  ┌────────────┐  │                    │
│   │  │  CHAPTER   │  │    │  │  CHAPTER   │  │                    │
│   │  │ (Tenant A) │  │    │  │ (Tenant C) │  │                    │
│   │  └────────────┘  │    │  └────────────┘  │                    │
│   │  ┌────────────┐  │    │  ┌────────────┐  │                    │
│   │  │  CHAPTER   │  │    │  │  CHAPTER   │  │                    │
│   │  │ (Tenant B) │  │    │  │ (Tenant D) │  │                    │
│   │  └────────────┘  │    │  └────────────┘  │                    │
│   └──────────────────┘    └──────────────────┘                    │
└───────────────────────────────────────────────────────────────────┘

Tenant Isolation: Every data query is scoped by chapter_id
Context: g.current_chapter set via middleware on each request
```

---

## Data Model (29 Models)

```
User ─────────────────────────────────────────────────────────────────┐
  │                                                                    │
  ├── OrganizationMembership ──► Organization                          │
  │        (role="admin" → IHQ access)         │                      │
  │                                            │                      │
  ├── RegionMembership ──────► Region ◄────────┘                      │
  │                              │                                    │
  └── ChapterMembership ────► Chapter ◄──────────────────────────────┐│
        │  (suspended, role)      │                                   ││
        │                        ├── Payment                          ││
        │                        ├── PaymentPlan                      ││
        │                        ├── Donation                         ││
        │                        ├── Invoice                          ││
        │                        ├── Expense                          ││
        │                        ├── Event                            ││
        │                        │     └── EventAttendance            ││
        │                        ├── Announcement                     ││
        │                        ├── Document                         ││
        │                        ├── KnowledgeArticle                 ││
        │                        ├── Notification (90-day purge)      ││
        │                        ├── InviteCode                       ││
        │                        ├── IntakeCandidate                  ││
        │                        ├── ChapterTransferRequest           ││
        │                        ├── WorkflowTemplate                 ││
        │                        │     ├── WorkflowStep               ││
        │                        │     └── WorkflowInstance           ││
        │                        │           └── StepInstance         ││
        │                        ├── ChapterPeriod ─────────────────┐ ││
        │                        │     (semester/annual/custom)      │ ││
        │                        │     is_active (one at a time)     │ ││
        │                        │                                   │ ││
        │                        └── ChapterPeriodDues ◄─────────────┘ ││
        │                              (user × fee_type × period)      ││
        │                              amount_owed / amount_paid       ││
        │                              status: unpaid/partial/paid/    ││
        │                                      exempt                  ││
        │                                                              ││
        └── active_chapter_id (session context) ─────────────────────┘│
                                                                       │
Agent Models (platform-internal, no chapter_id):                       │
  ├── AgentRun     (ops agent run history)                             │
  ├── AgentApproval (staged human-approval actions)                    │
  └── AuthEvent    (login/logout audit log, 90-day purge)              │
                                                                       └
```

---

## Dues System Architecture

Three-layer model for flexible, period-aware dues tracking.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DUES SYSTEM                                   │
│                                                                      │
│  Layer 1 — FeeTypes (config JSON on Chapter)                        │
│  ─────────────────────────────────────────────                      │
│  chapter.config.fee_types = [                                        │
│    { "id": "ft_abc", "label": "Chapter Dues",    "amount": 200 },   │
│    { "id": "ft_def", "label": "National & Reg",  "amount": 225 },   │
│  ]                                                                   │
│                                                                      │
│  Layer 2 — ChapterPeriod (billing period)                           │
│  ───────────────────────────────────────────                        │
│  id | chapter_id | name | period_type | start_date | end_date       │
│  is_active (one active per chapter at a time)                        │
│                                                                      │
│  Layer 3 — ChapterPeriodDues (per-member × per-fee-type × period)  │
│  ──────────────────────────────────────────────────────────────     │
│  id | chapter_id | period_id | user_id | fee_type_id                │
│  fee_type_label | amount_owed | amount_paid | status                 │
│                                                                      │
│  UNIQUE on (period_id, user_id, fee_type_id)                        │
└─────────────────────────────────────────────────────────────────────┘

dues_service.py — Single source of truth for all dues mutations
──────────────────────────────────────────────────────────────
  seed_period_dues(chapter, period)
    → Creates dues rows for all active members × all fee types
    → Idempotent (skips existing rows)
    → Called: period CREATE (if active), period ACTIVATE

  seed_member_dues(chapter, user_id)
    → Seeds a new member for the current active period only
    → Called: member registration via invite

  apply_payment(chapter, user_id, fee_type_id, amount) → bool
    → Applies payment amount to matching dues rows
    → Returns False if no dues system configured (caller falls back
      to legacy auto-promote: not_financial → financial)
    → DOES NOT COMMIT — caller is responsible

  recompute_financial_status(chapter, user_id)
    → Derives financial_status from dues rows:
        all paid → "financial"
        any unpaid → "not_financial"
    → No-op for neophyte/exempt members
    → DOES NOT COMMIT — caller is responsible

Financial Status Lifecycle:
  not_financial ──[payment applied, all dues paid]──► financial
  financial ──[new period seeded with unpaid dues]──► not_financial
  neophyte ──[exempt from dues, never changes via dues system]
  exempt   ──[manually set, never changes via dues system]
```

---

## Authentication & Authorization

```
┌─────────────────────────────────────────────────────┐
│                    AUTH FLOW                          │
│                                                      │
│  Login ──► bcrypt verify ──► Flask-Login session     │
│         └──► AuthEvent logged (success/failure)      │
│                                    │                 │
│                              ┌─────▼──────┐         │
│                              │ current_user│         │
│                              └─────┬──────┘         │
│                                    │                 │
│                    ┌───────────────▼──────────────┐  │
│                    │   Tenant Middleware           │  │
│                    │   Sets g.current_chapter      │  │
│                    │   from active_chapter_id      │  │
│                    │                               │  │
│                    │   Suspension checks:          │  │
│                    │   • chapter.suspended → 403   │  │
│                    │     (org admins bypass)        │  │
│                    │   • membership.suspended → 403│  │
│                    └───────────────┬──────────────┘  │
│                                    │                 │
│                    ┌───────────────▼──────────────┐  │
│                    │   Route Decorators            │  │
│                    │   @chapter_required           │  │
│                    │   @role_required("treasurer") │  │
│                    │   @region_role_required(...)  │  │
│                    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

CHAPTER ROLES              REGION ROLES              ORG ROLES
─────────────              ────────────              ─────────
5 admin                    5 regional_director       5 admin (IHQ)
4 president                4 regional_1st_vice       0 member
3 vice_president           3 regional_2nd_vice
2 treasurer                2 regional_treasurer
1 secretary                1 regional_secretary
0 member                   0 member
```

---

## Suspension System

Two independent suspension mechanisms exist — both reversible, both enforced in the tenant middleware.

```
MEMBER SUSPENSION                      CHAPTER SUSPENSION
─────────────────                      ──────────────────
Set by: president                      Set by: org admin (IHQ)
Scope:  individual ChapterMembership   Scope:  entire Chapter
Effect: 403 on any chapter request     Effect: 403 for all members
        member stays on roster                 org admins retain access
Fields: membership.suspended           Fields: chapter.suspended
        membership.suspension_reason           chapter.suspension_reason
API:    POST /api/members/:id/suspend  API:    POST /api/ihq/chapters/:id/suspend
        POST /api/members/:id/unsuspend        POST /api/ihq/chapters/:id/unsuspend

Both are distinct from deactivation (active=False), which is permanent roster removal.
Suspended members/chapters remain visible to officers and can be reinstated at any time.
```

---

## Data Retention & Account Lifecycle

```
USER ACCOUNT DELETION (self-service)
─────────────────────────────────────
• POST /api/auth/account (DELETE) — password-confirmed
• PII anonymized: email → deleted_{uuid}@deleted.invalid, names cleared
• Financial records preserved for 7-year compliance (FK dereferenced, not deleted)
• Session terminated, redirect to /login

CHAPTER DELETION (30-day grace period)
───────────────────────────────────────
• POST /api/config/chapter/delete — president, password + chapter name confirm
• Sets deletion_scheduled_at = now() + 30 days
• Triggers CSV export email (members, payments, donations) via SendGrid
• DELETE /api/config/chapter/delete — cancels pending deletion
• Background job (2:00am UTC nightly) hard-deletes chapters past scheduled date:
    1. Cascade delete: events, documents, memberships, announcements, etc.
    2. De-link financial records: UPDATE payment SET chapter_id = NULL
    3. Hard-delete Chapter row

NOTIFICATION PURGE
───────────────────
• Background job (3:45am UTC nightly) — deletes notifications older than 90 days
• AuthEvent records also purged at 90 days
```

---

## IHQ (International Headquarters) Dashboard

Org-admin-only cross-chapter visibility. No chapter context required — scoped at organization level.

```
GET /api/ihq/dashboard
└── Returns:
    ├── organization       (org metadata)
    ├── summary            (KPIs: chapters, members, financial rate, dues YTD, regions)
    ├── regions[]          (per-region rollup: chapter count, members, rate, dues)
    └── chapters[]         (per-chapter health: members, rate, dues, tier, suspension status)

POST /api/ihq/broadcast
└── Creates one Announcement per active chapter simultaneously

POST /api/ihq/chapters/:id/suspend    (org admin only)
POST /api/ihq/chapters/:id/unsuspend  (org admin only)

Access guard: OrganizationMembership.role == "admin" for the chapter's organization
Helper: _is_org_admin(user, org_id) in app/utils/decorators.py
```

---

## Ops Agent

Internal background system for platform health monitoring. Not user-facing.

```
┌────────────────────────────────────────────────────────────────┐
│                       OPS AGENT                                │
│                    backend/agent/                              │
│                                                                │
│  APScheduler jobs (in-process, no Celery needed):             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Every 15min: ops_agent_run()                           │   │
│  │    └── checks/stripe.py   — webhook health, missed pmts │   │
│  │    └── checks/database.py — connectivity, slow queries  │   │
│  │    └── checks/auth.py     — brute force, geo anomalies  │   │
│  │    └── checks/chapters.py — dormant, overdue plans      │   │
│  │    └── checks/storage.py  — R2 health, orphaned files   │   │
│  │                                                         │   │
│  │  Daily 7:00am UTC: ops_agent_digest()                   │   │
│  │    └── digest.py — assembles and emails morning summary │   │
│  │                                                         │   │
│  │  Daily 2:00am UTC: _process_chapter_deletions()         │   │
│  │    └── Hard-deletes chapters past deletion_scheduled_at │   │
│  │                                                         │   │
│  │  Daily 3:45am UTC: _purge_notifications()               │   │
│  │    └── Deletes notifications + AuthEvents > 90 days     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  Autonomy ladder:                                              │
│  • Read-only / notifications → fully autonomous               │
│  • Cache clear / webhook replay → autonomous + logged         │
│  • Destructive / irreversible → human approval via email link │
│                                                                │
│  Models: AgentRun, AgentApproval, AuthEvent                   │
│  Routes: GET /api/agent/status, POST /api/agent/run           │
│          GET /api/agent/approve/<token>                        │
└────────────────────────────────────────────────────────────────┘
```

---

## Request Flow

```
Browser ──► React App ──► Axios (/api/*) ──► Flask
                                               │
                                    ┌──────────▼──────────┐
                                    │  CORS / CSRF Check   │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Rate Limiter        │
                                    │  (Redis-backed)      │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Session Auth        │
                                    │  (Flask-Login)       │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Tenant Middleware   │
                                    │  resolve chapter     │
                                    │  check suspensions   │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Route Handler       │
                                    │  (@role_required)    │
                                    └──────────┬──────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              │                │                │
                        ┌─────▼─────┐   ┌──────▼─────┐  ┌──────▼──────┐
                        │ PostgreSQL│   │   Redis    │  │  External   │
                        │ (data)    │   │  (cache)   │  │  (Stripe,   │
                        └───────────┘   └────────────┘  │  SendGrid,  │
                                                        │  R2)        │
                                                        └─────────────┘
```

---

## External Integrations

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌─────────────┐   Stripe Connect (per-chapter accounts)    │
│  │   STRIPE    │   • Dues & payment collection              │
│  │             │   • Donation checkout                      │
│  │             │   • Event ticket sales                     │
│  │             │   • Installment payments                   │
│  │             │   • Webhook → /webhook                     │
│  └─────────────┘   • Platform fee: configurable %           │
│                                                              │
│  ┌─────────────┐   Email Service                            │
│  │  SENDGRID   │   • Invite emails                          │
│  │             │   • Password reset                         │
│  │             │   • Email blasts (chapter-wide)            │
│  │             │   • Chapter data export (CSV attachments)  │
│  │             │   • Ops agent digest + alerts              │
│  └─────────────┘                                            │
│                                                              │
│  ┌─────────────┐   Object Storage (S3-compatible)           │
│  │ CLOUDFLARE  │   • Profile pictures                       │
│  │     R2      │   • Org/chapter logos & favicons            │
│  │             │   • Document vault files                    │
│  └─────────────┘                                            │
│                                                              │
│  ┌─────────────┐   Future                                   │
│  │   TWILIO    │   • SMS notifications (placeholder)        │
│  └─────────────┘                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      REACT SPA                            │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                  React Router                        │  │
│  │                                                      │  │
│  │  Public Routes          Protected Routes             │  │
│  │  ──────────────         ────────────────              │  │
│  │  /login                 /dashboard                   │  │
│  │  /register              /dues       ← MyDues         │  │
│  │  /events/public/:slug   /chapter-dues ← TreasurerDues│  │
│  │                         /analytics                   │  │
│  │                         /members                     │  │
│  │                         /payments                    │  │
│  │                         /donations                   │  │
│  │                         /events                      │  │
│  │                         /invites                     │  │
│  │                         /comms                       │  │
│  │                         /documents                   │  │
│  │                         /kb                          │  │
│  │                         /regions                     │  │
│  │                         /region-dashboard            │  │
│  │                         /ihq    ← IHQ Dashboard      │  │
│  │                         /workflows                   │  │
│  │                         /settings                    │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │ Zustand      │  │ Services     │  │ Components    │   │
│  │ Stores       │  │ (API calls)  │  │               │   │
│  │              │  │              │  │ Layout        │   │
│  │ authStore    │  │ authService  │  │ ProtectedRoute│   │
│  │ configStore  │  │ paymentSvc   │  │ ImageUpload   │   │
│  │ brandingStore│  │ eventService │  │ Notifications │   │
│  │ regionStore  │  │ regionSvc    │  │               │   │
│  │ workflowStore│  │ workflowSvc  │  │               │   │
│  │ notifStore   │  │ chapterSvc   │  │ MobileBottomNav│  │
│  │              │  │ ihqService   │  │               │   │
│  │              │  │ periodSvc    │  │               │   │
│  │              │  │ analyticsSvc │  │               │   │
│  │              │  │ + 5 more     │  │               │   │
│  └──────────────┘  └──────────────┘  └───────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Axios Client (lib/api.ts)               │  │
│  │  baseURL: /api  │  withCredentials: true             │  │
│  │  401 → redirect to /login                            │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## API Surface (22 Blueprints, 100+ Endpoints)

| Blueprint        | Prefix                  | Key Operations                                        |
|------------------|--------------------------|-------------------------------------------------------|
| auth             | /api/auth                | login, register, logout, profile, switch, delete acct |
| onboarding       | /api/onboarding          | org/region/chapter setup                              |
| members          | /api/members             | list, update role/status, suspend/unsuspend, delete   |
| invites          | /api/invites             | create/delete invite codes                            |
| payments         | /api/payments            | list, create, checkout, summary                       |
| payment_plans    | /api/payment-plans       | CRUD recurring plans                                  |
| donations        | /api/donations           | list, create, checkout                                |
| invoices         | /api/invoices            | member + regional billing, bulk create                |
| expenses         | /api/expenses            | submit, approve/deny, mark paid                       |
| events           | /api/events              | CRUD, RSVP, attendees, public, tickets                |
| comms            | /api/comms               | announcements, email blast                            |
| notifications    | /api/notifications       | list, mark read, unread count                         |
| documents        | /api/documents           | file vault CRUD, download                             |
| kb               | /api/kb                  | knowledge articles CRUD                               |
| regions          | /api/regions             | CRUD, chapters, members, directory                    |
| transfers        | /api/transfers           | request, approve/deny, list                           |
| workflows        | /api/workflows           | templates, steps, instances, tasks                    |
| stripe_connect   | /api/stripe/connect      | OAuth, account info, disconnect                       |
| config           | /api/config              | org/chapter config, chapter deletion request/cancel   |
| files            | /api/files               | profile pics, logos, favicons                         |
| dashboard        | /api/dashboard           | inbox action queue (prioritized CTAs)                 |
| **periods**      | **/api/periods**         | **CRUD billing periods, activate, dues list/edit**    |
| **analytics**    | **/api/analytics**       | **chapter snapshot: dues, members, payments, events** |
| **ihq**          | **/api/ihq**             | **dashboard, broadcast, chapter suspend/unsuspend**   |
| **agent**        | **/api/agent**           | **status, manual trigger, approval confirmation**     |
| webhooks         | /webhook                 | Stripe event handling                                 |

---

## Deployment Target

```
┌─────────────────────────────────────┐
│                RENDER                │
│                                      │
│  ┌──────────────┐  ┌───────────────┐ │
│  │ Static Site  │  │ Web Service   │ │
│  │ (React SPA)  │  │ Flask+Gunicorn│ │
│  │              │  │ + APScheduler │ │
│  │ Vite build → │  │ (in-process)  │ │
│  │ dist/        │  │               │ │
│  └──────────────┘  └───────┬───────┘ │
│                             │        │
│         ┌───────────────────┼──────┐ │
│  ┌──────▼──────┐  ┌─────────▼────┐ │ │
│  │  Managed    │  │   Managed    │ │ │
│  │  PostgreSQL │  │   Redis      │ │ │
│  └─────────────┘  └─────────────┘ │ │
└────────────────────────────────────┘ │
                                       │
   ┌───────────────────────────────────┘
   │
   ┌─────────────────────────────────┐
   │  External Services               │
   │  Stripe · SendGrid · Cloudflare  │
   └──────────────────────────────────┘
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth | Session-based (not JWT) | Simpler revocation, no token refresh complexity |
| Multi-tenancy | Shared DB, `chapter_id` filtering | Cost-effective, single migration path |
| Payments | Stripe Connect (per-chapter) | Each chapter gets own Stripe account, platform takes fee |
| File storage | Cloudflare R2 | S3-compatible, no egress fees |
| State mgmt | Zustand (not Redux) | Minimal boilerplate, simple API |
| Styling | Tailwind CSS | Rapid iteration, consistent design system |
| Rich text | Tiptap | Extensible, works well with React |
| Roles | Numeric hierarchy | Simple `>=` comparisons for permission checks |
| IHQ access | OrganizationMembership.role="admin" | Reuses existing model, no new table |
| Suspension | `suspended` flag on model | Reversible; distinct from `active=False` (permanent) |
| Financial retention | De-link on chapter delete | 7-year compliance; `chapter_id = NULL` preserves records |
| Background jobs | APScheduler in-process | No Celery/worker infra needed at current scale |
| Ops agent autonomy | Tiered approval ladder | Autonomous safe actions, human approval for destructive ones |

---

## Migrations Log (Applied)

| Revision         | Description                                          |
|------------------|------------------------------------------------------|
| (initial)        | Core schema: user, chapter, org, membership, payment |
| ...              | ...                                                  |
| d9e4f2a8b6c1     | Chapter deletion fields (deletion_requested_at, deletion_scheduled_at) |
| e1b3c5d7f9a2     | Suspension fields (chapter.suspended, membership.suspended + reasons) |
| f1a2b3c4d5e6     | ChapterPeriod model (billing periods with period_type enum) |
| a2b4c6d8e1f3     | ChapterPeriodDues model (per-member × per-fee-type dues rows) |

---

---

## Mobile Architecture

The app is designed mobile-first for the primary user (members, not officers).

```
Layout.tsx (MobileBottomNav)
  Fixed bottom bar — visible on < md breakpoint
  ┌─────────┬─────────┬─────────┬─────────┐
  │  Home   │ My Dues │ Events  │  More   │
  │   /     │  /dues  │/events  │(drawer) │
  └─────────┴─────────┴─────────┴─────────┘
  • env(safe-area-inset-bottom) for notched phones
  • "More" opens the full sidebar drawer

Main content: pb-24 md:pb-8 to clear bottom nav on mobile

Mobile-specific patterns:
  • sm:opacity-0 sm:group-hover:opacity-100 for hover-only CTAs
    (always visible on mobile, hover-reveal on desktop)
  • Both mobile card layout and desktop table rendered in DOM;
    CSS controls visibility — no JS breakpoint detection
  • Minimum py-2.5 tap targets for all action buttons
```

---

*Updated 2026-04-08 · ChapterOps v1.3*
