# Payment Flows Expansion — Deploy 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land additive schema for polymorphic Invoice/Payment columns and ship Stripe Connect OAuth flows for Organization and Region tiers — without changing any existing chapter invoicing or payment behavior.

**Architecture:** Three new nullable polymorphic columns each on `Invoice` (`issuer_type`, `issuer_id`, `target_type`, `target_id`) and `Payment` (`payer_type`, `payer_id`, `receiver_type`, `receiver_id`). Two new Stripe fields on `Organization` and `Region` (`stripe_account_id`, `stripe_onboarding_complete`). A shared `stripe_connect_service.complete_oauth(...)` helper replaces the inlined OAuth logic in the existing chapter route and powers two new blueprints: `stripe_connect_region_bp` and `stripe_connect_org_bp`. A new `org_admin_required` decorator enforces org-level authorization. Behavior for existing chapter flows is preserved — this deploy ships infrastructure only.

**Tech Stack:** Flask 3.x, SQLAlchemy 2.x + Alembic, PostgreSQL (SQLite in tests), Flask-Login, Stripe Python SDK, pytest.

**Related spec:** [docs/superpowers/specs/2026-04-24-payment-flows-expansion-design.md](../specs/2026-04-24-payment-flows-expansion-design.md)

**Current Alembic head:** `b4e8d1c9a3f7`

**Deviation from spec:** Routes use `/api/stripe/org/<org_id>/*` with explicit `org_id` in the URL (mirroring the region pattern), not the unscoped `/api/stripe/org/*` shown in the spec. This is cleaner because a user can be admin of multiple organizations and there is no tenant middleware for active organization context. Spec will be footnoted in a later cleanup commit.

---

## Task 1: Alembic migration — add polymorphic columns to Invoice and Payment

**Purpose:** Ship additive, fully-nullable columns so later deploys can dual-write and backfill. No data changes, no behavior changes.

**Files:**
- Create: `chapter-ops/backend/migrations/versions/a1b2c3d4e5f6_add_polymorphic_columns_invoice_payment.py`

- [ ] **Step 1: Create the migration file**

```python
"""add polymorphic columns to invoice and payment

Adds nullable issuer_type/id + target_type/id on invoice and
payer_type/id + receiver_type/id on payment. No data changes.
Columns remain nullable until Deploy 2 completes backfill.

Revision ID: a1b2c3d4e5f6
Revises: b4e8d1c9a3f7
Create Date: 2026-04-24 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'b4e8d1c9a3f7'
branch_labels = None
depends_on = None


def upgrade():
    # Invoice polymorphic columns
    op.add_column('invoice', sa.Column('issuer_type', sa.String(20), nullable=True))
    op.add_column('invoice', sa.Column('issuer_id', sa.String(36), nullable=True))
    op.add_column('invoice', sa.Column('target_type', sa.String(20), nullable=True))
    op.add_column('invoice', sa.Column('target_id', sa.String(36), nullable=True))
    op.create_index('ix_invoice_issuer', 'invoice', ['issuer_type', 'issuer_id'])
    op.create_index('ix_invoice_target', 'invoice', ['target_type', 'target_id'])

    # Payment polymorphic columns
    op.add_column('payment', sa.Column('payer_type', sa.String(20), nullable=True))
    op.add_column('payment', sa.Column('payer_id', sa.String(36), nullable=True))
    op.add_column('payment', sa.Column('receiver_type', sa.String(20), nullable=True))
    op.add_column('payment', sa.Column('receiver_id', sa.String(36), nullable=True))
    op.create_index('ix_payment_payer', 'payment', ['payer_type', 'payer_id'])
    op.create_index('ix_payment_receiver', 'payment', ['receiver_type', 'receiver_id'])


def downgrade():
    op.drop_index('ix_payment_receiver', table_name='payment')
    op.drop_index('ix_payment_payer', table_name='payment')
    op.drop_column('payment', 'receiver_id')
    op.drop_column('payment', 'receiver_type')
    op.drop_column('payment', 'payer_id')
    op.drop_column('payment', 'payer_type')
    op.drop_index('ix_invoice_target', table_name='invoice')
    op.drop_index('ix_invoice_issuer', table_name='invoice')
    op.drop_column('invoice', 'target_id')
    op.drop_column('invoice', 'target_type')
    op.drop_column('invoice', 'issuer_id')
    op.drop_column('invoice', 'issuer_type')
```

- [ ] **Step 2: Run the migration locally**

Run: `cd chapter-ops/backend && flask db upgrade`
Expected: `INFO  [alembic.runtime.migration] Running upgrade b4e8d1c9a3f7 -> a1b2c3d4e5f6, add polymorphic columns to invoice and payment`

- [ ] **Step 3: Verify reversibility**

Run: `cd chapter-ops/backend && flask db downgrade && flask db upgrade`
Expected: clean downgrade to `b4e8d1c9a3f7`, then clean upgrade back to `a1b2c3d4e5f6`.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/backend/migrations/versions/a1b2c3d4e5f6_add_polymorphic_columns_invoice_payment.py
git commit -m "feat(db): add polymorphic columns to invoice and payment (nullable)"
```

---

## Task 2: Add polymorphic columns to Invoice model

**Files:**
- Modify: `chapter-ops/backend/app/models/invoice.py`
- Test: `chapter-ops/backend/tests/test_invoice_model_polymorphic.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_invoice_model_polymorphic.py`:

```python
"""Tests for polymorphic columns on the Invoice model (Deploy 1 schema)."""

from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models import Invoice
from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
)


class TestInvoicePolymorphicColumns:
    def test_can_set_polymorphic_issuer_and_target(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="treasurer")
        db.session.commit()

        inv = Invoice(
            scope="member",
            chapter_id=chapter.id,
            billed_user_id=user.id,
            invoice_number="INV-2026-9001",
            description="Test",
            amount=Decimal("10.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
            # NEW polymorphic columns
            issuer_type="chapter",
            issuer_id=chapter.id,
            target_type="user",
            target_id=user.id,
        )
        db.session.add(inv)
        db.session.commit()

        fetched = db.session.get(Invoice, inv.id)
        assert fetched.issuer_type == "chapter"
        assert fetched.issuer_id == chapter.id
        assert fetched.target_type == "user"
        assert fetched.target_id == user.id

    def test_polymorphic_columns_are_nullable(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="treasurer")
        db.session.commit()

        inv = Invoice(
            scope="member",
            chapter_id=chapter.id,
            billed_user_id=user.id,
            invoice_number="INV-2026-9002",
            description="Legacy row",
            amount=Decimal("10.00"),
            status="draft",
            due_date=date(2026, 5, 1),
            created_by_id=user.id,
            # polymorphic columns deliberately unset
        )
        db.session.add(inv)
        db.session.commit()

        fetched = db.session.get(Invoice, inv.id)
        assert fetched.issuer_type is None
        assert fetched.issuer_id is None
        assert fetched.target_type is None
        assert fetched.target_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_invoice_model_polymorphic.py -v`
Expected: FAIL — `AttributeError: 'Invoice' object has no attribute 'issuer_type'` or similar.

- [ ] **Step 3: Add polymorphic columns to Invoice model**

Edit `chapter-ops/backend/app/models/invoice.py` — add these `Mapped` columns inside the `Invoice` class, placed right after the `# ── Scope ────` block:

```python
    # ── Polymorphic entity pointers (Deploy 1 — nullable during migration) ─
    issuer_type: Mapped[str | None] = mapped_column(
        db.String(20), nullable=True
    )  # "organization" | "region" | "chapter"
    issuer_id: Mapped[str | None] = mapped_column(
        db.String(36), nullable=True
    )
    target_type: Mapped[str | None] = mapped_column(
        db.String(20), nullable=True
    )  # "chapter" | "user"
    target_id: Mapped[str | None] = mapped_column(
        db.String(36), nullable=True
    )
```

Also extend `to_dict()` to include the new fields at the top of the returned dict:

```python
            "issuer_type": self.issuer_type,
            "issuer_id": self.issuer_id,
            "target_type": self.target_type,
            "target_id": self.target_id,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_invoice_model_polymorphic.py -v`
Expected: PASS — both tests.

- [ ] **Step 5: Verify existing invoice tests unaffected**

Run: `cd chapter-ops/backend && pytest tests/ -x -q`
Expected: all existing tests PASS (there's no `test_invoices.py` today; the broader suite should be green).

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/models/invoice.py chapter-ops/backend/tests/test_invoice_model_polymorphic.py
git commit -m "feat(models): add polymorphic issuer/target columns to Invoice"
```

---

## Task 3: Add polymorphic columns to Payment model

**Files:**
- Modify: `chapter-ops/backend/app/models/payment.py`
- Test: `chapter-ops/backend/tests/test_payment_model_polymorphic.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_payment_model_polymorphic.py`:

```python
"""Tests for polymorphic columns on the Payment model (Deploy 1 schema)."""

from decimal import Decimal

from app.extensions import db
from app.models import Payment
from tests.conftest import make_user, make_organization, make_chapter, make_membership


class TestPaymentPolymorphicColumns:
    def test_can_set_polymorphic_payer_and_receiver(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        pmt = Payment(
            chapter_id=chapter.id,
            user_id=user.id,
            amount=Decimal("50.00"),
            payment_type="one-time",
            method="cash",
            payer_type="user",
            payer_id=user.id,
            receiver_type="chapter",
            receiver_id=chapter.id,
        )
        db.session.add(pmt)
        db.session.commit()

        fetched = db.session.get(Payment, pmt.id)
        assert fetched.payer_type == "user"
        assert fetched.payer_id == user.id
        assert fetched.receiver_type == "chapter"
        assert fetched.receiver_id == chapter.id

    def test_polymorphic_columns_are_nullable(self, app, db_session):
        org = make_organization()
        chapter = make_chapter(org)
        user = make_user()
        make_membership(user, chapter, role="member")
        db.session.commit()

        pmt = Payment(
            chapter_id=chapter.id,
            user_id=user.id,
            amount=Decimal("50.00"),
            payment_type="one-time",
            method="cash",
        )
        db.session.add(pmt)
        db.session.commit()

        fetched = db.session.get(Payment, pmt.id)
        assert fetched.payer_type is None
        assert fetched.payer_id is None
        assert fetched.receiver_type is None
        assert fetched.receiver_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_payment_model_polymorphic.py -v`
Expected: FAIL — `AttributeError: 'Payment' object has no attribute 'payer_type'`.

- [ ] **Step 3: Add polymorphic columns to Payment model**

Edit `chapter-ops/backend/app/models/payment.py` — add these `Mapped` columns inside the `Payment` class, right after `plan_id`:

```python
    # ── Polymorphic entity pointers (Deploy 1 — nullable during migration) ─
    payer_type: Mapped[str | None] = mapped_column(
        db.String(20), nullable=True
    )  # "user" | "chapter"
    payer_id: Mapped[str | None] = mapped_column(
        db.String(36), nullable=True
    )
    receiver_type: Mapped[str | None] = mapped_column(
        db.String(20), nullable=True
    )  # "organization" | "region" | "chapter"
    receiver_id: Mapped[str | None] = mapped_column(
        db.String(36), nullable=True
    )
```

Extend `to_dict()` to include the new fields:

```python
            "payer_type": self.payer_type,
            "payer_id": self.payer_id,
            "receiver_type": self.receiver_type,
            "receiver_id": self.receiver_id,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_payment_model_polymorphic.py -v`
Expected: PASS — both tests.

- [ ] **Step 5: Verify existing payment tests still pass**

Run: `cd chapter-ops/backend && pytest tests/test_payments.py tests/test_payment_plans.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/models/payment.py chapter-ops/backend/tests/test_payment_model_polymorphic.py
git commit -m "feat(models): add polymorphic payer/receiver columns to Payment"
```

---

## Task 4: Alembic migration — add Stripe Connect fields to Organization and Region

**Files:**
- Create: `chapter-ops/backend/migrations/versions/a2b3c4d5e6f7_add_stripe_connect_to_org_region.py`

- [ ] **Step 1: Create the migration file**

```python
"""add stripe connect fields to organization and region

Adds stripe_account_id (nullable, partial unique index) and
stripe_onboarding_complete (default false) to both tables.
Unique index is partial — only enforced when stripe_account_id is not null.

Revision ID: a2b3c4d5e6f7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-24 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a2b3c4d5e6f7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # Organization
    op.add_column(
        'organization',
        sa.Column('stripe_account_id', sa.String(200), nullable=True),
    )
    op.add_column(
        'organization',
        sa.Column(
            'stripe_onboarding_complete',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        'uq_organization_stripe_account_id',
        'organization',
        ['stripe_account_id'],
        unique=True,
        postgresql_where=sa.text('stripe_account_id IS NOT NULL'),
    )

    # Region
    op.add_column(
        'region',
        sa.Column('stripe_account_id', sa.String(200), nullable=True),
    )
    op.add_column(
        'region',
        sa.Column(
            'stripe_onboarding_complete',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        'uq_region_stripe_account_id',
        'region',
        ['stripe_account_id'],
        unique=True,
        postgresql_where=sa.text('stripe_account_id IS NOT NULL'),
    )


def downgrade():
    op.drop_index('uq_region_stripe_account_id', table_name='region')
    op.drop_column('region', 'stripe_onboarding_complete')
    op.drop_column('region', 'stripe_account_id')
    op.drop_index('uq_organization_stripe_account_id', table_name='organization')
    op.drop_column('organization', 'stripe_onboarding_complete')
    op.drop_column('organization', 'stripe_account_id')
```

- [ ] **Step 2: Run the migration**

Run: `cd chapter-ops/backend && flask db upgrade`
Expected: `INFO  [alembic.runtime.migration] Running upgrade a1b2c3d4e5f6 -> a2b3c4d5e6f7`.

- [ ] **Step 3: Verify reversibility**

Run: `cd chapter-ops/backend && flask db downgrade && flask db upgrade`
Expected: clean down, clean up.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/backend/migrations/versions/a2b3c4d5e6f7_add_stripe_connect_to_org_region.py
git commit -m "feat(db): add stripe_account_id and stripe_onboarding_complete to Organization and Region"
```

---

## Task 5: Add Stripe Connect fields to Organization and Region models

**Files:**
- Modify: `chapter-ops/backend/app/models/organization.py`
- Modify: `chapter-ops/backend/app/models/region.py`
- Test: `chapter-ops/backend/tests/test_entity_stripe_fields.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_entity_stripe_fields.py`:

```python
"""Tests for Stripe Connect fields on Organization and Region."""

from app.extensions import db
from app.models import Organization, Region
from tests.conftest import make_organization, make_region


class TestOrganizationStripeFields:
    def test_defaults(self, app, db_session):
        org = make_organization()
        db.session.commit()
        fetched = db.session.get(Organization, org.id)
        assert fetched.stripe_account_id is None
        assert fetched.stripe_onboarding_complete is False

    def test_can_set_stripe_account_id(self, app, db_session):
        org = make_organization()
        org.stripe_account_id = "acct_test_org_123"
        org.stripe_onboarding_complete = True
        db.session.commit()
        fetched = db.session.get(Organization, org.id)
        assert fetched.stripe_account_id == "acct_test_org_123"
        assert fetched.stripe_onboarding_complete is True

    def test_to_dict_includes_stripe_fields(self, app, db_session):
        org = make_organization()
        org.stripe_account_id = "acct_abc"
        org.stripe_onboarding_complete = True
        db.session.commit()
        d = org.to_dict()
        assert d["stripe_account_id"] == "acct_abc"
        assert d["stripe_onboarding_complete"] is True


class TestRegionStripeFields:
    def test_defaults(self, app, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        db.session.commit()
        fetched = db.session.get(Region, region.id)
        assert fetched.stripe_account_id is None
        assert fetched.stripe_onboarding_complete is False

    def test_can_set_stripe_account_id(self, app, db_session):
        org = make_organization()
        region = make_region(org, name="West")
        region.stripe_account_id = "acct_test_region_456"
        region.stripe_onboarding_complete = True
        db.session.commit()
        fetched = db.session.get(Region, region.id)
        assert fetched.stripe_account_id == "acct_test_region_456"
        assert fetched.stripe_onboarding_complete is True

    def test_to_dict_includes_stripe_fields(self, app, db_session):
        org = make_organization()
        region = make_region(org, name="Southern")
        region.stripe_account_id = "acct_xyz"
        region.stripe_onboarding_complete = True
        db.session.commit()
        d = region.to_dict()
        assert d["stripe_account_id"] == "acct_xyz"
        assert d["stripe_onboarding_complete"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_entity_stripe_fields.py -v`
Expected: FAIL — attribute errors on `stripe_account_id`.

- [ ] **Step 3: Add columns to Organization model**

Edit `chapter-ops/backend/app/models/organization.py` — add these `Mapped` columns inside the `Organization` class, placed right after the `plan` column:

```python
    # ── Stripe Connect (Deploy 1) ────────────────────────────────
    stripe_account_id: Mapped[str | None] = mapped_column(
        db.String(200), nullable=True
    )
    stripe_onboarding_complete: Mapped[bool] = mapped_column(
        db.Boolean, default=False, nullable=False
    )
```

Extend `to_dict()` to include:

```python
            "stripe_account_id": self.stripe_account_id,
            "stripe_onboarding_complete": self.stripe_onboarding_complete,
```

- [ ] **Step 4: Add columns to Region model**

Edit `chapter-ops/backend/app/models/region.py` — add these `Mapped` columns inside the `Region` class, placed right after the `config` column:

```python
    # ── Stripe Connect (Deploy 1) ────────────────────────────────
    stripe_account_id: Mapped[str | None] = mapped_column(
        db.String(200), nullable=True
    )
    stripe_onboarding_complete: Mapped[bool] = mapped_column(
        db.Boolean, default=False, nullable=False
    )
```

Extend `to_dict()` to include:

```python
            "stripe_account_id": self.stripe_account_id,
            "stripe_onboarding_complete": self.stripe_onboarding_complete,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_entity_stripe_fields.py -v`
Expected: PASS — all six tests.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/models/organization.py chapter-ops/backend/app/models/region.py chapter-ops/backend/tests/test_entity_stripe_fields.py
git commit -m "feat(models): add stripe_account_id and onboarding flag to Organization and Region"
```

---

## Task 6: Add `org_admin_required` decorator

**Purpose:** Give `/api/stripe/org/<org_id>/*` routes the same ergonomic role gate that chapter and region routes have today. Reuses the existing `_is_org_admin` helper in `decorators.py`.

**Files:**
- Modify: `chapter-ops/backend/app/utils/decorators.py`
- Test: `chapter-ops/backend/tests/test_decorators_org_admin.py` (new)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_decorators_org_admin.py`:

```python
"""Tests for the org_admin_required decorator."""

import pytest
from flask import Blueprint, jsonify
from flask_login import login_required

from app.extensions import db
from app.utils.decorators import org_admin_required
from tests.conftest import make_user, make_organization, make_org_membership


@pytest.fixture(autouse=False)
def register_probe_blueprint(app):
    """Register a probe blueprint that exercises the decorator."""
    probe = Blueprint("probe_org_admin", __name__)

    @probe.route("/probe/org-admin/<org_id>", methods=["GET"])
    @login_required
    @org_admin_required
    def probe_view(org_id):
        return jsonify({"ok": True, "org_id": org_id}), 200

    app.register_blueprint(probe)
    from app.extensions import csrf
    csrf.exempt(probe)
    yield


class TestOrgAdminRequired:
    def test_allows_org_admin(self, app, client, db_session, register_probe_blueprint):
        org = make_organization()
        user = make_user()
        make_org_membership(user, org, role="admin")
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get(f"/probe/org-admin/{org.id}")
        assert resp.status_code == 200
        assert resp.get_json()["org_id"] == org.id

    def test_blocks_non_admin_member(self, app, client, db_session, register_probe_blueprint):
        org = make_organization()
        user = make_user()
        make_org_membership(user, org, role="member")
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get(f"/probe/org-admin/{org.id}")
        assert resp.status_code == 403

    def test_blocks_user_with_no_org_membership(self, app, client, db_session, register_probe_blueprint):
        org = make_organization()
        user = make_user()
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get(f"/probe/org-admin/{org.id}")
        assert resp.status_code == 403

    def test_404_when_org_not_found(self, app, client, db_session, register_probe_blueprint):
        user = make_user()
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get("/probe/org-admin/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_decorators_org_admin.py -v`
Expected: FAIL — `ImportError: cannot import name 'org_admin_required'`.

- [ ] **Step 3: Implement the decorator**

Edit `chapter-ops/backend/app/utils/decorators.py` — add at the bottom of the file:

```python
def org_admin_required(f):
    """
    Decorator that grants access only to organization admins.

    Extracts ``org_id`` from the URL kwargs. Returns 404 if the org
    does not exist, 403 if the user is not an active admin of it.
    Sets ``g.current_organization`` for use in handlers.

    Usage:
        @bp.route("/<org_id>/something")
        @login_required
        @org_admin_required
        def some_view(org_id):
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from app.models import Organization

        org_id = kwargs.get("org_id")
        if not org_id:
            return jsonify({"error": "Organization ID required."}), 400

        org = db.session.get(Organization, org_id)
        if not org:
            return jsonify({"error": "Organization not found."}), 404

        if not _is_org_admin(current_user, org.id):
            return jsonify({
                "error": "Organization admin role required."
            }), 403

        g.current_organization = org
        return f(*args, **kwargs)
    return decorated_function
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_decorators_org_admin.py -v`
Expected: PASS — all four tests.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/utils/decorators.py chapter-ops/backend/tests/test_decorators_org_admin.py
git commit -m "feat(decorators): add org_admin_required decorator"
```

---

## Task 7: Shared Stripe OAuth service + refactor chapter route

**Purpose:** Extract the OAuth code-exchange and account-retrieval logic into a single service module so all three tiers reuse the same implementation. Behavior of the existing chapter flow is preserved — we're moving the code, not changing it.

**Files:**
- Create: `chapter-ops/backend/app/services/stripe_connect_service.py`
- Create: `chapter-ops/backend/tests/test_stripe_connect_service.py`
- Modify: `chapter-ops/backend/app/routes/stripe_connect.py` (refactor to call service)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_stripe_connect_service.py`:

```python
"""Tests for the shared Stripe Connect OAuth service."""

from unittest.mock import patch, MagicMock
import pytest
import stripe

from app.services.stripe_connect_service import (
    exchange_oauth_code,
    retrieve_account_status,
    deauthorize_account,
    StripeConnectError,
)


class TestExchangeOAuthCode:
    def test_returns_stripe_account_id(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "token") as mock_token:
            mock_token.return_value = {"stripe_user_id": "acct_123"}
            account_id = exchange_oauth_code(code="ac_test_code")
            assert account_id == "acct_123"
            mock_token.assert_called_once_with(
                grant_type="authorization_code", code="ac_test_code"
            )

    def test_raises_on_missing_account_id(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "token") as mock_token:
            mock_token.return_value = {}
            with pytest.raises(StripeConnectError, match="stripe account"):
                exchange_oauth_code(code="ac_test_code")

    def test_raises_on_stripe_oauth_error(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "token") as mock_token:
            err = stripe.oauth_error.OAuthError("invalid_grant", "Bad code")
            mock_token.side_effect = err
            with pytest.raises(StripeConnectError, match="Bad code"):
                exchange_oauth_code(code="ac_bad")


class TestRetrieveAccountStatus:
    def test_returns_account_status_dict(self, app):
        fake_account = MagicMock()
        fake_account.get = lambda k, d=None: {
            "charges_enabled": True,
            "payouts_enabled": False,
            "settings": {"dashboard": {"display_name": "Acme"}},
            "business_profile": {},
        }.get(k, d)

        with app.app_context(), patch.object(stripe.Account, "retrieve", return_value=fake_account):
            status = retrieve_account_status("acct_123", fallback_display_name="Fallback")
            assert status["charges_enabled"] is True
            assert status["payouts_enabled"] is False
            assert status["display_name"] == "Acme"

    def test_falls_back_to_display_name_when_missing(self, app):
        fake_account = MagicMock()
        fake_account.get = lambda k, d=None: {
            "charges_enabled": True,
            "payouts_enabled": True,
            "settings": {"dashboard": {}},
            "business_profile": {},
        }.get(k, d)

        with app.app_context(), patch.object(stripe.Account, "retrieve", return_value=fake_account):
            status = retrieve_account_status("acct_123", fallback_display_name="Fallback Name")
            assert status["display_name"] == "Fallback Name"


class TestDeauthorize:
    def test_calls_stripe_oauth_deauthorize(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "deauthorize") as mock_deauth:
            deauthorize_account("acct_123")
            mock_deauth.assert_called_once()
            kwargs = mock_deauth.call_args.kwargs
            assert kwargs["stripe_user_id"] == "acct_123"

    def test_swallows_stripe_errors(self, app):
        with app.app_context(), patch.object(stripe.OAuth, "deauthorize") as mock_deauth:
            mock_deauth.side_effect = stripe.error.StripeError("already revoked")
            # Must not raise — caller may still want to clear local state
            deauthorize_account("acct_123")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_service.py -v`
Expected: FAIL — `ImportError: No module named 'app.services.stripe_connect_service'`.

- [ ] **Step 3: Implement the service**

Create `chapter-ops/backend/app/services/stripe_connect_service.py`:

```python
"""Shared Stripe Connect OAuth service.

Used by chapter, region, and organization Stripe Connect routes.
Raises ``StripeConnectError`` for any recoverable Stripe API issue so
callers can return a user-friendly 400 response.
"""

from flask import current_app
import stripe


class StripeConnectError(Exception):
    """Raised for recoverable Stripe Connect OAuth / API errors."""


def exchange_oauth_code(code: str) -> str:
    """
    Exchange an OAuth ``code`` for a connected ``stripe_user_id``.

    Raises ``StripeConnectError`` on any Stripe failure or missing id.
    """
    try:
        response = stripe.OAuth.token(grant_type="authorization_code", code=code)
    except stripe.oauth_error.OAuthError as e:
        raise StripeConnectError(str(e.user_message or e))
    except stripe.error.StripeError as e:
        raise StripeConnectError(str(e.user_message or e))

    account_id = response.get("stripe_user_id")
    if not account_id:
        raise StripeConnectError("Failed to retrieve stripe account id from OAuth response.")
    return account_id


def retrieve_account_status(stripe_account_id: str, fallback_display_name: str) -> dict:
    """
    Return a dict describing the connected account's current status.

    Fields: ``charges_enabled``, ``payouts_enabled``, ``display_name``.
    ``display_name`` falls back to ``fallback_display_name`` when Stripe
    has no configured label for the account.
    """
    try:
        account = stripe.Account.retrieve(stripe_account_id)
    except stripe.error.StripeError as e:
        raise StripeConnectError(str(e.user_message or e))

    return {
        "charges_enabled": account.get("charges_enabled", False),
        "payouts_enabled": account.get("payouts_enabled", False),
        "display_name": (
            account.get("settings", {}).get("dashboard", {}).get("display_name")
            or account.get("business_profile", {}).get("name")
            or fallback_display_name
        ),
    }


def deauthorize_account(stripe_account_id: str) -> None:
    """
    Best-effort OAuth deauthorize. Swallows Stripe errors because the
    caller still wants to clear local state even if Stripe rejects
    the deauthorize (e.g., token already revoked).
    """
    client_id = current_app.config["STRIPE_CLIENT_ID"]
    try:
        stripe.OAuth.deauthorize(
            client_id=client_id,
            stripe_user_id=stripe_account_id,
        )
    except stripe.error.StripeError:
        pass
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_service.py -v`
Expected: PASS — all seven tests.

- [ ] **Step 5: Refactor existing chapter Stripe route to use the service**

Edit `chapter-ops/backend/app/routes/stripe_connect.py`:

Replace the body of `stripe_callback()` (lines 54-103 of the current file) with this call-through to the service, preserving the state validation that's unique to the OAuth step:

```python
@stripe_connect_bp.route("/callback", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def stripe_callback():
    """
    Handle the OAuth callback from Stripe after user authorizes.

    The frontend StripeCallback page extracts ?code and ?state from the
    redirect URL, then calls this endpoint to complete the connection.
    """
    from app.services.stripe_connect_service import (
        exchange_oauth_code,
        StripeConnectError,
    )

    chapter = g.current_chapter
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        error_desc = request.args.get("error_description", "Stripe authorization was denied.")
        return jsonify({"error": error_desc}), 400

    if not code:
        return jsonify({"error": "Missing authorization code."}), 400

    expected_state = session.pop("stripe_oauth_state", None)
    if not expected_state or state != expected_state:
        return jsonify({"error": "Invalid state parameter. Please try connecting again."}), 400

    try:
        stripe_account_id = exchange_oauth_code(code)
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 400

    chapter.stripe_account_id = stripe_account_id
    chapter.stripe_onboarding_complete = True
    db.session.commit()

    return jsonify({
        "success": True,
        "stripe_account_id": stripe_account_id,
    }), 200
```

Replace the body of `get_account_status()` (the existing `@stripe_connect_bp.route("/account", methods=["GET"])` view):

```python
@stripe_connect_bp.route("/account", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def get_account_status():
    """
    Get the current chapter's Stripe Connect account status.

    Returns connected=false if the chapter hasn't linked a Stripe account.
    """
    from app.services.stripe_connect_service import (
        retrieve_account_status,
        StripeConnectError,
    )

    chapter = g.current_chapter

    if not chapter.stripe_account_id:
        return jsonify({"connected": False}), 200

    try:
        status = retrieve_account_status(
            chapter.stripe_account_id,
            fallback_display_name=chapter.name,
        )
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "connected": True,
        "stripe_account_id": chapter.stripe_account_id,
        **status,
    }), 200
```

Replace the body of `disconnect_stripe()`:

```python
@stripe_connect_bp.route("/disconnect", methods=["DELETE"])
@login_required
@chapter_required
@role_required("president")
def disconnect_stripe():
    """
    Disconnect the chapter's Stripe account.

    Requires president role.
    """
    from app.services.stripe_connect_service import deauthorize_account

    chapter = g.current_chapter

    if not chapter.stripe_account_id:
        return jsonify({"error": "No Stripe account is connected."}), 400

    deauthorize_account(chapter.stripe_account_id)

    chapter.stripe_account_id = None
    chapter.stripe_onboarding_complete = False
    db.session.commit()

    return jsonify({"success": True}), 200
```

- [ ] **Step 6: Verify no regression on chapter flow**

Run: `cd chapter-ops/backend && pytest tests/ -x -q`
Expected: entire suite PASSES. The refactor is behavior-preserving.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/app/services/stripe_connect_service.py chapter-ops/backend/app/routes/stripe_connect.py chapter-ops/backend/tests/test_stripe_connect_service.py
git commit -m "refactor(stripe): extract shared OAuth service; chapter route now delegates"
```

---

## Task 8: Region Stripe Connect routes

**Files:**
- Create: `chapter-ops/backend/app/routes/stripe_connect_region.py`
- Create: `chapter-ops/backend/tests/test_stripe_connect_region.py`
- Modify: `chapter-ops/backend/app/__init__.py` (register new blueprint)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_stripe_connect_region.py`:

```python
"""Tests for Region Stripe Connect routes."""

from unittest.mock import patch

from app.extensions import db
from tests.conftest import (
    make_user, make_organization, make_region, make_region_membership,
    make_chapter, make_membership,
)


def _login(client, user):
    client.post("/api/auth/login", json={
        "email": user.email,
        "password": "Str0ng!Password1",
    })


class TestRegionStripeConnect:
    def test_connect_url_requires_regional_treasurer(self, app, client, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="u1@example.com")
        make_region_membership(user, region, role="member")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/connect")
        assert resp.status_code == 403

    def test_connect_url_returns_oauth_url_for_treasurer(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"
        app.config["STRIPE_CONNECT_REDIRECT_URI"] = "https://example.com/cb"

        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/connect")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["url"].startswith("https://connect.stripe.com/oauth/authorize?")
        assert "client_id=ca_test_123" in body["url"]

    def test_callback_persists_account_id(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"

        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)

        # Prime state token via the connect endpoint
        connect_resp = client.get(f"/api/stripe/region/{region.id}/connect")
        state = connect_resp.get_json()["url"].split("state=")[1].split("&")[0]

        with patch(
            "app.services.stripe_connect_service.exchange_oauth_code",
            return_value="acct_region_xyz",
        ):
            resp = client.get(
                f"/api/stripe/region/{region.id}/callback?code=ac_test&state={state}"
            )

        assert resp.status_code == 200
        assert resp.get_json()["stripe_account_id"] == "acct_region_xyz"

        from app.models import Region
        region = db.session.get(Region, region.id)
        assert region.stripe_account_id == "acct_region_xyz"
        assert region.stripe_onboarding_complete is True

    def test_account_status_not_connected(self, app, client, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/account")
        assert resp.status_code == 200
        assert resp.get_json() == {"connected": False}

    def test_disconnect_clears_account_id(self, app, client, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        region.stripe_account_id = "acct_preexisting"
        region.stripe_onboarding_complete = True
        user = make_user(email="rt@example.com")
        make_region_membership(user, region, role="regional_treasurer")
        db.session.commit()

        _login(client, user)

        with patch(
            "app.services.stripe_connect_service.deauthorize_account",
            return_value=None,
        ):
            resp = client.delete(f"/api/stripe/region/{region.id}/disconnect")

        assert resp.status_code == 200

        from app.models import Region
        region = db.session.get(Region, region.id)
        assert region.stripe_account_id is None
        assert region.stripe_onboarding_complete is False

    def test_org_admin_can_connect_any_region_in_org(self, app, client, db_session):
        org = make_organization()
        region = make_region(org, name="East")
        user = make_user(email="orgadmin@example.com")
        from tests.conftest import make_org_membership
        make_org_membership(user, org, role="admin")
        db.session.commit()

        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"
        app.config["STRIPE_CONNECT_REDIRECT_URI"] = "https://example.com/cb"

        _login(client, user)
        resp = client.get(f"/api/stripe/region/{region.id}/connect")
        # region_role_required allows org admins through
        assert resp.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_region.py -v`
Expected: FAIL — 404s because the routes don't exist yet.

- [ ] **Step 3: Create the blueprint**

Create `chapter-ops/backend/app/routes/stripe_connect_region.py`:

```python
"""Stripe Connect routes — /api/stripe/region/<region_id>/*

Handles OAuth connect flow for regions to link their Stripe accounts.
Regional treasurers (or org admins, via region_role_required) can initiate
the flow.
"""

import secrets
from urllib.parse import urlencode

from flask import Blueprint, current_app, g, jsonify, request, session
from flask_login import login_required

from app.extensions import db
from app.services.stripe_connect_service import (
    exchange_oauth_code,
    retrieve_account_status,
    deauthorize_account,
    StripeConnectError,
)
from app.utils.decorators import region_role_required

stripe_connect_region_bp = Blueprint(
    "stripe_connect_region", __name__, url_prefix="/api/stripe/region"
)


@stripe_connect_region_bp.route("/<region_id>/connect", methods=["GET"])
@login_required
@region_role_required("regional_treasurer")
def get_connect_url(region_id):
    region = g.current_region
    client_id = current_app.config["STRIPE_CLIENT_ID"]
    redirect_uri = current_app.config["STRIPE_CONNECT_REDIRECT_URI"]

    if not client_id:
        return jsonify({"error": "Stripe Connect is not configured on this platform."}), 503

    state_token = secrets.token_urlsafe(32)
    session[f"stripe_oauth_state_region_{region.id}"] = state_token

    params = {
        "response_type": "code",
        "client_id": client_id,
        "scope": "read_write",
        "state": state_token,
        "redirect_uri": redirect_uri,
    }
    url = "https://connect.stripe.com/oauth/authorize?" + urlencode(params)
    return jsonify({"url": url}), 200


@stripe_connect_region_bp.route("/<region_id>/callback", methods=["GET"])
@login_required
@region_role_required("regional_treasurer")
def stripe_callback(region_id):
    region = g.current_region
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        error_desc = request.args.get(
            "error_description", "Stripe authorization was denied."
        )
        return jsonify({"error": error_desc}), 400

    if not code:
        return jsonify({"error": "Missing authorization code."}), 400

    expected_state = session.pop(f"stripe_oauth_state_region_{region.id}", None)
    if not expected_state or state != expected_state:
        return jsonify({
            "error": "Invalid state parameter. Please try connecting again."
        }), 400

    try:
        stripe_account_id = exchange_oauth_code(code)
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 400

    region.stripe_account_id = stripe_account_id
    region.stripe_onboarding_complete = True
    db.session.commit()

    return jsonify({
        "success": True,
        "stripe_account_id": stripe_account_id,
    }), 200


@stripe_connect_region_bp.route("/<region_id>/account", methods=["GET"])
@login_required
@region_role_required("regional_treasurer")
def get_account_status(region_id):
    region = g.current_region

    if not region.stripe_account_id:
        return jsonify({"connected": False}), 200

    try:
        status = retrieve_account_status(
            region.stripe_account_id,
            fallback_display_name=region.name,
        )
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "connected": True,
        "stripe_account_id": region.stripe_account_id,
        **status,
    }), 200


@stripe_connect_region_bp.route("/<region_id>/disconnect", methods=["DELETE"])
@login_required
@region_role_required("regional_treasurer")
def disconnect_stripe(region_id):
    region = g.current_region

    if not region.stripe_account_id:
        return jsonify({"error": "No Stripe account is connected."}), 400

    deauthorize_account(region.stripe_account_id)

    region.stripe_account_id = None
    region.stripe_onboarding_complete = False
    db.session.commit()

    return jsonify({"success": True}), 200
```

- [ ] **Step 4: Register the blueprint**

Edit `chapter-ops/backend/app/__init__.py` — add the import alongside the existing `stripe_connect` import (around line 107):

```python
    from app.routes.stripe_connect import stripe_connect_bp
    from app.routes.stripe_connect_region import stripe_connect_region_bp
```

And register it alongside the existing chapter registration (around line 140):

```python
    app.register_blueprint(stripe_connect_bp)
    app.register_blueprint(stripe_connect_region_bp)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_region.py -v`
Expected: PASS — all six tests.

- [ ] **Step 6: Run the full suite**

Run: `cd chapter-ops/backend && pytest tests/ -x -q`
Expected: entire suite PASSES.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/app/routes/stripe_connect_region.py chapter-ops/backend/app/__init__.py chapter-ops/backend/tests/test_stripe_connect_region.py
git commit -m "feat(stripe): add Stripe Connect OAuth routes for regions"
```

---

## Task 9: Organization Stripe Connect routes

**Files:**
- Create: `chapter-ops/backend/app/routes/stripe_connect_org.py`
- Create: `chapter-ops/backend/tests/test_stripe_connect_org.py`
- Modify: `chapter-ops/backend/app/__init__.py` (register new blueprint)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_stripe_connect_org.py`:

```python
"""Tests for Organization Stripe Connect routes."""

from unittest.mock import patch

from app.extensions import db
from tests.conftest import make_user, make_organization, make_org_membership


def _login(client, user):
    client.post("/api/auth/login", json={
        "email": user.email,
        "password": "Str0ng!Password1",
    })


class TestOrgStripeConnect:
    def test_connect_url_requires_admin(self, app, client, db_session):
        org = make_organization()
        user = make_user(email="m@example.com")
        make_org_membership(user, org, role="member")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/connect")
        assert resp.status_code == 403

    def test_connect_url_returns_oauth_url_for_admin(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"
        app.config["STRIPE_CONNECT_REDIRECT_URI"] = "https://example.com/cb"

        org = make_organization()
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/connect")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["url"].startswith("https://connect.stripe.com/oauth/authorize?")
        assert "client_id=ca_test_123" in body["url"]

    def test_callback_persists_account_id(self, app, client, db_session):
        app.config["STRIPE_CLIENT_ID"] = "ca_test_123"

        org = make_organization()
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)

        connect_resp = client.get(f"/api/stripe/org/{org.id}/connect")
        state = connect_resp.get_json()["url"].split("state=")[1].split("&")[0]

        with patch(
            "app.services.stripe_connect_service.exchange_oauth_code",
            return_value="acct_org_xyz",
        ):
            resp = client.get(
                f"/api/stripe/org/{org.id}/callback?code=ac_test&state={state}"
            )

        assert resp.status_code == 200
        assert resp.get_json()["stripe_account_id"] == "acct_org_xyz"

        from app.models import Organization
        org = db.session.get(Organization, org.id)
        assert org.stripe_account_id == "acct_org_xyz"
        assert org.stripe_onboarding_complete is True

    def test_account_status_not_connected(self, app, client, db_session):
        org = make_organization()
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/account")
        assert resp.status_code == 200
        assert resp.get_json() == {"connected": False}

    def test_disconnect_clears_account_id(self, app, client, db_session):
        org = make_organization()
        org.stripe_account_id = "acct_preexisting"
        org.stripe_onboarding_complete = True
        user = make_user(email="a@example.com")
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, user)

        with patch(
            "app.services.stripe_connect_service.deauthorize_account",
            return_value=None,
        ):
            resp = client.delete(f"/api/stripe/org/{org.id}/disconnect")

        assert resp.status_code == 200

        from app.models import Organization
        org = db.session.get(Organization, org.id)
        assert org.stripe_account_id is None
        assert org.stripe_onboarding_complete is False

    def test_non_member_returns_403(self, app, client, db_session):
        org = make_organization()
        user = make_user(email="nobody@example.com")
        db.session.commit()

        _login(client, user)
        resp = client.get(f"/api/stripe/org/{org.id}/connect")
        assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_org.py -v`
Expected: FAIL — 404s because the routes don't exist yet.

- [ ] **Step 3: Create the blueprint**

Create `chapter-ops/backend/app/routes/stripe_connect_org.py`:

```python
"""Stripe Connect routes — /api/stripe/org/<org_id>/*

Handles OAuth connect flow for organizations to link their Stripe accounts.
Only organization admins can initiate the flow.
"""

import secrets
from urllib.parse import urlencode

from flask import Blueprint, current_app, g, jsonify, request, session
from flask_login import login_required

from app.extensions import db
from app.services.stripe_connect_service import (
    exchange_oauth_code,
    retrieve_account_status,
    deauthorize_account,
    StripeConnectError,
)
from app.utils.decorators import org_admin_required

stripe_connect_org_bp = Blueprint(
    "stripe_connect_org", __name__, url_prefix="/api/stripe/org"
)


@stripe_connect_org_bp.route("/<org_id>/connect", methods=["GET"])
@login_required
@org_admin_required
def get_connect_url(org_id):
    org = g.current_organization
    client_id = current_app.config["STRIPE_CLIENT_ID"]
    redirect_uri = current_app.config["STRIPE_CONNECT_REDIRECT_URI"]

    if not client_id:
        return jsonify({"error": "Stripe Connect is not configured on this platform."}), 503

    state_token = secrets.token_urlsafe(32)
    session[f"stripe_oauth_state_org_{org.id}"] = state_token

    params = {
        "response_type": "code",
        "client_id": client_id,
        "scope": "read_write",
        "state": state_token,
        "redirect_uri": redirect_uri,
    }
    url = "https://connect.stripe.com/oauth/authorize?" + urlencode(params)
    return jsonify({"url": url}), 200


@stripe_connect_org_bp.route("/<org_id>/callback", methods=["GET"])
@login_required
@org_admin_required
def stripe_callback(org_id):
    org = g.current_organization
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        error_desc = request.args.get(
            "error_description", "Stripe authorization was denied."
        )
        return jsonify({"error": error_desc}), 400

    if not code:
        return jsonify({"error": "Missing authorization code."}), 400

    expected_state = session.pop(f"stripe_oauth_state_org_{org.id}", None)
    if not expected_state or state != expected_state:
        return jsonify({
            "error": "Invalid state parameter. Please try connecting again."
        }), 400

    try:
        stripe_account_id = exchange_oauth_code(code)
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 400

    org.stripe_account_id = stripe_account_id
    org.stripe_onboarding_complete = True
    db.session.commit()

    return jsonify({
        "success": True,
        "stripe_account_id": stripe_account_id,
    }), 200


@stripe_connect_org_bp.route("/<org_id>/account", methods=["GET"])
@login_required
@org_admin_required
def get_account_status(org_id):
    org = g.current_organization

    if not org.stripe_account_id:
        return jsonify({"connected": False}), 200

    try:
        status = retrieve_account_status(
            org.stripe_account_id,
            fallback_display_name=org.name,
        )
    except StripeConnectError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({
        "connected": True,
        "stripe_account_id": org.stripe_account_id,
        **status,
    }), 200


@stripe_connect_org_bp.route("/<org_id>/disconnect", methods=["DELETE"])
@login_required
@org_admin_required
def disconnect_stripe(org_id):
    org = g.current_organization

    if not org.stripe_account_id:
        return jsonify({"error": "No Stripe account is connected."}), 400

    deauthorize_account(org.stripe_account_id)

    org.stripe_account_id = None
    org.stripe_onboarding_complete = False
    db.session.commit()

    return jsonify({"success": True}), 200
```

- [ ] **Step 4: Register the blueprint**

Edit `chapter-ops/backend/app/__init__.py` — add the import alongside the region import:

```python
    from app.routes.stripe_connect_region import stripe_connect_region_bp
    from app.routes.stripe_connect_org import stripe_connect_org_bp
```

And register it alongside:

```python
    app.register_blueprint(stripe_connect_region_bp)
    app.register_blueprint(stripe_connect_org_bp)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd chapter-ops/backend && pytest tests/test_stripe_connect_org.py -v`
Expected: PASS — all six tests.

- [ ] **Step 6: Run the full suite**

Run: `cd chapter-ops/backend && pytest tests/ -x -q`
Expected: entire suite PASSES.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/app/routes/stripe_connect_org.py chapter-ops/backend/app/__init__.py chapter-ops/backend/tests/test_stripe_connect_org.py
git commit -m "feat(stripe): add Stripe Connect OAuth routes for organizations"
```

---

## Task 10: Deploy 1 smoke check — existing chapter flow unaffected

**Purpose:** Confirm the Deploy 1 ship gate from the spec: "existing chapter invoicing and payments unaffected in smoke test." This task is explicitly a manual verification gate; it ensures we haven't regressed the most load-bearing flow.

**Files:** None (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd chapter-ops/backend && pytest tests/ -v`
Expected: all tests PASS. Record total count and pass count.

- [ ] **Step 2: Start the dev server and verify chapter Stripe Connect UI still works end-to-end**

Run (in one terminal): `cd chapter-ops/backend && flask run`
Run (in another terminal): `cd chapter-ops/frontend && npm run dev`

Navigate to `/settings` → Payments tab → confirm the existing chapter "Connect Stripe" flow still returns an OAuth URL. (Do not complete OAuth — we're only verifying the endpoint is reachable and produces a URL.) If the button produces a URL, the chapter flow is intact.

- [ ] **Step 3: Manually hit `/api/stripe/region/<id>/connect` and `/api/stripe/org/<id>/connect`**

Using your logged-in session cookie, hit both new endpoints in a browser or curl to confirm they respond with either an OAuth URL (when authorized) or a proper 403/404 (when not). This is a sanity check — detailed behavior is covered by unit tests.

- [ ] **Step 4: Inspect the database schema**

Run: `cd chapter-ops/backend && flask shell`
In the shell:

```python
from app.extensions import db
from sqlalchemy import inspect
insp = inspect(db.engine)

invoice_cols = {c["name"] for c in insp.get_columns("invoice")}
assert {"issuer_type", "issuer_id", "target_type", "target_id"}.issubset(invoice_cols)

payment_cols = {c["name"] for c in insp.get_columns("payment")}
assert {"payer_type", "payer_id", "receiver_type", "receiver_id"}.issubset(payment_cols)

org_cols = {c["name"] for c in insp.get_columns("organization")}
assert {"stripe_account_id", "stripe_onboarding_complete"}.issubset(org_cols)

region_cols = {c["name"] for c in insp.get_columns("region")}
assert {"stripe_account_id", "stripe_onboarding_complete"}.issubset(region_cols)
print("Schema verified.")
```

Expected: `Schema verified.` with no AssertionErrors.

- [ ] **Step 5: Final commit (empty, tag the deploy)**

```bash
git commit --allow-empty -m "chore: Deploy 1 ship gate passed — polymorphic schema + multi-tier Stripe Connect OAuth live"
```

---

## Deploy 1 complete

**What shipped:**
- Polymorphic columns on `Invoice` and `Payment` (all nullable)
- Stripe Connect fields on `Organization` and `Region`
- Shared `stripe_connect_service` helper
- `/api/stripe/region/<region_id>/*` routes (connect, callback, account, disconnect)
- `/api/stripe/org/<org_id>/*` routes (connect, callback, account, disconnect)
- `org_admin_required` decorator
- Comprehensive test coverage for all new surface area (model, decorator, service, routes)

**What remains unchanged:**
- Chapter Stripe Connect OAuth flow (behavior identical, internals now delegate to service)
- Chapter invoicing and payment behavior
- All existing API contracts

**Next:** Deploy 2 (backfill + dual-write) — separate plan, written after Deploy 1 is in production.
