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
│   │   │   ├── payments.py      # /api/payments/*
│   │   │   ├── payment_plans.py # /api/payment-plans/*
│   │   │   ├── invites.py       # /api/invites/*
│   │   │   ├── donations.py     # /api/donations/*
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
│   │   │   ├── regions.py       # /api/regions/*
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
│       │   └── ui/            # Base UI components
│       └── pages/             # Route-level page components
│           ├── Login.tsx
│           ├── Register.tsx
│           ├── Dashboard.tsx
│           ├── Onboarding.tsx
│           ├── Settings.tsx
│           ├── Payments.tsx
│           ├── Members.tsx
│           ├── Invites.tsx
│           ├── Donations.tsx
│           ├── Events.tsx
│           ├── EventPublic.tsx    # Public event page (/e/:slug, no login required)
│           ├── Workflows.tsx
│           ├── Communications.tsx
│           ├── Documents.tsx
│           ├── KnowledgeBase.tsx
│           └── Regions.tsx
└── README.md
```

## Architecture Principles

### Multi-Tenancy

This is the most critical architectural concept. Every piece of data belongs to a chapter.

- **Hierarchy:** Organization → Chapter → Member
- **Tenant boundary:** The Chapter is the primary tenant. All data (payments, events, documents, etc.) is scoped to a chapter via `chapter_id`.
- **Isolation strategy:** PostgreSQL Row-Level Security (RLS) policies + Flask middleware that sets the tenant context on every request.
- **User membership:** A user can belong to multiple chapters (e.g., transferred, or a graduate who advises an undergrad chapter). The `ChapterMembership` model is the join table.
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
- **Dynamic Branding**: Use `brand-*` utilities (e.g., `bg-brand-primary`, `text-brand-primary-dark`) instead of hardcoded colors for components that should respect organization branding
- File naming: PascalCase for components (`Dashboard.tsx`), camelCase for utilities (`authService.ts`)
- All API response types defined in `src/types/`

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

## Key Implementation Notes

### Branding System
- Uses JSON `config` columns on Organization and Chapter — no separate migration needed
- `brandingStore.ts` injects CSS custom properties (`--color-primary-main`, etc.) at runtime
- Tailwind `brand-*` utilities map to those CSS vars (e.g., `bg-brand-primary`, `text-brand-primary-dark`)
- Organization sets defaults; chapters can override via `branding.enabled` flag
- Always use `brand-*` utilities for UI elements — never hardcode `indigo` or other colors

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
-Follow DRY(Don't Repeat Yourself) method of coding
