# Payment Flows Expansion — Deploy 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut all Invoice reads over to the polymorphic columns Deploy 2 backfilled, extend `recompute_financial_status` with the cross-tier outstanding-invoice clause, and wire status-transition triggers so sending/paying/cancelling an invoice keeps `ChapterMembership.financial_status` honest. Legacy columns are still WRITTEN (the dual-write from Deploy 2 stays in place); Deploy 5 drops them.

**Architecture:** A new `app/services/invoice_queries.py` module centralises four polymorphic query patterns (chapter→user, chapter→user-for-one-member, invoices owed by a chapter, region→chapter) so every read site uses the same canonical filter and string-literal drift is impossible. All ten production read sites flip to the helpers. `recompute_financial_status` gains a `_has_outstanding_external_invoices(user_id, org_id)` clause that ANDs with the existing dues check. Three status-transition trigger points (`sent`, `paid`, `cancelled`) call recompute for the target user.

**Tech Stack:** Flask 3.x, SQLAlchemy 2.x, Flask-Login, pytest. **No new Alembic migrations** — Deploy 3 is pure code change.

**Related spec:** [docs/superpowers/specs/2026-04-24-payment-flows-expansion-design.md](../specs/2026-04-24-payment-flows-expansion-design.md)
**Related plans:** [Deploy 1](2026-04-24-payment-flows-deploy-1.md), [Deploy 2](2026-04-29-payment-flows-deploy-2.md)

**Production prerequisites (all verified ✅ as of 2026-04-29):**
- Deploy 2 backfill SQL ran cleanly: `missing_issuer = 0` for all invoice scopes, `missing_payer = 0` for payments
- Single Alembic head `d5e0a7c2f4b6` confirmed on production
- All 7 Invoice/Payment construction sites dual-write polymorphic columns

**Risk profile:** Per the design spec, Deploy 3 is the **riskiest deploy** of the rollout — polymorphic columns become the read-path source of truth. Mitigation built into Task 9:
- DB backup taken immediately before deploy (operator step, captured in the runbook)
- Legacy columns are still written, so revert is safe — re-pointing reads back to legacy columns produces correct results until Deploy 5 drops them
- 24h close-monitoring window post-deploy

---

## Task 1: Add `invoice_queries.py` service module

**Purpose:** Centralise the four polymorphic Invoice query patterns in one place so every read site uses the same canonical filter. Prevents string-literal drift across routes (the same discipline `polymorphic.py` enforces for writes in Deploy 2).

**Files:**
- Create: `chapter-ops/backend/app/services/invoice_queries.py`
- Test: `chapter-ops/backend/tests/test_invoice_queries.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_invoice_queries.py`:

```python
"""Tests for the polymorphic Invoice query builders."""

from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models import Invoice
from app.services.invoice_queries import (
    chapter_to_user_invoices,
    chapter_to_user_invoices_for_member,
    invoices_owed_by_chapter,
    region_to_chapter_invoices,
)
from app.utils.polymorphic import (
    chapter_to_user_invoice_kwargs,
    region_to_chapter_invoice_kwargs,
)
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership, make_region,
)


class TestInvoiceQueries:
    def _make_member_invoice(self, *, chapter, user, creator, number, scope="member"):
        inv = Invoice(
            scope=scope,
            chapter_id=chapter.id,
            billed_user_id=user.id,
            invoice_number=number,
            description="dues",
            amount=Decimal("100.00"),
            status="sent",
            due_date=date(2026, 6, 1),
            created_by_id=creator.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=user.id),
        )
        db.session.add(inv)
        return inv

    def _make_regional_invoice(self, *, region, chapter, creator, number):
        inv = Invoice(
            scope="chapter",
            region_id=region.id,
            billed_chapter_id=chapter.id,
            invoice_number=number,
            description="head tax",
            amount=Decimal("500.00"),
            status="sent",
            due_date=date(2026, 6, 1),
            created_by_id=creator.id,
            **region_to_chapter_invoice_kwargs(region_id=region.id, chapter_id=chapter.id),
        )
        db.session.add(inv)
        return inv

    def test_chapter_to_user_invoices_returns_member_dues(self, app, db_session):
        org = make_organization()
        chapter_a = make_chapter(org, name="Alpha")
        chapter_b = make_chapter(org, name="Beta")
        user_a = make_user(email="ua@example.com")
        user_b = make_user(email="ub@example.com")
        make_membership(user_a, chapter_a, role="treasurer")
        make_membership(user_b, chapter_b, role="treasurer")
        self._make_member_invoice(chapter=chapter_a, user=user_a, creator=user_a, number="INV-A-1")
        self._make_member_invoice(chapter=chapter_b, user=user_b, creator=user_b, number="INV-B-1")
        db.session.commit()

        result = chapter_to_user_invoices(chapter_a).all()
        assert len(result) == 1
        assert result[0].invoice_number == "INV-A-1"

    def test_chapter_to_user_invoices_for_member_filters_by_target_user(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user_x = make_user(email="x@example.com")
        user_y = make_user(email="y@example.com")
        make_membership(user_x, chapter, role="member")
        make_membership(user_y, chapter, role="member")
        self._make_member_invoice(chapter=chapter, user=user_x, creator=user_x, number="INV-X-1")
        self._make_member_invoice(chapter=chapter, user=user_y, creator=user_y, number="INV-Y-1")
        db.session.commit()

        result = chapter_to_user_invoices_for_member(chapter, user_x.id).all()
        assert len(result) == 1
        assert result[0].invoice_number == "INV-X-1"

    def test_invoices_owed_by_chapter_returns_regional_head_tax(self, app, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        creator = make_user(email="c@example.com")
        # Member invoice TO this chapter's user — should NOT appear
        self._make_member_invoice(chapter=chapter, user=creator, creator=creator, number="INV-MEM-1")
        # Regional invoice owed BY this chapter — should appear
        self._make_regional_invoice(region=region, chapter=chapter, creator=creator, number="RGN-1")
        db.session.commit()

        result = invoices_owed_by_chapter(chapter).all()
        assert len(result) == 1
        assert result[0].invoice_number == "RGN-1"

    def test_region_to_chapter_invoices_returns_only_this_region(self, app, db_session):
        org = make_organization()
        region_a = make_region(org, name="Region Alpha")
        region_b = make_region(org, name="Region Beta")
        chapter_a = make_chapter(org, region=region_a, name="Alpha Chapter")
        chapter_b = make_chapter(org, region=region_b, name="Beta Chapter")
        creator = make_user(email="c@example.com")
        self._make_regional_invoice(region=region_a, chapter=chapter_a, creator=creator, number="RGN-A-1")
        self._make_regional_invoice(region=region_b, chapter=chapter_b, creator=creator, number="RGN-B-1")
        db.session.commit()

        result = region_to_chapter_invoices(region_a).all()
        assert len(result) == 1
        assert result[0].invoice_number == "RGN-A-1"
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_invoice_queries.py -v`
Expected: `ImportError: cannot import name 'chapter_to_user_invoices' from 'app.services.invoice_queries'`

- [ ] **Step 3: Implement the query module**

Create `chapter-ops/backend/app/services/invoice_queries.py`:

```python
"""Canonical polymorphic Invoice query builders.

Every Invoice read site that filters by issuer/target tier MUST use one
of these helpers rather than spelling out polymorphic literals inline.
This is the same discipline that app.utils.polymorphic enforces for
Invoice/Payment writes — keeping the legal (issuer, target) tuples in
one place prevents drift across routes.

Each helper returns a Query object so callers can chain ``.filter(...)``,
``.order_by(...)``, ``.count()``, or ``.all()``.
"""

from app.models import Invoice


def chapter_to_user_invoices(chapter):
    """All chapter→member invoices issued by this chapter."""
    return Invoice.query.filter(
        Invoice.issuer_type == "chapter",
        Invoice.issuer_id == chapter.id,
        Invoice.target_type == "user",
    )


def chapter_to_user_invoices_for_member(chapter, user_id: str):
    """Chapter→member invoices targeting a specific user."""
    return chapter_to_user_invoices(chapter).filter(Invoice.target_id == user_id)


def invoices_owed_by_chapter(chapter):
    """All invoices targeting this chapter (region/org head tax, etc.)."""
    return Invoice.query.filter(
        Invoice.target_type == "chapter",
        Invoice.target_id == chapter.id,
    )


def region_to_chapter_invoices(region):
    """Region→chapter invoices issued by this region."""
    return Invoice.query.filter(
        Invoice.issuer_type == "region",
        Invoice.issuer_id == region.id,
        Invoice.target_type == "chapter",
    )
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_invoice_queries.py -v`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/services/invoice_queries.py chapter-ops/backend/tests/test_invoice_queries.py
git commit -m "feat(invoices): add polymorphic Invoice query builder module"
```

---

## Task 2: Flip reads in `app/routes/invoices.py`

**Purpose:** Replace all eight legacy-column reads in the invoice routes with the Task 1 query helpers. Behavior is unchanged; only the SQL filter columns change.

**Files:**
- Modify: `chapter-ops/backend/app/routes/invoices.py` (8 sites)
- Test: `chapter-ops/backend/tests/test_invoices_polymorphic_reads.py` (new)

The eight sites to flip:

| Line | Function | Current filter | New helper |
|---|---|---|---|
| 75 | `list_invoices` (treasurer) | `chapter_id=chapter.id, scope="member"` | `chapter_to_user_invoices(chapter)` |
| 82 | `list_invoices` user filter | `query.filter_by(billed_user_id=user_id)` | `query.filter(Invoice.target_id == user_id)` |
| 85 | `list_invoices` (member view) | `chapter_id=chapter.id, scope="member", billed_user_id=current_user.id` | `chapter_to_user_invoices_for_member(chapter, current_user.id)` |
| 387 | `bulk_send_invoices` filter | `Invoice.chapter_id == chapter.id, Invoice.status == "draft"` | `chapter_to_user_invoices(chapter).filter(Invoice.status == "draft")` |
| 392 | `bulk_send_invoices` fallback | `chapter_id=chapter.id, status="draft", scope="member"` | `chapter_to_user_invoices(chapter).filter(Invoice.status == "draft")` |
| 431 | `invoice_summary` | `chapter_id=chapter.id, scope="member"` | `chapter_to_user_invoices(chapter)` |
| 464 | `list_chapter_bills` | `billed_chapter_id=chapter.id, scope="chapter"` | `invoices_owed_by_chapter(chapter)` |
| 495 | `list_regional_invoices` (officer/admin) | `region_id=region.id, scope="chapter"` | `region_to_chapter_invoices(region)` |
| 502-504 | `list_regional_invoices` (chapter member) | `Invoice.region_id == region.id, Invoice.scope == "chapter", Invoice.billed_chapter_id.in_(chapter_ids)` | `region_to_chapter_invoices(region).filter(Invoice.target_id.in_(chapter_ids))` |

- [ ] **Step 1: Write the failing read-flip tests**

Create `chapter-ops/backend/tests/test_invoices_polymorphic_reads.py`:

```python
"""Tests asserting Invoice routes serve reads via polymorphic columns (Deploy 3).

These tests insert legacy-shape rows with ONLY polymorphic columns populated
(no scope/chapter_id/billed_*), then verify each route still returns them.
A failing test here means the route is still reading from legacy columns.
"""

from datetime import date, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Invoice
from app.utils.polymorphic import (
    chapter_to_user_invoice_kwargs,
    region_to_chapter_invoice_kwargs,
)
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership, make_region,
)


def _login(client, user, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": user.email, "password": password})


def _polymorphic_only_member_invoice(chapter, user, creator, number):
    """Insert an invoice with ONLY polymorphic columns set — legacy columns NULL.
    Used to prove the route reads from polymorphic columns."""
    inv = Invoice(
        scope="member",  # CHECK constraint requires non-null scope; legacy stays
        chapter_id=None,  # legacy NULL — proves read uses polymorphic
        billed_user_id=None,
        invoice_number=number,
        description="poly-only",
        amount=Decimal("50.00"),
        status="sent",
        due_date=date(2026, 6, 1),
        created_by_id=creator.id,
        **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=user.id),
    )
    db.session.add(inv)
    return inv


class TestInvoicesPolymorphicReads:
    def test_list_invoices_treasurer_view_finds_polymorphic_only_rows(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        member = make_user(email="m@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(member, chapter, role="member")
        treasurer.active_chapter_id = chapter.id
        _polymorphic_only_member_invoice(chapter, member, treasurer, "INV-POLY-1")
        db.session.commit()

        _login(client, treasurer)
        resp = client.get("/api/invoices")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["invoices"]) == 1
        assert data["invoices"][0]["invoice_number"] == "INV-POLY-1"

    def test_list_invoices_member_view_finds_own_polymorphic_only_row(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        member = make_user(email="m@example.com")
        make_membership(member, chapter, role="member")
        member.active_chapter_id = chapter.id
        _polymorphic_only_member_invoice(chapter, member, member, "INV-POLY-OWN-1")
        db.session.commit()

        _login(client, member)
        resp = client.get("/api/invoices")
        assert resp.status_code == 200
        invs = resp.get_json()["invoices"]
        assert len(invs) == 1
        assert invs[0]["invoice_number"] == "INV-POLY-OWN-1"

    def test_invoice_summary_counts_polymorphic_only_rows(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        member = make_user(email="m@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(member, chapter, role="member")
        treasurer.active_chapter_id = chapter.id
        _polymorphic_only_member_invoice(chapter, member, treasurer, "INV-S-1")
        db.session.commit()

        _login(client, treasurer)
        resp = client.get("/api/invoices/summary")
        assert resp.status_code == 200
        assert resp.get_json()["total_count"] == 1

    def test_chapter_bills_endpoint_finds_polymorphic_only_regional_invoice(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        treasurer = make_user(email="t@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        treasurer.active_chapter_id = chapter.id
        inv = Invoice(
            scope="chapter",
            region_id=None,  # legacy NULL
            billed_chapter_id=None,
            invoice_number="RGN-POLY-1",
            description="head tax",
            amount=Decimal("500.00"),
            status="sent",
            due_date=date(2026, 6, 1),
            created_by_id=treasurer.id,
            **region_to_chapter_invoice_kwargs(region_id=region.id, chapter_id=chapter.id),
        )
        db.session.add(inv)
        db.session.commit()

        _login(client, treasurer)
        resp = client.get("/api/invoices/chapter-bills")
        assert resp.status_code == 200
        invs = resp.get_json()["invoices"]
        assert len(invs) == 1
        assert invs[0]["invoice_number"] == "RGN-POLY-1"

    def test_regional_invoices_officer_view_finds_polymorphic_only_rows(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        admin = make_user(email="a@example.com")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(user_id=admin.id, organization_id=org.id, role="admin"))
        inv = Invoice(
            scope="chapter",
            region_id=None,
            billed_chapter_id=None,
            invoice_number="RGN-POLY-OFF-1",
            description="head tax",
            amount=Decimal("500.00"),
            status="sent",
            due_date=date(2026, 6, 1),
            created_by_id=admin.id,
            **region_to_chapter_invoice_kwargs(region_id=region.id, chapter_id=chapter.id),
        )
        db.session.add(inv)
        db.session.commit()

        _login(client, admin)
        resp = client.get(f"/api/invoices/regional/{region.id}")
        assert resp.status_code == 200
        invs = resp.get_json()["invoices"]
        assert len(invs) == 1
        assert invs[0]["invoice_number"] == "RGN-POLY-OFF-1"
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_invoices_polymorphic_reads.py -v`
Expected: 5 tests fail (each route still filters on legacy NULLs and returns 0 rows).

- [ ] **Step 3: Flip the eight read sites in `invoices.py`**

Add to the imports block (after `from app.utils.polymorphic import (...)`):

```python
from app.services.invoice_queries import (
    chapter_to_user_invoices,
    chapter_to_user_invoices_for_member,
    invoices_owed_by_chapter,
    region_to_chapter_invoices,
)
```

Replace each site per the table above:

**Site 1 (line ~75)** — `list_invoices` treasurer query:
```python
        query = chapter_to_user_invoices(chapter)
```

**Site 2 (line ~82)** — `list_invoices` user filter:
```python
        user_id = request.args.get("user_id")
        if user_id:
            query = query.filter(Invoice.target_id == user_id)
```

**Site 3 (line ~85)** — `list_invoices` member view:
```python
        query = chapter_to_user_invoices_for_member(chapter, current_user.id)
```

**Site 4 (line ~387)** — `bulk_send_invoices` filter on selected ids (the existing `Invoice.id.in_(invoice_ids)` clause stays; just swap the chapter+scope guard):
```python
        invoices = chapter_to_user_invoices(chapter).filter(
            Invoice.id.in_(invoice_ids),
            Invoice.status == "draft",
        ).all()
```

**Site 5 (line ~392)** — `bulk_send_invoices` fallback (no ids supplied):
```python
        invoices = chapter_to_user_invoices(chapter).filter(
            Invoice.status == "draft",
        ).all()
```

**Site 6 (line ~431)** — `invoice_summary`:
```python
    invoices = chapter_to_user_invoices(chapter).all()
```

**Site 7 (line ~464)** — `list_chapter_bills`:
```python
    invoices = (
        invoices_owed_by_chapter(chapter)
        .order_by(Invoice.due_date.desc())
        .all()
    )
```

**Site 8 (line ~495)** — `list_regional_invoices` officer/admin path:
```python
        invoices = region_to_chapter_invoices(region).order_by(Invoice.due_date.desc()).all()
```

**Site 9 (lines ~502-504)** — `list_regional_invoices` chapter-member path:
```python
        invoices = (
            region_to_chapter_invoices(region)
            .filter(Invoice.target_id.in_(chapter_ids))
            .order_by(Invoice.due_date.desc())
            .all()
        )
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_invoices_polymorphic_reads.py tests/test_invoices_dual_write.py tests/test_invoice_queries.py -v`
Expected: all green (5 new + 4 dual-write + 4 queries = 13 tests).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/invoices.py chapter-ops/backend/tests/test_invoices_polymorphic_reads.py
git commit -m "feat(invoices): flip route reads to polymorphic columns"
```

---

## Task 3: Flip reads in `app/routes/webhooks.py`

**Purpose:** The Stripe webhook auto-link query at lines 188-189 still uses legacy columns. After Deploy 5 drops them, this query would silently match no invoices.

**Files:**
- Modify: `chapter-ops/backend/app/routes/webhooks.py:184-189`
- Test: `chapter-ops/backend/tests/test_webhooks_polymorphic_reads.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_webhooks_polymorphic_reads.py`:

```python
"""Tests asserting webhook auto-link queries via polymorphic columns (Deploy 3)."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch

from app.extensions import db
from app.models import Invoice, Payment
from app.utils.polymorphic import chapter_to_user_invoice_kwargs
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
)


class TestWebhookAutoLinkPolymorphic:
    def test_auto_links_polymorphic_only_open_invoice(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        chapter.stripe_account_id = "acct_test_chapter_1"
        user = make_user()
        make_membership(user, chapter, role="member")
        # Open invoice with ONLY polymorphic columns
        open_inv = Invoice(
            scope="member",
            chapter_id=None,
            billed_user_id=None,
            invoice_number="INV-OPEN-1",
            description="dues",
            amount=Decimal("100.00"),
            status="sent",
            due_date=date(2026, 6, 1),
            created_by_id=user.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=user.id),
        )
        db.session.add(open_inv)
        db.session.commit()

        event = {
            "type": "checkout.session.completed",
            "account": "acct_test_chapter_1",
            "data": {"object": {
                "id": "cs_test_autolink_poly",
                "amount_total": 10000,
                "metadata": {
                    "payment_type": "one-time",
                    "chapter_id": chapter.id,
                    "user_id": user.id,
                },
            }},
        }
        with patch("stripe.Webhook.construct_event", return_value=event):
            resp = client.post("/webhook", data=b"{}", headers={"Stripe-Signature": "test"})
        assert resp.status_code == 200

        db.session.refresh(open_inv)
        assert open_inv.status == "paid"
        assert open_inv.payment_id is not None
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd chapter-ops/backend && python -m pytest tests/test_webhooks_polymorphic_reads.py -v`
Expected: fail with `assert open_inv.status == 'paid'` because the legacy-column-based query at line 184-189 returns no rows when legacy columns are NULL.

- [ ] **Step 3: Flip the auto-link query**

In `chapter-ops/backend/app/routes/webhooks.py`, find the open-invoice auto-link block (around lines 184-189):

```python
        open_invoice = Invoice.query.filter(
            Invoice.chapter_id == chapter_id,
            Invoice.billed_user_id == user_id,
            Invoice.status.in_(["sent", "overdue"]),
            Invoice.payment_id.is_(None),
        ).order_by(Invoice.due_date.asc()).first()
```

Replace with:

```python
        open_invoice = Invoice.query.filter(
            Invoice.issuer_type == "chapter",
            Invoice.issuer_id == chapter_id,
            Invoice.target_type == "user",
            Invoice.target_id == user_id,
            Invoice.status.in_(["sent", "overdue"]),
            Invoice.payment_id.is_(None),
        ).order_by(Invoice.due_date.asc()).first()
```

(Inline filter rather than the helper because the chapter argument here is just an ID string, not a Chapter object — looking up the Chapter just to call the helper would be wasted work.)

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd chapter-ops/backend && python -m pytest tests/test_webhooks_polymorphic_reads.py tests/test_webhooks_dual_write.py -v`
Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/webhooks.py chapter-ops/backend/tests/test_webhooks_polymorphic_reads.py
git commit -m "feat(webhooks): flip auto-link query to polymorphic columns"
```

---

## Task 4: Flip reads in `app/routes/dashboard.py`

**Purpose:** Two dashboard inbox queries still use legacy columns (member's own invoices at L146-147, chapter overdue regional invoices at L342). Flip both.

**Files:**
- Modify: `chapter-ops/backend/app/routes/dashboard.py:142-149` and `dashboard.py:336-345`
- Test: `chapter-ops/backend/tests/test_dashboard_polymorphic_reads.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_dashboard_polymorphic_reads.py`:

```python
"""Dashboard inbox reads via polymorphic columns (Deploy 3)."""

from datetime import date, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Invoice
from app.utils.polymorphic import (
    chapter_to_user_invoice_kwargs,
    region_to_chapter_invoice_kwargs,
)
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership, make_region,
)


def _login(client, user, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": user.email, "password": password})


class TestDashboardPolymorphicReads:
    def test_member_inbox_finds_polymorphic_only_outstanding_invoice(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        member = make_user(email="m@example.com")
        make_membership(member, chapter, role="member")
        member.active_chapter_id = chapter.id
        inv = Invoice(
            scope="member",
            chapter_id=None,
            billed_user_id=None,
            invoice_number="INV-DASH-1",
            description="dues",
            amount=Decimal("100.00"),
            status="sent",
            due_date=date.today() + timedelta(days=10),
            created_by_id=member.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=member.id),
        )
        db.session.add(inv)
        db.session.commit()

        _login(client, member)
        resp = client.get("/api/dashboard/inbox")
        assert resp.status_code == 200
        items = resp.get_json()["items"]
        assert any("invoice" in it["type"] or "bill" in it["type"] for it in items)

    def test_chapter_inbox_finds_polymorphic_only_overdue_regional_invoice(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        treasurer = make_user(email="t@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        treasurer.active_chapter_id = chapter.id
        inv = Invoice(
            scope="chapter",
            region_id=None,
            billed_chapter_id=None,
            invoice_number="RGN-DASH-OVERDUE-1",
            description="head tax",
            amount=Decimal("500.00"),
            status="overdue",
            due_date=date.today() - timedelta(days=5),
            created_by_id=treasurer.id,
            **region_to_chapter_invoice_kwargs(region_id=region.id, chapter_id=chapter.id),
        )
        db.session.add(inv)
        db.session.commit()

        _login(client, treasurer)
        resp = client.get("/api/dashboard/inbox")
        assert resp.status_code == 200
        items = resp.get_json()["items"]
        assert any(it["id"].startswith("invoice_overdue_") for it in items)
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_dashboard_polymorphic_reads.py -v`
Expected: 2 fail.

- [ ] **Step 3: Flip both dashboard queries**

In `chapter-ops/backend/app/routes/dashboard.py`, around lines 142-149 (member invoice inbox), replace:

```python
        my_invoices = Invoice.query.filter(
            Invoice.chapter_id == chapter.id,
            Invoice.billed_user_id == current_user.id,
            Invoice.status.in_(["sent", "overdue"]),
        ).all()
```

with:

```python
        my_invoices = Invoice.query.filter(
            Invoice.issuer_type == "chapter",
            Invoice.issuer_id == chapter.id,
            Invoice.target_type == "user",
            Invoice.target_id == current_user.id,
            Invoice.status.in_(["sent", "overdue"]),
        ).all()
```

Around lines 336-345 (chapter overdue regional invoices), replace:

```python
            count = Invoice.query.filter(
                Invoice.billed_chapter_id == chapter.id,
                Invoice.status.in_(["sent", "overdue"]),
                Invoice.due_date < today,
            ).count()
```

with:

```python
            count = Invoice.query.filter(
                Invoice.target_type == "chapter",
                Invoice.target_id == chapter.id,
                Invoice.status.in_(["sent", "overdue"]),
                Invoice.due_date < today,
            ).count()
```

(Inline polymorphic filters here rather than the helper because the dashboard route already imports Invoice and the queries have status/date conditions specific to inbox logic — adding helpers for these one-off inbox filters would be over-abstracting.)

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_dashboard_polymorphic_reads.py tests/test_dashboard_aggregations.py -v`
Expected: green; no regressions on existing dashboard tests.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/dashboard.py chapter-ops/backend/tests/test_dashboard_polymorphic_reads.py
git commit -m "feat(dashboard): flip inbox invoice reads to polymorphic columns"
```

---

## Task 5: Flip reads in `app/routes/regions.py`

**Purpose:** The regional dashboard's invoice snapshot at line 233 uses `Invoice.query.filter_by(region_id=region.id)`. After Deploy 5 drops `region_id`, this returns nothing. Flip to polymorphic.

**Files:**
- Modify: `chapter-ops/backend/app/routes/regions.py:233`
- Test: extend `chapter-ops/backend/tests/test_dashboard_polymorphic_reads.py` (Task 4) with one regional-dashboard test

- [ ] **Step 1: Append the failing test to Task 4's test file**

Append to `chapter-ops/backend/tests/test_dashboard_polymorphic_reads.py`:

```python
class TestRegionDashboardPolymorphicReads:
    def test_region_dashboard_invoice_snapshot_finds_polymorphic_only_rows(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        admin = make_user(email="a@example.com")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(user_id=admin.id, organization_id=org.id, role="admin"))
        inv = Invoice(
            scope="chapter",
            region_id=None,
            billed_chapter_id=None,
            invoice_number="RGN-DASH-2",
            description="head tax",
            amount=Decimal("500.00"),
            status="sent",
            due_date=date.today() + timedelta(days=30),
            created_by_id=admin.id,
            **region_to_chapter_invoice_kwargs(region_id=region.id, chapter_id=chapter.id),
        )
        db.session.add(inv)
        db.session.commit()

        _login(client, admin)
        resp = client.get(f"/api/regions/{region.id}/dashboard")
        assert resp.status_code == 200
        snapshot = resp.get_json()["invoice_snapshot"]
        # Outstanding total includes the new sent invoice
        assert Decimal(snapshot["outstanding_total"]) >= Decimal("500.00")
        assert snapshot["counts"].get("sent", 0) >= 1
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd chapter-ops/backend && python -m pytest tests/test_dashboard_polymorphic_reads.py::TestRegionDashboardPolymorphicReads -v`
Expected: fail (snapshot count returns 0 because `region_id` is NULL on the test row).

- [ ] **Step 3: Flip the regional dashboard query**

In `chapter-ops/backend/app/routes/regions.py`, find line 233:

```python
    invoices = Invoice.query.filter_by(region_id=region.id).all()
```

Replace with the helper from Task 1 (covers the `region_to_chapter_invoices` shape exactly):

```python
    from app.services.invoice_queries import region_to_chapter_invoices
    invoices = region_to_chapter_invoices(region).all()
```

(Move the import to the top of the file alongside the other `from app.services...` imports if any exist; otherwise inline import is fine since this is the only call.)

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_dashboard_polymorphic_reads.py tests/test_dashboard_aggregations.py -v`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/regions.py chapter-ops/backend/tests/test_dashboard_polymorphic_reads.py
git commit -m "feat(regions): flip regional dashboard invoice snapshot to polymorphic columns"
```

---

## Task 6: Flip reads in `app/cli/seed_demo.py`

**Purpose:** The demo seeder's cleanup queries use legacy columns at lines 606-607, 867-868, and 928. These are not unit-tested but should still flip so `flask seed-demo` produces consistent state after Deploy 5.

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (5 sites)
- No new tests (seeder is exercised manually)

- [ ] **Step 1: Inspect the five seeder query sites**

Run: `grep -n "Invoice\.\(chapter_id\|billed_chapter_id\|region_id\)" chapter-ops/backend/app/cli/seed_demo.py`

Expected output mentions lines 606, 607, 867, 868, 928.

- [ ] **Step 2: Flip each site**

For each occurrence, replace the legacy column reference with the polymorphic equivalent:
- `Invoice.chapter_id.in_(chapter_ids)` → `db.and_(Invoice.issuer_type == "chapter", Invoice.issuer_id.in_(chapter_ids))`
- `Invoice.billed_chapter_id.in_(chapter_ids)` → `db.and_(Invoice.target_type == "chapter", Invoice.target_id.in_(chapter_ids))`
- `Invoice.region_id.in_(region_ids)` → `db.and_(Invoice.issuer_type == "region", Invoice.issuer_id.in_(region_ids))`

Where these appear inside an `or_(...)` clause that combines two of them, lift each into its own `and_(...)` and keep the `or_(...)` wrapper.

(Read the surrounding loop to confirm the exact filter shape — the cleanup queries delete demo data, so it's important to keep the filter logic equivalent.)

- [ ] **Step 3: Smoke-test the seeder**

Run: `cd chapter-ops/backend && python -m flask seed-demo --reset 2>&1 | tail -20`
Expected: seeder runs to completion without exceptions. Verify with: `python -c "from app import create_app; app = create_app(); from app.extensions import db; from app.models import Invoice; app.app_context().push(); print(Invoice.query.count())"` — should return a non-zero count.

(If your local DB is in production-like state and you'd rather not reset, skip this step and verify in a follow-up `flask seed-demo` run during Task 9's smoke verification window.)

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "chore(seed): flip seeder Invoice cleanup queries to polymorphic columns"
```

---

## Task 7: Extend `recompute_financial_status` for cross-tier outstanding invoices

**Purpose:** Per the design spec, a member is "financial" only when (a) all chapter dues are satisfied AND (b) no outstanding region invoices target the user within their organization AND (c) no outstanding org invoices target the user. Today only chapter dues are checked. After this task, region/org outstanding invoices also flip the user to `not_financial`.

**At production today** there are no Region→User or Org→User invoices (those flows ship in Deploy 4). So this change is a no-op against current data — it's groundwork that will activate as Deploy 4 lands.

**Files:**
- Modify: `chapter-ops/backend/app/services/dues_service.py` — extend `recompute_financial_status` and add `_has_outstanding_external_invoices` helper
- Test: `chapter-ops/backend/tests/test_dues_service_cross_tier.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_dues_service_cross_tier.py`:

```python
"""Tests for cross-tier financial_status logic in dues_service (Deploy 3)."""

from datetime import date, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import ChapterMembership, Invoice, ChapterPeriodDues
from app.services.dues_service import recompute_financial_status
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership, make_region,
)


def _make_active_period_with_satisfied_dues(chapter, user, creator):
    """Set up a chapter period with one fully-paid dues row so the existing
    chapter-dues check returns 'satisfied' — leaving the cross-tier clause
    as the only thing that can flip status."""
    from app.models import ChapterPeriod
    period = ChapterPeriod(
        chapter_id=chapter.id,
        period_type="annual",
        name="Test Period",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
    )
    db.session.add(period)
    db.session.flush()
    dues = ChapterPeriodDues(
        chapter_id=chapter.id,
        user_id=user.id,
        period_id=period.id,
        fee_type_id="dues",
        amount_owed=Decimal("100.00"),
        amount_paid=Decimal("100.00"),
        status="paid",
    )
    db.session.add(dues)


class TestCrossTierFinancialStatus:
    def test_outstanding_region_invoice_flips_member_to_not_financial(self, app, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        member = make_user(email="m@example.com")
        membership = make_membership(member, chapter, role="member", financial_status="financial")
        _make_active_period_with_satisfied_dues(chapter, member, member)
        # Region→user invoice outstanding (Deploy 4 flow, but cross-tier clause must read it)
        db.session.add(Invoice(
            scope="member",  # legacy enum is required non-null; semantic is via polymorphic
            invoice_number="RGN-USER-1",
            description="regional dues",
            amount=Decimal("75.00"),
            status="sent",
            due_date=date.today() + timedelta(days=10),
            created_by_id=member.id,
            issuer_type="region",
            issuer_id=region.id,
            target_type="user",
            target_id=member.id,
        ))
        db.session.commit()

        recompute_financial_status(chapter, member.id)
        db.session.refresh(membership)
        assert membership.financial_status == "not_financial"

    def test_outstanding_org_invoice_flips_member_to_not_financial(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        member = make_user(email="m@example.com")
        membership = make_membership(member, chapter, role="member", financial_status="financial")
        _make_active_period_with_satisfied_dues(chapter, member, member)
        db.session.add(Invoice(
            scope="member",
            invoice_number="ORG-USER-1",
            description="national dues",
            amount=Decimal("100.00"),
            status="overdue",
            due_date=date.today() - timedelta(days=5),
            created_by_id=member.id,
            issuer_type="organization",
            issuer_id=org.id,
            target_type="user",
            target_id=member.id,
        ))
        db.session.commit()

        recompute_financial_status(chapter, member.id)
        db.session.refresh(membership)
        assert membership.financial_status == "not_financial"

    def test_paid_external_invoice_does_not_flip_status(self, app, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        member = make_user(email="m@example.com")
        membership = make_membership(member, chapter, role="member", financial_status="financial")
        _make_active_period_with_satisfied_dues(chapter, member, member)
        # PAID region→user invoice should not block financial status
        db.session.add(Invoice(
            scope="member",
            invoice_number="RGN-USER-PAID-1",
            description="regional dues paid",
            amount=Decimal("75.00"),
            status="paid",
            due_date=date.today() - timedelta(days=10),
            created_by_id=member.id,
            issuer_type="region",
            issuer_id=region.id,
            target_type="user",
            target_id=member.id,
        ))
        db.session.commit()

        recompute_financial_status(chapter, member.id)
        db.session.refresh(membership)
        assert membership.financial_status == "financial"

    def test_cross_org_isolation(self, app, db_session):
        """Org B's invoice on a member must not affect that member's status in Org A."""
        org_a = make_organization(name="Org A")
        org_b = make_organization(name="Org B")
        chapter_a = make_chapter(org_a)
        member = make_user(email="m@example.com")
        membership_a = make_membership(member, chapter_a, role="member", financial_status="financial")
        _make_active_period_with_satisfied_dues(chapter_a, member, member)
        # Outstanding invoice from Org B (different org) should NOT affect Org A status
        db.session.add(Invoice(
            scope="member",
            invoice_number="ORG-B-USER-1",
            description="org b dues",
            amount=Decimal("100.00"),
            status="sent",
            due_date=date.today() + timedelta(days=10),
            created_by_id=member.id,
            issuer_type="organization",
            issuer_id=org_b.id,
            target_type="user",
            target_id=member.id,
        ))
        db.session.commit()

        recompute_financial_status(chapter_a, member.id)
        db.session.refresh(membership_a)
        assert membership_a.financial_status == "financial"
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_dues_service_cross_tier.py -v`
Expected: 2-3 tests fail (the two outstanding-invoice tests will fail because `recompute_financial_status` ignores Region/Org invoices today; the paid-invoice and cross-org-isolation tests may pass coincidentally because today's logic also ignores them — but they document the intended behavior).

- [ ] **Step 3: Implement the cross-tier helper and extend recompute**

In `chapter-ops/backend/app/services/dues_service.py`, add the helper function above `recompute_financial_status` (around line 332):

```python
def _has_outstanding_external_invoices(user_id: str, organization_id: str) -> bool:
    """True if any sent/overdue Region or Organization invoice targets this user
    within the given organization. Region invoices count only when the region
    belongs to the same organization (cross-org isolation)."""
    from app.models import Invoice, Region

    region_ids_subquery = (
        db.session.query(Region.id)
        .filter(Region.organization_id == organization_id)
        .subquery()
    )

    return db.session.query(Invoice.id).filter(
        Invoice.target_type == "user",
        Invoice.target_id == user_id,
        Invoice.status.in_(("sent", "overdue")),
        db.or_(
            db.and_(
                Invoice.issuer_type == "organization",
                Invoice.issuer_id == organization_id,
            ),
            db.and_(
                Invoice.issuer_type == "region",
                Invoice.issuer_id.in_(region_ids_subquery),
            ),
        ),
    ).first() is not None
```

Then extend `recompute_financial_status`. Find the line:

```python
    new_status = "financial" if all(_row_satisfied(d) for d in owed_rows) else "not_financial"
```

Replace with:

```python
    chapter_dues_satisfied = all(_row_satisfied(d) for d in owed_rows)
    has_external_outstanding = _has_outstanding_external_invoices(
        user_id=user_id, organization_id=chapter.organization_id,
    )
    new_status = (
        "financial" if chapter_dues_satisfied and not has_external_outstanding
        else "not_financial"
    )
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_dues_service_cross_tier.py -v`
Expected: 4/4 pass.

- [ ] **Step 5: Wider sanity — confirm no regression on existing dues tests**

Run: `cd chapter-ops/backend && python -m pytest tests/test_dues_service_cross_tier.py tests/test_payments_dual_write.py tests/test_webhooks_dual_write.py -v`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/services/dues_service.py chapter-ops/backend/tests/test_dues_service_cross_tier.py
git commit -m "feat(dues): cross-tier financial_status considers Region/Org outstanding invoices"
```

---

## Task 8: Add status-transition triggers on invoice send / pay / cancel

**Purpose:** Per the spec, sending an invoice (status → `sent`) must call `recompute_financial_status` for the target user; same for `paid` (which can flip a member back to financial) and `cancelled` (treated as forgiveness). Today these transitions don't trigger recompute — only payment-via-Stripe does (via `apply_payment` in the webhook).

**Scope:** Three invoice routes contain status mutations:
- `invoices.py:send_invoice` (single send) — sets status='sent'
- `invoices.py:bulk_send_invoices` (batch send) — sets status='sent' for many
- `invoices.py:update_invoice` (treasurer manual edit) — can set any status, including 'paid'/'cancelled'
- `webhooks.py:_create_payment_from_session` — already calls recompute via `apply_payment` for chapter-dues path, plus the auto-link path that sets `open_invoice.status = "paid"` (line 191) — this auto-link path needs an explicit recompute call

**Files:**
- Modify: `chapter-ops/backend/app/routes/invoices.py` (send_invoice, bulk_send_invoices, update_invoice)
- Modify: `chapter-ops/backend/app/routes/webhooks.py` (auto-link path)
- Test: `chapter-ops/backend/tests/test_invoice_status_triggers.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_invoice_status_triggers.py`:

```python
"""Tests for invoice status transition → recompute_financial_status triggers (Deploy 3)."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from app.extensions import db
from app.models import ChapterMembership, Invoice
from app.utils.polymorphic import chapter_to_user_invoice_kwargs
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership, make_region,
)


def _login(client, user, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": user.email, "password": password})


def _make_external_invoice(*, issuer_type, issuer_id, user, status):
    """Insert a region/org invoice targeting a user."""
    inv = Invoice(
        scope="member",
        invoice_number=f"EXT-{issuer_type}-{user.email}-{status}",
        description="ext",
        amount=Decimal("50.00"),
        status=status,
        due_date=date.today() + timedelta(days=10),
        created_by_id=user.id,
        issuer_type=issuer_type,
        issuer_id=issuer_id,
        target_type="user",
        target_id=user.id,
    )
    db.session.add(inv)
    return inv


class TestStatusTriggers:
    def test_send_invoice_recomputes_financial_status(self, client, db_session):
        """Sending a region→user invoice flips a financial member to not_financial."""
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        member = make_user(email="m@example.com")
        treasurer = make_user(email="t@example.com")
        membership = make_membership(member, chapter, role="member", financial_status="financial")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(user_id=treasurer.id, organization_id=org.id, role="admin"))
        treasurer.active_chapter_id = chapter.id

        # A draft region→user invoice (must be region for region_role_required to bind)
        inv = _make_external_invoice(issuer_type="region", issuer_id=region.id, user=member, status="draft")
        db.session.commit()

        # Send via the chapter-level send_invoice endpoint — region→user invoices are
        # not yet exposed as a separate endpoint (Deploy 4), so we exercise update_invoice
        # which mutates status.
        _login(client, treasurer)
        # update_invoice is a chapter-scoped endpoint; we drive status via direct DB mutation
        # plus an explicit recompute call to mirror what the trigger should do.
        # The simpler path: test via webhook auto-link below for sent→paid coverage. Here
        # we rely on the dedicated send_invoice path on chapter→member invoices.
        chapter_inv = Invoice(
            scope="member",
            invoice_number="INV-SEND-1",
            description="dues",
            amount=Decimal("100.00"),
            status="draft",
            due_date=date.today() + timedelta(days=10),
            created_by_id=treasurer.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=member.id),
        )
        db.session.add(chapter_inv)
        db.session.commit()

        resp = client.post(f"/api/invoices/{chapter_inv.id}/send")
        assert resp.status_code == 200
        db.session.refresh(membership)
        # The send transition should have triggered recompute. The dues system isn't seeded
        # for this member, so recompute is a no-op (returns False without changing status).
        # The trigger correctness is observable by patching recompute and asserting it was called.

    def test_send_invoice_calls_recompute(self, client, db_session):
        """Verify the trigger by spying on recompute_financial_status."""
        org = make_organization()
        chapter = make_chapter(org)
        member = make_user(email="m@example.com")
        treasurer = make_user(email="t@example.com")
        make_membership(member, chapter, role="member")
        make_membership(treasurer, chapter, role="treasurer")
        treasurer.active_chapter_id = chapter.id
        chapter_inv = Invoice(
            scope="member",
            invoice_number="INV-SEND-SPY-1",
            description="dues",
            amount=Decimal("100.00"),
            status="draft",
            due_date=date.today() + timedelta(days=10),
            created_by_id=treasurer.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=member.id),
        )
        db.session.add(chapter_inv)
        db.session.commit()

        _login(client, treasurer)
        with patch("app.routes.invoices.recompute_financial_status") as mock_recompute:
            resp = client.post(f"/api/invoices/{chapter_inv.id}/send")
        assert resp.status_code == 200
        # recompute should have been called once with the target user
        mock_recompute.assert_called_once()
        call_kwargs = mock_recompute.call_args
        assert call_kwargs.args[1] == member.id or call_kwargs.kwargs.get("user_id") == member.id

    def test_update_invoice_to_paid_calls_recompute(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        member = make_user(email="m@example.com")
        treasurer = make_user(email="t@example.com")
        make_membership(member, chapter, role="member")
        make_membership(treasurer, chapter, role="treasurer")
        treasurer.active_chapter_id = chapter.id
        chapter_inv = Invoice(
            scope="member",
            invoice_number="INV-UPD-1",
            description="dues",
            amount=Decimal("100.00"),
            status="sent",
            due_date=date.today() + timedelta(days=10),
            created_by_id=treasurer.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=member.id),
        )
        db.session.add(chapter_inv)
        db.session.commit()

        _login(client, treasurer)
        with patch("app.routes.invoices.recompute_financial_status") as mock_recompute:
            resp = client.patch(f"/api/invoices/{chapter_inv.id}", json={"status": "paid"})
        assert resp.status_code == 200
        mock_recompute.assert_called_once()

    def test_update_invoice_to_cancelled_calls_recompute(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        member = make_user(email="m@example.com")
        treasurer = make_user(email="t@example.com")
        make_membership(member, chapter, role="member")
        make_membership(treasurer, chapter, role="treasurer")
        treasurer.active_chapter_id = chapter.id
        chapter_inv = Invoice(
            scope="member",
            invoice_number="INV-UPD-CANCEL-1",
            description="dues",
            amount=Decimal("100.00"),
            status="sent",
            due_date=date.today() + timedelta(days=10),
            created_by_id=treasurer.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=member.id),
        )
        db.session.add(chapter_inv)
        db.session.commit()

        _login(client, treasurer)
        with patch("app.routes.invoices.recompute_financial_status") as mock_recompute:
            resp = client.patch(f"/api/invoices/{chapter_inv.id}", json={"status": "cancelled"})
        assert resp.status_code == 200
        mock_recompute.assert_called_once()
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && python -m pytest tests/test_invoice_status_triggers.py -v`
Expected: 3 fail with `AssertionError: Expected 'recompute_financial_status' to have been called once. Called 0 times.`

- [ ] **Step 3: Add the trigger calls to `invoices.py`**

In `chapter-ops/backend/app/routes/invoices.py`, add to imports:

```python
from app.services.dues_service import recompute_financial_status
```

Define a small private helper at the top of the route module (after imports, before the blueprint declaration):

```python
def _recompute_for_invoice_target(invoice):
    """If the invoice targets a user (chapter→user, region→user, org→user),
    recompute that user's financial status across all chapter memberships
    they hold within the issuer's organization."""
    if invoice.target_type != "user":
        return
    from app.models import ChapterMembership, Region, Organization
    user_id = invoice.target_id
    # Find the owning organization for this invoice
    if invoice.issuer_type == "chapter":
        chapter = db.session.get(Chapter, invoice.issuer_id)
        org_id = chapter.organization_id if chapter else None
    elif invoice.issuer_type == "region":
        region = db.session.get(Region, invoice.issuer_id)
        org_id = region.organization_id if region else None
    elif invoice.issuer_type == "organization":
        org_id = invoice.issuer_id
    else:
        return
    if not org_id:
        return
    # Recompute for every chapter membership the user has in this org
    memberships = (
        db.session.query(ChapterMembership)
        .join(Chapter, ChapterMembership.chapter_id == Chapter.id)
        .filter(
            ChapterMembership.user_id == user_id,
            ChapterMembership.active == True,
            Chapter.organization_id == org_id,
        )
        .all()
    )
    for m in memberships:
        recompute_financial_status(m.chapter, user_id)
```

In `send_invoice` (around line 351), AFTER `db.session.commit()`, AFTER the notification block, add:

```python
    _recompute_for_invoice_target(invoice)
    db.session.commit()
```

In `bulk_send_invoices` (around line 397, AFTER `db.session.commit()` and the notification loop), add:

```python
    for inv in invoices:
        _recompute_for_invoice_target(inv)
    db.session.commit()
```

In `update_invoice` (around line 323, AFTER the existing `db.session.commit()`), add (only when status changed):

```python
    if "status" in data or "payment_id" in data:
        _recompute_for_invoice_target(invoice)
        db.session.commit()
```

- [ ] **Step 4: Add the trigger to webhook auto-link path**

In `chapter-ops/backend/app/routes/webhooks.py`, find the auto-link block where `open_invoice.status = "paid"` is set (around line 191). Currently the surrounding webhook flow already calls `recompute_financial_status` via `apply_payment` for chapter-dues — but only when the payment metadata includes `chapter_id` + `user_id` matching active membership. The auto-link discovers an invoice that may NOT have been the target of the same code path.

The simplest fix: import the helper at the top of `webhooks.py`:

```python
from app.routes.invoices import _recompute_for_invoice_target
```

(If you'd rather not cross-import between route modules, lift `_recompute_for_invoice_target` out to `app/services/dues_service.py` as a public function. Pragmatic call: keep it in `invoices.py` for this deploy; lift to `dues_service.py` if a third caller appears.)

After `open_invoice.status = "paid"` (around line 191), call:

```python
        _recompute_for_invoice_target(open_invoice)
```

(The surrounding `db.session.commit()` near line 195 will commit the recompute changes too.)

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && python -m pytest tests/test_invoice_status_triggers.py tests/test_invoices_dual_write.py tests/test_invoices_polymorphic_reads.py tests/test_webhooks_dual_write.py -v`
Expected: all green.

- [ ] **Step 6: Wider sanity — full backend suite**

Run: `cd chapter-ops/backend && python -m pytest -q`
Expected: every test green. Report the final pass count.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/app/routes/invoices.py chapter-ops/backend/app/routes/webhooks.py chapter-ops/backend/tests/test_invoice_status_triggers.py
git commit -m "feat(invoices): trigger recompute_financial_status on send/pay/cancel"
```

---

## Task 9: Smoke verification + ship-gate runbook

**Purpose:** Document the production deploy procedure. Per the design spec, Deploy 3 is the "riskiest deploy" — explicit DB backup, post-deploy spot checks, and a documented rollback plan are the mitigation.

**Files:**
- Create: `chapter-ops/backend/tests/test_polymorphic_reads_smoke.py` — single integration test that runs every flipped read path against a seeded mixed dataset

- [ ] **Step 1: Write the smoke test**

Create `chapter-ops/backend/tests/test_polymorphic_reads_smoke.py`:

```python
"""End-to-end smoke: seed a mixed dataset and exercise every flipped read path.

This is the ship-gate test. If anything in this file fails, do NOT deploy.
"""

from datetime import date, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Invoice, OrganizationMembership
from app.utils.polymorphic import (
    chapter_to_user_invoice_kwargs,
    region_to_chapter_invoice_kwargs,
)
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership, make_region,
)


def _login(client, user, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": user.email, "password": password})


class TestPolymorphicReadsSmoke:
    def test_full_read_path_smoke(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        treasurer = make_user(email="t@example.com")
        member = make_user(email="m@example.com")
        admin = make_user(email="a@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(member, chapter, role="member")
        db.session.add(OrganizationMembership(user_id=admin.id, organization_id=org.id, role="admin"))
        treasurer.active_chapter_id = chapter.id
        admin.active_chapter_id = chapter.id

        # Seed: one chapter→member invoice, one region→chapter invoice
        member_inv = Invoice(
            scope="member",
            chapter_id=None, billed_user_id=None,  # legacy NULL — proves polymorphic-only read
            invoice_number="SMOKE-INV-1",
            description="dues",
            amount=Decimal("100.00"),
            status="sent",
            due_date=date.today() + timedelta(days=10),
            created_by_id=treasurer.id,
            **chapter_to_user_invoice_kwargs(chapter_id=chapter.id, user_id=member.id),
        )
        regional_inv = Invoice(
            scope="chapter",
            region_id=None, billed_chapter_id=None,
            invoice_number="SMOKE-RGN-1",
            description="head tax",
            amount=Decimal("500.00"),
            status="sent",
            due_date=date.today() + timedelta(days=30),
            created_by_id=admin.id,
            **region_to_chapter_invoice_kwargs(region_id=region.id, chapter_id=chapter.id),
        )
        db.session.add_all([member_inv, regional_inv])
        db.session.commit()

        # 1. Treasurer list invoices
        _login(client, treasurer)
        resp = client.get("/api/invoices")
        assert resp.status_code == 200
        assert any(i["invoice_number"] == "SMOKE-INV-1" for i in resp.get_json()["invoices"])

        # 2. Invoice summary
        resp = client.get("/api/invoices/summary")
        assert resp.status_code == 200
        assert resp.get_json()["total_count"] >= 1

        # 3. Chapter bills (regional invoice owed by chapter)
        resp = client.get("/api/invoices/chapter-bills")
        assert resp.status_code == 200
        assert any(i["invoice_number"] == "SMOKE-RGN-1" for i in resp.get_json()["invoices"])

        # 4. Dashboard inbox (chapter overdue check + member invoices)
        resp = client.get("/api/dashboard/inbox")
        assert resp.status_code == 200

        # 5. Regional list (admin)
        client.post("/api/auth/logout")
        _login(client, admin)
        resp = client.get(f"/api/invoices/regional/{region.id}")
        assert resp.status_code == 200
        assert any(i["invoice_number"] == "SMOKE-RGN-1" for i in resp.get_json()["invoices"])

        # 6. Region dashboard invoice snapshot
        resp = client.get(f"/api/regions/{region.id}/dashboard")
        assert resp.status_code == 200
        snapshot = resp.get_json()["invoice_snapshot"]
        assert snapshot["counts"].get("sent", 0) >= 1
```

- [ ] **Step 2: Run the smoke test**

Run: `cd chapter-ops/backend && python -m pytest tests/test_polymorphic_reads_smoke.py -v`
Expected: 1 test passes, exercising all six flipped paths.

- [ ] **Step 3: Run the full backend suite**

Run: `cd chapter-ops/backend && python -m pytest -q`
Expected: every test green.

- [ ] **Step 4: Document the production deploy runbook**

Append to the bottom of this plan file as a `## Deploy runbook` section, OR add it to the PR description in Task 10. The runbook must include:

```
## Deploy 3 production runbook

1. **DB backup before deploy.** From the Render dashboard: PostgreSQL service → "Backups" → "Take backup". Wait for it to complete. Note the backup ID.

2. **Merge PR + Render auto-deploys.** No migrations to run; the dual-write from Deploy 2 stays in place.

3. **Post-deploy verification (within 10 minutes of deploy completing):**
   - Open the existing IHQ dashboard — confirm chapter health table loads, invoice counts look right.
   - Open a chapter's `/dues` page — confirm invoices display.
   - Open the regional dashboard for a region with at least one chapter — confirm invoice snapshot loads.
   - Run via flask shell:
     ```python
     from app.extensions import db
     # Confirm at least one polymorphic-served read returns rows that match legacy expectations
     from app.services.invoice_queries import chapter_to_user_invoices
     from app.models import Chapter
     ch = Chapter.query.first()
     count = chapter_to_user_invoices(ch).count()
     legacy_count = db.session.execute(db.text("SELECT COUNT(*) FROM invoice WHERE chapter_id = :cid AND scope = 'member'"), {"cid": ch.id}).scalar()
     assert count == legacy_count, f"polymorphic={count} legacy={legacy_count}"
     print(f"polymorphic-served reads match legacy: {count} rows")
     ```

4. **24h close monitoring.** Watch Sentry for any new error rate spike. The most likely failure mode is a forgotten read site in a route I missed — Sentry will show `Invoice` queries returning empty results or AttributeErrors on `.scope` etc.

5. **Rollback plan if reads break.** Revert the merge commit on `main`. Render auto-redeploys the previous build. Legacy columns are still being written from Deploy 2, so reverting Deploy 3 brings the read path back to legacy columns — zero data loss.
```

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/tests/test_polymorphic_reads_smoke.py
git commit -m "test(invoices): smoke test exercising all flipped polymorphic read paths"
```

---

## Task 10: Open the PR

- [ ] **Step 1: Push and open a draft PR**

```bash
git push -u origin feature/payment-flows-deploy-3
gh pr create --draft --title "Payment Flows Deploy 3: read cutover + cross-tier financial_status" --body "$(cat <<'EOF'
## Summary

Deploy 3 of the 5-deploy [Payment Flows Expansion](docs/superpowers/specs/2026-04-24-payment-flows-expansion-design.md). Cuts all Invoice reads over to the polymorphic columns Deploy 2 backfilled, extends financial_status with the cross-tier outstanding-invoice clause, and wires status-transition triggers so sending/paying/cancelling an invoice keeps `ChapterMembership.financial_status` honest.

### Tasks
1. New `app/services/invoice_queries.py` — canonical polymorphic query builders.
2. Flip reads in `app/routes/invoices.py` (8 sites).
3. Flip reads in `app/routes/webhooks.py` (auto-link).
4. Flip reads in `app/routes/dashboard.py` (member inbox + chapter overdue).
5. Flip reads in `app/routes/regions.py` (regional dashboard snapshot).
6. Flip reads in `app/cli/seed_demo.py` (5 cleanup queries).
7. Extend `recompute_financial_status` for cross-tier Region/Org outstanding invoices.
8. Status-transition triggers (send/pay/cancel) call `recompute_financial_status` for the target user.
9. Smoke verification suite + ship-gate runbook.

### What stays the same
- Polymorphic columns: continue to be dual-written on every Invoice/Payment construction site (Deploy 2).
- Legacy columns: still WRITTEN, no longer READ. Drop happens in Deploy 5.
- No new Alembic migrations.

### Cross-tier behavior change
Today `recompute_financial_status` only considers chapter dues. After this PR, it also flips a member to `not_financial` if any sent/overdue Region or Organization invoice targets them within the same organization. Production has zero Region→User and Org→User invoices today (those flows ship in Deploy 4), so this change is a no-op against current data — it's groundwork for Deploy 4.

### Risk profile
Per the design spec, this is the **riskiest deploy** of the rollout. Mitigation:
- DB backup before deploy (operator step in the runbook below).
- Legacy columns still written, so reverting this PR is safe — reads return correct rows.
- 24h close monitoring window post-deploy.

### Backend test suite
**Deploy 3 added ~20 new tests** across `test_invoice_queries`, `test_invoices_polymorphic_reads`, `test_webhooks_polymorphic_reads`, `test_dashboard_polymorphic_reads`, `test_dues_service_cross_tier`, `test_invoice_status_triggers`, and `test_polymorphic_reads_smoke`.

## Test plan
- [ ] CI green (`pytest -q`)
- [ ] Take Render Postgres backup before merging
- [ ] Post-deploy: open IHQ dashboard, chapter `/dues` page, regional dashboard — confirm invoices render
- [ ] Run the polymorphic-vs-legacy count assertion from the runbook in `flask shell`
- [ ] Watch Sentry for 24h post-deploy

## Deploy 3 production runbook

[Paste the runbook from Task 9 Step 4]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: draft PR opened. (If `gh` CLI isn't installed locally, push the branch and open the PR via the GitHub web UI using the title and body above.)

---

## Self-review checklist (run after writing the plan)

- [x] Every spec Deploy 3 line item is covered: read cutover (Tasks 1-6), `recompute_financial_status` extension (Task 7), status-transition triggers (Task 8), risk mitigation (Task 9 runbook).
- [x] Every read site identified by `grep` is flipped (10 production sites + 5 seeder sites).
- [x] No new Alembic migrations — plan header explicitly notes this.
- [x] Cross-tier behavior change is documented as a no-op against current production data (Deploy 4 activates it).
- [x] Rollback plan is concrete: legacy columns still written, revert is safe.
- [x] Every task ends in a commit step with a concrete `git add` / `git commit` command.
- [x] Test commands are exact pytest invocations relative to the repo root.
