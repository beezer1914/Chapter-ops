# Payment Flows Expansion — Deploy 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill the polymorphic columns on every existing Invoice/Payment row, dual-write those columns on every new row, and bundle three deferred items from Deploy 1's review (Chapter `stripe_account_id` partial-unique index, CHECK constraints on `*_type` columns, audit log on Region/Org Stripe Connect changes). Reads still serve off legacy columns — that flip is Deploy 3.

**Architecture:** Three sequential Alembic migrations chained off the current head `c6e9b3f7a0d2`. Backfill is a single data migration over `invoice` and `payment` (the only tier shipped today is chapter→member and region→chapter, so the mapping is closed-form). Dual-write is centralised in a tiny helper module `app/utils/polymorphic.py` so every Invoice/Payment construction site uses identical key sets — no duplicated string literals scattered across routes. CHECK constraints live in a follow-on migration that runs AFTER backfill, so the check itself acts as a backfill verifier (any typo or stray legacy row left unbackfilled would fail to apply). Audit logging uses an `AuditEvent` row appended on every Stripe Connect mutation at all three tiers.

**Tech Stack:** Flask 3.x, SQLAlchemy 2.x + Alembic, PostgreSQL (SQLite in tests), Stripe Python SDK, pytest.

**Related spec:** [docs/superpowers/specs/2026-04-24-payment-flows-expansion-design.md](../specs/2026-04-24-payment-flows-expansion-design.md)
**Related plan:** [docs/superpowers/plans/2026-04-24-payment-flows-deploy-1.md](2026-04-24-payment-flows-deploy-1.md)

**Current Alembic state:** TWO heads exist in production —
- `c6e9b3f7a0d2` (Deploy 1: Stripe Connect fields on Org/Region, 2026-04-24)
- `cbdffd5a4544` (MFA reset event audit, shipped 2026-04-27)

Both branched from a common ancestor when the MFA work landed in parallel with Deploy 1. Task 1's migration doubles as a merge by revising both heads simultaneously.

**New Alembic chain shipped by this deploy:**

```
c6e9b3f7a0d2  ──┐  (Deploy 1 head)
                ├─→ d2a4c6e8b0f1  backfill polymorphic columns + merge
cbdffd5a4544  ──┘   (MFA head)            │
                                          └── d3b5d7f9a1c2  tighten chapter.stripe_account_id to partial unique
                                                └── d4c6e8a0b2d3  add CHECK constraints on *_type columns
                                                      └── d5e0a7c2f4b6  audit_event table   (new head)
```

**Bundled scope from Deploy 1 final review:**

1. Chapter `stripe_account_id` index is non-unique (`ix_chapter_stripe_account_id` from `c4606ba68c1f`) while Org/Region got partial-unique in `c6e9b3f7a0d2`. Tightening to partial unique here matches the safety guarantee across all three tiers — same Stripe account cannot be linked to two chapters.
2. Polymorphic `*_type` columns are plain `String(20)` with no DB-level guard. A CHECK constraint per column rejects typos (e.g. `'Chapter'` vs `'chapter'`) at write time, in both the backfill migration and any future inserts.
3. Org admins can connect a region's Stripe account via `region_role_required("regional_treasurer")` because the decorator passes org admins through. Behavior is intentional, but add an `AuditEvent` on every Stripe Connect mutation (chapter, region, org) so the trail exists if anything goes sideways.

---

## Task 1: Alembic data migration — backfill polymorphic columns on Invoice and Payment

**Purpose:** Populate `issuer_type`/`issuer_id`/`target_type`/`target_id` on every existing Invoice and `payer_type`/`payer_id`/`receiver_type`/`receiver_id` on every existing Payment, using the existing legacy columns as the source of truth.

**Mapping:**

| Existing row | Polymorphic columns set |
|---|---|
| `Invoice.scope='member'` | `issuer_type='chapter', issuer_id=chapter_id, target_type='user', target_id=billed_user_id` |
| `Invoice.scope='chapter'` | `issuer_type='region', issuer_id=region_id, target_type='chapter', target_id=billed_chapter_id` |
| `Payment` (all rows) | `payer_type='user', payer_id=user_id, receiver_type='chapter', receiver_id=chapter_id` |

**Files:**
- Create: `chapter-ops/backend/migrations/versions/d2a4c6e8b0f1_backfill_polymorphic_columns.py`

- [ ] **Step 1: Create the migration file**

```python
"""backfill polymorphic columns on invoice and payment (also merges MFA chain)

Populates issuer_type/issuer_id/target_type/target_id on invoice and
payer_type/payer_id/receiver_type/receiver_id on payment from the
existing legacy columns. Idempotent — only updates rows where the
polymorphic column is NULL.

Also merges the MFA reset audit chain (cbdffd5a4544) with the Deploy 1
chain (c6e9b3f7a0d2) by listing both as parents.

Revision ID: d2a4c6e8b0f1
Revises: c6e9b3f7a0d2, cbdffd5a4544
Create Date: 2026-04-29 09:00:00.000000

"""
from alembic import op


revision = 'd2a4c6e8b0f1'
down_revision = ('c6e9b3f7a0d2', 'cbdffd5a4544')
branch_labels = None
depends_on = None


def upgrade():
    # Invoice.scope='member' → chapter→user
    op.execute("""
        UPDATE invoice
        SET issuer_type = 'chapter',
            issuer_id   = chapter_id,
            target_type = 'user',
            target_id   = billed_user_id
        WHERE scope = 'member'
          AND issuer_type IS NULL
          AND chapter_id IS NOT NULL
          AND billed_user_id IS NOT NULL
    """)

    # Invoice.scope='chapter' → region→chapter
    op.execute("""
        UPDATE invoice
        SET issuer_type = 'region',
            issuer_id   = region_id,
            target_type = 'chapter',
            target_id   = billed_chapter_id
        WHERE scope = 'chapter'
          AND issuer_type IS NULL
          AND region_id IS NOT NULL
          AND billed_chapter_id IS NOT NULL
    """)

    # Payment → user→chapter
    op.execute("""
        UPDATE payment
        SET payer_type    = 'user',
            payer_id      = user_id,
            receiver_type = 'chapter',
            receiver_id   = chapter_id
        WHERE payer_type IS NULL
          AND user_id IS NOT NULL
          AND chapter_id IS NOT NULL
    """)


def downgrade():
    op.execute("""
        UPDATE invoice
        SET issuer_type = NULL,
            issuer_id   = NULL,
            target_type = NULL,
            target_id   = NULL
    """)
    op.execute("""
        UPDATE payment
        SET payer_type    = NULL,
            payer_id      = NULL,
            receiver_type = NULL,
            receiver_id   = NULL
    """)
```

- [ ] **Step 2: Run the migration locally**

Run: `cd chapter-ops/backend && flask db upgrade`
Expected: `INFO  [alembic.runtime.migration] Running upgrade c6e9b3f7a0d2 -> d2a4c6e8b0f1, backfill polymorphic columns on invoice and payment`

- [ ] **Step 3: Spot-check the backfill**

Run (psql or `flask shell`):
```sql
SELECT scope, COUNT(*) AS rows,
       COUNT(*) FILTER (WHERE issuer_type IS NULL) AS missing_issuer
FROM invoice GROUP BY scope;

SELECT COUNT(*) AS rows,
       COUNT(*) FILTER (WHERE payer_type IS NULL) AS missing_payer
FROM payment;
```
Expected: `missing_issuer = 0` for every scope, `missing_payer = 0`.

- [ ] **Step 4: Verify reversibility**

Run: `cd chapter-ops/backend && flask db downgrade && flask db upgrade`
Expected: clean downgrade to `c6e9b3f7a0d2`, then clean upgrade back to `d2a4c6e8b0f1`.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/migrations/versions/d2a4c6e8b0f1_backfill_polymorphic_columns.py
git commit -m "feat(db): backfill polymorphic columns on invoice and payment"
```

---

## Task 2: Alembic migration — tighten Chapter `stripe_account_id` to partial unique

**Purpose:** Bring Chapter into parity with Organization and Region, both of which got partial-unique indexes on `stripe_account_id` in `c6e9b3f7a0d2`. Same Stripe account can no longer be linked to two chapters.

**Files:**
- Create: `chapter-ops/backend/migrations/versions/d3b5d7f9a1c2_chapter_stripe_account_id_unique.py`

- [ ] **Step 1: Verify no duplicate Stripe account IDs exist on Chapter**

Run (psql or `flask shell`):
```sql
SELECT stripe_account_id, COUNT(*) FROM chapter
WHERE stripe_account_id IS NOT NULL
GROUP BY stripe_account_id HAVING COUNT(*) > 1;
```
Expected: zero rows. If anything returns, escalate before continuing — the migration will fail to apply.

- [ ] **Step 2: Create the migration file**

```python
"""tighten chapter.stripe_account_id to partial unique

Drops the existing non-unique ix_chapter_stripe_account_id and
recreates it as a partial unique index, matching the index shape
already on organization and region (added in c6e9b3f7a0d2).

Revision ID: d3b5d7f9a1c2
Revises: d2a4c6e8b0f1
Create Date: 2026-04-29 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd3b5d7f9a1c2'
down_revision = 'd2a4c6e8b0f1'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index('ix_chapter_stripe_account_id', table_name='chapter')
    op.create_index(
        'uq_chapter_stripe_account_id',
        'chapter',
        ['stripe_account_id'],
        unique=True,
        postgresql_where=sa.text('stripe_account_id IS NOT NULL'),
    )


def downgrade():
    op.drop_index('uq_chapter_stripe_account_id', table_name='chapter')
    op.create_index(
        'ix_chapter_stripe_account_id',
        'chapter',
        ['stripe_account_id'],
        unique=False,
    )
```

- [ ] **Step 3: Run the migration locally**

Run: `cd chapter-ops/backend && flask db upgrade`
Expected: `INFO  [alembic.runtime.migration] Running upgrade d2a4c6e8b0f1 -> d3b5d7f9a1c2, tighten chapter.stripe_account_id to partial unique`

- [ ] **Step 4: Verify reversibility**

Run: `cd chapter-ops/backend && flask db downgrade && flask db upgrade`
Expected: clean roundtrip to `d3b5d7f9a1c2`.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/migrations/versions/d3b5d7f9a1c2_chapter_stripe_account_id_unique.py
git commit -m "feat(db): make chapter.stripe_account_id partial unique (match org/region)"
```

---

## Task 3: Alembic migration — CHECK constraints on polymorphic `*_type` columns

**Purpose:** DB-level guard against typos in the four polymorphic discriminator columns. Runs AFTER backfill so any unbackfilled or malformed row would fail the migration, surfacing data drift loudly.

**Files:**
- Create: `chapter-ops/backend/migrations/versions/d4c6e8a0b2d3_polymorphic_check_constraints.py`

- [ ] **Step 1: Create the migration file**

```python
"""add CHECK constraints on polymorphic *_type columns

invoice.issuer_type     IN (NULL, 'organization', 'region', 'chapter')
invoice.target_type     IN (NULL, 'chapter', 'user')
payment.payer_type      IN (NULL, 'user', 'chapter')
payment.receiver_type   IN (NULL, 'organization', 'region', 'chapter')

NULLs are permitted while legacy columns remain authoritative
(through Deploy 4). NOT NULL is added by Deploy 5's cleanup.

Revision ID: d4c6e8a0b2d3
Revises: d3b5d7f9a1c2
Create Date: 2026-04-29 10:00:00.000000

"""
from alembic import op


revision = 'd4c6e8a0b2d3'
down_revision = 'd3b5d7f9a1c2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('invoice') as batch:
        batch.create_check_constraint(
            'ck_invoice_issuer_type',
            "issuer_type IS NULL OR issuer_type IN ('organization', 'region', 'chapter')",
        )
        batch.create_check_constraint(
            'ck_invoice_target_type',
            "target_type IS NULL OR target_type IN ('chapter', 'user')",
        )

    with op.batch_alter_table('payment') as batch:
        batch.create_check_constraint(
            'ck_payment_payer_type',
            "payer_type IS NULL OR payer_type IN ('user', 'chapter')",
        )
        batch.create_check_constraint(
            'ck_payment_receiver_type',
            "receiver_type IS NULL OR receiver_type IN ('organization', 'region', 'chapter')",
        )


def downgrade():
    with op.batch_alter_table('payment') as batch:
        batch.drop_constraint('ck_payment_receiver_type', type_='check')
        batch.drop_constraint('ck_payment_payer_type', type_='check')

    with op.batch_alter_table('invoice') as batch:
        batch.drop_constraint('ck_invoice_target_type', type_='check')
        batch.drop_constraint('ck_invoice_issuer_type', type_='check')
```

- [ ] **Step 2: Run the migration locally**

Run: `cd chapter-ops/backend && flask db upgrade`
Expected: `INFO  [alembic.runtime.migration] Running upgrade d3b5d7f9a1c2 -> d4c6e8a0b2d3, add CHECK constraints on polymorphic *_type columns`

- [ ] **Step 3: Verify the constraint rejects bad writes**

Run (`flask shell`):
```python
from app.extensions import db
db.session.execute(db.text("INSERT INTO invoice (id, scope, invoice_number, description, amount, status, due_date, created_by_id, issuer_type) VALUES ('bad-1', 'member', 'INV-X', 'x', 1, 'draft', '2026-12-31', (SELECT id FROM \"user\" LIMIT 1), 'Chapter')"))
db.session.commit()
```
Expected: `IntegrityError` (or `CheckViolation` on Postgres) referencing `ck_invoice_issuer_type`. Roll back the session.

- [ ] **Step 4: Verify reversibility**

Run: `cd chapter-ops/backend && flask db downgrade && flask db upgrade`
Expected: clean roundtrip to `d4c6e8a0b2d3`.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/migrations/versions/d4c6e8a0b2d3_polymorphic_check_constraints.py
git commit -m "feat(db): add CHECK constraints on polymorphic *_type columns"
```

---

## Task 4: Polymorphic helper module

**Purpose:** Centralise the legal `(issuer, target)` and `(payer, receiver)` shapes in one place so every dual-write site uses identical literals. Preventing drift between routes is the entire point.

**Files:**
- Create: `chapter-ops/backend/app/utils/polymorphic.py`
- Test: `chapter-ops/backend/tests/test_utils_polymorphic.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_utils_polymorphic.py`:

```python
"""Tests for the polymorphic dict-builder helpers."""

from app.utils.polymorphic import (
    chapter_to_user_invoice_kwargs,
    region_to_chapter_invoice_kwargs,
    user_to_chapter_payment_kwargs,
)


class TestPolymorphicHelpers:
    def test_chapter_to_user_invoice_kwargs(self):
        result = chapter_to_user_invoice_kwargs(chapter_id="c-1", user_id="u-1")
        assert result == {
            "issuer_type": "chapter",
            "issuer_id": "c-1",
            "target_type": "user",
            "target_id": "u-1",
        }

    def test_region_to_chapter_invoice_kwargs(self):
        result = region_to_chapter_invoice_kwargs(region_id="r-1", chapter_id="c-1")
        assert result == {
            "issuer_type": "region",
            "issuer_id": "r-1",
            "target_type": "chapter",
            "target_id": "c-1",
        }

    def test_user_to_chapter_payment_kwargs(self):
        result = user_to_chapter_payment_kwargs(user_id="u-1", chapter_id="c-1")
        assert result == {
            "payer_type": "user",
            "payer_id": "u-1",
            "receiver_type": "chapter",
            "receiver_id": "c-1",
        }
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_utils_polymorphic.py -v`
Expected: `ImportError: cannot import name 'chapter_to_user_invoice_kwargs' from 'app.utils.polymorphic'`

- [ ] **Step 3: Implement the helper module**

Create `chapter-ops/backend/app/utils/polymorphic.py`:

```python
"""Builder helpers for polymorphic Invoice and Payment column sets.

Every Invoice/Payment construction site must use these helpers rather
than spelling out string literals like 'chapter' or 'user' inline. This
keeps the legal (issuer, target) and (payer, receiver) tuples in one
place and prevents drift across routes.
"""


def chapter_to_user_invoice_kwargs(*, chapter_id: str, user_id: str) -> dict:
    """Polymorphic kwargs for a chapter→member dues invoice."""
    return {
        "issuer_type": "chapter",
        "issuer_id": chapter_id,
        "target_type": "user",
        "target_id": user_id,
    }


def region_to_chapter_invoice_kwargs(*, region_id: str, chapter_id: str) -> dict:
    """Polymorphic kwargs for a region→chapter head-tax invoice."""
    return {
        "issuer_type": "region",
        "issuer_id": region_id,
        "target_type": "chapter",
        "target_id": chapter_id,
    }


def user_to_chapter_payment_kwargs(*, user_id: str, chapter_id: str) -> dict:
    """Polymorphic kwargs for a member-paid, chapter-received Payment."""
    return {
        "payer_type": "user",
        "payer_id": user_id,
        "receiver_type": "chapter",
        "receiver_id": chapter_id,
    }
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_utils_polymorphic.py -v`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/utils/polymorphic.py chapter-ops/backend/tests/test_utils_polymorphic.py
git commit -m "feat(utils): add polymorphic kwargs builder helpers"
```

---

## Task 5: Dual-write — chapter→member invoice routes

**Purpose:** Every new chapter→member Invoice row writes both legacy and polymorphic columns. Two construction sites: `create_invoice` (single) and `bulk_create_invoices` (batch).

**Files:**
- Modify: `chapter-ops/backend/app/routes/invoices.py:138-150` and `chapter-ops/backend/app/routes/invoices.py:217-229`
- Test: `chapter-ops/backend/tests/test_invoices_dual_write.py` (new)

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_invoices_dual_write.py`:

```python
"""Tests asserting Invoice routes dual-write polymorphic columns (Deploy 2)."""

from datetime import date, timedelta
from decimal import Decimal

from app.extensions import db
from app.models import Invoice
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_region, login,
)


class TestChapterMemberInvoiceDualWrite:
    def test_create_invoice_dual_writes_polymorphic_columns(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        member = make_user(email="m@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(member, chapter, role="member")
        db.session.commit()

        login(client, treasurer)
        due = (date.today() + timedelta(days=30)).isoformat()
        resp = client.post("/api/invoices", json={
            "billed_user_id": member.id,
            "amount": "100.00",
            "description": "Spring dues",
            "due_date": due,
        })
        assert resp.status_code == 201
        inv_id = resp.get_json()["id"]

        inv = db.session.get(Invoice, inv_id)
        # Legacy columns still populated
        assert inv.scope == "member"
        assert inv.chapter_id == chapter.id
        assert inv.billed_user_id == member.id
        # Polymorphic columns dual-written
        assert inv.issuer_type == "chapter"
        assert inv.issuer_id == chapter.id
        assert inv.target_type == "user"
        assert inv.target_id == member.id

    def test_bulk_create_invoices_dual_writes(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        m1 = make_user(email="m1@example.com")
        m2 = make_user(email="m2@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(m1, chapter, role="member")
        make_membership(m2, chapter, role="member")
        db.session.commit()

        login(client, treasurer)
        due = (date.today() + timedelta(days=30)).isoformat()
        resp = client.post("/api/invoices/bulk", json={
            "user_ids": [m1.id, m2.id],
            "amount": "100.00",
            "description": "Spring dues",
            "due_date": due,
        })
        assert resp.status_code == 201
        assert resp.get_json()["count"] == 2

        invs = Invoice.query.filter(
            Invoice.billed_user_id.in_([m1.id, m2.id])
        ).all()
        assert len(invs) == 2
        for inv in invs:
            assert inv.issuer_type == "chapter"
            assert inv.issuer_id == chapter.id
            assert inv.target_type == "user"
            assert inv.target_id == inv.billed_user_id
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && pytest tests/test_invoices_dual_write.py::TestChapterMemberInvoiceDualWrite -v`
Expected: 2 tests fail with `AssertionError: assert None == 'chapter'` (polymorphic columns are still NULL because routes only write legacy columns today).

- [ ] **Step 3: Add the dual-write to `create_invoice`**

In `chapter-ops/backend/app/routes/invoices.py`:

Replace the `Invoice(...)` block at lines 138-150:
```python
    invoice = Invoice(
        scope="member",
        chapter_id=chapter.id,
        billed_user_id=data["billed_user_id"],
        fee_type_id=data.get("fee_type_id"),
        invoice_number=_generate_invoice_number("member"),
        description=data["description"],
        amount=amount,
        status="draft",
        due_date=due,
        notes=data.get("notes"),
        created_by_id=current_user.id,
    )
```

with:
```python
    invoice = Invoice(
        scope="member",
        chapter_id=chapter.id,
        billed_user_id=data["billed_user_id"],
        fee_type_id=data.get("fee_type_id"),
        invoice_number=_generate_invoice_number("member"),
        description=data["description"],
        amount=amount,
        status="draft",
        due_date=due,
        notes=data.get("notes"),
        created_by_id=current_user.id,
        **chapter_to_user_invoice_kwargs(
            chapter_id=chapter.id, user_id=data["billed_user_id"],
        ),
    )
```

Add to the imports at the top of the file (after `from app.utils.permissions import enforce_module_access`):
```python
from app.utils.polymorphic import (
    chapter_to_user_invoice_kwargs,
    region_to_chapter_invoice_kwargs,
)
```

- [ ] **Step 4: Add the dual-write to `bulk_create_invoices`**

In `chapter-ops/backend/app/routes/invoices.py`, replace the `Invoice(...)` block at lines 217-229 (inside the `for i, m in enumerate(members):` loop):
```python
            inv = Invoice(
                scope="member",
                chapter_id=chapter.id,
                billed_user_id=m.user_id,
                fee_type_id=data.get("fee_type_id"),
                invoice_number=f"INV-{year}-{base_seq + i:04d}",
                description=data["description"],
                amount=amount,
                status="draft",
                due_date=due,
                notes=data.get("notes"),
                created_by_id=current_user.id,
            )
```

with:
```python
            inv = Invoice(
                scope="member",
                chapter_id=chapter.id,
                billed_user_id=m.user_id,
                fee_type_id=data.get("fee_type_id"),
                invoice_number=f"INV-{year}-{base_seq + i:04d}",
                description=data["description"],
                amount=amount,
                status="draft",
                due_date=due,
                notes=data.get("notes"),
                created_by_id=current_user.id,
                **chapter_to_user_invoice_kwargs(
                    chapter_id=chapter.id, user_id=m.user_id,
                ),
            )
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && pytest tests/test_invoices_dual_write.py::TestChapterMemberInvoiceDualWrite -v`
Expected: 2 tests pass.

- [ ] **Step 6: Run the full invoice test suite to confirm no regression**

Run: `cd chapter-ops/backend && pytest tests/test_invoice_model_polymorphic.py tests/test_invoices_dual_write.py -v`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/app/routes/invoices.py chapter-ops/backend/tests/test_invoices_dual_write.py
git commit -m "feat(invoices): dual-write polymorphic columns on chapter→member create paths"
```

---

## Task 6: Dual-write — region→chapter invoice routes

**Purpose:** Every new region→chapter Invoice row dual-writes. Two construction sites: `create_regional_invoice` and `bulk_create_regional_invoices`.

**Files:**
- Modify: `chapter-ops/backend/app/routes/invoices.py:563-576` and `chapter-ops/backend/app/routes/invoices.py:638-651`
- Test: `chapter-ops/backend/tests/test_invoices_dual_write.py` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `chapter-ops/backend/tests/test_invoices_dual_write.py`:

```python
class TestRegionChapterInvoiceDualWrite:
    def test_create_regional_invoice_dual_writes(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        m1 = make_user(email="m1@example.com")
        regional_treasurer = make_user(email="rt@example.com")
        make_membership(m1, chapter, role="member")
        # Make regional_treasurer an org admin so region_role_required passes
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(
            user_id=regional_treasurer.id, organization_id=org.id, role="admin"
        ))
        db.session.commit()

        login(client, regional_treasurer)
        due = (date.today() + timedelta(days=30)).isoformat()
        resp = client.post(f"/api/invoices/regional/{region.id}", json={
            "billed_chapter_id": chapter.id,
            "amount": "500.00",
            "description": "Q2 head tax",
            "due_date": due,
        })
        assert resp.status_code == 201
        inv_id = resp.get_json()["id"]

        inv = db.session.get(Invoice, inv_id)
        assert inv.scope == "chapter"
        assert inv.region_id == region.id
        assert inv.billed_chapter_id == chapter.id
        # Polymorphic columns dual-written
        assert inv.issuer_type == "region"
        assert inv.issuer_id == region.id
        assert inv.target_type == "chapter"
        assert inv.target_id == chapter.id

    def test_bulk_create_regional_invoices_dual_writes(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        ch1 = make_chapter(org, region=region, name="Alpha")
        ch2 = make_chapter(org, region=region, name="Beta")
        m1 = make_user(email="a@example.com")
        m2 = make_user(email="b@example.com")
        regional_treasurer = make_user(email="rt@example.com")
        make_membership(m1, ch1, role="member")
        make_membership(m2, ch2, role="member")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(
            user_id=regional_treasurer.id, organization_id=org.id, role="admin"
        ))
        db.session.commit()

        login(client, regional_treasurer)
        due = (date.today() + timedelta(days=30)).isoformat()
        resp = client.post(f"/api/invoices/regional/{region.id}/bulk", json={
            "per_member_rate": "50.00",
            "description": "Q2 head tax",
            "due_date": due,
        })
        assert resp.status_code == 201
        assert resp.get_json()["count"] == 2

        invs = Invoice.query.filter(
            Invoice.billed_chapter_id.in_([ch1.id, ch2.id])
        ).all()
        assert len(invs) == 2
        for inv in invs:
            assert inv.issuer_type == "region"
            assert inv.issuer_id == region.id
            assert inv.target_type == "chapter"
            assert inv.target_id == inv.billed_chapter_id
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && pytest tests/test_invoices_dual_write.py::TestRegionChapterInvoiceDualWrite -v`
Expected: 2 tests fail (polymorphic columns NULL).

- [ ] **Step 3: Add the dual-write to `create_regional_invoice`**

In `chapter-ops/backend/app/routes/invoices.py`, replace the `Invoice(...)` block at lines 563-576:
```python
    invoice = Invoice(
        scope="chapter",
        region_id=region.id,
        billed_chapter_id=chapter.id,
        per_member_rate=rate,
        member_count=member_count,
        invoice_number=_generate_invoice_number("chapter"),
        description=data["description"],
        amount=amount,
        status="draft",
        due_date=due,
        notes=data.get("notes"),
        created_by_id=current_user.id,
    )
```

with:
```python
    invoice = Invoice(
        scope="chapter",
        region_id=region.id,
        billed_chapter_id=chapter.id,
        per_member_rate=rate,
        member_count=member_count,
        invoice_number=_generate_invoice_number("chapter"),
        description=data["description"],
        amount=amount,
        status="draft",
        due_date=due,
        notes=data.get("notes"),
        created_by_id=current_user.id,
        **region_to_chapter_invoice_kwargs(
            region_id=region.id, chapter_id=chapter.id,
        ),
    )
```

- [ ] **Step 4: Add the dual-write to `bulk_create_regional_invoices`**

In `chapter-ops/backend/app/routes/invoices.py`, replace the `Invoice(...)` block at lines 638-651 (inside the `for i, (ch, member_count) in enumerate(eligible):` loop):
```python
            inv = Invoice(
                scope="chapter",
                region_id=region.id,
                billed_chapter_id=ch.id,
                per_member_rate=rate,
                member_count=member_count,
                invoice_number=f"RGN-{year}-{base_seq + i:04d}",
                description=data["description"],
                amount=rate * member_count,
                status="draft",
                due_date=due,
                notes=data.get("notes"),
                created_by_id=current_user.id,
            )
```

with:
```python
            inv = Invoice(
                scope="chapter",
                region_id=region.id,
                billed_chapter_id=ch.id,
                per_member_rate=rate,
                member_count=member_count,
                invoice_number=f"RGN-{year}-{base_seq + i:04d}",
                description=data["description"],
                amount=rate * member_count,
                status="draft",
                due_date=due,
                notes=data.get("notes"),
                created_by_id=current_user.id,
                **region_to_chapter_invoice_kwargs(
                    region_id=region.id, chapter_id=ch.id,
                ),
            )
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && pytest tests/test_invoices_dual_write.py -v`
Expected: 4 tests pass (2 from Task 5 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/routes/invoices.py chapter-ops/backend/tests/test_invoices_dual_write.py
git commit -m "feat(invoices): dual-write polymorphic columns on region→chapter create paths"
```

---

## Task 7: Dual-write — Payment in Stripe webhook

**Purpose:** Every Payment created from a Stripe Checkout success dual-writes the polymorphic payer/receiver pair.

**Files:**
- Modify: `chapter-ops/backend/app/routes/webhooks.py:131-141`
- Test: `chapter-ops/backend/tests/test_webhooks_dual_write.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_webhooks_dual_write.py`:

```python
"""Tests asserting Stripe webhook Payment creation dual-writes (Deploy 2)."""

from decimal import Decimal
from unittest.mock import patch

from app.extensions import db
from app.models import Payment
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
)


class TestWebhookPaymentDualWrite:
    def _build_event(self, chapter, user, session_id="cs_test_dualwrite_1"):
        return {
            "type": "checkout.session.completed",
            "account": chapter.stripe_account_id,
            "data": {
                "object": {
                    "id": session_id,
                    "amount_total": 10000,  # $100.00
                    "metadata": {
                        "payment_type": "one-time",
                        "chapter_id": chapter.id,
                        "user_id": user.id,
                    },
                },
            },
        }

    def test_webhook_payment_dual_writes(self, client, db_session, app):
        org = make_organization()
        chapter = make_chapter(org)
        chapter.stripe_account_id = "acct_test_chapter_1"
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        event = self._build_event(chapter, user)
        with patch("stripe.Webhook.construct_event", return_value=event):
            resp = client.post(
                "/webhook",
                data=b"{}",
                headers={"Stripe-Signature": "test"},
            )
        assert resp.status_code == 200

        payment = Payment.query.filter_by(stripe_session_id="cs_test_dualwrite_1").first()
        assert payment is not None
        # Legacy
        assert payment.chapter_id == chapter.id
        assert payment.user_id == user.id
        assert payment.amount == Decimal("100.00")
        # Polymorphic dual-written
        assert payment.payer_type == "user"
        assert payment.payer_id == user.id
        assert payment.receiver_type == "chapter"
        assert payment.receiver_id == chapter.id
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_webhooks_dual_write.py -v`
Expected: 1 test fails with `AssertionError: assert None == 'user'`.

- [ ] **Step 3: Add the dual-write to `_create_payment_from_session`**

In `chapter-ops/backend/app/routes/webhooks.py`, replace the `Payment(...)` block at lines 131-141:
```python
    payment = Payment(
        chapter_id=chapter_id,
        user_id=user_id,
        amount=amount,
        payment_type=payment_type,
        method="stripe",
        stripe_session_id=session_id,
        fee_type_id=metadata.get("fee_type_id") or None,
        plan_id=plan_id,
        notes=metadata.get("notes") or None,
    )
```

with:
```python
    payment = Payment(
        chapter_id=chapter_id,
        user_id=user_id,
        amount=amount,
        payment_type=payment_type,
        method="stripe",
        stripe_session_id=session_id,
        fee_type_id=metadata.get("fee_type_id") or None,
        plan_id=plan_id,
        notes=metadata.get("notes") or None,
        **user_to_chapter_payment_kwargs(
            user_id=user_id, chapter_id=chapter_id,
        ),
    )
```

Add to the imports at the top of the file (after `from app.models.event import EventAttendance`):
```python
from app.utils.polymorphic import user_to_chapter_payment_kwargs
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_webhooks_dual_write.py -v`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/webhooks.py chapter-ops/backend/tests/test_webhooks_dual_write.py
git commit -m "feat(webhooks): dual-write polymorphic columns on Stripe-created Payment"
```

---

## Task 8: Dual-write — manual Payment route + demo seeder

**Purpose:** Cover the two remaining Payment construction sites: `payments.py:178` (treasurer-recorded manual payment) and `cli/seed_demo.py:475` (demo seeder).

**Files:**
- Modify: `chapter-ops/backend/app/routes/payments.py:178-187`
- Modify: `chapter-ops/backend/app/cli/seed_demo.py:475` (Payment construction)
- Test: `chapter-ops/backend/tests/test_payments_dual_write.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_payments_dual_write.py`:

```python
"""Tests asserting manual Payment route dual-writes (Deploy 2)."""

from app.extensions import db
from app.models import Payment
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership, login,
)


class TestManualPaymentDualWrite:
    def test_manual_payment_dual_writes(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        treasurer = make_user(email="t@example.com")
        member = make_user(email="m@example.com")
        make_membership(treasurer, chapter, role="treasurer")
        make_membership(member, chapter, role="member")
        db.session.commit()

        login(client, treasurer)
        resp = client.post("/api/payments", json={
            "user_id": member.id,
            "amount": "75.00",
            "payment_type": "one-time",
            "method": "cash",
        })
        assert resp.status_code == 201
        payment_id = resp.get_json()["payment"]["id"]

        payment = db.session.get(Payment, payment_id)
        assert payment.chapter_id == chapter.id
        assert payment.user_id == member.id
        # Polymorphic dual-written
        assert payment.payer_type == "user"
        assert payment.payer_id == member.id
        assert payment.receiver_type == "chapter"
        assert payment.receiver_id == chapter.id
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_payments_dual_write.py -v`
Expected: 1 test fails with `AssertionError: assert None == 'user'`.

- [ ] **Step 3: Add the dual-write to the manual Payment route**

In `chapter-ops/backend/app/routes/payments.py`, replace the `Payment(...)` block at lines 178-187:
```python
    payment = Payment(
        chapter_id=chapter.id,
        user_id=data["user_id"],
        amount=amount,
        payment_type=payment_type,
        method=method,
        fee_type_id=fee_type_id or None,
        notes=data.get("notes", "").strip() or None,
        plan_id=plan_id,
    )
```

with:
```python
    payment = Payment(
        chapter_id=chapter.id,
        user_id=data["user_id"],
        amount=amount,
        payment_type=payment_type,
        method=method,
        fee_type_id=fee_type_id or None,
        notes=data.get("notes", "").strip() or None,
        plan_id=plan_id,
        **user_to_chapter_payment_kwargs(
            user_id=data["user_id"], chapter_id=chapter.id,
        ),
    )
```

Add to the imports at the top of `payments.py`:
```python
from app.utils.polymorphic import user_to_chapter_payment_kwargs
```

- [ ] **Step 4: Update the demo seeder**

In `chapter-ops/backend/app/cli/seed_demo.py`, find the `payment = Payment(...)` construction at line 475 and add the same `**user_to_chapter_payment_kwargs(...)` spread plus the import. The seeder is non-test code; it should still produce dual-written rows so `flask seed-demo` doesn't generate inconsistent data.

Add to the imports at the top of `seed_demo.py`:
```python
from app.utils.polymorphic import user_to_chapter_payment_kwargs
```

Add to the `Payment(...)` construction:
```python
                **user_to_chapter_payment_kwargs(
                    user_id=member.id, chapter_id=chapter.id,
                ),
```

(Use the actual variable names that exist in the surrounding seeder loop — `member.id` and `chapter.id` are illustrative; verify against the file.)

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_payments_dual_write.py tests/test_payments.py -v`
Expected: new test passes; existing payment tests still green.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/routes/payments.py chapter-ops/backend/app/cli/seed_demo.py chapter-ops/backend/tests/test_payments_dual_write.py
git commit -m "feat(payments): dual-write polymorphic columns on manual payments and demo seeder"
```

---

## Task 9: Audit log — Stripe Connect mutations across all three tiers

**Purpose:** Address Deploy 1 review item #3. Org admins can connect a region's Stripe account via the `region_role_required` org-admin passthrough — intentional but worth a paper trail. Add an `AuditEvent` on every Stripe Connect mutation at chapter, region, and org tiers (connect, callback, disconnect).

**Files:**
- Create: `chapter-ops/backend/app/models/audit_event.py`
- Create: `chapter-ops/backend/migrations/versions/d5e0a7c2f4b6_add_audit_event_table.py`
- Modify: `chapter-ops/backend/app/models/__init__.py`
- Modify: `chapter-ops/backend/app/routes/stripe_connect.py` (chapter)
- Modify: `chapter-ops/backend/app/routes/stripe_connect_region.py`
- Modify: `chapter-ops/backend/app/routes/stripe_connect_org.py`
- Test: `chapter-ops/backend/tests/test_stripe_connect_audit.py` (new)

- [ ] **Step 1: Create the AuditEvent model**

Create `chapter-ops/backend/app/models/audit_event.py`:

```python
"""AuditEvent — append-only log of security-relevant mutations.

Currently used by Stripe Connect routes to record connect/disconnect
events at chapter, region, and organization tiers. Designed to grow
into other security-sensitive flows over time.
"""

from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db
from app.models.base import BaseModel


class AuditEvent(BaseModel):
    __tablename__ = "audit_event"

    actor_user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(
        db.String(64), nullable=False, index=True
    )
    target_type: Mapped[str] = mapped_column(db.String(20), nullable=False)
    target_id: Mapped[str] = mapped_column(db.String(36), nullable=False)
    details: Mapped[dict] = mapped_column(db.JSON, nullable=False, default=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "actor_user_id": self.actor_user_id,
            "event_type": self.event_type,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "details": self.details,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
```

- [ ] **Step 2: Add the model to the package exports**

In `chapter-ops/backend/app/models/__init__.py`, add:
```python
from app.models.audit_event import AuditEvent  # noqa: F401
```

(Place it alphabetically with the other model imports, matching the pattern of nearby imports.)

- [ ] **Step 3: Create the Alembic migration**

Create `chapter-ops/backend/migrations/versions/d5e0a7c2f4b6_add_audit_event_table.py`:

```python
"""add audit_event table

Append-only log of security-relevant mutations. Used immediately by
Stripe Connect routes; designed to grow.

Revision ID: d5e0a7c2f4b6
Revises: d4c6e8a0b2d3
Create Date: 2026-04-29 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd5e0a7c2f4b6'
down_revision = 'd4c6e8a0b2d3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_event',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('actor_user_id', sa.String(36), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('event_type', sa.String(64), nullable=False),
        sa.Column('target_type', sa.String(20), nullable=False),
        sa.Column('target_id', sa.String(36), nullable=False),
        sa.Column('details', sa.JSON, nullable=False),
    )
    op.create_index('ix_audit_event_actor_user_id', 'audit_event', ['actor_user_id'])
    op.create_index('ix_audit_event_event_type', 'audit_event', ['event_type'])
    op.create_index(
        'ix_audit_event_target',
        'audit_event',
        ['target_type', 'target_id'],
    )


def downgrade():
    op.drop_index('ix_audit_event_target', table_name='audit_event')
    op.drop_index('ix_audit_event_event_type', table_name='audit_event')
    op.drop_index('ix_audit_event_actor_user_id', table_name='audit_event')
    op.drop_table('audit_event')
```

- [ ] **Step 4: Run the migration**

Run: `cd chapter-ops/backend && flask db upgrade`
Expected: `INFO  [alembic.runtime.migration] Running upgrade d4c6e8a0b2d3 -> d5e0a7c2f4b6, add audit_event table`

- [ ] **Step 5: Write the failing audit-log test**

Create `chapter-ops/backend/tests/test_stripe_connect_audit.py`:

```python
"""Tests asserting AuditEvent rows are written on Stripe Connect mutations."""

from unittest.mock import patch

from app.extensions import db
from app.models import AuditEvent
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_region, login,
)


class TestStripeConnectAudit:
    def test_chapter_connect_writes_audit_event(self, client, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        president = make_user(email="p@example.com")
        make_membership(president, chapter, role="president")
        db.session.commit()

        login(client, president)
        # exchange_oauth_code returns the stripe_account_id string directly.
        # Patch it where it's imported by the route, not at the service module.
        with patch(
            "app.routes.stripe_connect.exchange_oauth_code",
            return_value="acct_test_aaa",
        ):
            client.get("/api/stripe/callback?code=ac_test&state=ignored")

        events = AuditEvent.query.filter_by(
            event_type="stripe_connect.chapter.connect",
            target_id=chapter.id,
        ).all()
        assert len(events) == 1
        assert events[0].actor_user_id == president.id
        assert events[0].target_type == "chapter"
        assert events[0].details.get("stripe_account_id") == "acct_test_aaa"

    def test_region_connect_by_org_admin_writes_audit_event(self, client, db_session):
        org = make_organization()
        region = make_region(org)
        admin = make_user(email="a@example.com")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(
            user_id=admin.id, organization_id=org.id, role="admin",
        ))
        db.session.commit()

        login(client, admin)
        with patch(
            "app.routes.stripe_connect_region.exchange_oauth_code",
            return_value="acct_test_region_1",
        ):
            client.get(
                f"/api/stripe/region/{region.id}/callback"
                "?code=ac_test&state=ignored"
            )

        events = AuditEvent.query.filter_by(
            event_type="stripe_connect.region.connect",
            target_id=region.id,
        ).all()
        assert len(events) == 1
        assert events[0].actor_user_id == admin.id
        assert events[0].target_type == "region"

    def test_org_connect_writes_audit_event(self, client, db_session):
        org = make_organization()
        admin = make_user(email="a@example.com")
        from app.models import OrganizationMembership
        db.session.add(OrganizationMembership(
            user_id=admin.id, organization_id=org.id, role="admin",
        ))
        db.session.commit()

        login(client, admin)
        with patch(
            "app.routes.stripe_connect_org.exchange_oauth_code",
            return_value="acct_test_org_1",
        ):
            client.get(
                f"/api/stripe/org/{org.id}/callback"
                "?code=ac_test&state=ignored"
            )

        events = AuditEvent.query.filter_by(
            event_type="stripe_connect.organization.connect",
            target_id=org.id,
        ).all()
        assert len(events) == 1
        assert events[0].actor_user_id == admin.id
        assert events[0].target_type == "organization"
```

- [ ] **Step 6: Run the tests and verify they fail**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_audit.py -v`
Expected: 3 tests fail (`AuditEvent.query` returns 0 rows because no route writes audit events yet).

- [ ] **Step 7: Add a small audit helper**

Create `chapter-ops/backend/app/utils/audit.py`:

```python
"""Append-only audit logging helper.

Wraps AuditEvent creation in a single call so route handlers can record
security-relevant events without spelling out boilerplate. Caller is
responsible for db.session.commit() as part of the surrounding
transaction.
"""

from flask_login import current_user

from app.extensions import db
from app.models import AuditEvent


def record_audit(
    *,
    event_type: str,
    target_type: str,
    target_id: str,
    details: dict | None = None,
) -> AuditEvent:
    """Append a row to audit_event. Does not commit.

    Reads the actor from flask_login.current_user when authenticated; falls
    back to None for unauthenticated callers (e.g. callback hits where the
    session was lost — record the attempt anyway).
    """
    actor_id = (
        current_user.id
        if hasattr(current_user, "id") and current_user.is_authenticated
        else None
    )
    event = AuditEvent(
        actor_user_id=actor_id,
        event_type=event_type,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
    )
    db.session.add(event)
    return event
```

- [ ] **Step 8: Hook the helper into all three Stripe Connect callback routes**

**`chapter-ops/backend/app/routes/stripe_connect.py`** — add to the imports:
```python
from app.utils.audit import record_audit
```

Inside the `callback` route, the line `chapter.stripe_account_id = stripe_account_id` lives at line 90. Immediately AFTER that line and BEFORE the `db.session.commit()` further down, add:
```python
    record_audit(
        event_type="stripe_connect.chapter.connect",
        target_type="chapter",
        target_id=chapter.id,
        details={"stripe_account_id": stripe_account_id},
    )
```

Inside the `disconnect` route, the line `chapter.stripe_account_id = None` lives at line 155. Immediately BEFORE that line (so the previous account ID is still readable), add:
```python
    previous_account_id = chapter.stripe_account_id
    record_audit(
        event_type="stripe_connect.chapter.disconnect",
        target_type="chapter",
        target_id=chapter.id,
        details={"stripe_account_id": previous_account_id},
    )
```

**`chapter-ops/backend/app/routes/stripe_connect_region.py`** — same import. The connect happens at line 81 (`region.stripe_account_id = stripe_account_id`), disconnect at line 133 (`region.stripe_account_id = None`). Use `event_type="stripe_connect.region.connect"` / `"stripe_connect.region.disconnect"`, `target_type="region"`, `target_id=region.id`.

**`chapter-ops/backend/app/routes/stripe_connect_org.py`** — same import. The connect happens at line 82 (`org.stripe_account_id = stripe_account_id`), disconnect at line 136 (`org.stripe_account_id = None`). Use `event_type="stripe_connect.organization.connect"` / `"stripe_connect.organization.disconnect"`, `target_type="organization"`, `target_id=org.id`.

- [ ] **Step 9: Run the tests and verify they pass**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_audit.py -v`
Expected: 3 tests pass.

- [ ] **Step 10: Commit**

```bash
git add chapter-ops/backend/app/models/audit_event.py chapter-ops/backend/app/models/__init__.py chapter-ops/backend/app/utils/audit.py chapter-ops/backend/migrations/versions/d5e0a7c2f4b6_add_audit_event_table.py chapter-ops/backend/app/routes/stripe_connect.py chapter-ops/backend/app/routes/stripe_connect_region.py chapter-ops/backend/app/routes/stripe_connect_org.py chapter-ops/backend/tests/test_stripe_connect_audit.py
git commit -m "feat(audit): record AuditEvent on Stripe Connect mutations across all three tiers"
```

---

## Task 10: Backfill verification + ship-gate

**Purpose:** Final correctness check before merging. Run the migration chain on a fresh DB seeded with legacy rows, assert backfill populated polymorphic columns, and run the full backend test suite.

**Files:**
- Create: `chapter-ops/backend/tests/test_backfill_polymorphic.py` (new)

- [ ] **Step 1: Write the backfill verification test**

Create `chapter-ops/backend/tests/test_backfill_polymorphic.py`:

```python
"""End-to-end check: legacy rows exist → migration runs → polymorphic columns populated."""

from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models import Invoice, Payment
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_region,
)


class TestBackfillPolymorphic:
    def test_invoice_member_scope_backfilled(self, app, db_session):
        """Legacy chapter→member invoice gets polymorphic columns when
        inserted with explicit NULL polymorphic columns and the backfill
        SQL is run against it."""
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="treasurer")
        db.session.commit()

        # Simulate a legacy row written before Deploy 1
        inv = Invoice(
            scope="member",
            chapter_id=chapter.id,
            billed_user_id=user.id,
            invoice_number="INV-LEGACY-1",
            description="Legacy",
            amount=Decimal("10.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
        )
        db.session.add(inv)
        db.session.commit()
        assert inv.issuer_type is None  # legacy shape

        # Run the backfill SQL by hand
        db.session.execute(db.text("""
            UPDATE invoice
            SET issuer_type = 'chapter', issuer_id = chapter_id,
                target_type = 'user', target_id = billed_user_id
            WHERE scope = 'member' AND issuer_type IS NULL
        """))
        db.session.commit()

        db.session.refresh(inv)
        assert inv.issuer_type == "chapter"
        assert inv.issuer_id == chapter.id
        assert inv.target_type == "user"
        assert inv.target_id == user.id

    def test_invoice_chapter_scope_backfilled(self, app, db_session):
        org = make_organization()
        region = make_region(org)
        chapter = make_chapter(org, region=region)
        user = make_user()
        db.session.commit()

        inv = Invoice(
            scope="chapter",
            region_id=region.id,
            billed_chapter_id=chapter.id,
            invoice_number="RGN-LEGACY-1",
            description="Legacy head tax",
            amount=Decimal("100.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
        )
        db.session.add(inv)
        db.session.commit()
        assert inv.issuer_type is None

        db.session.execute(db.text("""
            UPDATE invoice
            SET issuer_type = 'region', issuer_id = region_id,
                target_type = 'chapter', target_id = billed_chapter_id
            WHERE scope = 'chapter' AND issuer_type IS NULL
        """))
        db.session.commit()
        db.session.refresh(inv)
        assert inv.issuer_type == "region"
        assert inv.issuer_id == region.id
        assert inv.target_type == "chapter"
        assert inv.target_id == chapter.id

    def test_payment_backfilled(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        p = Payment(
            chapter_id=chapter.id,
            user_id=user.id,
            amount=Decimal("50.00"),
            payment_type="one-time",
            method="cash",
        )
        db.session.add(p)
        db.session.commit()
        assert p.payer_type is None

        db.session.execute(db.text("""
            UPDATE payment
            SET payer_type = 'user', payer_id = user_id,
                receiver_type = 'chapter', receiver_id = chapter_id
            WHERE payer_type IS NULL
        """))
        db.session.commit()
        db.session.refresh(p)
        assert p.payer_type == "user"
        assert p.payer_id == user.id
        assert p.receiver_type == "chapter"
        assert p.receiver_id == chapter.id
```

- [ ] **Step 2: Run the backfill verification suite**

Run: `cd chapter-ops/backend && pytest tests/test_backfill_polymorphic.py -v`
Expected: 3 tests pass.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd chapter-ops/backend && pytest -q`
Expected: every test green. Deploy 1 left ~331 tests; this deploy adds approximately 12-15 new tests across `test_utils_polymorphic`, `test_invoices_dual_write`, `test_webhooks_dual_write`, `test_payments_dual_write`, `test_stripe_connect_audit`, and `test_backfill_polymorphic`.

- [ ] **Step 4: Production spot-check checklist (perform after deploy)**

Run via `flask shell` against the production database AFTER `flask db upgrade` completes on Render:

```python
from app.extensions import db
print(db.session.execute(db.text("""
    SELECT scope, COUNT(*) AS rows,
           COUNT(*) FILTER (WHERE issuer_type IS NULL) AS missing_issuer
    FROM invoice GROUP BY scope
""")).fetchall())

print(db.session.execute(db.text("""
    SELECT COUNT(*) AS rows,
           COUNT(*) FILTER (WHERE payer_type IS NULL) AS missing_payer
    FROM payment
""")).fetchall())
```

Expected: `missing_issuer = 0` for every scope, `missing_payer = 0`.

If anything is non-zero, root cause it BEFORE Deploy 3 — Deploy 3 cuts reads to polymorphic columns and any unbackfilled row would silently drop from query results.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/tests/test_backfill_polymorphic.py
git commit -m "test(payments): backfill verification + cross-tier polymorphic asserts"
```

---

## Task 11: Open the PR

- [ ] **Step 1: Push and open a draft PR**

```bash
git push -u origin feature/payment-flows-deploy-2
gh pr create --draft --title "Payment Flows Deploy 2: backfill + dual-write" --body "$(cat <<'EOF'
## Summary

Deploy 2 of the 5-deploy [Payment Flows Expansion](docs/superpowers/specs/2026-04-24-payment-flows-expansion-design.md). Backfills polymorphic columns on every existing Invoice/Payment row, dual-writes them on every new row, and bundles three deferred items from Deploy 1's review.

### Tasks
1. Backfill migration `d2a4c6e8b0f1` — Invoice + Payment legacy → polymorphic
2. Migration `d3b5d7f9a1c2` — Chapter `stripe_account_id` partial unique (parity with Org/Region)
3. Migration `d4c6e8a0b2d3` — CHECK constraints on `*_type` columns (backfill insurance)
4. `app/utils/polymorphic.py` — central kwargs builders for Invoice/Payment dual-write
5. Dual-write on chapter→member invoice routes
6. Dual-write on region→chapter invoice routes
7. Dual-write on Payment in Stripe webhook
8. Dual-write on manual Payment route + demo seeder
9. AuditEvent + migration `d5e0a7c2f4b6` + audit logging on Stripe Connect mutations across all three tiers
10. Backfill verification suite + ship-gate checklist

### Bundled Deploy 1 review items
- ✅ Chapter `stripe_account_id` index tightened to partial unique (Task 2)
- ✅ CHECK constraints on `issuer_type`, `target_type`, `payer_type`, `receiver_type` (Task 3)
- ✅ Audit log on Stripe Connect connect/disconnect at all three tiers (Task 9)

### Deploy gate
Reads still serve off legacy columns. Polymorphic columns are now authoritative on writes. Cutover to polymorphic reads happens in Deploy 3.

## Test plan
- [ ] `pytest -q` green locally
- [ ] `flask db upgrade` runs cleanly on local DB; `flask db downgrade` rolls back through all four new migrations
- [ ] After deploying to Render: run the production spot-check SQL in Task 10 Step 4, confirm `missing_issuer = 0` for every scope and `missing_payer = 0`
- [ ] Smoke: create a test invoice via `/api/invoices` in production, query the DB, confirm both legacy and polymorphic columns are populated

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened in draft state, links to the spec, calls out the bundled review items.

---

## Self-review checklist (run after writing the plan)

- [x] Every spec Deploy 2 line item is covered: backfill (Task 1), dual-write Invoice (Tasks 5–6), dual-write Payment (Tasks 7–8), ship gate (Task 10).
- [x] All three Deploy 1 review items are bundled: Chapter unique index (Task 2), CHECK constraints (Task 3), Stripe Connect audit log (Task 9).
- [x] Every Alembic revision ID is fresh and verified absent from `chapter-ops/backend/migrations/versions/`.
- [x] Every task ends in a commit step with a concrete `git add` / `git commit` command.
- [x] Every code step shows the full code, not a placeholder.
- [x] Test commands are exact pytest invocations relative to the repo root.
