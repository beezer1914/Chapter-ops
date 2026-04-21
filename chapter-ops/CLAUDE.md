# CLAUDE.md — Project Context for Claude Code

## Project Overview

This is the codebase for a multi-tenant SaaS platform (working name: "ChapterOps") that helps Greek letter organizations manage chapter operations. It evolved from "Sigma Finance," a single-chapter dues management tool built for the Sigma Delta Sigma chapter of Phi Beta Sigma Fraternity, Inc.

The platform is expanding to serve all Greek letter organizations, starting with the National Pan-Hellenic Council (NPHC / Divine Nine), then broadening to all fraternities and sororities globally.

## Guidelines
Four principles in one file that directly address these issues:

Principle	Addresses
Think Before Coding	Wrong assumptions, hidden confusion, missing tradeoffs
Simplicity First	Overcomplication, bloated abstractions
Surgical Changes	Orthogonal edits, touching code you shouldn't
Goal-Driven Execution	Leverage through tests-first, verifiable success criteria
The Four Principles in Detail
1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

LLMs often pick an interpretation silently and run with it. This principle forces explicit reasoning:

State assumptions explicitly — If uncertain, ask rather than guess
Present multiple interpretations — Don't pick silently when ambiguity exists
Push back when warranted — If a simpler approach exists, say so
Stop when confused — Name what's unclear and ask for clarification
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

Combat the tendency toward overengineering:

No features beyond what was asked
No abstractions for single-use code
No "flexibility" or "configurability" that wasn't requested
No error handling for impossible scenarios
If 200 lines could be 50, rewrite it
The test: Would a senior engineer say this is overcomplicated? If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting
Don't refactor things that aren't broken
Match existing style, even if you'd do it differently
If you notice unrelated dead code, mention it — don't delete it
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused
Don't remove pre-existing dead code unless asked
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform imperative tasks into verifiable goals:

Instead of...	Transform to...
"Add validation"	"Write tests for invalid inputs, then make them pass"
"Fix the bug"	"Write a test that reproduces it, then make it pass"
"Refactor X"	"Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let the LLM loop independently. Weak criteria ("make it work") require constant clarification.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v3 + Zustand + React Router v7
- **Backend:** Flask 3.x + Python 3.11+ + SQLAlchemy 2.x + Alembic
- **Database:** PostgreSQL 16 + Redis 7
- **Payments:** Stripe Connect (per-chapter payment processing)
- **File Storage:** S3-compatible (Cloudflare R2 or AWS S3)
- **Email:** Resend
- **Dev Environment:** Docker Compose for local Postgres + Redis

## Project Structure

```
chapter-ops/
├── CLAUDE.md                  # This file — project context for Claude Code
├── docker-compose.yml         # Local Postgres + Redis
├── .env.example               # Environment variable template
├── backend/                   # Flask API
│   ├── app/
│   │   ├── __init__.py        # Flask app factory (create_app)
│   │   ├── config.py          # Config classes (Local, Production, Testing)
│   │   ├── extensions.py      # Flask extension instances (db, bcrypt, cache, etc.)
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   └── tenant.py      # Multi-tenant context middleware
│   │   ├── models/
│   │   │   ├── __init__.py          # Exports all models
│   │   │   ├── base.py              # Base model with common fields (id, timestamps)
│   │   │   ├── organization.py
│   │   │   ├── chapter.py
│   │   │   ├── user.py
│   │   │   ├── membership.py        # ChapterMembership (join table)
│   │   │   ├── org_membership.py    # OrgMembership (org-level roles)
│   │   │   ├── region.py            # Region model
│   │   │   ├── region_membership.py
│   │   │   ├── payment.py
│   │   │   ├── payment_plan.py      # PaymentPlan with total_paid() Decimal method
│   │   │   ├── invite.py
│   │   │   ├── donation.py
│   │   │   ├── notification.py      # In-app notifications
│   │   │   ├── transfer_request.py  # Chapter transfer requests
│   │   │   ├── event.py             # Event + EventAttendance
│   │   │   ├── workflow.py          # Workflow + WorkflowStep
│   │   │   ├── announcement.py      # Chapter announcements
│   │   │   ├── document.py          # Document vault (R2-backed)
│   │   │   ├── knowledge_article.py # Knowledge base articles
│   │   │   ├── chapter_period.py    # ChapterPeriod (semester/annual/custom billing periods)
│   │   │   ├── chapter_period_dues.py # ChapterPeriodDues (per-member × per-fee-type dues rows)
│   │   │   └── committee.py         # Committee (chair_user_id FK, budget_amount, is_active)
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py          # /api/auth/*
│   │   │   ├── config.py        # /api/config (branding, chapter config)
│   │   │   ├── members.py       # /api/members/*
│   │   │   ├── payments.py      # /api/payments/* (includes Zelle/Venmo/Cash App)
│   │   │   ├── payment_plans.py # /api/payment-plans/*
│   │   │   ├── invites.py       # /api/invites/*
│   │   │   ├── donations.py     # /api/donations/*
│   │   │   ├── invoices.py      # /api/invoices/* (regional billing)
│   │   │   ├── onboarding.py    # /api/onboarding/*
│   │   │   ├── transfers.py     # /api/transfers/*
│   │   │   ├── stripe_connect.py # /api/stripe/*
│   │   │   ├── events.py        # /api/events/* + /api/events/public/<slug>
│   │   │   ├── workflows.py     # /api/workflows/*
│   │   │   ├── comms.py         # /api/comms/* (announcements + email blasts)
│   │   │   ├── documents.py     # /api/documents/*
│   │   │   ├── kb.py            # /api/kb/* (knowledge base)
│   │   │   ├── files.py         # /api/files/* (S3/R2 uploads)
│   │   │   ├── notifications.py # /api/notifications/*
│   │   │   ├── regions.py       # /api/regions/* (includes current_user_region_role)
│   │   │   ├── expenses.py      # /api/expenses/*
│   │   │   ├── intake.py        # /api/intake/* (rush/intake management)
│   │   │   ├── lineage.py       # /api/lineage/* (family tree + milestones)
│   │   │   ├── dashboard.py     # /api/dashboard/inbox (action queue)
│   │   │   ├── periods.py       # /api/periods/* (billing periods, my-dues, dues edit + rollover)
│   │   │   ├── analytics.py     # /api/analytics/chapter (reporting snapshot + budget summary)
│   │   │   ├── committees.py    # /api/committees/* (CRUD, chair assignment, budget stats)
│   │   │   └── webhooks.py      # /webhook (Stripe)
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── workflow_engine.py        # Workflow execution engine
│   │   │   ├── notification_service.py   # In-app notification creation helpers
│   │   │   └── dues_service.py           # seed_period_dues, seed_member_dues, apply_payment, recompute_financial_status
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── password.py    # Password validation
│   │       ├── email.py       # Email helpers
│   │       └── decorators.py  # @role_required, @chapter_required decorators
│   ├── migrations/            # Alembic migrations
│   │   ├── env.py
│   │   ├── alembic.ini
│   │   └── versions/
│   ├── requirements.txt
│   ├── wsgi.py                # Gunicorn entry point
│   └── tests/                 # pytest test directory (future)
├── frontend/                  # React TypeScript SPA
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts     # Tailwind v4 config (if needed)
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx           # Entry point
│       ├── App.tsx            # Root component + routes
│       ├── index.css          # Tailwind imports
│       ├── vite-env.d.ts      # Vite type declarations
│       ├── types/             # TypeScript interfaces/types
│       │   ├── index.ts       # Barrel export
│       │   ├── auth.ts        # User, LoginRequest, etc.
│       │   ├── organization.ts
│       │   ├── chapter.ts
│       │   └── payment.ts
│       ├── lib/               # Utilities
│       │   └── api.ts         # Axios instance with interceptors
│       ├── stores/            # Zustand stores
│       │   ├── authStore.ts
│       │   ├── configStore.ts
│       │   ├── brandingStore.ts
│       │   ├── notificationStore.ts
│       │   ├── regionStore.ts
│       │   ├── workflowStore.ts
│       │   └── onboardingStore.ts
│       ├── hooks/             # Custom React hooks
│       │   └── useAuth.ts
│       ├── data/              # Static data and presets
│       │   └── brandingPresets.ts  # Divine Nine color presets
│       ├── services/          # API service functions
│       │   ├── authService.ts
│       │   ├── chapterService.ts
│       │   ├── paymentService.ts
│       │   ├── fileService.ts
│       │   ├── configService.ts
│       │   ├── stripeService.ts
│       │   ├── transferService.ts
│       │   ├── eventService.ts
│       │   ├── workflowService.ts
│       │   ├── commsService.ts
│       │   ├── documentService.ts
│       │   ├── kbService.ts
│       │   ├── notificationService.ts
│       │   ├── dashboardService.ts  # fetchDashboardInbox()
│       │   ├── periodService.ts     # fetchPeriods, fetchMyDues, fetchPeriodDues, updateDuesRecord, activatePeriod
│       │   ├── analyticsService.ts  # fetchChapterAnalytics()
│       │   └── committeeService.ts  # fetchCommittees, createCommittee, updateCommittee, fetchCommitteeStats
│       ├── components/        # Shared/reusable components
│       │   ├── ProtectedRoute.tsx
│       │   ├── Layout.tsx         # Includes MobileBottomNav component
│       │   ├── ImageUpload.tsx
│       │   ├── NotificationBell.tsx
│       │   ├── NotificationCard.tsx
│       │   └── ui/            # Base UI components
│       └── pages/             # Route-level page components
│           ├── Login.tsx
│           ├── Register.tsx
│           ├── Landing.tsx        # Public marketing/landing page
│           ├── Dashboard.tsx      # Inbox/action queue entry point
│           ├── Onboarding.tsx
│           ├── onboarding/        # Multi-step onboarding sub-components
│           │   ├── OrganizationStep.tsx
│           │   ├── RegionStep.tsx
│           │   ├── ChapterStep.tsx
│           │   └── SuccessStep.tsx  # Progressive checklist
│           ├── Settings.tsx
│           ├── Payments.tsx
│           ├── MyDues.tsx         # Member dues view (/dues) — per-fee-type breakdown + pay CTA
│           ├── TreasurerDues.tsx  # Officer dues matrix (/chapter-dues) — member × fee type grid
│           ├── Analytics.tsx      # Chapter analytics (/analytics) — period comparison, charts
│           ├── Members.tsx
│           ├── Invites.tsx
│           ├── Donations.tsx
│           ├── Invoices.tsx       # Regional invoice management
│           ├── Expenses.tsx       # Chapter expense tracking + approvals
│           ├── Events.tsx
│           ├── EventPublic.tsx    # Public event page (/e/:slug, no login required)
│           ├── Workflows.tsx
│           ├── Communications.tsx
│           ├── Documents.tsx
│           ├── KnowledgeBase.tsx
│           ├── Regions.tsx        # Regional management + per-region role gating
│           ├── RegionDashboard.tsx # Regional officer dashboard
│           ├── IHQDashboard.tsx   # Org-admin IHQ view
│           ├── Intake.tsx         # Rush/intake pipeline management
│           ├── Lineage.tsx        # Chapter family tree + milestone tracking
│           └── StripeCallback.tsx # Stripe Connect OAuth callback
└── README.md
```

## Architecture Principles

### Multi-Tenancy

This is the most critical architectural concept. Every piece of data belongs to a chapter.

- **Hierarchy:** Organization → Chapter → Member
- **Tenant boundary:** The Chapter is the primary tenant. All data (payments, events, documents, etc.) is scoped to a chapter via `chapter_id`.
- **Isolation strategy:** PostgreSQL Row-Level Security (RLS) policies + Flask middleware that sets the tenant context on every request.
- **User membership:** A user has exactly ONE active chapter membership at a time within a given organization. `ChapterMembership` is the join table; the `active` flag marks the current chapter. Transfers move the active flag from one chapter to another — they do not create concurrent memberships.
- **BGLO cultural rules (must be enforced):**
  - A member cannot hold simultaneous active memberships in two chapters of the same org
  - A member cannot be initiated into two different Greek letter organizations — cross-org membership is strictly forbidden in BGLO culture
  - The transfer system exists to move a member's active membership, not to create dual membership
- **Active chapter context:** Each user session tracks which chapter they're currently operating in. The tenant middleware reads this and scopes all queries.

### Tenant Middleware Pattern

```python
# Every request goes through this flow:
# 1. User authenticates (session cookie)
# 2. Middleware reads user's active_chapter_id from session
# 3. Middleware sets g.current_chapter (Flask's request-scoped global)
# 4. All database queries automatically filter by g.current_chapter.id
# 5. RLS policies in Postgres act as a safety net
```

### API Design

- All API routes are prefixed with `/api/`
- Webhook routes are at `/webhook` (no /api prefix)
- Authentication is session-based (Flask-Login) with secure cookies
- All responses are JSON
- The React frontend proxies `/api` requests to Flask in development

### Role System

Roles are per-chapter (via ChapterMembership), not global:

- **member** — Basic access: view dashboard, make payments, RSVP to events
- **secretary** — Member role + view reports, create invites
- **treasurer** — Secretary role + manage members, manage finances, edit member details
- **vice_president** — Treasurer-level access
- **president** — Full chapter access
- **admin** — System-level access (platform administrators, not chapter officers)

### Database Conventions

- All models inherit from `BaseModel` which provides: `id` (UUID), `created_at`, `updated_at`
- Use UUID primary keys (not auto-increment integers) for security and multi-tenant safety
- All tenant-scoped models have a `chapter_id` column with a foreign key to `chapter.id`
- Use SQLAlchemy 2.x `Mapped` type annotations
- Alembic for all migrations — never modify the database manually
- Soft deletes where appropriate (active/inactive flag) rather than hard deletes

### Frontend Conventions

- TypeScript strict mode enabled
- Functional components only (no class components)
- Zustand for global state (auth, active chapter, branding, config)
- React Hook Form + Zod for form validation
- Axios for HTTP requests (configured with interceptors for auth)
- Tailwind CSS for styling — no CSS modules or styled-components
- **Editorial Theme (default)**: Cream surfaces (`#FAF9F7`), always-black sidebar (`#0a0a0a`), Playfair Display Black headings, Instrument Sans body. This is the default. The dark navy theme remains available as an option.
- **Dynamic Branding**: Use `brand-*` utilities (e.g., `bg-brand-primary-main`, `text-brand-primary-light`) instead of hardcoded colors for brand-colored elements
- File naming: PascalCase for components (`Dashboard.tsx`), camelCase for utilities (`authService.ts`)
- All API response types defined in `src/types/`

### Editorial Theme Token Reference

The app uses CSS custom property tokens driven by `brandingStore.ts`. Always use these — never hardcode colors directly:

| Purpose | Token |
|---|---|
| Page background | `bg-surface-deep` / `bg-[var(--color-bg-deep)]` |
| Card background | `bg-[var(--color-bg-card)]` |
| Card hover | `bg-[var(--color-bg-card-hover)]` |
| Solid card | `bg-[var(--color-bg-card-solid)]` |
| Form inputs | auto-applied via global CSS — no class needed |
| Primary text | `text-content-primary` |
| Secondary text | `text-content-secondary` |
| Muted/label text | `text-content-muted` |
| Headings | `text-content-heading` |
| Borders | `border-[var(--color-border)]` |
| Brand borders | `border-[var(--color-border-brand)]` |
| Dividers | `divide-[var(--color-border)]` (NOT `divide-white/5`) |
| Status: paid/financial | `bg-emerald-50 text-emerald-700` (light) / `bg-emerald-900/30 text-emerald-400` (dark) |
| Status: unpaid/error | `bg-red-50 text-red-700` / `bg-red-900/20 text-red-400` |
| Status: warning | `bg-amber-50 text-amber-700` / `bg-amber-900/30 text-amber-400` |
| Brand button | `bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90` |
| Brand accent button | `bg-brand-primary-main hover:bg-brand-primary-dark text-white` |
| Sidebar | Always `bg-[#0a0a0a] text-white` — never themed |

### Typography

- **Headings**: `font-heading` → Playfair Display Black. Use `font-black` weight, `tracking-tight`.
- **Body**: `font-body` → Instrument Sans.
- **Section labels**: `text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted`
- **Editorial double-rule header pattern**: `border-t-2 border-[var(--color-text-heading)]` top, `border-b border-[var(--color-border)]` bottom with `mt-[2px]` gap.

### Design Principles (Editorial)

- **No rounded corners** on cards, modals, buttons — sharp edges throughout.
- **No glassmorphism** — flat surfaces, `border-[var(--color-border)]` instead of `backdrop-blur`.
- **Left-border color strips** for status indicators (e.g. `border-l-4 border-l-red-500`).
- **Status chips**: small, uppercase, no rounded corners — `text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5`.
- Progress bars: `h-1` or `h-1.5`, no rounded ends.

Global CSS in `index.css` automatically styles all `input`, `textarea`, and `select` elements — no class needed on individual inputs.

## Key Commands

```bash
# Start local services (Postgres + Redis)
docker compose up -d

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
flask db upgrade          # Run migrations
flask run                 # Start dev server on :5000

# Frontend
cd frontend
npm install
npm run dev               # Start Vite dev server on :5173

# Database migrations
cd backend
flask db migrate -m "description"  # Generate migration
flask db upgrade                    # Apply migrations
flask db downgrade                  # Rollback last migration
```

## Environment Variables

See `.env.example` for the full list. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `SECRET_KEY` — Flask session secret
- `STRIPE_SECRET_KEY` — Stripe API key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `RESEND_API_KEY` — Resend for email
- `RESEND_FROM_EMAIL` — Sender address (must be a verified domain in Resend)
- `S3_*` — S3-compatible storage credentials

## Current Development Phase

**Phase 1 & 2: Complete**

All foundational and Phase 2 feature work is done. The platform is fully functional for chapter operations.

### All Completed Features

1. ✅ Project scaffolding and multi-tenant architecture
2. ✅ Core data models (all models listed in project structure above)
3. ✅ Tenant middleware (chapter context per request, RLS-backed)
4. ✅ Auth system (login, register, invite-only codes, session-based)
5. ✅ Chapter onboarding flow (create org → create chapter → invite members)
6. ✅ Financial models (Payment, PaymentPlan, Donation)
7. ✅ **Stripe Connect** — per-chapter accounts, OAuth, webhooks, checkout sessions
8. ✅ **S3/R2 file storage** — profile pictures, chapter/org logos, favicons, documents
9. ✅ **Organization Branding & White-Label** — custom colors, typography, logos, favicons, CSS custom properties, Divine Nine presets
10. ✅ **In-App Notifications** — polling every 30s, bell icon, mark read/delete
11. ✅ **Role-Based UI** — sidebar filtered by role, member vs officer views throughout
12. ✅ **Settings** — Profile tab (all users), officer-only tabs (org/chapter/payments/branding)
13. ✅ **Chapter Transfer System** — member submits, dual-president approval, denial with reason
14. ✅ **Financial Status Auto-Promotion** — any payment (manual or Stripe) promotes `not_financial` → `financial`
15. ✅ **Event Management** — Event + EventAttendance models, full CRUD, public slugs (`/e/:slug`), Stripe ticketing, RSVP, manual check-in
16. ✅ **Workflow Builder** — custom workflows with steps, execution engine, frontend management UI
17. ✅ **Communications Hub** — chapter announcements (pin/edit/delete/expiry), email blasts via Resend with audience filters
18. ✅ **Document Vault** — R2-backed file storage (PDF/Word/Excel/images up to 25MB), presigned download URLs, category tabs, officer upload/edit/delete
19. ✅ **Knowledge Base** — dual-scope articles (org-wide / chapter), Tiptap WYSIWYG editor, full-text search, category filters, view tracking
20. ✅ **Payment Plan Enhancements** — members can self-create plans, quarterly frequency, auto-calculated end date, adjustable installment amounts
21. ✅ **Regional Invoice Management** — regions can bill chapters; invoices include `billed_chapter` in all API responses
22. ✅ **Per-Region Authorization** — backend returns `current_user_region_role`; frontend gates all region actions (invoice, manage officers, move chapters) by the user's role in that specific region, not their global org role
23. ✅ **Additional Payment Methods** — Zelle, Venmo, and Cash App supported alongside Stripe/manual
24. ✅ **Expense Tracking** — chapter expense submissions with officer approval flow
25. ✅ **Rush/Intake Pipeline** — intake management with stages and candidate tracking
26. ✅ **Lineage Management** — chapter family tree visualization and milestone tracking
27. ✅ **Regional Dashboard** — dedicated dashboard for regional officers showing chapter stats
28. ✅ **Editorial Theme (default)** — Playfair Display Black headings, cream surfaces, always-black sidebar, sharp editorial design. Dark navy theme remains as an option. CSS variable theming system supports any org branding.
29. ✅ **Inbox/Action Queue Dashboard** — dashboard is now an action queue ("what do I need to do?") with prioritized items (critical/warning/info), grouped sections, and direct CTAs. Replaces the financial stats dashboard.
30. ✅ **ChapterPeriod — Billing Periods** — `ChapterPeriod` model with `period_type` enum (semester/annual/custom). Auto-created on chapter onboarding. Manages dues tracking lifecycle.
31. ✅ **ChapterPeriodDues — Full Dues Tracking** — per-member × per-fee-type × per-period dues rows. `dues_service.py` handles seeding, payment application, and financial status recomputation. Auto-seeded when a period is activated or a new member joins.
32. ✅ **Member Dues View (`/dues`)** — `MyDues.tsx`: per-fee-type breakdown, progress bars, Stripe pay CTA for remaining balance. Financial status banner. Empty states handle inactive period gracefully.
33. ✅ **Treasurer Dues Dashboard (`/chapter-dues`)** — `TreasurerDues.tsx`: member × fee type matrix with period picker, collection stats, inline edit modal (adjust amount owed, mark exempt, add notes).
34. ✅ **Analytics (`/analytics`)** — `Analytics.tsx`: period comparison (current vs previous), dues by fee type with collection rates, member status distribution stacked bar, 12-month payment bar chart, event stats. CSS-only charts, no charting library.
35. ✅ **Mobile-First Experience** — Fixed bottom navigation bar (Home/My Dues/Events/More), mobile quick-action strip on Dashboard, redesigned EventCard with date badge + full-width RSVP buttons, always-visible CTAs on touch devices. PWA manifest updated.
36. ✅ **Progressive Onboarding** — `SuccessStep.tsx` redesigned as a 6-step checklist guiding new presidents through setup in correct order. First step pre-checked.
37. ✅ **Security Hardening** — XSS protection on KB articles (nh3), password reset flow, pagination on all list endpoints, N+1 fixes, DB indexes, data retention + account deletion (GDPR-compliant), user PII anonymization.
38. ✅ **CSRF Protection** — Double-submit header pattern (`X-CSRFToken`). `GET /api/auth/csrf` endpoint. Axios request interceptor injects token on all non-GET requests. Response interceptor auto-refreshes stale token and retries once on 400 CSRF errors. Logout exempt (force-logout is not a meaningful attack). Stripe webhooks blueprint exempt.
39. ✅ **Period Rollover** — `rollover_unpaid_dues(chapter, prev_period, new_period)` in `dues_service.py`. Opt-in via `{ rollover_unpaid: true }` on period activate. Carries forward unpaid/partial balances, increases amount_owed on matching rows, creates new rows if missing. Settings UI shows rollover confirmation modal with checkbox.
40. ✅ **Committee Chairs + Budget Tracking** — `Committee` model with `chair_user_id` FK (no new role tier), `budget_amount`, `is_active`. Expenses tagged via `committee_id` FK with SET NULL. `/api/committees/<id>/stats` returns spent/pending/remaining/over_budget. Analytics budget breakdown section. Expenses UI shows committee dropdown + badge. Settings CommitteesSection with full CRUD.
41. ✅ **Fee Type Permissions Fix** — Treasurer can now manage fee types in Settings. Backend: `update_chapter_config` lowered to `@role_required("treasurer")` with per-section guard (permissions/branding require president+). Frontend: `canEditFees` check replaces `isAdmin` gate on fee types UI.
42. ✅ **Financial Status Accuracy** — Fixed `seed_period_dues`/`seed_member_dues` to seed $0-owed fee types as `status="paid"` instead of "unpaid". `recompute_financial_status` now treats `amount_owed=0` rows as satisfied regardless of status. `update_dues_record` calls `recompute_financial_status` after every treasurer edit. Data migrations `d5e7f9a1b3c2` + `e6f8a0b2c4d5` retroactively fixed existing bad rows.
43. ✅ **Member-Safe Dues Endpoint** — `GET /api/periods/<id>/my-dues` accessible to all members. Auto-seeds rows on first access (handles late joiners + accounts created outside invite flow). Always recomputes financial_status. Returns `{ dues, financial_status }` so MyDues banner never reads stale auth store cache.

## Key Implementation Notes

### Branding / Theming System
- Uses JSON `config` columns on Organization and Chapter — no separate migration needed
- `brandingStore.ts` injects CSS custom properties (`--color-primary-main`, etc.) at runtime
- Tailwind `brand-*` utilities map to those CSS vars (e.g., `bg-brand-primary-main`, `text-brand-primary-light`)
- Organization sets defaults; chapters can override via `branding.enabled` flag
- Always use `brand-*` utilities for brand-colored UI elements — never hardcode `blue` or `indigo`
- **Re-theming for a new org**: only 4 CSS variables need to change in `index.css`: `--color-primary-light`, `--color-primary-main`, `--color-primary-dark`, `--color-primary-glow`
- Dark surface palette variables (`--color-bg-*`, `--color-text-*`, `--color-border`) are in `index.css :root`
- Tailwind surface/content tokens are defined in `tailwind.config.ts` under `surface` and `content` color keys

### Per-Region Authorization
- Backend (`regions.py`) returns `current_user_region_role` in region detail responses
- Frontend (`Regions.tsx`) derives all permission flags from this field, not from global `isOrgAdmin`
- `isAdmin` = org admin (full access everywhere); `isDirector/isTreasurer` = scoped to their specific region
- Never show region management actions (invoice, assign officer, move chapter) based on global role alone

### Payment Plans
- `PaymentPlan.total_paid()` is a **method** (not a property) — always call with `()`
- Returns `Decimal` — uses `sum(..., Decimal("0"))` with explicit `Decimal(str(p.amount))` conversion to handle mixed DB/in-memory types safely
- Webhook stores payment amounts as `Decimal(str(cents)) / Decimal("100")` — never `/ 100.0` (float)
- Members can self-create plans for themselves; treasurer+ can create for any member

### Stripe Webhooks
- All webhook handlers must return 200 even on error (Stripe retries on 4xx/5xx)
- Errors are caught by outer `try/except` and logged via `logger.exception()` — check Flask logs when payments don't appear
- Idempotency: check `stripe_session_id` before creating Payment/Donation to handle duplicate events
- Installment checkout success URL includes `?redirect_type=installment` so frontend auto-switches to Plans tab
- **Webhook registration mode** — In the Stripe Dashboard, the endpoint must be registered with "Connected and v2 accounts" selected, not "Your account." Checkout Sessions are created with `stripe_account=chapter.stripe_account_id`, so `checkout.session.completed` fires on the connected account. `account.updated` is also a Connect event. Same rule applies when setting up the live-mode webhook.

### Event Management
- Public events have a `public_slug` (8-char hex) — accessible at `/e/:slug` outside `ProtectedRoute`
- `/api/events/public/` is exempt from tenant middleware
- Paid event tickets use same Stripe Connect pattern with `payment_type=event_ticket` metadata

### Dues System Architecture

The dues system uses a three-layer model:

1. **Fee Types** — configured in `chapter.config.fee_types[]` (JSON). Each has an `id`, `label`, and `amount`. Examples: "Chapter Dues" ($200), "National & Regional" ($225).
2. **ChapterPeriod** — a billing period (semester/annual/custom) with `start_date`, `end_date`, `is_active`. One active period per chapter at a time.
3. **ChapterPeriodDues** — one row per (member × fee_type × period). Tracks `amount_owed`, `amount_paid`, `status` (unpaid/partial/paid/exempt).

**`dues_service.py` — the single source of truth for dues mutations:**
- `seed_period_dues(chapter, period)` — creates dues rows for all active members × all fee types. Idempotent. Called on period CREATE (if active) and ACTIVATE.
- `seed_member_dues(chapter, user_id)` — seeds a new member for the active period only. Called when a member registers via invite.
- `apply_payment(chapter, user_id, fee_type_id, amount) → bool` — applies a payment to dues rows. Returns `False` if no dues system is configured (caller falls back to legacy auto-promote).
- `recompute_financial_status(chapter, user_id)` — derives `financial_status` from dues rows (all paid → financial, any unpaid → not_financial). No-op for neophyte/exempt.
- **None of these functions commit** — callers are responsible for `db.session.commit()`.

**Backward compatibility**: Chapters without fee types configured or without an active period continue to use the legacy auto-promote behavior (`not_financial → financial` on any payment). `apply_payment` returns `False` to signal this.

### Dashboard Inbox

`GET /api/dashboard/inbox` returns prioritized action items for the current user. Items have:
- `priority`: `"critical"` | `"warning"` | `"info"`
- `type`: e.g. `"dues_overdue"`, `"workflow_task"`, `"transfer_pending"`
- `cta_url`: frontend route to navigate to

The `dues_overdue` item links to `/dues` (not `/payments`). Officers receive additional chapter-level items (expense approvals, members not financial, etc.).

### Analytics

`GET /api/analytics/chapter?period_id=<optional>` returns a full snapshot including:
- Dues aggregates from `ChapterPeriodDues` (by fee type and overall)
- Period-over-period comparison (current vs previous)
- Member status distribution
- Monthly payment totals (last 12 months)
- Event stats for the period date range

Role gate: secretary+. Uses SQLAlchemy `func` and `case` from `sqlalchemy` — never `db.case`.

### Mobile Responsiveness Pattern
- Layout includes a **fixed bottom navigation bar** (`MobileBottomNav` in `Layout.tsx`) for mobile — Home, My Dues, Events, More. Always-visible on `< md` breakpoint.
- Main content has `pb-24 md:pb-8` to clear the bottom nav on mobile.
- Use `md:hidden` for mobile-only layouts + `hidden md:block` / `hidden md:table` for desktop.
- Both views are rendered in the DOM; CSS controls which is visible — no JS breakpoint detection needed.
- Mobile tap targets: buttons should be at minimum `py-2.5` for comfortable thumb use.
- CTAs that use `group-hover:opacity-100` must also be always-visible on mobile: `sm:opacity-0 sm:group-hover:opacity-100` (hide hover-only behavior only on sm+).

## Patterns Carried Over from Sigma Finance

These patterns were proven in the original app and should be maintained:

- **App factory pattern** (`create_app()`) for Flask
- **Blueprint-per-domain** route organization
- **Redis caching** for statistics (5-10 min TTL with invalidation on writes)
- **Strong password requirements** (12+ chars, uppercase, lowercase, digit, special char)
- **Rate limiting** on auth endpoints (3 login attempts per 15 min)
- **Invite-only registration** with expiring invite codes
- **Stripe webhook verification** with signature validation
- **Session regeneration** on login (prevent session fixation)

## Important Notes for Claude Code

- When creating new models, always include `chapter_id` for tenant-scoped data
- When creating new routes, always use the `@chapter_required` decorator for tenant-scoped endpoints
- When writing database queries, never query without a chapter_id filter (the middleware helps but be explicit)
- The frontend uses TypeScript — all props, state, and API responses should be typed
- Prefer `Mapped[]` annotations for SQLAlchemy model columns (2.x style)
- All new API endpoints need corresponding TypeScript types in `frontend/src/types/`
- All new blueprints must be registered AND csrf-exempted in `app/__init__.py`
- Test multi-tenant isolation: a query for Chapter A's data should never return Chapter B's data
- Follow DRY (Don't Repeat Yourself) method of coding
- **Never hardcode colors** — always use CSS variable tokens from the token reference above
- **Form inputs do not need explicit background/text classes** — `index.css` applies styles globally to all `input`, `textarea`, and `select` elements
- **Theme is editorial by default** — cream surfaces, sharp corners, no glassmorphism, Playfair Display headings. Do not reintroduce rounded-xl cards or backdrop-blur unless explicitly asked.
- **Dues mutations go through `dues_service.py`** — never update `ChapterPeriodDues` directly from routes. Use the service functions and let the caller commit.
- **`dues_service.apply_payment` returns False** if no dues system is configured — callers must handle the fallback to legacy auto-promote.
- **$0-owed fee types seed as `status="paid"`** — a fee type with `default_amount=0` means nothing is owed; seeding it as "unpaid" would block financial status. `seed_period_dues` also repairs existing $0/unpaid rows in-place on each call.
- **`recompute_financial_status` treats `amount_owed=0` rows as satisfied** regardless of their `status` field — handles legacy data without a migration.
- **`GET /api/periods/<id>/my-dues` is the member-safe endpoint** — use this in member-facing views, not `GET /api/periods/<id>/dues` which is treasurer-only. It auto-seeds, always recomputes, and returns `financial_status` in the response body.
- **Financial status in MyDues comes from the API response**, not from the Zustand auth store — the auth store can be stale after dues changes.
- **SQLAlchemy `case()`** must be imported from `sqlalchemy` directly (`from sqlalchemy import case`), not from `db`.
- **BGLO membership rules are sacred** — never build features that allow: (1) simultaneous active membership in two chapters of the same org, or (2) membership in two different Greek letter organizations. These are non-negotiable cultural rules, not just business logic.

## Ops Agent — Lightweight Agentic Monitor

ChapterOps includes a background ops agent that monitors platform health, detects anomalies, and delivers a morning digest to the founder. This is **not** a chatbot or user-facing feature — it is an internal autonomous loop that runs on a schedule, reasons over live data, and takes a limited set of safe actions without human intervention.

### Philosophy & Guardrails

The agent follows a strict **autonomy ladder**:

| Action Type | Examples | Autonomy Level |
|---|---|---|
| Read-only observation | Query DB, read logs, call Stripe API | Fully autonomous |
| Reversible notification | Send digest email, update status page, fire Slack alert | Fully autonomous |
| Safe remediation | Replay a Stripe webhook, clear a stale Redis cache key | Autonomous with logging |
| Destructive / irreversible | DB rollback, account lockout, file deletion | **Human approval required** — agent drafts the action and emails Brandon for confirmation |

The agent **never** modifies chapter financial records autonomously. It **never** touches member data directly. It surfaces findings and recommendations; Brandon approves anything with real-world consequences.

---

### Architecture

**Entry point:** `backend/agent/runner.py`
- Scheduled via APScheduler (already in requirements or add it) — runs two jobs:
  - `ops_agent_run()` — every 15 minutes, lightweight checks
  - `ops_agent_digest()` — daily at 7:00am local time, morning summary email

**Structure:**
```
backend/
└── agent/
    ├── __init__.py
    ├── runner.py            # APScheduler setup, job registration, entry point
    ├── checks/
    │   ├── __init__.py
    │   ├── stripe.py        # Stripe webhook health, failed payment detection
    │   ├── database.py      # Connection health, slow query detection, migration drift
    │   ├── auth.py          # Brute force patterns, suspicious login detection
    │   ├── chapters.py      # Dormant chapter detection, dues collection anomalies
    │   └── storage.py       # R2 storage health, orphaned file detection
    ├── actions/
    │   ├── __init__.py
    │   ├── safe.py          # Autonomous actions: cache clear, webhook replay, alerts
    │   └── approval.py      # Drafts human-approval actions and emails Brandon
    ├── digest.py            # Assembles and sends the morning digest email
    └── context.py           # Shared AgentContext object passed through all checks
```

---

### AgentContext

Every check run receives an `AgentContext` object (defined in `context.py`) that holds shared state for the run:

```python
@dataclass
class AgentContext:
    run_id: str                    # UUID for this agent run (for log correlation)
    triggered_at: datetime
    findings: list[Finding]        # Accumulated findings from all checks
    actions_taken: list[str]       # Log of autonomous actions executed this run
    approval_requests: list[str]   # Actions staged for human approval

@dataclass
class Finding:
    severity: str          # "info" | "warning" | "critical"
    check: str             # e.g. "stripe.webhook_health"
    summary: str           # One-line human-readable summary
    detail: str            # Full context for digest/email
    recommended_action: str | None
```

All checks append `Finding` objects to `ctx.findings`. The digest and alert logic reads from `ctx.findings` at the end of the run.

---

### Check Modules

Each check module exposes a single `run(ctx: AgentContext) -> None` function. Checks are independent — a failure in one must not crash others. Wrap each check body in `try/except` and append a `critical` finding on unexpected exceptions.

#### `checks/stripe.py`
- Query Stripe API for webhook endpoint delivery success rate over the last 24 hours
- If failure rate > 10%: append `warning` finding, autonomously trigger replay of failed events via Stripe API, log action to `ctx.actions_taken`
- If failure rate > 50%: append `critical` finding, queue approval request to disable Stripe checkout temporarily
- Cross-reference Stripe payment records against local `Payment` table for the last 24 hours — flag any Stripe charges with no matching local record as a `warning` (potential webhook miss)

#### `checks/database.py`
- Run a lightweight connectivity check (`SELECT 1`)
- Query `pg_stat_activity` for long-running queries (> 30 seconds) — append `warning` if found
- Compare current Alembic head revision against the latest migration in `versions/` — if they differ, append `critical` finding (unapplied migration in production)
- Check Redis connectivity via `PING`

#### `checks/auth.py`
- Query the last 1 hour of auth logs (or a dedicated `auth_event` table — see note below) for:
  - Any single IP with > 10 failed login attempts: append `warning`
  - Any user account with > 5 failed attempts in 15 minutes: append `warning`, queue account lock for human approval
  - Any successful login from a new country for a treasurer/president role: append `info` finding
- **Note:** This check requires an `AuthEvent` model (see New Models below). Claude Code should create this alongside the agent.

#### `checks/chapters.py`
- Query all active chapters — flag any chapter with zero logins in the last 30 days as `info` (dormant chapter outreach candidate)
- Query chapters with at least one payment plan where the most recent installment is > 14 days overdue — append `info` finding with chapter name and member count
- Query chapters where financial status auto-promotion has not fired in > 60 days despite having members — flag as `info` (possible dues collection issue)

#### `checks/storage.py`
- Verify R2 connectivity by performing a HEAD request on a known sentinel file (a small probe file written during deploy)
- Query the `Document` table for records where `file_key` does not resolve (404 on presigned URL HEAD check) — append `warning` for any orphaned DB records

---

### Actions

#### `actions/safe.py` — Autonomous actions (no approval needed)
- `clear_cache(pattern: str)` — delete Redis keys matching pattern, log to `ctx.actions_taken`
- `replay_stripe_webhooks(event_ids: list[str])` — call Stripe API to resend specific webhook events
- `send_alert(subject: str, body: str)` — send immediate email to `FOUNDER_EMAIL` env var for critical findings that need same-day attention (not a digest — fires immediately)
- `update_status_page(status: str, message: str)` — POST to status page provider API (Statuspage.io or Better Uptime) if configured

#### `actions/approval.py` — Staged actions requiring human confirmation
- `request_approval(action_id: str, description: str, command: str)` — writes a pending approval record to a new `AgentApproval` table and emails Brandon with a confirmation link
- The confirmation link hits `/api/agent/approve/<token>` (a new internal-only route) which executes the pre-staged action
- Approvals expire after 24 hours
- Approved actions are logged to `AgentApproval` with `approved_at` timestamp

---

### Morning Digest

`digest.py` runs at 7:00am and sends a structured summary email to `FOUNDER_EMAIL`:

**Email structure:**
1. **Status line** — "All systems healthy" or "X issues found, Y actions taken overnight"
2. **Critical findings** (if any) — listed first, with recommended actions
3. **Warnings** — brief list
4. **Actions taken autonomously** — what the agent did without asking
5. **Pending approvals** — actions staged and waiting for Brandon's confirmation (with links)
6. **Info / Chapter insights** — dormant chapters, dues collection patterns, engagement signals
7. **Footer** — run ID and timestamp for log correlation

The digest is sent via the existing Resend email integration (`utils/email.py`). Add a `send_digest(subject, html_body)` helper there.

---

### New Models Required

Claude Code should create these models and generate Alembic migrations:

#### `AgentRun`
```
id (UUID), triggered_at, completed_at, run_type ("scheduled" | "manual"),
findings_json (JSON), actions_taken_json (JSON), status ("ok" | "warning" | "critical")
```

#### `AgentApproval`
```
id (UUID), created_at, expires_at, approved_at (nullable), rejected_at (nullable),
action_id (str), description (text), command_json (JSON), approval_token (str, unique),
executed (bool, default False)
```

#### `AuthEvent`
```
id (UUID), created_at, user_id (FK → user, nullable), ip_address (str),
event_type ("login_success" | "login_failure" | "logout" | "password_change"),
user_agent (str, nullable), country_code (str, nullable)
```
- `auth.py` route should write an `AuthEvent` record on every login attempt (success and failure)
- Never store passwords or session tokens in this table
- Rotate/purge records older than 90 days via a scheduled agent cleanup job

---

### New Route

Add `backend/app/routes/agent.py` — blueprint registered at `/api/agent/`:

- `GET /api/agent/status` — admin-only, returns the last 5 `AgentRun` records as JSON (for a future internal dashboard)
- `POST /api/agent/run` — admin-only, manually triggers an agent run outside the schedule (useful for testing)
- `GET /api/agent/approve/<token>` — no auth required (token is the auth), validates and executes a pending `AgentApproval`. Expires after 24 hours. One-time use only.

---

### Environment Variables to Add

Add to `.env.example`:

```
# Ops Agent
FOUNDER_EMAIL=           # Digest and alert destination
AGENT_ENABLED=true       # Set to false to disable all agent jobs (useful in dev)
AGENT_DIGEST_HOUR=7      # Hour (0-23) to send morning digest, server local time
STATUSPAGE_API_KEY=      # Optional — Better Uptime or Statuspage.io API key
STATUSPAGE_PAGE_ID=      # Optional — status page ID
```

The agent checks `AGENT_ENABLED` before running any job. In local dev, set `AGENT_ENABLED=false` to avoid spurious digest emails.

---

### Project Structure Update

Add these entries to the project structure tree in this file:

```
backend/
└── agent/
    ├── __init__.py
    ├── runner.py
    ├── context.py
    ├── digest.py
    ├── checks/
    │   ├── __init__.py
    │   ├── stripe.py
    │   ├── database.py
    │   ├── auth.py
    │   ├── chapters.py
    │   └── storage.py
    └── actions/
        ├── __init__.py
        ├── safe.py
        └── approval.py
```

---

### Implementation Order for Claude Code

Build in this sequence to avoid dependency issues:

1. `AuthEvent` model + migration + auth.py route instrumentation
2. `AgentRun` + `AgentApproval` models + migrations
3. `agent/context.py` — `AgentContext` and `Finding` dataclasses
4. `agent/checks/database.py` — simplest check, good for validating the loop
5. `agent/checks/stripe.py`
6. `agent/checks/auth.py`
7. `agent/checks/chapters.py`
8. `agent/checks/storage.py`
9. `agent/actions/safe.py`
10. `agent/actions/approval.py`
11. `agent/digest.py`
12. `agent/runner.py` — wire APScheduler, register all checks, integrate digest
13. `backend/app/routes/agent.py` — status, manual trigger, approval endpoint
14. `.env.example` updates

---


<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
