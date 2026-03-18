# ChapterOps

A multi-tenant SaaS platform for Greek letter organizations to manage chapter operations. Built initially for the Divine Nine (NPHC) and expanding to all fraternities and sororities globally.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (for local PostgreSQL and Redis)

### 1. Start Local Services

```bash
docker compose up -d
```

This starts PostgreSQL (port 5432) and Redis (port 6379).

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate      # macOS/Linux
# venv\Scripts\activate       # Windows

pip install -r requirements.txt

# Copy environment file and configure
cp ../.env.example .env

# Run database migrations
flask db upgrade

# Start the Flask dev server
flask run
```

The API will be available at `http://localhost:5000`.

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The React app will be available at `http://localhost:5173`, with API requests proxied to Flask.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, React Router v7 |
| Backend | Flask 3.x, Python 3.11+, SQLAlchemy 2.x, Alembic |
| Database | PostgreSQL 16, Redis 7 |
| Payments | Stripe Connect (per-chapter accounts) |
| Storage | S3-compatible (Cloudflare R2 / AWS S3) |
| Email | SendGrid |
| SMS | Twilio |

---

## Architecture

### Multi-Tenancy Model

The platform uses a shared-database, shared-schema multi-tenancy model scoped at the **Chapter** level:

- **Organization** — National Greek letter organization (e.g., Phi Beta Sigma Fraternity, Inc.)
- **Chapter** — Local chapter (the primary tenant boundary — all data is scoped here)
- **Member** — Individual user (can belong to multiple chapters)

Data isolation is enforced via:
- Flask middleware that sets `g.current_chapter` on every authenticated request
- All database queries filter explicitly by `chapter_id`
- PostgreSQL Row-Level Security as a safety net

### Role System

Roles are per-chapter (stored on `ChapterMembership`):

| Role | Access |
|------|--------|
| `member` | Dashboard, own payments, donations, settings |
| `secretary` | Member role + member list, invites, regions, workflows |
| `treasurer` | Secretary role + full financial management |
| `vice_president` | Treasurer-level access |
| `president` | Full chapter access |
| `admin` | Platform-level access (system administrators) |

For comprehensive architecture documentation, see [CLAUDE.md](./CLAUDE.md).

---

## Features

### Core Platform
- **Multi-tenant architecture** — Full data isolation between chapters via chapter_id scoping and Flask tenant middleware
- **Invite-only registration** — Members join via time-limited invite codes sent by chapter officers
- **Session-based authentication** — Secure cookies with session regeneration on login and rate-limited auth endpoints
- **Role-based access control** — Per-chapter roles with hierarchical permission inheritance

### Financial Management
- **Payments** — Record one-time and installment payments; Stripe Checkout integration for online collection
- **Payment Plans** — Multi-installment plans with automatic completion detection
- **Donations** — Accept and track chapter donations with donor attribution
- **Financial Status** — Member `financial_status` auto-promotes to `financial` after a successful payment
- **Stripe Connect** — Each chapter has its own connected Stripe account; platform handles OAuth onboarding and webhook routing

### Member Management
- **Member directory** — Full member list with financial status, role, and region filters (secretary+)
- **Chapter Transfers** — Members can transfer between chapters; full transfer history tracked
- **Custom Fields** — Organizations can define custom member profile fields
- **Profile Pictures** — S3-backed user profile picture upload/delete

### Organization Branding (White-Label)
- **Custom colors** — 3 color palettes × 3 shades each (primary, secondary, accent)
- **Custom typography** — Heading and body font selection from a curated Google Fonts list
- **Logos & Favicons** — Upload organization and chapter logos (sidebar) and favicons (browser tab) separately
- **Scope inheritance** — Organization sets defaults; chapters can optionally override with their own branding
- **Divine Nine presets** — One-click branding presets for all NPHC organizations with official colors
- **Dynamic theming** — Changes apply instantly via CSS custom properties without a build step

### In-App Notifications
- **Notification bell** — Unread count badge in the header; dropdown shows recent notifications
- **Automatic triggers** — Notifications created on payments, plan completions, new members, invite events
- **Multi-tenant isolated** — Users only see notifications for their active chapter
- **Read/delete management** — Mark individual or all notifications as read; delete from inbox
- **Polling** — Unread count refreshes every 30 seconds while the tab is active

### Settings
- **Profile tab** — Update name, password, phone; upload/remove profile picture
- **Branding tab** — Full white-label customization (colors, fonts, logos, favicons, presets)
- **Fee Types** — Configure chapter fee types and amounts
- **Chapter Info** — Update chapter details; Stripe onboarding status

### Additional
- **Regions** — Organize members geographically within a chapter
- **Workflows** — Custom process automation (in progress)
- **File Storage** — All uploads (logos, favicons, profile pictures) stored on Cloudflare R2

---

## Environment Variables

Copy `.env.example` to `backend/.env` and configure:

```
DATABASE_URL=postgresql://chapterops:chapterops@localhost:5432/chapterops
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=<random secret>

STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=chapterops
```

### Stripe Local Testing

Use the Stripe CLI to forward webhook events to your local server:

```bash
stripe listen --forward-to localhost:5000/webhook
```

---

## Database Migrations

```bash
cd backend

# Generate a new migration after model changes
flask db migrate -m "description of change"

# Apply pending migrations
flask db upgrade

# Roll back the last migration
flask db downgrade
```

---

## Project Status

**Phase 1: Foundation** — Complete

| Feature | Status |
|---------|--------|
| Multi-tenant architecture | ✅ |
| Auth system (login, register, invite codes) | ✅ |
| Chapter onboarding flow | ✅ |
| Financial management (payments, plans, donations) | ✅ |
| Stripe Connect per-chapter | ✅ |
| S3/R2 file storage | ✅ |
| Organization branding & white-label system | ✅ |
| In-app notification system | ✅ |
| Role-based UI (nav, dashboard, pages) | ✅ |
| Chapter transfer system | ✅ |
| Financial status auto-promotion | ✅ |
| Settings overhaul (profile, branding, fees) | ✅ |

---

## License

Proprietary — All rights reserved.
