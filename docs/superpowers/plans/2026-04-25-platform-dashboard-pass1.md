# Platform Admin Dashboard Pass 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Platform Admin Dashboard at `/platform` from a header + pending-requests stub into a real founder dashboard with summary tiles (orgs/chapters/members/dues YTD), tier mix breakdown, and top-5 chapters by dues.

**Architecture:** Single new endpoint `GET /api/platform/dashboard` (gated by existing `@require_founder` decorator) returns all metrics in one JSON payload. The existing `PlatformDashboard.tsx` page is expanded to render the new sections above the existing pending requests component. A new `is_demo: bool` column on `Organization` lets the demo seed (DGLO) be excluded from platform metrics.

**Tech Stack:** Flask 3.x + SQLAlchemy 2.x + Alembic + Flask-Login (existing). Pytest with the existing fixtures from `tests/conftest.py`. React 19 + TypeScript + Tailwind CSS (existing).

**Spec:** [docs/superpowers/specs/2026-04-25-platform-dashboard-pass1-design.md](../specs/2026-04-25-platform-dashboard-pass1-design.md)

---

## Verified Facts (resolved during planning)

- `@require_founder` already exists at `chapter-ops/backend/app/utils/platform_admin.py` — use it directly. NO need to create a new decorator.
- `is_founder()` (same module) is the helper that checks if `current_user.email` matches `PLATFORM_ADMIN_EMAIL` or falls back to `FOUNDER_EMAIL`.
- `Payment.amount` is `Numeric(10, 2)` — returns `Decimal` in Python.
- `Organization.plan` valid values: `"beta"`, `"starter"`, `"pro"`, `"elite"`, `"organization"` (per CLAUDE.md).
- `Chapter.subscription_tier` valid values: `"starter"`, `"pro"`, `"elite"`, `"organization"` (per CLAUDE.md — no "beta").
- Pytest harness exists with full fixtures (`app`, `client`, `db_session`) and factory helpers (`make_user`, `make_organization`, `make_chapter`, `make_membership`) at `chapter-ops/backend/tests/conftest.py`.
- Existing pattern for testing platform-admin gating is in `tests/test_platform_admin.py`.
- Migrations are run as a separate command (verified earlier — no `db.create_all()` in app startup).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `chapter-ops/backend/app/models/organization.py` | Modify | Add `is_demo: bool` column |
| `chapter-ops/backend/migrations/versions/<auto>_add_is_demo_to_organization.py` | Create (via `flask db migrate`) | Alembic migration |
| `chapter-ops/backend/tests/conftest.py` | Modify | Add `is_demo=False` parameter to `make_organization` factory |
| `chapter-ops/backend/app/cli/seed_demo.py` | Modify (~3 lines) | Set `is_demo=True` on DGLO; handle re-seed |
| `chapter-ops/backend/app/routes/platform.py` | Create (~180 lines) | New blueprint with `GET /api/platform/dashboard` |
| `chapter-ops/backend/app/__init__.py` | Modify (2 lines) | Register blueprint + CSRF exempt |
| `chapter-ops/backend/tests/test_platform_dashboard.py` | Create (~250 lines) | Tests for the endpoint: gating, summary, tier breakdown, top chapters |
| `chapter-ops/frontend/src/lib/format.ts` | Create (~25 lines) | Extract `formatDollars` to shared utility |
| `chapter-ops/frontend/src/pages/IHQDashboard.tsx` | Modify | Import `formatDollars` from shared lib (delete inline copy) |
| `chapter-ops/frontend/src/types/platform.ts` | Create (~30 lines) | TypeScript types for the endpoint response |
| `chapter-ops/frontend/src/services/platformService.ts` | Create (~15 lines) | `fetchPlatformDashboard()` |
| `chapter-ops/frontend/src/pages/PlatformDashboard.tsx` | Modify (~150 lines added) | Render the four new sections above existing pending requests |

---

## Task 1: Add `is_demo` column to Organization

**Files:**
- Modify: `chapter-ops/backend/app/models/organization.py`
- Modify: `chapter-ops/backend/tests/conftest.py`
- Create: `chapter-ops/backend/migrations/versions/<auto>_add_is_demo_to_organization.py`
- Create: `chapter-ops/backend/tests/test_organization_is_demo.py`

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_organization_is_demo.py`:

```python
"""Verify the is_demo flag on Organization defaults to False and is settable."""

from tests.conftest import make_organization
from app.extensions import db


class TestOrganizationIsDemo:
    def test_default_is_false(self, db_session):
        org = make_organization(name="Real Org", abbreviation="RO")
        db_session.commit()
        assert org.is_demo is False

    def test_can_be_set_to_true(self, db_session):
        org = make_organization(name="Demo Org", abbreviation="DGLO", is_demo=True)
        db_session.commit()
        assert org.is_demo is True

    def test_existing_rows_default_to_false_after_migration(self, db_session):
        # Simulating: row created via the model with no is_demo arg should be False
        from app.models import Organization
        org = Organization(name="Bare Org", abbreviation="BO", org_type="fraternity")
        db_session.add(org)
        db_session.commit()
        assert org.is_demo is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd chapter-ops/backend && python -m pytest tests/test_organization_is_demo.py -v`
Expected: FAIL with errors about `is_demo` not being a valid kwarg or attribute.

- [ ] **Step 3: Add `is_demo` column to the Organization model**

Edit `chapter-ops/backend/app/models/organization.py`. Find the `active` column (around line 25):

```python
active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)
```

Add immediately after it:

```python
# True for fictional demo organizations seeded for prospect demos
# (e.g., DGLO). Excluded from platform-wide metrics.
is_demo: Mapped[bool] = mapped_column(
    db.Boolean,
    nullable=False,
    default=False,
    server_default=db.text("false"),
)
```

Also add `"is_demo": self.is_demo,` to the `to_dict()` return dict (so the field is exposed in API responses where Organization is serialized).

- [ ] **Step 4: Update the test factory to accept is_demo**

Edit `chapter-ops/backend/tests/conftest.py`. Find `make_organization` (around line 83) and update:

```python
def make_organization(
    name="Phi Beta Sigma Fraternity, Inc.",
    abbreviation="PBS",
    org_type="fraternity",
    is_demo=False,
):
    """Create and persist an Organization."""
    org = Organization(
        name=name,
        abbreviation=abbreviation,
        org_type=org_type,
        is_demo=is_demo,
    )
    _db.session.add(org)
    _db.session.flush()
    return org
```

- [ ] **Step 5: Generate the Alembic migration**

Run: `cd chapter-ops/backend && flask db migrate -m "add is_demo flag to organization"`
Expected: a new file appears in `chapter-ops/backend/migrations/versions/`. Open it and verify the `upgrade()` function contains:

```python
op.add_column('organization', sa.Column('is_demo', sa.Boolean(), server_default=sa.text('false'), nullable=False))
```

If the autogenerated migration includes other unrelated changes (e.g., index drops), edit it down to just the `is_demo` column add. The `downgrade()` should be `op.drop_column('organization', 'is_demo')`.

- [ ] **Step 6: Apply the migration**

Run: `cd chapter-ops/backend && flask db upgrade`
Expected: completes without error. The `organization` table now has an `is_demo` column.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd chapter-ops/backend && python -m pytest tests/test_organization_is_demo.py -v`
Expected: PASS — all three test cases.

- [ ] **Step 8: Run the full test suite to confirm no regressions**

Run: `cd chapter-ops/backend && python -m pytest tests/ -x -q`
Expected: all tests pass (or the same set that passed before this change). The factory's new `is_demo=False` default means existing tests continue to create non-demo orgs by default.

- [ ] **Step 9: Commit**

```bash
git add chapter-ops/backend/app/models/organization.py chapter-ops/backend/tests/conftest.py chapter-ops/backend/migrations/versions/ chapter-ops/backend/tests/test_organization_is_demo.py
git commit -m "feat(model): add is_demo flag to Organization for platform metrics filtering"
```

---

## Task 2: Update demo seed to mark DGLO as is_demo=True

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` — `_seed_organization` function

- [ ] **Step 1: Find and read the existing `_seed_organization` function**

Open `chapter-ops/backend/app/cli/seed_demo.py` and locate `_seed_organization` (around line 135). It currently looks like:

```python
def _seed_organization():
    """Create or find DGLO. Returns the Organization instance."""
    from app.models import Organization

    org, created = _find_or_create(
        Organization,
        lookup={"abbreviation": DEMO_ORG_ABBREV},
        defaults={
            "name": DEMO_ORG_NAME,
            "org_type": "fraternity",
            "council": "NPHC",
            "active": True,
            "plan": "beta",
            "config": {},
        },
    )
    _log_phase("Organization", 1 if created else 0, 0 if created else 1)
    return org
```

- [ ] **Step 2: Update the function to set is_demo=True (and repair existing rows)**

Replace the function body with:

```python
def _seed_organization():
    """Create or find DGLO. Returns the Organization instance.

    Sets is_demo=True so the org is excluded from platform-wide metrics.
    On re-seed, repairs the flag if it was somehow set to False on a prior run.
    """
    from app.models import Organization

    org, created = _find_or_create(
        Organization,
        lookup={"abbreviation": DEMO_ORG_ABBREV},
        defaults={
            "name": DEMO_ORG_NAME,
            "org_type": "fraternity",
            "council": "NPHC",
            "active": True,
            "plan": "beta",
            "config": {},
            "is_demo": True,
        },
    )
    # Belt-and-suspenders: ensure existing rows from older seeds (before is_demo
    # existed) are flipped to True. This is idempotent.
    if not created and not org.is_demo:
        org.is_demo = True
    _log_phase("Organization", 1 if created else 0, 0 if created else 1)
    return org
```

- [ ] **Step 3: Verify syntax**

Run: `cd chapter-ops/backend && python -c "import ast; ast.parse(open('app/cli/seed_demo.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Run the seed locally to confirm it works**

Run: `cd chapter-ops/backend && flask seed-demo-org`
Expected: completes without error. If DGLO already exists from a prior seed, the output reports `Organization: 0 created, 1 existed` and silently flips `is_demo` to True.

- [ ] **Step 5: Verify is_demo was set on DGLO**

Run:
```bash
cd chapter-ops/backend && python -c "
from app import create_app
from app.models import Organization
app = create_app()
with app.app_context():
    o = Organization.query.filter_by(abbreviation='DGLO').first()
    print(f'DGLO is_demo: {o.is_demo}')
"
```
Expected output: `DGLO is_demo: True`

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): mark DGLO seed org as is_demo=True"
```

---

## Task 3: Create platform routes blueprint with stub endpoint + auth gate

**Files:**
- Create: `chapter-ops/backend/app/routes/platform.py`
- Modify: `chapter-ops/backend/app/__init__.py` — register the new blueprint
- Create: `chapter-ops/backend/tests/test_platform_dashboard.py`

- [ ] **Step 1: Write the failing test for auth gating**

Create `chapter-ops/backend/tests/test_platform_dashboard.py`:

```python
"""Tests for GET /api/platform/dashboard."""

import pytest

from tests.conftest import make_user, make_organization
from app.extensions import db


def _login(client, email, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestPlatformDashboardAuth:
    def test_returns_403_when_not_authenticated(self, client):
        resp = client.get("/api/platform/dashboard")
        assert resp.status_code in (401, 403)

    def test_returns_403_when_not_platform_admin(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        make_user(email="someone@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "someone@example.com")
        resp = client.get("/api/platform/dashboard")
        assert resp.status_code == 403

    def test_returns_200_when_platform_admin(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        make_user(email="founder@example.com", password="Str0ng!Password1")
        db_session.commit()
        _login(client, "founder@example.com")
        resp = client.get("/api/platform/dashboard")
        assert resp.status_code == 200
        body = resp.get_json()
        assert "summary" in body
        assert "tier_breakdown" in body
        assert "top_chapters_by_dues" in body
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py::TestPlatformDashboardAuth -v`
Expected: FAIL — endpoint returns 404 (route doesn't exist yet).

- [ ] **Step 3: Create the platform blueprint with a stub endpoint**

Create `chapter-ops/backend/app/routes/platform.py`:

```python
"""
Platform Admin Dashboard routes — /api/platform/*

Cross-organization views and actions reserved for platform staff (the
founder identified via FOUNDER_EMAIL / PLATFORM_ADMIN_EMAIL config).
"""

from flask import Blueprint, jsonify
from flask_login import login_required

from app.utils.platform_admin import require_founder

platform_bp = Blueprint("platform", __name__, url_prefix="/api/platform")


@platform_bp.route("/dashboard", methods=["GET"])
@login_required
@require_founder
def get_dashboard():
    """Return cross-org platform metrics for the founder dashboard.

    All counts and aggregates exclude organizations flagged is_demo=True
    so demo seeds (e.g., DGLO) don't skew real business metrics.
    """
    return jsonify({
        "summary": {
            "organizations": {"total": 0, "new_30d": 0},
            "chapters": {"total": 0, "new_30d": 0},
            "members": {"total": 0, "new_30d": 0},
            "dues_ytd": "0.00",
        },
        "tier_breakdown": {
            "organizations": [],
            "chapters": [],
        },
        "top_chapters_by_dues": [],
    })
```

- [ ] **Step 4: Register the blueprint in `app/__init__.py`**

Open `chapter-ops/backend/app/__init__.py` and find the section where blueprints are registered (search for `app.register_blueprint`). Add after the last existing blueprint registration:

```python
    from app.routes.platform import platform_bp
    app.register_blueprint(platform_bp)
    csrf.exempt(platform_bp)
```

(CSRF exempt because this is a GET-only blueprint at the moment; if POST routes are added later, drop the exempt and rely on the standard CSRF token flow.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py::TestPlatformDashboardAuth -v`
Expected: all three test cases PASS.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/routes/platform.py chapter-ops/backend/app/__init__.py chapter-ops/backend/tests/test_platform_dashboard.py
git commit -m "feat(platform): scaffold /api/platform/dashboard endpoint with founder auth gate"
```

---

## Task 4: Implement the `summary` block (orgs/chapters/members/dues totals + 30-day deltas)

**Files:**
- Modify: `chapter-ops/backend/app/routes/platform.py`
- Modify: `chapter-ops/backend/tests/test_platform_dashboard.py`

- [ ] **Step 1: Write failing tests for the summary block**

Append to `chapter-ops/backend/tests/test_platform_dashboard.py`:

```python
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from tests.conftest import (
    make_organization, make_chapter, make_user, make_membership
)
from app.models import Payment


def _make_founder_session(app, client, db_session):
    """Helper: create the founder, log in, return None."""
    app.config["FOUNDER_EMAIL"] = "founder@example.com"
    make_user(email="founder@example.com", password="Str0ng!Password1")
    db_session.commit()
    _login(client, "founder@example.com")


class TestPlatformDashboardSummary:
    def test_excludes_demo_orgs_from_org_count(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        make_organization(name="Real", abbreviation="REAL")
        make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["organizations"]["total"] == 1

    def test_excludes_inactive_orgs_from_org_count(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        make_organization(name="Active", abbreviation="ACT")
        inactive = make_organization(name="Gone", abbreviation="GONE")
        inactive.active = False
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["organizations"]["total"] == 1

    def test_chapters_count_excludes_demo_org_chapters(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        make_chapter(real, name="Real Chapter")
        make_chapter(demo, name="Demo Chapter")
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["chapters"]["total"] == 1

    def test_members_count_dedupes_and_excludes_demo(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        c1 = make_chapter(real, name="C1")
        c2 = make_chapter(real, name="C2", region=c1.region)
        cdemo = make_chapter(demo, name="DemoC")
        u1 = make_user(email="u1@example.com")
        u2 = make_user(email="u2@example.com")
        u_in_demo = make_user(email="u3@example.com")
        # u1 has memberships in BOTH real chapters — must count as 1
        make_membership(u1, c1)
        make_membership(u1, c2)
        make_membership(u2, c1)
        make_membership(u_in_demo, cdemo)
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        # u1 + u2 = 2 distinct real members (u_in_demo excluded, u1 not double-counted)
        assert body["summary"]["members"]["total"] == 2

    def test_dues_ytd_sums_payments_excluding_demo(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        cr = make_chapter(real, name="CR")
        cd = make_chapter(demo, name="CD")
        u = make_user(email="payer@example.com")
        db_session.commit()

        # Real payment counts; demo payment doesn't
        db_session.add(Payment(chapter_id=cr.id, user_id=u.id, amount=Decimal("125.00"), method="manual"))
        db_session.add(Payment(chapter_id=cd.id, user_id=u.id, amount=Decimal("999.00"), method="manual"))
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["dues_ytd"] == "125.00"

    def test_new_30d_orgs_only_counts_recent(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        old_org = make_organization(name="Old", abbreviation="OLD")
        old_org.created_at = datetime.now(timezone.utc) - timedelta(days=60)
        make_organization(name="New", abbreviation="NEW")  # created_at = now
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["summary"]["organizations"]["total"] == 2
        assert body["summary"]["organizations"]["new_30d"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py::TestPlatformDashboardSummary -v`
Expected: all six FAIL — current stub returns zeros for everything.

- [ ] **Step 3: Implement the summary block**

Replace the `get_dashboard` function in `chapter-ops/backend/app/routes/platform.py` with:

```python
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, jsonify
from flask_login import login_required
from sqlalchemy import distinct, extract, func

from app.extensions import db
from app.models import (
    Chapter,
    ChapterMembership,
    Organization,
    Payment,
    User,
)
from app.utils.platform_admin import require_founder

platform_bp = Blueprint("platform", __name__, url_prefix="/api/platform")


def _summary_block():
    """Compute the summary tile values."""
    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=30)
    current_year = now.year

    # Organizations (real, active, non-demo)
    org_base = Organization.query.filter_by(is_demo=False, active=True)
    orgs_total = org_base.count()
    orgs_new_30d = org_base.filter(Organization.created_at >= cutoff_30d).count()

    # Chapters (active, in real orgs)
    chap_base = (
        Chapter.query
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(Organization.is_demo.is_(False), Chapter.active.is_(True))
    )
    chapters_total = chap_base.count()
    chapters_new_30d = chap_base.filter(Chapter.created_at >= cutoff_30d).count()

    # Members — distinct users with at least one active membership in a real, active chapter
    members_total = (
        db.session.query(func.count(distinct(ChapterMembership.user_id)))
        .join(Chapter, ChapterMembership.chapter_id == Chapter.id)
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(
            Organization.is_demo.is_(False),
            Chapter.active.is_(True),
            ChapterMembership.active.is_(True),
        )
        .scalar()
    ) or 0

    # New members (new accounts in last 30d, with at least one real membership)
    members_new_30d = (
        db.session.query(func.count(distinct(ChapterMembership.user_id)))
        .join(Chapter, ChapterMembership.chapter_id == Chapter.id)
        .join(Organization, Chapter.organization_id == Organization.id)
        .join(User, ChapterMembership.user_id == User.id)
        .filter(
            Organization.is_demo.is_(False),
            Chapter.active.is_(True),
            ChapterMembership.active.is_(True),
            User.created_at >= cutoff_30d,
        )
        .scalar()
    ) or 0

    # Dues YTD — sum of Payment.amount for current year, real chapters only
    dues_ytd = (
        db.session.query(func.coalesce(func.sum(Payment.amount), Decimal("0")))
        .join(Chapter, Payment.chapter_id == Chapter.id)
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(
            Organization.is_demo.is_(False),
            extract("year", Payment.created_at) == current_year,
        )
        .scalar()
    )

    return {
        "organizations": {"total": orgs_total, "new_30d": orgs_new_30d},
        "chapters": {"total": chapters_total, "new_30d": chapters_new_30d},
        "members": {"total": members_total, "new_30d": members_new_30d},
        "dues_ytd": f"{Decimal(dues_ytd):.2f}",
    }


@platform_bp.route("/dashboard", methods=["GET"])
@login_required
@require_founder
def get_dashboard():
    """Return cross-org platform metrics for the founder dashboard.

    All counts and aggregates exclude organizations flagged is_demo=True
    so demo seeds (e.g., DGLO) don't skew real business metrics.
    """
    return jsonify({
        "summary": _summary_block(),
        "tier_breakdown": {"organizations": [], "chapters": []},
        "top_chapters_by_dues": [],
    })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py -v`
Expected: all tests in `TestPlatformDashboardAuth` and `TestPlatformDashboardSummary` PASS.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/platform.py chapter-ops/backend/tests/test_platform_dashboard.py
git commit -m "feat(platform): implement summary block (orgs/chapters/members/dues with 30d deltas)"
```

---

## Task 5: Implement the `tier_breakdown` block

**Files:**
- Modify: `chapter-ops/backend/app/routes/platform.py`
- Modify: `chapter-ops/backend/tests/test_platform_dashboard.py`

- [ ] **Step 1: Write failing tests for tier_breakdown**

Append to `chapter-ops/backend/tests/test_platform_dashboard.py`:

```python
ORG_PLAN_TIERS = ["beta", "starter", "pro", "elite", "organization"]
CHAPTER_TIERS = ["starter", "pro", "elite", "organization"]


class TestPlatformDashboardTierBreakdown:
    def test_org_breakdown_returns_all_tiers_with_zero_for_missing(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        # Only one beta org; all other tiers should appear with count 0
        make_organization(name="Beta", abbreviation="BETA")  # plan defaults to "beta"
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        breakdown = {row["tier"]: row["count"] for row in body["tier_breakdown"]["organizations"]}
        assert breakdown == {"beta": 1, "starter": 0, "pro": 0, "elite": 0, "organization": 0}

    def test_org_breakdown_excludes_demo_org(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        make_organization(name="Real", abbreviation="REAL")  # beta
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        demo.plan = "pro"
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        breakdown = {row["tier"]: row["count"] for row in body["tier_breakdown"]["organizations"]}
        assert breakdown["beta"] == 1
        assert breakdown["pro"] == 0  # demo org's pro tier doesn't count

    def test_chapter_breakdown_returns_all_4_tiers(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        org = make_organization(name="Real", abbreviation="REAL")
        c1 = make_chapter(org, name="C1")
        c2 = make_chapter(org, name="C2", region=c1.region)
        c1.subscription_tier = "pro"
        c2.subscription_tier = "starter"
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        breakdown = {row["tier"]: row["count"] for row in body["tier_breakdown"]["chapters"]}
        assert breakdown == {"starter": 1, "pro": 1, "elite": 0, "organization": 0}

    def test_chapter_breakdown_excludes_demo_chapters(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        make_chapter(real, name="Real Chapter")  # subscription_tier defaults to "starter"
        make_chapter(demo, name="Demo Chapter")
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        breakdown = {row["tier"]: row["count"] for row in body["tier_breakdown"]["chapters"]}
        assert breakdown["starter"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py::TestPlatformDashboardTierBreakdown -v`
Expected: all FAIL — `tier_breakdown` is still empty arrays.

- [ ] **Step 3: Add tier_breakdown helper and wire it into the response**

Add this helper to `chapter-ops/backend/app/routes/platform.py` (above the `_summary_block` function):

```python
ORG_PLAN_TIERS = ["beta", "starter", "pro", "elite", "organization"]
CHAPTER_TIERS = ["starter", "pro", "elite", "organization"]


def _tier_breakdown_block():
    """Return tier counts for orgs and chapters. Always includes all tiers
    (zero-fills missing ones) so the UI doesn't have to."""
    org_rows = (
        db.session.query(Organization.plan, func.count(Organization.id))
        .filter(Organization.is_demo.is_(False), Organization.active.is_(True))
        .group_by(Organization.plan)
        .all()
    )
    org_counts = dict(org_rows)
    org_breakdown = [
        {"tier": tier, "count": int(org_counts.get(tier, 0))}
        for tier in ORG_PLAN_TIERS
    ]

    chapter_rows = (
        db.session.query(Chapter.subscription_tier, func.count(Chapter.id))
        .join(Organization, Chapter.organization_id == Organization.id)
        .filter(
            Organization.is_demo.is_(False),
            Chapter.active.is_(True),
        )
        .group_by(Chapter.subscription_tier)
        .all()
    )
    chapter_counts = dict(chapter_rows)
    chapter_breakdown = [
        {"tier": tier, "count": int(chapter_counts.get(tier, 0))}
        for tier in CHAPTER_TIERS
    ]

    return {"organizations": org_breakdown, "chapters": chapter_breakdown}
```

Update the `get_dashboard` function to use it:

```python
    return jsonify({
        "summary": _summary_block(),
        "tier_breakdown": _tier_breakdown_block(),
        "top_chapters_by_dues": [],
    })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py -v`
Expected: all tests in all three test classes PASS.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/platform.py chapter-ops/backend/tests/test_platform_dashboard.py
git commit -m "feat(platform): add tier_breakdown for orgs and chapters with zero-filling"
```

---

## Task 6: Implement the `top_chapters_by_dues` block

**Files:**
- Modify: `chapter-ops/backend/app/routes/platform.py`
- Modify: `chapter-ops/backend/tests/test_platform_dashboard.py`

- [ ] **Step 1: Write failing tests for top_chapters**

Append to `chapter-ops/backend/tests/test_platform_dashboard.py`:

```python
class TestPlatformDashboardTopChapters:
    def test_returns_empty_when_no_payments(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        org = make_organization(name="Real", abbreviation="REAL")
        make_chapter(org, name="No Payments Chapter")
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        assert body["top_chapters_by_dues"] == []

    def test_orders_by_dues_desc_and_caps_at_5(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        org = make_organization(name="Real", abbreviation="REAL")
        u = make_user(email="payer@example.com")
        db_session.commit()

        chapters_with_dues = []
        prev_region = None
        for i in range(7):
            ch = make_chapter(org, name=f"Chapter {i}", region=prev_region)
            prev_region = ch.region
            db_session.add(Payment(
                chapter_id=ch.id, user_id=u.id,
                amount=Decimal(str(100 + i * 50)),  # 100, 150, 200, ..., 400
                method="manual",
            ))
            chapters_with_dues.append((ch.id, ch.name, 100 + i * 50))
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        top = body["top_chapters_by_dues"]
        assert len(top) == 5
        # First entry should be the highest-dues chapter
        assert top[0]["dues_ytd"] == "400.00"
        # Returned in descending order
        amounts = [Decimal(c["dues_ytd"]) for c in top]
        assert amounts == sorted(amounts, reverse=True)

    def test_excludes_demo_chapters(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        real = make_organization(name="Real", abbreviation="REAL")
        demo = make_organization(name="Demo", abbreviation="DGLO", is_demo=True)
        cr = make_chapter(real, name="Real Chapter")
        cd = make_chapter(demo, name="Demo Chapter")
        u = make_user(email="payer@example.com")
        db_session.commit()
        db_session.add(Payment(chapter_id=cr.id, user_id=u.id, amount=Decimal("100"), method="manual"))
        db_session.add(Payment(chapter_id=cd.id, user_id=u.id, amount=Decimal("999"), method="manual"))
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        top = body["top_chapters_by_dues"]
        assert len(top) == 1
        assert top[0]["name"] == "Real Chapter"
        assert top[0]["dues_ytd"] == "100.00"

    def test_returns_org_name_alongside_chapter(self, app, client, db_session):
        _make_founder_session(app, client, db_session)
        org = make_organization(name="Phi Beta Sigma Fraternity, Inc.", abbreviation="PBS")
        ch = make_chapter(org, name="Sigma Delta Sigma")
        u = make_user(email="payer@example.com")
        db_session.commit()
        db_session.add(Payment(chapter_id=ch.id, user_id=u.id, amount=Decimal("250"), method="manual"))
        db_session.commit()

        body = client.get("/api/platform/dashboard").get_json()
        top = body["top_chapters_by_dues"][0]
        assert top["name"] == "Sigma Delta Sigma"
        assert top["organization_name"] == "Phi Beta Sigma Fraternity, Inc."
        assert "id" in top
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py::TestPlatformDashboardTopChapters -v`
Expected: all FAIL — `top_chapters_by_dues` is still empty.

- [ ] **Step 3: Add the top_chapters helper and wire it in**

Add to `chapter-ops/backend/app/routes/platform.py` (above `_summary_block`):

```python
TOP_CHAPTERS_LIMIT = 5


def _top_chapters_block():
    """Return up to 5 chapters ranked by current-year dues, excluding demo orgs."""
    current_year = datetime.now(timezone.utc).year

    rows = (
        db.session.query(
            Chapter.id,
            Chapter.name,
            Organization.name.label("organization_name"),
            func.coalesce(func.sum(Payment.amount), Decimal("0")).label("dues_ytd"),
        )
        .join(Organization, Chapter.organization_id == Organization.id)
        .join(Payment, Payment.chapter_id == Chapter.id)
        .filter(
            Organization.is_demo.is_(False),
            Chapter.active.is_(True),
            extract("year", Payment.created_at) == current_year,
        )
        .group_by(Chapter.id, Chapter.name, Organization.name)
        .order_by(func.sum(Payment.amount).desc())
        .limit(TOP_CHAPTERS_LIMIT)
        .all()
    )

    return [
        {
            "id": r.id,
            "name": r.name,
            "organization_name": r.organization_name,
            "dues_ytd": f"{Decimal(r.dues_ytd):.2f}",
        }
        for r in rows
    ]
```

Update the `get_dashboard` function:

```python
    return jsonify({
        "summary": _summary_block(),
        "tier_breakdown": _tier_breakdown_block(),
        "top_chapters_by_dues": _top_chapters_block(),
    })
```

- [ ] **Step 4: Run all platform dashboard tests**

Run: `cd chapter-ops/backend && python -m pytest tests/test_platform_dashboard.py -v`
Expected: all four test classes PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `cd chapter-ops/backend && python -m pytest tests/ -x -q`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/routes/platform.py chapter-ops/backend/tests/test_platform_dashboard.py
git commit -m "feat(platform): add top_chapters_by_dues with year-over-year ranking"
```

---

## Task 7: Extract `formatDollars` to a shared frontend utility

**Files:**
- Create: `chapter-ops/frontend/src/lib/format.ts`
- Modify: `chapter-ops/frontend/src/pages/IHQDashboard.tsx`

- [ ] **Step 1: Create the shared utility**

Create `chapter-ops/frontend/src/lib/format.ts`:

```typescript
/**
 * Format a numeric dollar amount as a compact human-readable string.
 *
 * Examples:
 *   formatDollars(123) → "$123"
 *   formatDollars(1234) → "$1.2K"
 *   formatDollars(1234567) → "$1.2M"
 *
 * Accepts string amounts (server returns Decimal as string) and parses safely.
 */
export function formatDollars(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!isFinite(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
```

- [ ] **Step 2: Update IHQDashboard to import from the shared utility**

Open `chapter-ops/frontend/src/pages/IHQDashboard.tsx`. Find the inline `formatDollars` function (around line 27):

```typescript
function formatDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
```

Delete it. Add this import near the other imports at the top of the file:

```typescript
import { formatDollars } from "@/lib/format";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors. (If `formatDollars` is called with `string` somewhere in IHQDashboard, the new signature accepts that — no change needed.)

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/lib/format.ts chapter-ops/frontend/src/pages/IHQDashboard.tsx
git commit -m "refactor(frontend): extract formatDollars to shared lib/format.ts"
```

---

## Task 8: Add TypeScript types and service function for the platform dashboard

**Files:**
- Create: `chapter-ops/frontend/src/types/platform.ts`
- Create: `chapter-ops/frontend/src/services/platformService.ts`

- [ ] **Step 1: Create the types file**

Create `chapter-ops/frontend/src/types/platform.ts`:

```typescript
/** Response shape for GET /api/platform/dashboard */
export interface PlatformDashboardData {
  summary: {
    organizations: { total: number; new_30d: number };
    chapters:      { total: number; new_30d: number };
    members:       { total: number; new_30d: number };
    dues_ytd:      string;
  };
  tier_breakdown: {
    organizations: TierCount[];
    chapters:      TierCount[];
  };
  top_chapters_by_dues: TopChapterRow[];
}

export interface TierCount {
  tier: string;
  count: number;
}

export interface TopChapterRow {
  id: string;
  name: string;
  organization_name: string;
  dues_ytd: string;
}
```

- [ ] **Step 2: Create the service function**

Create `chapter-ops/frontend/src/services/platformService.ts`:

```typescript
import { api } from "@/lib/api";
import type { PlatformDashboardData } from "@/types/platform";

export async function fetchPlatformDashboard(): Promise<PlatformDashboardData> {
  const { data } = await api.get<PlatformDashboardData>("/platform/dashboard");
  return data;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/types/platform.ts chapter-ops/frontend/src/services/platformService.ts
git commit -m "feat(frontend): add platform dashboard types and service"
```

---

## Task 9: Render the summary tiles in PlatformDashboard

**Files:**
- Modify: `chapter-ops/frontend/src/pages/PlatformDashboard.tsx`

- [ ] **Step 1: Replace the page with the tile-rendering version**

Replace the entire contents of `chapter-ops/frontend/src/pages/PlatformDashboard.tsx` with:

```tsx
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import PendingChapterRequestsSection from "@/components/PendingChapterRequestsSection";
import { fetchPlatformDashboard } from "@/services/platformService";
import { formatDollars } from "@/lib/format";
import type { PlatformDashboardData } from "@/types/platform";
import { Building2, Users, Map, DollarSign } from "lucide-react";

function SummaryTile({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: typeof Building2;
}) {
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
          {label}
        </span>
        <Icon className="w-4 h-4 text-content-muted" />
      </div>
      <div className="text-3xl font-heading font-black text-content-primary tabular-nums">
        {value}
      </div>
      {delta !== undefined && (
        <div className="text-xs text-content-muted mt-1.5">{delta}</div>
      )}
    </div>
  );
}

export default function PlatformDashboard() {
  const [data, setData] = useState<PlatformDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatformDashboard()
      .then(setData)
      .catch(() => setError("Failed to load platform dashboard."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-8">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted mb-2">
            Platform Admin
          </div>
          <h1 className="font-heading text-4xl font-black tracking-tight">
            Platform Dashboard
          </h1>
          <p className="text-content-secondary mt-2 max-w-2xl">
            Cross-org metrics and actions for Blue Column Systems staff.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-content-muted text-sm">Loading platform metrics…</p>
        ) : data && (
          <>
            {/* Summary tiles */}
            <section>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryTile
                  label="Organizations"
                  value={data.summary.organizations.total.toString()}
                  delta={`+${data.summary.organizations.new_30d} last 30d`}
                  icon={Building2}
                />
                <SummaryTile
                  label="Chapters"
                  value={data.summary.chapters.total.toString()}
                  delta={`+${data.summary.chapters.new_30d} last 30d`}
                  icon={Map}
                />
                <SummaryTile
                  label="Members"
                  value={data.summary.members.total.toLocaleString()}
                  delta={`+${data.summary.members.new_30d} last 30d`}
                  icon={Users}
                />
                <SummaryTile
                  label="Dues YTD"
                  value={formatDollars(data.summary.dues_ytd)}
                  icon={DollarSign}
                />
              </div>
            </section>
          </>
        )}

        <PendingChapterRequestsSection
          title="Chapter Requests — Unaffiliated Orgs"
          scope="platform_admin"
          emptyMessage="No pending chapter requests for unaffiliated organizations."
        />
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add chapter-ops/frontend/src/pages/PlatformDashboard.tsx
git commit -m "feat(platform): render summary tiles on Platform Dashboard"
```

---

## Task 10: Add the tier mix section

**Files:**
- Modify: `chapter-ops/frontend/src/pages/PlatformDashboard.tsx`

- [ ] **Step 1: Add the TierMixCard component and wire it in**

Open `chapter-ops/frontend/src/pages/PlatformDashboard.tsx`. Add this component above the `PlatformDashboard` default export (right after `SummaryTile`):

```tsx
function TierMixCard({
  title,
  rows,
}: {
  title: string;
  rows: { tier: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-5">
      <h3 className="text-sm font-heading font-bold text-content-primary mb-4">{title}</h3>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.tier} className="flex items-center gap-3">
            <span className="text-xs text-content-secondary capitalize w-24 shrink-0">
              {r.tier}
            </span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-primary-main transition-all"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-content-primary tabular-nums w-8 text-right">
              {r.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the tier mix section to the JSX**

Inside the `data && (<>...</>)` block, after the summary tiles section, add:

```tsx
            {/* Tier mix */}
            <section>
              <h2 className="text-lg font-heading font-bold text-content-primary mb-4">
                Tier Mix
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TierMixCard
                  title="Organizations by Plan"
                  rows={data.tier_breakdown.organizations}
                />
                <TierMixCard
                  title="Chapters by Tier"
                  rows={data.tier_breakdown.chapters}
                />
              </div>
            </section>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/PlatformDashboard.tsx
git commit -m "feat(platform): add Tier Mix section to Platform Dashboard"
```

---

## Task 11: Add the top chapters table

**Files:**
- Modify: `chapter-ops/frontend/src/pages/PlatformDashboard.tsx`

- [ ] **Step 1: Add the TopChaptersTable component**

In `chapter-ops/frontend/src/pages/PlatformDashboard.tsx`, add above the `PlatformDashboard` default export (after `TierMixCard`):

```tsx
function TopChaptersTable({
  rows,
}: {
  rows: { id: string; name: string; organization_name: string; dues_ytd: string }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-10 text-center text-content-muted text-sm">
        No chapters with recorded dues yet.
      </div>
    );
  }
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-content-muted text-xs uppercase tracking-wider">
            <th className="px-5 py-3 text-left font-semibold">Chapter</th>
            <th className="px-5 py-3 text-left font-semibold">Organization</th>
            <th className="px-5 py-3 text-right font-semibold">Dues YTD</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-3.5 font-medium text-content-primary">{r.name}</td>
              <td className="px-5 py-3.5 text-content-secondary">{r.organization_name}</td>
              <td className="px-5 py-3.5 text-right text-content-primary tabular-nums font-semibold">
                ${parseFloat(r.dues_ytd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Add the top chapters section to the JSX**

Inside the `data && (<>...</>)` block, after the tier mix section, add:

```tsx
            {/* Top chapters by dues */}
            <section>
              <h2 className="text-lg font-heading font-bold text-content-primary mb-4">
                Top Chapters by Dues YTD
              </h2>
              <TopChaptersTable rows={data.top_chapters_by_dues} />
            </section>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/PlatformDashboard.tsx
git commit -m "feat(platform): add Top Chapters by Dues YTD table"
```

---

## Task 12: End-to-end manual verification on local DB

**Files:** none (verification only)

- [ ] **Step 1: Make sure the demo seed has run with the is_demo flag set**

Run:
```bash
cd chapter-ops/backend
flask seed-demo-org
```
Expected output line: `Organization: 0 created, 1 existed` (DGLO already exists), and the seed completes without error.

- [ ] **Step 2: Confirm DGLO is_demo=True**

Run:
```bash
cd chapter-ops/backend && python -c "
from app import create_app
from app.models import Organization
app = create_app()
with app.app_context():
    o = Organization.query.filter_by(abbreviation='DGLO').first()
    print(f'DGLO is_demo: {o.is_demo}')
"
```
Expected output: `DGLO is_demo: True`

- [ ] **Step 3: Hit the endpoint as the founder**

Make sure your local `.env` has `FOUNDER_EMAIL=bholi1914@gmail.com` (or whatever your founder login email is). Then in one terminal:
```bash
cd chapter-ops/backend && flask run
```
And in another, log in via curl + cookies and hit the endpoint:
```bash
curl -c /tmp/cj -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bholi1914@gmail.com","password":"<your-local-password>"}'

curl -b /tmp/cj http://localhost:5000/api/platform/dashboard | python -m json.tool
```
Expected: a JSON response with the four blocks. The `summary.organizations.total` should be the count of REAL orgs (likely 0 or 1 locally, NOT including DGLO).

- [ ] **Step 4: Hit the endpoint as a non-founder**

Either log in as a non-founder user or just clear the cookie and hit it unauthenticated:
```bash
curl -i http://localhost:5000/api/platform/dashboard
```
Expected: 401 (unauthenticated) or 403 (authenticated but not founder).

- [ ] **Step 5: View the page in the browser**

In a third terminal:
```bash
cd chapter-ops/frontend && npm run dev
```
Open `http://localhost:5173` (or whatever port Vite uses), log in as the founder, navigate to `/platform`. Expected:
- Page header (existing)
- 4 summary tiles in a row (or 2x2 if you resize to mobile width)
- Tier Mix section with two cards side-by-side
- Top Chapters by Dues table (likely empty if no real payments locally)
- Pending Chapter Requests section at the bottom

- [ ] **Step 6: Resize to mobile (375px) and confirm layout**

In Chrome DevTools, switch to a mobile viewport (iPhone SE, ~375px). Confirm:
- Tiles drop to 2x2 grid
- Tier Mix cards stack vertically
- Top Chapters table is horizontally scrollable (swipe right to see Dues column)

- [ ] **Step 7: Run the full backend test suite one more time**

Run: `cd chapter-ops/backend && python -m pytest tests/ -q`
Expected: all tests PASS.

No commit for this task — verification only.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Implementing task |
|---|---|
| `is_demo` flag on Organization (model + migration) | Task 1 |
| Demo seed updated to set `is_demo=True` | Task 2 |
| `GET /api/platform/dashboard` endpoint scaffold + auth gate | Task 3 |
| Summary block (orgs/chapters/members/dues YTD with 30d deltas) | Task 4 |
| Tier breakdown for orgs and chapters (zero-filled) | Task 5 |
| Top 5 chapters by dues YTD | Task 6 |
| Frontend types + service | Task 8 |
| `formatDollars` extracted to shared utility | Task 7 |
| Summary tiles section in UI | Task 9 |
| Tier mix section in UI | Task 10 |
| Top chapters table in UI | Task 11 |
| Existing PendingChapterRequestsSection unchanged | Verified in Task 9 (kept in JSX as-is) |
| Mobile-friendly table overflow on top chapters | Task 11 (uses overflow-x-auto + min-w-[640px]) |
| Empty states (zero tiles render, "No chapters" message) | Tasks 9, 11 |
| End-to-end verification | Task 12 |

All spec requirements have a task. No gaps.

**2. Placeholder scan:** No "TBD", "TODO", "implement later", or "similar to Task N" patterns. All code blocks are complete and copy-pasteable.

**3. Type consistency:**
- `PlatformDashboardData` defined in Task 8 matches the JSON shape returned by Tasks 4-6.
- `TierCount` (`{ tier: string; count: number }`) used consistently in Task 8 type, Task 5 backend response, and Task 10 component prop.
- `TopChapterRow` (`{ id, name, organization_name, dues_ytd }`) matches Task 6 backend response shape and Task 11 component prop.
- `formatDollars` signature (Task 7) accepts `number | string`; called with `string` (Task 9 dues_ytd) and `number` (existing IHQDashboard usages) — both work.
- `_summary_block`, `_tier_breakdown_block`, `_top_chapters_block` helper names consistent across Tasks 4, 5, 6.

No issues found.
