# Regional Dashboard MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-region Dashboard tab inside the existing Region Detail view, plus a sidebar shortcut for regional officers, replacing the existing stub `RegionDashboard.tsx` page.

**Architecture:** New backend endpoint `GET /api/regions/<id>/dashboard` returns KPIs + chapter health rows + invoice snapshot + officer summary + agent-findings placeholder in one round-trip. Frontend gains a shared `<ChapterHealthTable>` component (extracted from `IHQDashboard.tsx`) and a new `<RegionDashboardTab>` rendered inside `RegionDetailView`. Permission helper `can_view_region_dashboard` is the single source of truth for visibility (5 regional officer roles + org admin + platform admin). Old `RegionDashboard.tsx` page and `/api/regions/my-dashboard` endpoint are removed.

**Tech Stack:** Flask (Python 3.11), SQLAlchemy 2.0, pytest, React 19, TypeScript, Vitest, Tailwind CSS, Zustand, react-router-dom.

**Spec:** `docs/superpowers/specs/2026-04-28-regional-dashboard-design.md`

---

## File Structure

**Created:**
- `chapter-ops/backend/app/utils/region_permissions.py` — `can_view_region_dashboard` + `REGIONAL_OFFICER_ROLES`
- `chapter-ops/backend/app/services/dashboard_aggregations.py` — KPI helpers shared by IHQ and Regional dashboards
- `chapter-ops/backend/tests/test_region_permissions.py`
- `chapter-ops/backend/tests/test_dashboard_aggregations.py`
- `chapter-ops/backend/tests/test_region_dashboard_endpoint.py`
- `chapter-ops/frontend/src/components/ChapterHealthTable.tsx` — extracted from IHQDashboard
- `chapter-ops/frontend/src/components/ChapterHealthTable.test.tsx`
- `chapter-ops/frontend/src/components/RegionDashboardTab.tsx`
- `chapter-ops/frontend/src/components/RegionDashboardTab.test.tsx`

**Modified:**
- `chapter-ops/backend/app/routes/ihq.py` — call extracted helpers; remove inlined math
- `chapter-ops/backend/app/routes/regions.py` — add `/<id>/dashboard` route, add `regions_with_dashboard_access` to list payload, remove `/my-dashboard` handler
- `chapter-ops/frontend/src/services/regionService.ts` — add `fetchRegionDashboard`
- `chapter-ops/frontend/src/types/index.ts` — add `RegionDashboardPayload` and related types; remove `RegionDashboardData`
- `chapter-ops/frontend/src/stores/regionStore.ts` — add `regionsWithDashboardAccess: string[]`
- `chapter-ops/frontend/src/pages/Regions.tsx` — add Dashboard/Manage tab bar in `RegionDetailView`
- `chapter-ops/frontend/src/pages/IHQDashboard.tsx` — replace inline chapter health table with shared component
- `chapter-ops/frontend/src/components/Layout.tsx` — gate Regional Dashboard entry on `regionsWithDashboardAccess.length > 0`, deep-link to `/regions/<id>?tab=dashboard`
- `chapter-ops/frontend/src/App.tsx` — remove `/region-dashboard` route
- `chapter-ops/frontend/src/pages/Regions.test.tsx` — extend with tab + sidebar tests

**Deleted:**
- `chapter-ops/frontend/src/pages/RegionDashboard.tsx`
- `chapter-ops/backend/tests/test_regions_my_dashboard.py` (if it exists — check during Task 5)

---

## Backend Phase

### Task 1: Permission helper and role constant

**Files:**
- Create: `chapter-ops/backend/app/utils/region_permissions.py`
- Test: `chapter-ops/backend/tests/test_region_permissions.py`

- [ ] **Step 1: Write the failing tests**

```python
# chapter-ops/backend/tests/test_region_permissions.py
import pytest

from app.extensions import db
from app.models import (
    Chapter, ChapterMembership, Organization,
    OrganizationMembership, Region, RegionMembership,
)
from app.utils.region_permissions import (
    REGIONAL_OFFICER_ROLES, can_view_region_dashboard,
)
from tests.conftest import make_user


@pytest.fixture()
def org_and_region(db_session):
    org = Organization(name="Test Org", abbreviation="TST")
    db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="Southern Region", active=True)
    db_session.add(region); db_session.flush()
    return org, region


def _make_region_member(db_session, region, user, role):
    rm = RegionMembership(
        user_id=user.id, region_id=region.id, role=role, active=True,
    )
    db_session.add(rm); db_session.flush()
    return rm


def test_each_officer_role_grants_access(app, db_session, org_and_region):
    _, region = org_and_region
    with app.test_request_context():
        for role in REGIONAL_OFFICER_ROLES:
            user = make_user(email=f"{role}@example.com")
            _make_region_member(db_session, region, user, role)
            assert can_view_region_dashboard(user, region) is True, role


def test_member_role_does_not_grant_access(app, db_session, org_and_region):
    _, region = org_and_region
    with app.test_request_context():
        user = make_user(email="member@example.com")
        _make_region_member(db_session, region, user, "member")
        assert can_view_region_dashboard(user, region) is False


def test_org_admin_grants_access(app, db_session, org_and_region):
    org, region = org_and_region
    with app.test_request_context():
        user = make_user(email="admin@example.com")
        db_session.add(OrganizationMembership(
            user_id=user.id, organization_id=org.id, role="admin", active=True,
        ))
        db_session.flush()
        assert can_view_region_dashboard(user, region) is True


def test_unaffiliated_user_denied(app, db_session, org_and_region):
    _, region = org_and_region
    with app.test_request_context():
        user = make_user(email="random@example.com")
        assert can_view_region_dashboard(user, region) is False
```

(Platform-admin coverage is added when the route uses the helper — `is_founder()` reads `current_user`, so a request context test is more natural in `test_region_dashboard_endpoint.py`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_region_permissions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.utils.region_permissions'`.

- [ ] **Step 3: Implement the helper**

```python
# chapter-ops/backend/app/utils/region_permissions.py
"""Region-dashboard permission helper.

Single source of truth for whether a user may see a region's dashboard.
Used by the dashboard endpoint, the regions list endpoint (to populate
`regions_with_dashboard_access`), and the frontend route guard.
"""

from app.extensions import db
from app.models import RegionMembership
from app.utils.decorators import _is_org_admin
from app.utils.platform_admin import is_founder


REGIONAL_OFFICER_ROLES = frozenset({
    "regional_director",
    "regional_1st_vice",
    "regional_2nd_vice",
    "regional_secretary",
    "regional_treasurer",
})


def can_view_region_dashboard(user, region) -> bool:
    """Return True if the user may view the region dashboard."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False

    if is_founder():
        return True

    if _is_org_admin(user, region.organization_id):
        return True

    membership = db.session.query(RegionMembership).filter_by(
        user_id=user.id, region_id=region.id, active=True,
    ).first()

    return membership is not None and membership.role in REGIONAL_OFFICER_ROLES
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_region_permissions.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/utils/region_permissions.py chapter-ops/backend/tests/test_region_permissions.py
git commit -m "feat(regions): add can_view_region_dashboard permission helper"
```

---

### Task 2: Extract aggregation helpers from IHQ to shared service

**Files:**
- Create: `chapter-ops/backend/app/services/dashboard_aggregations.py`
- Modify: `chapter-ops/backend/app/routes/ihq.py` (replace inlined math with helper calls)
- Test: `chapter-ops/backend/tests/test_dashboard_aggregations.py`

- [ ] **Step 1: Write the failing tests**

```python
# chapter-ops/backend/tests/test_dashboard_aggregations.py
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db
from app.models import Chapter, ChapterMembership, Organization, Payment, Region
from app.services.dashboard_aggregations import (
    compute_chapter_kpis, compute_region_kpis,
)
from tests.conftest import make_user


def _seed_chapter(db_session, org, region, name, financial_count, non_count, dues_total):
    chapter = Chapter(
        organization_id=org.id, region_id=region.id, name=name,
        chapter_type="undergraduate", active=True,
    )
    db_session.add(chapter); db_session.flush()
    for i in range(financial_count):
        u = make_user(email=f"{name}-fin-{i}@x.com")
        db_session.add(ChapterMembership(
            user_id=u.id, chapter_id=chapter.id, role="member",
            active=True, financial_status="financial",
        ))
    for i in range(non_count):
        u = make_user(email=f"{name}-non-{i}@x.com")
        db_session.add(ChapterMembership(
            user_id=u.id, chapter_id=chapter.id, role="member",
            active=True, financial_status="not_financial",
        ))
    if dues_total > 0:
        db.session.add(Payment(
            chapter_id=chapter.id, amount=Decimal(str(dues_total)),
            currency="usd", status="succeeded",
            created_at=datetime(datetime.now(timezone.utc).year, 6, 1, tzinfo=timezone.utc),
        ))
    db_session.flush()
    return chapter


def test_compute_chapter_kpis(db_session):
    org = Organization(name="O", abbreviation="O"); db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="R", active=True)
    db_session.add(region); db_session.flush()

    chapter = _seed_chapter(db_session, org, region, "Alpha", financial_count=3, non_count=1, dues_total=500)
    result = compute_chapter_kpis(chapter.id)

    assert result["member_count"] == 4
    assert result["financial_rate"] == 75.0
    assert result["dues_ytd"] == 500.0


def test_compute_chapter_kpis_empty_chapter(db_session):
    org = Organization(name="O", abbreviation="O"); db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="R", active=True)
    db_session.add(region); db_session.flush()
    empty = _seed_chapter(db_session, org, region, "Empty", 0, 0, 0)

    result = compute_chapter_kpis(empty.id)
    assert result == {"member_count": 0, "financial_rate": 0.0, "dues_ytd": 0.0}


def test_compute_region_kpis_aggregates_active_chapters(db_session):
    org = Organization(name="O", abbreviation="O"); db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="R", active=True)
    db_session.add(region); db_session.flush()

    _seed_chapter(db_session, org, region, "A", 4, 0, 200)
    _seed_chapter(db_session, org, region, "B", 1, 1, 100)

    result = compute_region_kpis(region.id)
    assert result["chapter_count"] == 2
    assert result["chapter_count_active"] == 2
    assert result["chapter_count_suspended"] == 0
    assert result["member_count"] == 6
    assert result["financial_rate"] == round(5 / 6 * 100, 1)
    assert result["dues_ytd"] == 300.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_dashboard_aggregations.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.dashboard_aggregations'`.

- [ ] **Step 3: Create the helper module**

```python
# chapter-ops/backend/app/services/dashboard_aggregations.py
"""KPI aggregation helpers shared by IHQ and Regional dashboards.

Centralizes the math that was previously inlined in routes/ihq.py so the
two dashboards always produce identical numbers for the same input.
"""

from datetime import datetime, timezone

from sqlalchemy import func

from app.extensions import db
from app.models import Chapter, ChapterMembership, Payment, Region


def _year_start():
    return datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)


def compute_chapter_kpis(chapter_id: str) -> dict:
    """Return {member_count, financial_rate, dues_ytd} for one chapter."""
    total = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id == chapter_id,
        ChapterMembership.active == True,
    ).scalar() or 0

    financial = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id == chapter_id,
        ChapterMembership.active == True,
        ChapterMembership.financial_status == "financial",
    ).scalar() or 0

    dues = float(
        db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.chapter_id == chapter_id,
            Payment.created_at >= _year_start(),
        ).scalar() or 0
    )

    return {
        "member_count": total,
        "financial_rate": round((financial / total * 100) if total else 0, 1),
        "dues_ytd": dues,
    }


def compute_region_kpis(region_id: str) -> dict:
    """Return aggregate KPIs across all active chapters in a region."""
    chapters = Chapter.query.filter_by(region_id=region_id, active=True).all()
    chapter_ids = [c.id for c in chapters]

    chapter_count = len(chapters)
    chapter_count_suspended = sum(1 for c in chapters if c.suspended)
    chapter_count_active = chapter_count - chapter_count_suspended

    if not chapter_ids:
        return {
            "chapter_count": 0,
            "chapter_count_active": 0,
            "chapter_count_suspended": 0,
            "member_count": 0,
            "financial_rate": 0.0,
            "dues_ytd": 0.0,
        }

    total = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id.in_(chapter_ids),
        ChapterMembership.active == True,
    ).scalar() or 0

    financial = db.session.query(func.count(ChapterMembership.id)).filter(
        ChapterMembership.chapter_id.in_(chapter_ids),
        ChapterMembership.active == True,
        ChapterMembership.financial_status == "financial",
    ).scalar() or 0

    dues = float(
        db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.chapter_id.in_(chapter_ids),
            Payment.created_at >= _year_start(),
        ).scalar() or 0
    )

    return {
        "chapter_count": chapter_count,
        "chapter_count_active": chapter_count_active,
        "chapter_count_suspended": chapter_count_suspended,
        "member_count": total,
        "financial_rate": round((financial / total * 100) if total else 0, 1),
        "dues_ytd": dues,
    }
```

- [ ] **Step 4: Run new tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_dashboard_aggregations.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `ihq.py` to use the helpers**

In `chapter-ops/backend/app/routes/ihq.py` replace the inlined math (lines 80-101 and 120-146 and 152-191 referenced in spec discovery) with calls to the helpers. The end result for the `ihq_dashboard` route's chapter loop becomes:

```python
# Replaces lines 152-168 of routes/ihq.py
from app.services.dashboard_aggregations import compute_chapter_kpis

# Inside the chapter health loop:
for chapter in sorted(active_chapters, key=lambda c: c.name):
    kpis = compute_chapter_kpis(chapter.id)
    region = region_by_id.get(chapter.region_id) if chapter.region_id else None
    chapter_stats.append({
        "id": chapter.id,
        "name": chapter.name,
        "designation": chapter.designation,
        "region_id": chapter.region_id,
        "region_name": region.name if region else None,
        "chapter_type": chapter.chapter_type,
        "city": chapter.city,
        "state": chapter.state,
        "member_count": kpis["member_count"],
        "financial_rate": kpis["financial_rate"],
        "dues_ytd": kpis["dues_ytd"],
        "subscription_tier": chapter.subscription_tier,
        "suspended": chapter.suspended,
        "suspension_reason": chapter.suspension_reason,
        "deletion_scheduled_at": (
            chapter.deletion_scheduled_at.isoformat()
            if chapter.deletion_scheduled_at else None
        ),
    })
```

For the org-level summary (lines 80-101) and the per-region rollup (lines 120-146), use `compute_region_kpis` and a thin org-level inlining (org-level is just one large region — keep that inlined math or extract `compute_org_kpis` if it stays consistent). The simplest path that keeps IHQ behavior identical is to leave the org-summary inlined and replace ONLY the per-chapter and per-region loops with helper calls.

- [ ] **Step 6: Run full IHQ test suite to verify zero regressions**

Run: `pytest chapter-ops/backend/tests/ -k "ihq" -v`
Expected: All existing IHQ tests pass with no modifications. If a test fails, the refactor is not behavior-equivalent — fix the helpers/refactor before proceeding.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/app/services/dashboard_aggregations.py chapter-ops/backend/tests/test_dashboard_aggregations.py chapter-ops/backend/app/routes/ihq.py
git commit -m "refactor(ihq): extract chapter and region KPI helpers to shared service"
```

---

### Task 3: New region dashboard endpoint

**Files:**
- Modify: `chapter-ops/backend/app/routes/regions.py` (add new route)
- Test: `chapter-ops/backend/tests/test_region_dashboard_endpoint.py`

- [ ] **Step 1: Write the failing tests**

```python
# chapter-ops/backend/tests/test_region_dashboard_endpoint.py
import pytest

from app.extensions import db
from app.models import (
    Chapter, ChapterMembership, Invoice, Organization,
    OrganizationMembership, Region, RegionMembership,
)
from app.utils.region_permissions import REGIONAL_OFFICER_ROLES
from tests.conftest import make_user


@pytest.fixture()
def org_region_chapter(db_session):
    org = Organization(name="Org", abbreviation="ORG"); db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="South", active=True)
    db_session.add(region); db_session.flush()
    chapter = Chapter(
        organization_id=org.id, region_id=region.id, name="Alpha",
        chapter_type="undergraduate", active=True,
    )
    db_session.add(chapter); db_session.flush()
    return org, region, chapter


def _login(client, user):
    with client.session_transaction() as sess:
        sess["_user_id"] = user.id


def test_endpoint_404_when_region_missing(client, db_session):
    user = make_user(email="x@x.com")
    _login(client, user)
    resp = client.get("/api/regions/nonexistent-id/dashboard")
    assert resp.status_code == 404


def test_endpoint_403_for_unauthorized_user(client, db_session, org_region_chapter):
    _, region, _ = org_region_chapter
    user = make_user(email="random@example.com")
    _login(client, user)
    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 403


def test_endpoint_200_for_each_officer_role(client, db_session, org_region_chapter):
    _, region, _ = org_region_chapter
    for role in REGIONAL_OFFICER_ROLES:
        user = make_user(email=f"{role}@x.com")
        db_session.add(RegionMembership(
            user_id=user.id, region_id=region.id, role=role, active=True,
        )); db_session.flush()
        _login(client, user)
        resp = client.get(f"/api/regions/{region.id}/dashboard")
        assert resp.status_code == 200, role
        data = resp.get_json()
        assert "kpis" in data
        assert "chapters" in data
        assert "invoice_snapshot" in data
        assert "officer_summary" in data
        assert data["agent_findings"] == []


def test_endpoint_403_for_region_member_role(client, db_session, org_region_chapter):
    _, region, _ = org_region_chapter
    user = make_user(email="rm@x.com")
    db_session.add(RegionMembership(
        user_id=user.id, region_id=region.id, role="member", active=True,
    )); db_session.flush()
    _login(client, user)
    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 403


def test_endpoint_200_for_org_admin(client, db_session, org_region_chapter):
    org, region, _ = org_region_chapter
    user = make_user(email="oa@x.com")
    db_session.add(OrganizationMembership(
        user_id=user.id, organization_id=org.id, role="admin", active=True,
    )); db_session.flush()
    _login(client, user)
    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 200


def test_empty_region_returns_zero_kpis(client, db_session):
    org = Organization(name="O", abbreviation="O"); db_session.add(org); db_session.flush()
    region = Region(organization_id=org.id, name="Empty", active=True)
    db_session.add(region); db_session.flush()
    user = make_user(email="ea@x.com")
    db_session.add(OrganizationMembership(
        user_id=user.id, organization_id=org.id, role="admin", active=True,
    )); db_session.flush()
    _login(client, user)

    resp = client.get(f"/api/regions/{region.id}/dashboard")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["kpis"]["chapter_count"] == 0
    assert data["kpis"]["member_count"] == 0
    assert data["kpis"]["financial_rate"] == 0.0
    assert data["chapters"] == []
    assert data["officer_summary"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_region_dashboard_endpoint.py -v`
Expected: FAIL — endpoint does not exist (404 from Flask routing on every request).

- [ ] **Step 3: Implement the endpoint**

Add to `chapter-ops/backend/app/routes/regions.py` after the existing `/<region_id>` GET route (around line 152):

```python
import logging
from decimal import Decimal

from app.models import Invoice  # add to existing imports at top of file
from app.services.dashboard_aggregations import (
    compute_chapter_kpis, compute_region_kpis,
)
from app.utils.region_permissions import can_view_region_dashboard

logger = logging.getLogger(__name__)

REGIONAL_INVOICE_STATUSES = ("draft", "sent", "paid", "overdue", "cancelled")


@regions_bp.route("/<region_id>/dashboard", methods=["GET"])
@login_required
def region_dashboard(region_id: str):
    """Per-region dashboard payload for regional officers and admins."""
    region = db.session.get(Region, region_id)
    if region is None or not region.active:
        return jsonify({"error": "Region not found."}), 404

    if not can_view_region_dashboard(current_user, region):
        return jsonify({"error": "You do not have access to this region."}), 403

    region_kpis = compute_region_kpis(region.id)

    chapters = Chapter.query.filter_by(
        region_id=region.id, active=True,
    ).order_by(Chapter.name).all()

    chapter_rows = []
    for chapter in chapters:
        try:
            kpis = compute_chapter_kpis(chapter.id)
            chapter_rows.append({
                "id": chapter.id,
                "name": chapter.name,
                "designation": chapter.designation,
                "chapter_type": chapter.chapter_type,
                "city": chapter.city,
                "state": chapter.state,
                "member_count": kpis["member_count"],
                "financial_rate": kpis["financial_rate"],
                "dues_ytd": f"{kpis['dues_ytd']:.2f}",
                "subscription_tier": chapter.subscription_tier,
                "suspended": chapter.suspended,
                "deletion_scheduled_at": (
                    chapter.deletion_scheduled_at.isoformat()
                    if chapter.deletion_scheduled_at else None
                ),
            })
        except Exception:
            logger.exception("Failed to compute KPIs for chapter %s", chapter.id)
            chapter_rows.append({
                "id": chapter.id,
                "name": chapter.name,
                "designation": chapter.designation,
                "chapter_type": chapter.chapter_type,
                "city": chapter.city,
                "state": chapter.state,
                "member_count": None,
                "financial_rate": None,
                "dues_ytd": None,
                "subscription_tier": chapter.subscription_tier,
                "suspended": chapter.suspended,
                "deletion_scheduled_at": (
                    chapter.deletion_scheduled_at.isoformat()
                    if chapter.deletion_scheduled_at else None
                ),
            })

    # Invoice snapshot — counts by status, total outstanding
    invoice_counts = {s: 0 for s in REGIONAL_INVOICE_STATUSES}
    outstanding_total = Decimal("0")
    invoices = Invoice.query.filter_by(region_id=region.id).all()
    for inv in invoices:
        if inv.status in invoice_counts:
            invoice_counts[inv.status] += 1
        if inv.status in ("sent", "overdue"):
            outstanding_total += Decimal(str(inv.amount or 0))

    # Officer summary — top 5 active officers, formal roles only
    officer_memberships = (
        db.session.query(RegionMembership)
        .filter(
            RegionMembership.region_id == region.id,
            RegionMembership.active == True,
            RegionMembership.role.in_([
                "regional_director", "regional_1st_vice", "regional_2nd_vice",
                "regional_secretary", "regional_treasurer",
            ]),
        )
        .limit(5)
        .all()
    )
    officer_summary = []
    for m in officer_memberships:
        user = db.session.get(User, m.user_id)
        if user is None:
            continue
        officer_summary.append({
            "user_id": user.id,
            "full_name": user.full_name,
            "role": m.role,
        })

    return jsonify({
        "region": {
            "id": region.id,
            "name": region.name,
            "abbreviation": region.abbreviation,
            "description": region.description,
        },
        "kpis": {
            **{k: v for k, v in region_kpis.items() if k != "dues_ytd"},
            "dues_ytd": f"{region_kpis['dues_ytd']:.2f}",
            "invoices_outstanding_total": f"{outstanding_total:.2f}",
        },
        "chapters": chapter_rows,
        "invoice_snapshot": {
            **invoice_counts,
            "outstanding_total": f"{outstanding_total:.2f}",
        },
        "officer_summary": officer_summary,
        "agent_findings": [],
    }), 200
```

The Invoice model uses `region_id` to scope regional invoices (verified at `app/models/invoice.py:51`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_region_dashboard_endpoint.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/regions.py chapter-ops/backend/tests/test_region_dashboard_endpoint.py
git commit -m "feat(regions): add per-region dashboard endpoint"
```

---

### Task 4: Add `regions_with_dashboard_access` to GET /api/regions

**Files:**
- Modify: `chapter-ops/backend/app/routes/regions.py`
- Modify: `chapter-ops/backend/tests/test_regions_list.py` (or wherever the existing list tests live — find with `grep -l "list_regions\|GET /api/regions" tests/`)

- [ ] **Step 1: Write the failing test**

Add to the existing regions-list test file (or create one if needed):

```python
def test_list_regions_returns_dashboard_access_array(client, db_session):
    org = Organization(name="O", abbreviation="O"); db_session.add(org); db_session.flush()
    r1 = Region(organization_id=org.id, name="South", active=True)
    r2 = Region(organization_id=org.id, name="North", active=True)
    db_session.add_all([r1, r2]); db_session.flush()

    user = make_user(email="director@x.com")
    db_session.add(RegionMembership(
        user_id=user.id, region_id=r1.id, role="regional_director", active=True,
    ))
    # Make user an org member via a chapter so list_regions returns regions
    chapter = Chapter(
        organization_id=org.id, region_id=r1.id, name="A",
        chapter_type="undergraduate", active=True,
    ); db_session.add(chapter); db_session.flush()
    db_session.add(ChapterMembership(
        user_id=user.id, chapter_id=chapter.id, role="member", active=True,
    )); db_session.flush()

    with client.session_transaction() as sess:
        sess["_user_id"] = user.id

    resp = client.get(f"/api/regions?organization_id={org.id}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["regions_with_dashboard_access"] == [r1.id]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest chapter-ops/backend/tests/ -k "test_list_regions_returns_dashboard_access_array" -v`
Expected: FAIL — `KeyError: 'regions_with_dashboard_access'`.

- [ ] **Step 3: Update `list_regions` to include the field**

In `chapter-ops/backend/app/routes/regions.py`, modify the response of `list_regions` (the route at line 29). Add this just before the existing `return jsonify(...)`:

```python
from app.utils.region_permissions import can_view_region_dashboard

# ... inside list_regions, after `regions = Region.query.filter_by(...).all()`:
regions_with_dashboard_access = [
    r.id for r in regions if can_view_region_dashboard(current_user, r)
]
```

And update the return:

```python
return jsonify({
    "regions": result,
    "is_org_admin": is_admin,
    "is_regional_director": is_regional_director,
    "regions_with_dashboard_access": regions_with_dashboard_access,
}), 200
```

For the early-return paths at lines 50 and 65, add the empty array:

```python
return jsonify({
    "regions": [], "is_org_admin": False,
    "regions_with_dashboard_access": [],
}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest chapter-ops/backend/tests/ -k "test_list_regions" -v`
Expected: PASS, including any pre-existing `list_regions` tests (the new field is additive).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/regions.py chapter-ops/backend/tests/
git commit -m "feat(regions): expose regions_with_dashboard_access on GET /api/regions"
```

---

### Task 5: Remove old `/my-dashboard` endpoint

**Files:**
- Modify: `chapter-ops/backend/app/routes/regions.py` (delete handler)
- Delete: any backend test file targeting `/my-dashboard`

- [ ] **Step 1: Find any tests targeting `/my-dashboard`**

Run: `grep -rn "my-dashboard\|my_region_dashboard" chapter-ops/backend/tests/`

Note the test file paths; they will be deleted in Step 3.

- [ ] **Step 2: Delete the route handler**

In `chapter-ops/backend/app/routes/regions.py`, remove the entire `my_region_dashboard()` function and its `@regions_bp.route("/my-dashboard", ...)` decorator (lines 429-491 in the current file).

- [ ] **Step 3: Delete the test file(s) found in Step 1**

```bash
git rm chapter-ops/backend/tests/test_regions_my_dashboard.py  # adjust path per Step 1 output
```

- [ ] **Step 4: Run the full backend test suite to verify nothing else referenced /my-dashboard**

Run: `pytest chapter-ops/backend/tests/ -v`
Expected: PASS. If any test fails referencing `my_region_dashboard` or `/my-dashboard`, that test was depending on the deleted endpoint and should be removed (the frontend page that was its only consumer is being deleted in Task 12).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/regions.py
git commit -m "refactor(regions): remove unused /my-dashboard endpoint"
```

---

## Frontend Phase

### Task 6: Extract `<ChapterHealthTable>` component

**Files:**
- Create: `chapter-ops/frontend/src/components/ChapterHealthTable.tsx`
- Create: `chapter-ops/frontend/src/components/ChapterHealthTable.test.tsx`
- Modify: `chapter-ops/frontend/src/pages/IHQDashboard.tsx` (use the shared component)

- [ ] **Step 1: Write the failing test**

```tsx
// chapter-ops/frontend/src/components/ChapterHealthTable.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ChapterHealthTable from "./ChapterHealthTable";

const SAMPLE_ROWS = [
  {
    id: "c1", name: "Sigma Delta Sigma", designation: "ΣΔΣ",
    region_id: "r1", region_name: "Southern",
    chapter_type: "graduate" as const,
    city: "Huntsville", state: "AL",
    member_count: 24, financial_rate: 75.0, dues_ytd: "1250.00",
    subscription_tier: "starter", suspended: false,
    deletion_scheduled_at: null,
  },
  {
    id: "c2", name: "Alpha Beta", designation: "ΑΒ",
    region_id: "r1", region_name: "Southern",
    chapter_type: "undergraduate" as const,
    city: "Atlanta", state: "GA",
    member_count: 12, financial_rate: 100.0, dues_ytd: "500.00",
    subscription_tier: "starter", suspended: false,
    deletion_scheduled_at: null,
  },
];

describe("ChapterHealthTable", () => {
  it("renders one row per chapter", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} />);
    expect(screen.getByText("Sigma Delta Sigma")).toBeInTheDocument();
    expect(screen.getByText("Alpha Beta")).toBeInTheDocument();
  });

  it("filters by search term", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} />);
    const search = screen.getByPlaceholderText(/search chapters/i);
    fireEvent.change(search, { target: { value: "alpha" } });
    expect(screen.queryByText("Sigma Delta Sigma")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha Beta")).toBeInTheDocument();
  });

  it("hides region column when showRegionColumn is false", () => {
    render(<ChapterHealthTable chapters={SAMPLE_ROWS} showRegionColumn={false} />);
    expect(screen.queryByRole("columnheader", { name: /region/i })).not.toBeInTheDocument();
  });

  it("renders empty state when no chapters", () => {
    render(<ChapterHealthTable chapters={[]} />);
    expect(screen.getByText(/no chapters/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd chapter-ops/frontend && npm test -- ChapterHealthTable`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Create the component**

```tsx
// chapter-ops/frontend/src/components/ChapterHealthTable.tsx
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export interface ChapterHealthRow {
  id: string;
  name: string;
  designation: string | null;
  region_id?: string | null;
  region_name?: string | null;
  chapter_type: "undergraduate" | "graduate";
  city: string | null;
  state: string | null;
  member_count: number | null;
  financial_rate: number | null;
  dues_ytd: string | null;
  subscription_tier: string;
  suspended: boolean;
  deletion_scheduled_at: string | null;
}

interface Props {
  chapters: ChapterHealthRow[];
  showRegionColumn?: boolean;
  onChapterClick?: (chapterId: string) => void;
}

type SortKey = "name" | "member_count" | "financial_rate" | "dues_ytd";

export default function ChapterHealthTable({
  chapters,
  showRegionColumn = true,
  onChapterClick,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = chapters;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.designation || "").toLowerCase().includes(q) ||
          (c.city || "").toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [chapters, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const fmtRate = (r: number | null) => (r === null ? "—" : `${r.toFixed(1)}%`);
  const fmtDues = (d: string | null) =>
    d === null ? "—" : `$${parseFloat(d).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
        <input
          type="text"
          placeholder="Search chapters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-content-primary bg-surface-input focus:outline-none focus:border-brand-primary-main w-full"
        />
      </div>

      <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-content-muted text-sm">
            No chapters match your filters.
          </p>
        ) : (
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-content-muted text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left font-semibold cursor-pointer" onClick={() => toggleSort("name")}>
                  Chapter
                </th>
                {showRegionColumn && <th className="px-5 py-3 text-left font-semibold">Region</th>}
                <th className="px-5 py-3 text-right font-semibold cursor-pointer" onClick={() => toggleSort("member_count")}>
                  Members
                </th>
                <th className="px-5 py-3 text-right font-semibold cursor-pointer" onClick={() => toggleSort("financial_rate")}>
                  Financial Rate
                </th>
                <th className="px-5 py-3 text-right font-semibold cursor-pointer" onClick={() => toggleSort("dues_ytd")}>
                  Dues YTD
                </th>
                <th className="px-5 py-3 text-left font-semibold">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`transition-colors group ${c.suspended ? "bg-orange-900/5" : ""} ${onChapterClick ? "cursor-pointer hover:bg-white/[0.02]" : ""}`}
                  onClick={onChapterClick ? () => onChapterClick(c.id) : undefined}
                >
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-content-primary">{c.name}</div>
                    {c.designation && <div className="text-xs text-content-muted">{c.designation}</div>}
                  </td>
                  {showRegionColumn && (
                    <td className="px-5 py-3.5 text-content-secondary">{c.region_name ?? "—"}</td>
                  )}
                  <td className="px-5 py-3.5 text-right text-content-primary">{c.member_count ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right text-content-primary">{fmtRate(c.financial_rate)}</td>
                  <td className="px-5 py-3.5 text-right text-content-primary">{fmtDues(c.dues_ytd)}</td>
                  <td className="px-5 py-3.5 text-content-secondary capitalize">{c.subscription_tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run new tests to verify they pass**

Run: `cd chapter-ops/frontend && npm test -- ChapterHealthTable`
Expected: PASS (4 tests).

- [ ] **Step 5: Update `IHQDashboard.tsx` to use the shared component**

In `chapter-ops/frontend/src/pages/IHQDashboard.tsx`, replace the inline chapter health table (the entire `<div className="bg-surface-card-solid rounded-xl border ...">` block at lines ~385-end of the chapter health section) with:

```tsx
import ChapterHealthTable from "@/components/ChapterHealthTable";

// In the JSX, replace the inline table with:
<ChapterHealthTable
  chapters={filteredChapters}
  showRegionColumn={true}
/>
```

Remove now-unused state for `search`, `sortKey`, `sortDir`, `regionFilter` if they were ONLY driving the table (keep `regionFilter` since the IHQ filter chip is outside the table). The table component owns its own search/sort.

- [ ] **Step 6: Run the IHQ test suite to verify zero regressions**

Run: `cd chapter-ops/frontend && npm test -- IHQDashboard`
Expected: PASS with no test modifications. If any IHQ test fails, the extraction is not behavior-equivalent — fix before proceeding.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/frontend/src/components/ChapterHealthTable.tsx chapter-ops/frontend/src/components/ChapterHealthTable.test.tsx chapter-ops/frontend/src/pages/IHQDashboard.tsx
git commit -m "refactor(ihq): extract ChapterHealthTable into shared component"
```

---

### Task 7: Add types and service function

**Files:**
- Modify: `chapter-ops/frontend/src/types/index.ts`
- Modify: `chapter-ops/frontend/src/services/regionService.ts`

- [ ] **Step 1: Add types to `types/index.ts`**

```ts
// chapter-ops/frontend/src/types/index.ts (add to existing exports)

export interface RegionDashboardKpis {
  chapter_count: number;
  chapter_count_active: number;
  chapter_count_suspended: number;
  member_count: number;
  financial_rate: number;
  dues_ytd: string;
  invoices_outstanding_total: string;
}

export interface RegionDashboardInvoiceSnapshot {
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
  cancelled: number;
  outstanding_total: string;
}

export interface RegionDashboardOfficer {
  user_id: string;
  full_name: string;
  role:
    | "regional_director"
    | "regional_1st_vice"
    | "regional_2nd_vice"
    | "regional_secretary"
    | "regional_treasurer";
}

export interface RegionDashboardAgentFinding {
  severity: "info" | "warning" | "critical";
  check: string;
  summary: string;
  detail?: string;
  chapter_id?: string;
}

export interface RegionDashboardPayload {
  region: { id: string; name: string; abbreviation: string | null; description: string | null };
  kpis: RegionDashboardKpis;
  chapters: import("@/components/ChapterHealthTable").ChapterHealthRow[];
  invoice_snapshot: RegionDashboardInvoiceSnapshot;
  officer_summary: RegionDashboardOfficer[];
  agent_findings: RegionDashboardAgentFinding[];
}
```

(Also remove the `RegionDashboardData` interface from `types/index.ts` if it exists — it was used only by the old `RegionDashboard.tsx`.)

- [ ] **Step 2: Add the service function**

```ts
// chapter-ops/frontend/src/services/regionService.ts (add to existing exports)
import api from "@/lib/api";
import type { RegionDashboardPayload } from "@/types";

export async function fetchRegionDashboard(
  regionId: string,
): Promise<RegionDashboardPayload> {
  const res = await api.get<RegionDashboardPayload>(
    `/regions/${regionId}/dashboard`,
  );
  return res.data;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/types/index.ts chapter-ops/frontend/src/services/regionService.ts
git commit -m "feat(regions): add RegionDashboardPayload types and fetchRegionDashboard service"
```

---

### Task 8: Update `regionStore` with `regionsWithDashboardAccess`

**Files:**
- Modify: `chapter-ops/frontend/src/stores/regionStore.ts`
- Modify: `chapter-ops/frontend/src/services/regionService.ts` (return type for `fetchRegions`)

- [ ] **Step 1: Update `fetchRegions` return type**

In `chapter-ops/frontend/src/services/regionService.ts`, find `fetchRegions` and update its declared return shape to include the new field. Example (adjust to existing code style):

```ts
export interface FetchRegionsResponse {
  regions: RegionWithStats[];
  is_org_admin: boolean;
  is_regional_director: boolean;
  regions_with_dashboard_access: string[];
}

export async function fetchRegions(): Promise<FetchRegionsResponse> {
  const res = await api.get<FetchRegionsResponse>("/regions");
  return res.data;
}
```

- [ ] **Step 2: Extend the regionStore interface**

```ts
// chapter-ops/frontend/src/stores/regionStore.ts
interface RegionState {
  regions: RegionWithStats[];
  selectedRegion: RegionDetail | null;
  isOrgAdmin: boolean;
  isRegionalDirector: boolean;
  regionsWithDashboardAccess: string[];   // <-- new
  loading: boolean;
  error: string | null;

  loadRegions: () => Promise<void>;
  loadRegionDetail: (regionId: string) => Promise<void>;
  clearSelectedRegion: () => void;
  clearError: () => void;
  reset: () => void;
}

const INITIAL_STATE = {
  regions: [],
  selectedRegion: null,
  isOrgAdmin: false,
  isRegionalDirector: false,
  regionsWithDashboardAccess: [],          // <-- new
  loading: false,
  error: null,
};

// In loadRegions, after `const data = await fetchRegions();`:
set({
  regions: data.regions,
  isOrgAdmin: data.is_org_admin,
  isRegionalDirector: data.is_regional_director ?? false,
  regionsWithDashboardAccess: data.regions_with_dashboard_access ?? [],
  loading: false,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run regionStore tests**

Run: `cd chapter-ops/frontend && npm test -- regionStore`
Expected: PASS. If any pre-existing test breaks because the new field was missing from a mock response, update the mock (additive change only — keep existing assertions).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/stores/regionStore.ts chapter-ops/frontend/src/services/regionService.ts
git commit -m "feat(regions): add regionsWithDashboardAccess to regionStore"
```

---

### Task 9: `<RegionDashboardTab>` component

**Files:**
- Create: `chapter-ops/frontend/src/components/RegionDashboardTab.tsx`
- Create: `chapter-ops/frontend/src/components/RegionDashboardTab.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// chapter-ops/frontend/src/components/RegionDashboardTab.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import RegionDashboardTab from "./RegionDashboardTab";
import type { RegionDashboardPayload } from "@/types";

const PAYLOAD: RegionDashboardPayload = {
  region: { id: "r1", name: "Southern", abbreviation: "S", description: null },
  kpis: {
    chapter_count: 12, chapter_count_active: 11, chapter_count_suspended: 1,
    member_count: 248, financial_rate: 73.4,
    dues_ytd: "18452.00", invoices_outstanding_total: "3200.00",
  },
  chapters: [],
  invoice_snapshot: {
    draft: 0, sent: 3, paid: 8, overdue: 1, cancelled: 0,
    outstanding_total: "3200.00",
  },
  officer_summary: [
    { user_id: "u1", full_name: "Brandon Holiday", role: "regional_director" },
  ],
  agent_findings: [],
};

describe("RegionDashboardTab", () => {
  it("renders KPI cards", () => {
    render(<RegionDashboardTab payload={PAYLOAD} />);
    expect(screen.getByText("12")).toBeInTheDocument();   // chapter count
    expect(screen.getByText("248")).toBeInTheDocument();  // member count
    expect(screen.getByText("73.4%")).toBeInTheDocument();
    expect(screen.getByText(/\$18,452\.00/)).toBeInTheDocument();
  });

  it("renders officer summary names", () => {
    render(<RegionDashboardTab payload={PAYLOAD} />);
    expect(screen.getByText("Brandon Holiday")).toBeInTheDocument();
  });

  it("renders agent-findings placeholder when array is empty", () => {
    render(<RegionDashboardTab payload={PAYLOAD} />);
    expect(screen.getByText(/no findings yet/i)).toBeInTheDocument();
  });

  it("handles empty chapter list gracefully", () => {
    render(<RegionDashboardTab payload={{ ...PAYLOAD, chapters: [] }} />);
    expect(screen.getByText(/no chapters match/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chapter-ops/frontend && npm test -- RegionDashboardTab`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// chapter-ops/frontend/src/components/RegionDashboardTab.tsx
import { Building2, Users, TrendingUp, DollarSign, FileText, AlertCircle } from "lucide-react";
import ChapterHealthTable from "@/components/ChapterHealthTable";
import type { RegionDashboardPayload, RegionDashboardOfficer } from "@/types";

const ROLE_LABELS: Record<RegionDashboardOfficer["role"], string> = {
  regional_director: "Regional Director",
  regional_1st_vice: "Regional 1st Vice",
  regional_2nd_vice: "Regional 2nd Vice",
  regional_secretary: "Regional Secretary",
  regional_treasurer: "Regional Treasurer",
};

function formatCurrency(s: string): string {
  return `$${parseFloat(s).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

interface Props {
  payload: RegionDashboardPayload;
}

export default function RegionDashboardTab({ payload }: Props) {
  const { kpis, chapters, invoice_snapshot, officer_summary, agent_findings } = payload;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={<Building2 className="w-5 h-5" />}
          label="Chapters"
          value={String(kpis.chapter_count)}
          sublabel={`${kpis.chapter_count_active} active · ${kpis.chapter_count_suspended} suspended`}
        />
        <KpiCard
          icon={<Users className="w-5 h-5" />}
          label="Members"
          value={String(kpis.member_count)}
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Financial Rate"
          value={`${kpis.financial_rate.toFixed(1)}%`}
        />
        <KpiCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Dues YTD"
          value={formatCurrency(kpis.dues_ytd)}
        />
        <KpiCard
          icon={<FileText className="w-5 h-5" />}
          label="Invoices Outstanding"
          value={formatCurrency(kpis.invoices_outstanding_total)}
        />
      </div>

      {/* Chapter Health table */}
      <section>
        <h3 className="text-lg font-heading font-bold text-content-primary mb-3">Chapter Health</h3>
        <ChapterHealthTable chapters={chapters} showRegionColumn={false} />
      </section>

      {/* Invoice snapshot + Officer roster + Agent findings (3-column grid on desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Regional Invoices">
          <div className="space-y-1.5 text-sm">
            <SnapshotRow label="Draft" value={invoice_snapshot.draft} />
            <SnapshotRow label="Sent" value={invoice_snapshot.sent} />
            <SnapshotRow label="Paid" value={invoice_snapshot.paid} />
            <SnapshotRow label="Overdue" value={invoice_snapshot.overdue} />
            <SnapshotRow label="Cancelled" value={invoice_snapshot.cancelled} />
            <div className="pt-2 mt-2 border-t border-[var(--color-border)] flex justify-between font-semibold">
              <span className="text-content-secondary">Outstanding</span>
              <span className="text-content-primary">{formatCurrency(invoice_snapshot.outstanding_total)}</span>
            </div>
          </div>
        </Card>

        <Card title="Officers">
          {officer_summary.length === 0 ? (
            <p className="text-sm text-content-muted">No officers assigned.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {officer_summary.map((o) => (
                <li key={o.user_id}>
                  <p className="font-medium text-content-primary">{o.full_name}</p>
                  <p className="text-xs text-content-muted">{ROLE_LABELS[o.role]}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Agent Findings">
          {agent_findings.length === 0 ? (
            <div className="text-sm text-content-muted flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>No findings yet. Color-coded chapter health and Ops Agent suggestions will appear here once that feature ships.</span>
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {agent_findings.map((f, i) => (
                <li key={i} className="border-l-2 border-amber-400 pl-3">
                  <p className="font-medium text-content-primary">{f.summary}</p>
                  {f.detail && <p className="text-xs text-content-muted">{f.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon, label, value, sublabel,
}: { icon: React.ReactNode; label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex items-center gap-2 text-content-muted">
        {icon}
        <span className="text-xs uppercase tracking-wide font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-heading font-extrabold text-content-primary mt-2">{value}</p>
      {sublabel && <p className="text-xs text-content-muted mt-1">{sublabel}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card-solid rounded-xl border border-[var(--color-border)] p-5">
      <h4 className="font-heading font-bold text-content-primary mb-3">{title}</h4>
      {children}
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-content-secondary">{label}</span>
      <span className="text-content-primary font-medium">{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/frontend && npm test -- RegionDashboardTab`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/components/RegionDashboardTab.tsx chapter-ops/frontend/src/components/RegionDashboardTab.test.tsx
git commit -m "feat(regions): add RegionDashboardTab component"
```

---

### Task 10: Tab integration in `RegionDetailView`

**Files:**
- Modify: `chapter-ops/frontend/src/pages/Regions.tsx`
- Modify: `chapter-ops/frontend/src/pages/Regions.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `chapter-ops/frontend/src/pages/Regions.test.tsx`:

```tsx
it("defaults to the Dashboard tab when entering Region Detail", async () => {
  // mock fetchRegionDashboard to return a minimal payload
  vi.mock("@/services/regionService", async (orig) => ({
    ...(await orig() as object),
    fetchRegionDashboard: vi.fn().mockResolvedValue({
      region: { id: "r1", name: "S", abbreviation: null, description: null },
      kpis: { chapter_count: 0, chapter_count_active: 0, chapter_count_suspended: 0,
              member_count: 0, financial_rate: 0, dues_ytd: "0.00", invoices_outstanding_total: "0.00" },
      chapters: [], invoice_snapshot: { draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0, outstanding_total: "0.00" },
      officer_summary: [], agent_findings: [],
    }),
  }));
  // ... (full setup follows existing test patterns in this file — see existing tests for fixture style)
  // Render Regions, navigate to a region, assert the Dashboard tab content is visible
  // and the Manage tab content is NOT visible.
});
```

(The exact mock setup follows the patterns already used in `Regions.test.tsx`. Read the existing test file before writing this one to stay consistent with the project's mocking style.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/frontend && npm test -- Regions`
Expected: FAIL — Dashboard tab not present.

- [ ] **Step 3: Modify `RegionDetailView` to render tabs**

In `chapter-ops/frontend/src/pages/Regions.tsx`, modify `RegionDetailView` (line 455-onwards) to render a tab bar at the top, with the Dashboard tab as default. Read the `tab` query param via `useSearchParams` from `react-router-dom`:

```tsx
import { useSearchParams } from "react-router-dom";
import RegionDashboardTab from "@/components/RegionDashboardTab";
import { fetchRegionDashboard } from "@/services/regionService";
import type { RegionDashboardPayload } from "@/types";

function RegionDetailView({ detail, isOrgAdmin, allRegions, onBack, onRefresh }: { /* existing props */ }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") === "manage") ? "manage" : "dashboard";

  const [dashboardPayload, setDashboardPayload] = useState<RegionDashboardPayload | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    setDashboardError(null);
    fetchRegionDashboard(detail.region.id)
      .then(setDashboardPayload)
      .catch((err: { response?: { status?: number } }) => {
        // 403 = role removed mid-session, or deep link by an unauthorized user.
        // Sidebar gating prevents this for normal navigation; this is defense in depth.
        if (err?.response?.status === 403) {
          // toast is the project's existing toast util; substitute the actual import path
          // used elsewhere in the app (search for existing `toast(` calls)
          window.alert("You don't have access to that region.");
          window.location.assign("/dashboard");
          return;
        }
        setDashboardError("Failed to load dashboard.");
      });
  }, [activeTab, detail.region.id]);

  // ... existing role logic stays the same ...

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-brand-primary hover:underline font-medium flex items-center gap-1">
        {/* existing back chevron */}
        Back to Regions
      </button>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {(["dashboard", "manage"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSearchParams({ tab })}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-brand-primary text-brand-primary-dark"
                : "border-transparent text-content-secondary hover:text-content-secondary"
            }`}
          >
            {tab === "dashboard" ? "Dashboard" : "Manage"}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" ? (
        dashboardError ? (
          <div className="p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-md text-sm flex justify-between items-center">
            {dashboardError}
            <button onClick={() => fetchRegionDashboard(detail.region.id).then(setDashboardPayload).catch(() => setDashboardError("Failed to load dashboard."))} className="underline">Retry</button>
          </div>
        ) : !dashboardPayload ? (
          <p className="text-sm text-content-muted py-8 text-center">Loading dashboard...</p>
        ) : (
          <RegionDashboardTab payload={dashboardPayload} />
        )
      ) : (
        <>
          <RegionInfoSection detail={detail} canEdit={canEdit} onUpdated={onRefresh} />
          <ChaptersSection chapters={detail.chapters} currentRegionId={detail.region.id} isOrgAdmin={canManageChapters} allRegions={allRegions} onRefresh={onRefresh} />
          <RegionalOfficersSection detail={detail} isOrgAdmin={canManageOfficers} onUpdated={onRefresh} />
          {canViewInvoices && (
            <RegionalInvoicesSection regionId={detail.region.id} chapters={detail.chapters} canManage={canManageInvoices} />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/frontend && npm test -- Regions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/pages/Regions.tsx chapter-ops/frontend/src/pages/Regions.test.tsx
git commit -m "feat(regions): add Dashboard/Manage tabs to Region Detail view"
```

---

### Task 11: Sidebar update

**Files:**
- Modify: `chapter-ops/frontend/src/components/Layout.tsx`

- [ ] **Step 1: Write the failing test**

Add to `chapter-ops/frontend/src/components/Layout.test.tsx` (create if it doesn't exist; if it does, add to it):

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { useRegionStore } from "@/stores/regionStore";
import Layout from "./Layout";

describe("Layout sidebar", () => {
  it("does NOT show Regional Dashboard entry when regionsWithDashboardAccess is empty", () => {
    useRegionStore.setState({ regionsWithDashboardAccess: [] });
    render(<MemoryRouter><Layout><div /></Layout></MemoryRouter>);
    expect(screen.queryByText(/Regional Dashboard/i)).not.toBeInTheDocument();
  });

  it("shows Regional Dashboard entry when user has access to ≥1 region", () => {
    useRegionStore.setState({ regionsWithDashboardAccess: ["r1"] });
    render(<MemoryRouter><Layout><div /></Layout></MemoryRouter>);
    const link = screen.getByText(/Regional Dashboard/i).closest("a");
    expect(link).toHaveAttribute("href", "/regions/r1?tab=dashboard");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/frontend && npm test -- Layout`
Expected: FAIL.

- [ ] **Step 3: Update Layout.tsx**

In `chapter-ops/frontend/src/components/Layout.tsx` line 215:

```tsx
// Before:
const { isRegionalDirector, isOrgAdmin, loadRegions } = useRegionStore();
// ...
if (isRegionalDirector) {
  extra.push({ to: "/region-dashboard", label: "Region Dashboard", icon: BarChart3, module: "dashboard" as ModuleKey });
}

// After:
const { isRegionalDirector, isOrgAdmin, regionsWithDashboardAccess, loadRegions } = useRegionStore();
// ...
if (regionsWithDashboardAccess.length > 0) {
  if (regionsWithDashboardAccess.length > 1) {
    console.warn("User has dashboard access in multiple regions; linking to first:", regionsWithDashboardAccess);
  }
  extra.push({
    to: `/regions/${regionsWithDashboardAccess[0]}?tab=dashboard`,
    label: "Regional Dashboard",
    icon: BarChart3,
    module: "dashboard" as ModuleKey,
  });
}
```

`isRegionalDirector` stays as a separate variable; it's still used to gate the Incidents tile (line 186). Do not remove that.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd chapter-ops/frontend && npm test -- Layout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/components/Layout.tsx chapter-ops/frontend/src/components/Layout.test.tsx
git commit -m "feat(layout): gate Regional Dashboard sidebar entry on regionsWithDashboardAccess"
```

---

### Task 12: Cleanup — delete old `RegionDashboard.tsx` and route

**Files:**
- Delete: `chapter-ops/frontend/src/pages/RegionDashboard.tsx`
- Modify: `chapter-ops/frontend/src/App.tsx` (remove route registration + import)
- Modify: `chapter-ops/frontend/src/types/index.ts` (remove `RegionDashboardData` if not used elsewhere — already done in Task 7 step 1)

- [ ] **Step 1: Confirm no other imports**

Run: `grep -rn "RegionDashboard\|/region-dashboard\|RegionDashboardData" chapter-ops/frontend/src/`

Expected: only the file being deleted (`RegionDashboard.tsx`), the route in `App.tsx`, and possibly `Layout.tsx` if Task 11 wasn't fully applied. If any other file references these, update or remove the reference.

- [ ] **Step 2: Delete the page file**

```bash
git rm chapter-ops/frontend/src/pages/RegionDashboard.tsx
```

- [ ] **Step 3: Remove the App.tsx route + import**

In `chapter-ops/frontend/src/App.tsx`:
- Remove line 15: `import RegionDashboard from "@/pages/RegionDashboard";`
- Remove the `<Route path="/region-dashboard" ...>` block (lines 177-184)

- [ ] **Step 4: Run full frontend test suite**

Run: `cd chapter-ops/frontend && npm test`
Expected: PASS (whole suite).

Then verify TypeScript builds:

Run: `cd chapter-ops/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run a manual smoke test of the dev server**

Run: `cd chapter-ops/frontend && npm run dev` in one terminal and the backend in another. Log in as a regional director. Confirm:
1. Sidebar shows "Regional Dashboard" entry
2. Clicking it deep-links to `/regions/<id>?tab=dashboard`
3. Dashboard tab is the default; KPI cards and chapter health table render
4. Manage tab still works (Region Info, Chapters, Officers, Invoices sections all render)
5. The old `/region-dashboard` URL returns a 404 from the SPA router

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/frontend/src/App.tsx
git commit -m "refactor(regions): remove deprecated RegionDashboard page and route"
```

---

## Final Verification

After all 12 tasks:

```bash
# Backend
pytest chapter-ops/backend/tests/ -v

# Frontend
cd chapter-ops/frontend && npm test
cd chapter-ops/frontend && npx tsc --noEmit

# Verify all 12 commits are present
git log --oneline -12
```

Expected: all tests pass, TypeScript compiles cleanly, 12 commits showing the staged build (permission helper → aggregation extraction → endpoint → list-payload field → /my-dashboard removal → ChapterHealthTable extraction → types/service → regionStore → RegionDashboardTab → tab integration → sidebar → cleanup).
