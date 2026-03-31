# CLAUDE.md — Project Context for Claude Code

## Project Overview

This is the codebase for a multi-tenant SaaS platform (working name: "ChapterOps") that helps Greek letter organizations manage chapter operations. It evolved from "Sigma Finance," a single-chapter dues management tool built for the Sigma Delta Sigma chapter of Phi Beta Sigma Fraternity, Inc.

The platform is expanding to serve all Greek letter organizations, starting with the National Pan-Hellenic Council (NPHC / Divine Nine), then broadening to all fraternities and sororities globally.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + React Router v7
- **Backend:** Flask 3.x + Python 3.11+ + SQLAlchemy 2.x + Alembic
- **Database:** PostgreSQL 16 + Redis 7
- **Payments:** Stripe Connect (per-chapter payment processing)
- **File Storage:** S3-compatible (Cloudflare R2 or AWS S3)
- **Email:** SendGrid
- **SMS:** Twilio
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
│   │   │   └── knowledge_article.py # Knowledge base articles
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
│   │   │   └── webhooks.py      # /webhook (Stripe)
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── workflow_engine.py        # Workflow execution engine
│   │   │   └── notification_service.py   # In-app notification creation helpers
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
│       │   └── notificationService.ts
│       ├── components/        # Shared/reusable components
│       │   ├── ProtectedRoute.tsx
│       │   ├── Layout.tsx
│       │   ├── ImageUpload.tsx
│       │   ├── NotificationBell.tsx
│       │   ├── NotificationCard.tsx
│       │   └── ui/            # Base UI components
│       └── pages/             # Route-level page components
│           ├── Login.tsx
│           ├── Register.tsx
│           ├── Landing.tsx        # Public marketing/landing page
│           ├── Dashboard.tsx
│           ├── Onboarding.tsx
│           ├── onboarding/        # Multi-step onboarding sub-components
│           │   ├── OrganizationStep.tsx
│           │   ├── RegionStep.tsx
│           │   ├── ChapterStep.tsx
│           │   └── SuccessStep.tsx
│           ├── Settings.tsx
│           ├── Payments.tsx
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
- **Dark Theme**: The entire app uses a dark luxury theme. All new components must use the semantic color tokens below — never hardcode light colors.
- **Dynamic Branding**: Use `brand-*` utilities (e.g., `bg-brand-primary-main`, `text-brand-primary-light`) instead of hardcoded colors for brand-colored elements
- File naming: PascalCase for components (`Dashboard.tsx`), camelCase for utilities (`authService.ts`)
- All API response types defined in `src/types/`

### Dark Theme Token Reference

Always use these tokens — never use `bg-white`, `text-gray-*`, `bg-gray-*`, or `border-gray-*`:

| Purpose | Token |
|---|---|
| Page background | `bg-surface-deep` |
| Card background | `bg-surface-card-solid` |
| Subtle hover/row | `bg-white/5` |
| Sidebar | `bg-surface-sidebar` |
| Form inputs | `bg-surface-input` (auto-applied via global CSS) |
| Primary text | `text-content-primary` |
| Secondary text | `text-content-secondary` |
| Muted/label text | `text-content-muted` |
| Borders | `border-[var(--color-border)]` |
| Brand borders | `border-[var(--color-border-brand)]` |
| Dividers | `divide-white/5` |
| Status badges | `bg-{color}-900/30 text-{color}-400` (e.g. `bg-emerald-900/30 text-emerald-400`) |
| Error banners | `bg-red-900/20 border-red-900/30 text-red-400` |
| Success banners | `bg-emerald-900/20 border-emerald-900/30 text-emerald-400` |
| Brand button | `bg-brand-primary-main hover:bg-brand-primary-dark text-white` |
| Glass card | `.glass-card` or `backdrop-blur-xl` with `bg-surface-card` |

Global CSS in `index.css` automatically styles all `input`, `textarea`, and `select` elements with dark background and light text — no class needed on individual inputs.

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
- `TWILIO_*` — Twilio credentials for SMS
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
17. ✅ **Communications Hub** — chapter announcements (pin/edit/delete/expiry), email blasts via SendGrid with audience filters
18. ✅ **Document Vault** — R2-backed file storage (PDF/Word/Excel/images up to 25MB), presigned download URLs, category tabs, officer upload/edit/delete
19. ✅ **Knowledge Base** — dual-scope articles (org-wide / chapter), Tiptap WYSIWYG editor, full-text search, category filters, view tracking
20. ✅ **Payment Plan Enhancements** — members can self-create plans, quarterly frequency, auto-calculated end date, adjustable installment amounts
21. ✅ **Mobile-Responsive UI** — Members and Payments pages use card layout on mobile, table on desktop
22. ✅ **Regional Invoice Management** — regions can bill chapters; invoices include `billed_chapter` in all API responses
23. ✅ **Per-Region Authorization** — backend returns `current_user_region_role`; frontend gates all region actions (invoice, manage officers, move chapters) by the user's role in that specific region, not their global org role
24. ✅ **Additional Payment Methods** — Zelle, Venmo, and Cash App supported alongside Stripe/manual
25. ✅ **Expense Tracking** — chapter expense submissions with officer approval flow
26. ✅ **Rush/Intake Pipeline** — intake management with stages and candidate tracking
27. ✅ **Lineage Management** — chapter family tree visualization and milestone tracking
28. ✅ **Regional Dashboard** — dedicated dashboard for regional officers showing chapter stats
29. ✅ **Dark Luxury Theme** — full app reskin: dark navy base, Cormorant Garamond + Outfit fonts, CSS variable theming system (swap 4 vars to re-brand for any org), glassmorphism cards, pill nav

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

### Event Management
- Public events have a `public_slug` (8-char hex) — accessible at `/e/:slug` outside `ProtectedRoute`
- `/api/events/public/` is exempt from tenant middleware
- Paid event tickets use same Stripe Connect pattern with `payment_type=event_ticket` metadata

### Mobile Responsiveness Pattern
- Use `md:hidden` for mobile cards + `hidden md:table` (or `hidden md:block`) for desktop views
- Both views are rendered in the DOM; CSS controls which is visible — no JS breakpoint detection needed

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
- Test multi-tenant isolation: a query for Chapter A's data should never return Chapter B's data
- Follow DRY (Don't Repeat Yourself) method of coding
- **Never use light-theme Tailwind classes** (`bg-white`, `text-gray-*`, `bg-gray-*`, `border-gray-*`) — always use the dark theme tokens from the token reference table above
- **Form inputs do not need explicit background/text classes** — `index.css` applies dark styles globally to all `input`, `textarea`, and `select` elements
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
