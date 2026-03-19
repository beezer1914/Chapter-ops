chr# ChapterOps — System Architecture

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
| Testing       | pytest (backend), Vitest + RTL (frontend)           |

---

## Multi-Tenant Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                    ORGANIZATION                          │
│            (e.g., Phi Beta Sigma Fraternity)             │
│                                                          │
│   ┌──────────────────┐    ┌──────────────────┐          │
│   │     REGION       │    │     REGION       │   ...    │
│   │  (e.g., Eastern) │    │  (e.g., Southern)│          │
│   │                  │    │                  │          │
│   │  ┌────────────┐  │    │  ┌────────────┐  │          │
│   │  │  CHAPTER   │  │    │  │  CHAPTER   │  │          │
│   │  │ (Tenant A) │  │    │  │ (Tenant C) │  │          │
│   │  └────────────┘  │    │  └────────────┘  │          │
│   │  ┌────────────┐  │    │  ┌────────────┐  │          │
│   │  │  CHAPTER   │  │    │  │  CHAPTER   │  │          │
│   │  │ (Tenant B) │  │    │  │ (Tenant D) │  │          │
│   │  └────────────┘  │    │  └────────────┘  │          │
│   └──────────────────┘    └──────────────────┘          │
└─────────────────────────────────────────────────────────┘

Tenant Isolation: Every data query is scoped by chapter_id
Context: g.current_chapter set via middleware on each request
```

---

## Data Model (21 Models)

```
User ─────────────────────────────────────────────────────────┐
  │                                                            │
  ├── OrganizationMembership ──► Organization                  │
  │                                  │                         │
  ├── RegionMembership ──────► Region ◄──┘                     │
  │                              │                             │
  └── ChapterMembership ────► Chapter ◄──┘                     │
        │                        │                             │
        │                        ├── Payment                   │
        │                        ├── PaymentPlan               │
        │                        ├── Donation                  │
        │                        ├── Event                     │
        │                        │     └── EventAttendance     │
        │                        ├── Announcement              │
        │                        ├── Document                  │
        │                        ├── KnowledgeArticle          │
        │                        ├── Notification              │
        │                        ├── InviteCode                │
        │                        ├── ChapterTransferRequest    │
        │                        └── WorkflowTemplate          │
        │                              ├── WorkflowStep        │
        │                              └── WorkflowInstance    │
        │                                    └── StepInstance  │
        │                                                      │
        └── active_chapter_id (session context) ───────────────┘
```

---

## Authentication & Authorization

```
┌─────────────────────────────────────────────────────┐
│                    AUTH FLOW                          │
│                                                      │
│  Login ──► bcrypt verify ──► Flask-Login session     │
│                                    │                 │
│                              ┌─────▼──────┐         │
│                              │ current_user│         │
│                              └─────┬──────┘         │
│                                    │                 │
│                    ┌───────────────▼──────────────┐  │
│                    │   Tenant Middleware           │  │
│                    │   Sets g.current_chapter      │  │
│                    │   from active_chapter_id      │  │
│                    └───────────────┬──────────────┘  │
│                                    │                 │
│                    ┌───────────────▼──────────────┐  │
│                    │   Role Decorators             │  │
│                    │   @chapter_required           │  │
│                    │   @role_required("treasurer") │  │
│                    │   @region_role_required(...)  │  │
│                    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

CHAPTER ROLES              REGION ROLES              ORG ROLES
─────────────              ────────────              ─────────
5 admin                    5 regional_director       5 admin
4 president                4 regional_1st_vice       0 member
3 vice_president           3 regional_2nd_vice
2 treasurer                2 regional_treasurer
1 secretary                1 regional_secretary
0 member                   0 member
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
                                    │  (resolve chapter)   │
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
│  │  /register              /members                     │  │
│  │  /events/public/:slug   /payments                    │  │
│  │                         /donations                   │  │
│  │                         /events                      │  │
│  │                         /invites                     │  │
│  │                         /comms                       │  │
│  │                         /documents                   │  │
│  │                         /kb                          │  │
│  │                         /regions                     │  │
│  │                         /region-dashboard            │  │
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
│  │ notifStore   │  │ + 8 more     │  │               │   │
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

## API Surface (17 Blueprints, 80+ Endpoints)

| Blueprint        | Prefix              | Key Operations                              |
|------------------|----------------------|---------------------------------------------|
| auth             | /api/auth            | login, register, logout, profile, switch    |
| onboarding       | /api/onboarding      | org/region/chapter setup                    |
| members          | /api/members         | list, update role/status, delete            |
| invites          | /api/invites         | create/delete invite codes                  |
| payments         | /api/payments        | list, create, checkout, summary             |
| payment_plans    | /api/payment-plans   | CRUD recurring plans                        |
| donations        | /api/donations       | list, create, checkout                      |
| events           | /api/events          | CRUD, RSVP, attendees, public, tickets      |
| comms            | /api/comms           | announcements, email blast                  |
| notifications    | /api/notifications   | list, mark read, unread count               |
| documents        | /api/documents       | file vault CRUD, download                   |
| kb               | /api/kb              | knowledge articles CRUD                     |
| regions          | /api/regions         | CRUD, chapters, members, directory          |
| transfers        | /api/transfers       | request, approve/deny, list                 |
| workflows        | /api/workflows       | templates, steps, instances, tasks          |
| stripe_connect   | /api/stripe/connect  | OAuth, account info, disconnect             |
| config           | /api/config          | org/chapter config GET/PUT                  |
| files            | /api/files           | profile pics, logos, favicons               |
| webhooks         | /webhook             | Stripe event handling                       |

---

## Deployment Target

```
┌─────────────────────────────────────────────────┐
│                    RENDER                         │
│                                                   │
│  ┌──────────────┐    ┌─────────────────────────┐ │
│  │ Static Site  │    │ Web Service             │ │
│  │ (React SPA)  │    │ (Flask + Gunicorn)      │ │
│  │              │    │                         │ │
│  │ Vite build → │    │ wsgi.py entry point     │ │
│  │ dist/        │    │ ProductionConfig        │ │
│  └──────────────┘    └────────────┬────────────┘ │
│                                    │              │
│         ┌──────────────────────────┼───────┐     │
│         │                          │       │     │
│  ┌──────▼──────┐  ┌───────────────▼┐      │     │
│  │  Managed    │  │   Managed      │      │     │
│  │  PostgreSQL │  │   Redis        │      │     │
│  └─────────────┘  └────────────────┘      │     │
│                                            │     │
└────────────────────────────────────────────┘     │
                                                    │
          ┌─────────────────────────────────────────┘
          │
   ┌──────▼──────────────────────────┐
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

---

*Generated 2026-03-18 · ChapterOps v1.0*
