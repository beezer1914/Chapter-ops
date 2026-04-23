# Chapter Approval Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the fake-chapter / org-squatting holes by seeding NPHC orgs, gating `create_organization` to platform admin, and routing chapter creation through an approval queue (`ChapterRequest`). Grassroots chapters under unclaimed orgs route to the platform admin; chapters under claimed orgs route to org admins.

**Architecture:** New `ChapterRequest` entity captures pending asks; on approval, a service function creates `Chapter` + `ChapterPeriod` + founder `ChapterMembership` atomically. Approver scope (`org_admin` vs `platform_admin`) is resolved at submit time. NPHC orgs + "Unaffiliated" default regions are seeded in a single Alembic migration. Platform admin is defined as the user whose email matches the `FOUNDER_EMAIL` config value.

**Tech Stack:** Flask 3.x, SQLAlchemy 2.x + Alembic, PostgreSQL (SQLite in tests), Flask-Login, Resend (email), React 19 + TypeScript, Zustand, Axios.

**Related spec:** [docs/superpowers/specs/2026-04-23-chapter-approval-guardrails-design.md](../specs/2026-04-23-chapter-approval-guardrails-design.md)

---

## Task 1: `is_founder` helper + platform-admin gate on org creation

**Purpose:** Tighten the definition of "platform admin" to match `FOUNDER_EMAIL` (one specific user), not the broader "org admin of any org" currently used by `_is_platform_admin()` in [agent.py](../../chapter-ops/backend/app/routes/agent.py). Then gate `POST /api/onboarding/organizations` behind this check.

**Files:**
- Create: `chapter-ops/backend/app/utils/platform_admin.py`
- Modify: `chapter-ops/backend/app/routes/onboarding.py` (add `@require_founder` to `create_organization`)
- Test: `chapter-ops/backend/tests/test_platform_admin.py`
- Test (modify): `chapter-ops/backend/tests/test_onboarding.py` (update `TestCreateOrganization` class)

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_platform_admin.py`:

```python
"""Tests for the platform-admin (founder) helper + gating."""

import pytest
from flask import Flask

from app.utils.platform_admin import is_founder
from tests.conftest import make_user


class TestIsFounder:
    def test_is_founder_when_email_matches(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password="Str0ng!Password1")
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "brandon@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")  # establish session context
            assert is_founder() is True

    def test_not_founder_when_email_mismatch(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="someone@example.com", password="Str0ng!Password1")
        db_session.commit()

        client.post("/api/auth/login", json={
            "email": "someone@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is False

    def test_not_founder_when_unauthenticated(self, app, client):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        with client:
            assert is_founder() is False

    def test_not_founder_when_config_empty(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = ""
        make_user(email="brandon@example.com", password="Str0ng!Password1")
        db_session.commit()
        client.post("/api/auth/login", json={
            "email": "brandon@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is False

    def test_email_comparison_is_case_insensitive(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "Brandon@Example.COM"
        make_user(email="brandon@example.com", password="Str0ng!Password1")
        db_session.commit()
        client.post("/api/auth/login", json={
            "email": "brandon@example.com",
            "password": "Str0ng!Password1",
        })
        with client:
            client.get("/api/auth/user")
            assert is_founder() is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest chapter-ops/backend/tests/test_platform_admin.py -v`
Expected: FAIL (module `app.utils.platform_admin` does not exist).

- [ ] **Step 3: Implement the helper**

Create `chapter-ops/backend/app/utils/platform_admin.py`:

```python
"""Platform-admin (founder) authorization helper.

The "platform admin" / "founder" is a single user identified by the
FOUNDER_EMAIL config value. This is distinct from org admins — an org admin
is scoped to a single Organization (via OrganizationMembership), while the
founder has platform-wide authority for actions like approving chapter
requests under unclaimed organizations.
"""

from functools import wraps

from flask import current_app, jsonify
from flask_login import current_user


def is_founder() -> bool:
    """Return True if the current user's email matches FOUNDER_EMAIL (case-insensitive)."""
    if not current_user.is_authenticated:
        return False
    founder_email = (current_app.config.get("FOUNDER_EMAIL") or "").strip().lower()
    if not founder_email:
        return False
    return (current_user.email or "").strip().lower() == founder_email


def require_founder(f):
    """Decorator: return 403 JSON if the caller is not the platform founder."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        if not is_founder():
            return jsonify({"error": "Platform admin access required."}), 403
        return f(*args, **kwargs)

    return wrapper
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest chapter-ops/backend/tests/test_platform_admin.py -v`
Expected: all 5 tests PASS.

- [ ] **Step 5: Add failing test for `create_organization` gating**

Append to `chapter-ops/backend/tests/test_onboarding.py` inside `TestCreateOrganization`:

```python
    def test_create_org_requires_founder(self, app, client, db_session):
        """Non-founders cannot create organizations."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="nobody@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "nobody@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Some Org",
            "abbreviation": "SOM",
            "org_type": "fraternity",
        })
        assert resp.status_code == 403
        assert "Platform admin" in resp.get_json()["error"]

    def test_create_org_allowed_for_founder(self, app, client, db_session):
        """Platform founder can still create orgs."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "brandon@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Delta Sigma Theta Sorority, Inc.",
            "abbreviation": "DST",
            "org_type": "sorority",
        })
        assert resp.status_code == 201
```

Also update existing tests in `TestCreateOrganization` that expect 201 — prepend `app.config["FOUNDER_EMAIL"] = "alice@example.com"` before login, since they use `alice@example.com` as the creator.

Full list of tests to update (add `app.config["FOUNDER_EMAIL"] = "alice@example.com"` before login, and accept `app` fixture):
- `test_create_org_success`
- `test_create_org_duplicate_abbreviation` — this one expects 409 for an already-existing abbreviation, still needs founder access to reach the dupe check
- `test_create_org_invalid_type`
- `test_create_org_missing_fields`

(`test_create_org_unauthenticated` stays as-is — it tests the `@login_required` layer which runs before `@require_founder`.)

Also update `TestFullOnboardingFlow::test_founder_flow`: add `app.config["FOUNDER_EMAIL"] = "founder@example.com"` after the register call and before creating the org.

- [ ] **Step 6: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_onboarding.py::TestCreateOrganization -v`
Expected: `test_create_org_requires_founder` FAIL (no gate in place). Other tests may also fail due to the new gate rejecting `alice@example.com` even with the config override, because the current endpoint has no `@require_founder`.

- [ ] **Step 7: Apply the gate to `create_organization`**

Modify `chapter-ops/backend/app/routes/onboarding.py`:

Add import:
```python
from app.utils.platform_admin import require_founder
```

Change the endpoint decorator:
```python
@onboarding_bp.route("/organizations", methods=["POST"])
@login_required
@require_founder
def create_organization():
    ...
```

Also update the docstring to reflect the new gate:
```python
    """
    Create a new organization.

    Platform-admin only. General users pick from the pre-seeded NPHC
    organization list instead of creating their own. Kept as an endpoint
    so the founder can add non-NPHC orgs once the platform broadens.
    """
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_onboarding.py::TestCreateOrganization chapter-ops/backend/tests/test_onboarding.py::TestFullOnboardingFlow -v`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add chapter-ops/backend/app/utils/platform_admin.py chapter-ops/backend/app/routes/onboarding.py chapter-ops/backend/tests/test_platform_admin.py chapter-ops/backend/tests/test_onboarding.py
git commit -m "feat(auth): add is_founder helper and gate create_organization to platform admin"
```

---

## Task 2: Chapter-name normalization helper

**Purpose:** Centralized normalization function for dedup checks. Used by both `ChapterRequest.name_normalized` and the submit-time collision check against the `Chapter` table.

**Files:**
- Create: `chapter-ops/backend/app/utils/naming.py`
- Test: `chapter-ops/backend/tests/test_naming.py`

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_naming.py`:

```python
"""Tests for name normalization used in chapter dedup."""

from app.utils.naming import normalize_chapter_name


def test_lowercases():
    assert normalize_chapter_name("Alpha Chapter") == "alphachapter"


def test_strips_whitespace():
    assert normalize_chapter_name("  Alpha  Chapter  ") == "alphachapter"


def test_strips_interior_whitespace():
    assert normalize_chapter_name("Alpha\tChapter\n") == "alphachapter"


def test_strips_punctuation():
    assert normalize_chapter_name("Alpha-Chapter, Inc.") == "alphachapterinc"


def test_treats_unicode_letters_as_letters():
    # Greek letters should survive (stripped of anything non-alphanumeric,
    # but letters themselves are preserved and case-folded)
    assert normalize_chapter_name("ΣΔΣ Chapter") == "σδσchapter"


def test_empty_returns_empty():
    assert normalize_chapter_name("") == ""
    assert normalize_chapter_name("   ") == ""


def test_none_returns_empty():
    assert normalize_chapter_name(None) == ""


def test_equivalent_variants_collide():
    a = normalize_chapter_name("Alpha Chapter")
    b = normalize_chapter_name("alpha chapter")
    c = normalize_chapter_name("ALPHACHAPTER")
    d = normalize_chapter_name("  Alpha-Chapter  ")
    assert a == b == c == d
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest chapter-ops/backend/tests/test_naming.py -v`
Expected: FAIL (module `app.utils.naming` does not exist).

- [ ] **Step 3: Implement**

Create `chapter-ops/backend/app/utils/naming.py`:

```python
"""Name normalization helpers used for dedup on chapter names.

Two chapter requests with the same (org, region, normalized_name) cannot
both be pending simultaneously. A new chapter request cannot collide with
an existing active Chapter's normalized name either.
"""


def normalize_chapter_name(name: str | None) -> str:
    """
    Normalize a chapter name for dedup comparison.

    Lowercases, strips whitespace, strips all non-alphanumeric characters
    (punctuation, separators). Unicode letters (including Greek) are
    preserved case-folded. Returns empty string for None/empty input.
    """
    if not name:
        return ""
    return "".join(ch for ch in name.casefold() if ch.isalnum())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest chapter-ops/backend/tests/test_naming.py -v`
Expected: all 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/utils/naming.py chapter-ops/backend/tests/test_naming.py
git commit -m "feat(util): add normalize_chapter_name for dedup comparison"
```

---

## Task 3: `ChapterRequest` model

**Purpose:** Define the ORM model for the new entity. Schema migration comes in Task 4. Model is registered in `models/__init__.py` so `_db.create_all()` picks it up for tests.

**Files:**
- Create: `chapter-ops/backend/app/models/chapter_request.py`
- Modify: `chapter-ops/backend/app/models/__init__.py` (add import + `__all__` entry)
- Test: `chapter-ops/backend/tests/test_chapter_request_model.py`

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_chapter_request_model.py`:

```python
"""Tests for the ChapterRequest ORM model."""

import pytest

from app.extensions import db
from app.models.chapter_request import ChapterRequest
from tests.conftest import make_user, make_organization, make_region


def _base_request_kwargs(user, org, region):
    return {
        "requester_user_id": user.id,
        "organization_id": org.id,
        "region_id": region.id,
        "name": "Alpha Chapter",
        "name_normalized": "alphachapter",
        "chapter_type": "undergraduate",
        "founder_role": "president",
        "status": "pending",
        "approver_scope": "org_admin",
    }


class TestChapterRequestModel:
    def test_creates_with_required_fields(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        req = ChapterRequest(**_base_request_kwargs(user, org, region))
        db_session.add(req)
        db_session.commit()

        assert req.id is not None
        assert req.status == "pending"
        assert req.created_at is not None
        assert req.rejected_reason is None
        assert req.resulting_chapter_id is None

    def test_to_dict_shape(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        req = ChapterRequest(**_base_request_kwargs(user, org, region))
        db_session.add(req)
        db_session.commit()

        d = req.to_dict()
        assert d["id"] == req.id
        assert d["name"] == "Alpha Chapter"
        assert d["status"] == "pending"
        assert d["approver_scope"] == "org_admin"
        assert d["requester_email"] == user.email
        assert d["organization_name"] == org.name
        assert d["region_name"] == region.name
        assert d["chapter_type"] == "undergraduate"
        assert d["founder_role"] == "president"
        assert d["rejected_reason"] is None
        assert "created_at" in d
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest chapter-ops/backend/tests/test_chapter_request_model.py -v`
Expected: FAIL (`app.models.chapter_request` does not exist).

- [ ] **Step 3: Implement the model**

Create `chapter-ops/backend/app/models/chapter_request.py`:

```python
"""
ChapterRequest model — captures a pending ask to found a new chapter.

On approval, a real Chapter + ChapterPeriod + founder ChapterMembership
are created atomically. Rejected and cancelled requests are retained for
audit; approved requests keep a pointer to the resulting_chapter_id.
"""

from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.models.base import BaseModel


VALID_STATUSES = {"pending", "approved", "rejected", "cancelled"}
VALID_FOUNDER_ROLES = {"member", "secretary", "treasurer", "vice_president", "president"}
VALID_APPROVER_SCOPES = {"org_admin", "platform_admin"}


class ChapterRequest(BaseModel):
    __tablename__ = "chapter_request"

    __table_args__ = (
        db.Index(
            "uq_chapter_request_pending",
            "organization_id", "region_id", "name_normalized",
            unique=True,
            postgresql_where=db.text("status = 'pending'"),
        ),
        db.Index("ix_chapter_request_requester_status", "requester_user_id", "status"),
        db.Index("ix_chapter_request_approver_status", "approver_scope", "status"),
    )

    requester_user_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False, index=True
    )
    organization_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("organization.id"), nullable=False, index=True
    )
    region_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("region.id"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(db.String(200), nullable=False)
    name_normalized: Mapped[str] = mapped_column(db.String(200), nullable=False)
    designation: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    chapter_type: Mapped[str] = mapped_column(db.String(20), nullable=False)
    city: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(db.String(100), nullable=True)
    country: Mapped[str] = mapped_column(db.String(100), nullable=False, default="United States")
    timezone: Mapped[str] = mapped_column(db.String(50), nullable=False, default="America/New_York")

    founder_role: Mapped[str] = mapped_column(db.String(30), nullable=False)
    status: Mapped[str] = mapped_column(db.String(20), nullable=False, default="pending")
    approver_scope: Mapped[str] = mapped_column(db.String(20), nullable=False)

    approved_by_user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    rejected_reason: Mapped[str | None] = mapped_column(db.Text, nullable=True)
    resulting_chapter_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=True
    )
    acted_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    # Relationships
    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_user_id])
    organization: Mapped["Organization"] = relationship("Organization")
    region: Mapped["Region"] = relationship("Region")
    approver: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by_user_id])
    resulting_chapter: Mapped["Chapter | None"] = relationship(
        "Chapter", foreign_keys=[resulting_chapter_id]
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "requester_user_id": self.requester_user_id,
            "requester_name": self.requester.full_name if self.requester else None,
            "requester_email": self.requester.email if self.requester else None,
            "organization_id": self.organization_id,
            "organization_name": self.organization.name if self.organization else None,
            "region_id": self.region_id,
            "region_name": self.region.name if self.region else None,
            "name": self.name,
            "designation": self.designation,
            "chapter_type": self.chapter_type,
            "city": self.city,
            "state": self.state,
            "country": self.country,
            "timezone": self.timezone,
            "founder_role": self.founder_role,
            "status": self.status,
            "approver_scope": self.approver_scope,
            "approved_by_user_id": self.approved_by_user_id,
            "rejected_reason": self.rejected_reason,
            "resulting_chapter_id": self.resulting_chapter_id,
            "acted_at": self.acted_at.isoformat() if self.acted_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
```

- [ ] **Step 4: Register the model in `models/__init__.py`**

Modify `chapter-ops/backend/app/models/__init__.py`:

Add import (after the `transfer_request` import, before `workflow`):
```python
from app.models.chapter_request import ChapterRequest
```

Add to `__all__` list (after `"ChapterTransferRequest"`):
```python
    "ChapterRequest",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest chapter-ops/backend/tests/test_chapter_request_model.py -v`
Expected: all 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/models/chapter_request.py chapter-ops/backend/app/models/__init__.py chapter-ops/backend/tests/test_chapter_request_model.py
git commit -m "feat(model): add ChapterRequest entity for pending chapter approval"
```

---

## Task 4: Alembic migration — `chapter_request` table + NPHC org seed + "Unaffiliated" regions

**Purpose:** Create the `chapter_request` table, seed the nine NPHC orgs (skipping duplicates by abbreviation), and upsert one "Unaffiliated" region per seeded org. Migration is idempotent on the seed rows.

**Files:**
- Create: `chapter-ops/backend/migrations/versions/<auto-generated>_add_chapter_request_and_nphc_seed.py`
- Test: manual migration dry-run + SQLite auto-create verification in existing tests

- [ ] **Step 1: Generate migration skeleton**

Run:
```bash
cd chapter-ops/backend
flask db migrate -m "add chapter_request and NPHC seed"
```

This emits a new file in `migrations/versions/`. Note the filename — it will look like `<hash>_add_chapter_request_and_nphc_seed.py`.

- [ ] **Step 2: Replace the autogen body with explicit schema + seed**

Open the newly generated file and replace its body with the following (keep the top-of-file `revision`, `down_revision`, `branch_labels`, `depends_on` headers exactly as Alembic generated them):

```python
"""add chapter_request and NPHC seed

Revision ID: <keep-existing>
Revises: <keep-existing>
Create Date: <keep-existing>
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "<keep-existing>"
down_revision = "<keep-existing>"
branch_labels = None
depends_on = None


NPHC_ORGS = [
    # Divine Nine — alphabetical
    {
        "name": "Alpha Kappa Alpha Sorority, Inc.",
        "abbreviation": "AKA",
        "greek_letters": "ΑΚΑ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1908,
        "motto": "By Culture and By Merit",
    },
    {
        "name": "Alpha Phi Alpha Fraternity, Inc.",
        "abbreviation": "APA",
        "greek_letters": "ΑΦΑ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1906,
        "motto": "First of All, Servants of All, We Shall Transcend All",
    },
    {
        "name": "Delta Sigma Theta Sorority, Inc.",
        "abbreviation": "DST",
        "greek_letters": "ΔΣΘ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1913,
        "motto": "Intelligence is the Torch of Wisdom",
    },
    {
        "name": "Iota Phi Theta Fraternity, Inc.",
        "abbreviation": "IPT",
        "greek_letters": "ΙΦΘ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1963,
        "motto": "Building a Tradition, Not Resting Upon One",
    },
    {
        "name": "Kappa Alpha Psi Fraternity, Inc.",
        "abbreviation": "KAPsi",
        "greek_letters": "ΚΑΨ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1911,
        "motto": "Achievement in Every Field of Human Endeavor",
    },
    {
        "name": "Omega Psi Phi Fraternity, Inc.",
        "abbreviation": "OPP",
        "greek_letters": "ΩΨΦ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1911,
        "motto": "Friendship is Essential to the Soul",
    },
    {
        "name": "Phi Beta Sigma Fraternity, Inc.",
        "abbreviation": "PBS",
        "greek_letters": "ΦΒΣ",
        "org_type": "fraternity",
        "council": "NPHC",
        "founded_year": 1914,
        "motto": "Culture for Service and Service for Humanity",
    },
    {
        "name": "Sigma Gamma Rho Sorority, Inc.",
        "abbreviation": "SGRho",
        "greek_letters": "ΣΓΡ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1922,
        "motto": "Greater Service, Greater Progress",
    },
    {
        "name": "Zeta Phi Beta Sorority, Inc.",
        "abbreviation": "ZPhiB",
        "greek_letters": "ΖΦΒ",
        "org_type": "sorority",
        "council": "NPHC",
        "founded_year": 1920,
        "motto": "A Community-Conscious, Action-Oriented Organization",
    },
]


def upgrade():
    # ── Create chapter_request table ──────────────────────────────────────
    op.create_table(
        "chapter_request",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("requester_user_id", sa.String(length=36), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("organization_id", sa.String(length=36), sa.ForeignKey("organization.id"), nullable=False),
        sa.Column("region_id", sa.String(length=36), sa.ForeignKey("region.id"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("name_normalized", sa.String(length=200), nullable=False),
        sa.Column("designation", sa.String(length=100), nullable=True),
        sa.Column("chapter_type", sa.String(length=20), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=False, server_default="United States"),
        sa.Column("timezone", sa.String(length=50), nullable=False, server_default="America/New_York"),
        sa.Column("founder_role", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("approver_scope", sa.String(length=20), nullable=False),
        sa.Column("approved_by_user_id", sa.String(length=36), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("rejected_reason", sa.Text, nullable=True),
        sa.Column("resulting_chapter_id", sa.String(length=36), sa.ForeignKey("chapter.id"), nullable=True),
        sa.Column("acted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chapter_request_requester_user_id", "chapter_request", ["requester_user_id"])
    op.create_index("ix_chapter_request_organization_id", "chapter_request", ["organization_id"])
    op.create_index("ix_chapter_request_region_id", "chapter_request", ["region_id"])
    op.create_index(
        "uq_chapter_request_pending",
        "chapter_request",
        ["organization_id", "region_id", "name_normalized"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "ix_chapter_request_requester_status",
        "chapter_request",
        ["requester_user_id", "status"],
    )
    op.create_index(
        "ix_chapter_request_approver_status",
        "chapter_request",
        ["approver_scope", "status"],
    )

    # ── Seed NPHC orgs (idempotent: skip by abbreviation) ─────────────────
    import uuid
    from datetime import datetime, timezone
    conn = op.get_bind()

    for org_data in NPHC_ORGS:
        existing = conn.execute(
            sa.text("SELECT id FROM organization WHERE abbreviation = :abbr"),
            {"abbr": org_data["abbreviation"]},
        ).fetchone()

        if existing:
            org_id = existing[0]
        else:
            org_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO organization (
                        id, name, abbreviation, greek_letters, org_type, council,
                        founded_year, motto, active, plan, config, created_at, updated_at
                    ) VALUES (
                        :id, :name, :abbreviation, :greek_letters, :org_type, :council,
                        :founded_year, :motto, TRUE, 'beta', '{}', :created_at, :updated_at
                    )
                """),
                {
                    "id": org_id,
                    "name": org_data["name"],
                    "abbreviation": org_data["abbreviation"],
                    "greek_letters": org_data["greek_letters"],
                    "org_type": org_data["org_type"],
                    "council": org_data["council"],
                    "founded_year": org_data["founded_year"],
                    "motto": org_data["motto"],
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                },
            )

        # ── Upsert "Unaffiliated" region for this org (idempotent) ────────
        existing_region = conn.execute(
            sa.text("""
                SELECT id FROM region
                 WHERE organization_id = :org_id AND name = 'Unaffiliated'
            """),
            {"org_id": org_id},
        ).fetchone()

        if not existing_region:
            conn.execute(
                sa.text("""
                    INSERT INTO region (
                        id, organization_id, name, description, active, config,
                        created_at, updated_at
                    ) VALUES (
                        :id, :org_id, 'Unaffiliated',
                        'Default region for chapters operating outside a formal IHQ regional structure.',
                        TRUE, '{}', :created_at, :updated_at
                    )
                """),
                {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                },
            )


def downgrade():
    # Drop the chapter_request table. Do NOT delete seeded orgs/regions —
    # they may have dependent data (chapters, memberships) by the time a
    # downgrade is attempted. Manual cleanup required if truly needed.
    op.drop_index("ix_chapter_request_approver_status", table_name="chapter_request")
    op.drop_index("ix_chapter_request_requester_status", table_name="chapter_request")
    op.drop_index("uq_chapter_request_pending", table_name="chapter_request")
    op.drop_index("ix_chapter_request_region_id", table_name="chapter_request")
    op.drop_index("ix_chapter_request_organization_id", table_name="chapter_request")
    op.drop_index("ix_chapter_request_requester_user_id", table_name="chapter_request")
    op.drop_table("chapter_request")
```

- [ ] **Step 3: Run migration locally against dev database**

```bash
cd chapter-ops/backend
docker compose up -d  # ensure postgres + redis are up
flask db upgrade
```

Expected: `Running upgrade ... add chapter_request and NPHC seed` logged, no errors.

- [ ] **Step 4: Verify seed ran correctly**

```bash
docker compose exec db psql -U chapterops -c "SELECT abbreviation, name FROM organization WHERE council='NPHC' ORDER BY abbreviation;"
```

Expected: 9 rows listing AKA, APA, DST, IPT, KAPsi, OPP, PBS, SGRho, ZPhiB.

```bash
docker compose exec db psql -U chapterops -c "SELECT o.abbreviation, r.name FROM region r JOIN organization o ON o.id = r.organization_id WHERE r.name = 'Unaffiliated' ORDER BY o.abbreviation;"
```

Expected: 9 rows — one "Unaffiliated" per NPHC org.

- [ ] **Step 5: Run migration idempotency check**

```bash
flask db downgrade -1
flask db upgrade
```

Then re-check both queries. Expected: still 9 rows each (no duplicates).

If an existing Phi Beta Sigma org record was already present from the Sigma Finance era, it should have been preserved (the seed skipped it). Verify with:

```bash
docker compose exec db psql -U chapterops -c "SELECT COUNT(*) FROM organization WHERE abbreviation='PBS';"
```

Expected: 1.

- [ ] **Step 6: Run full test suite — ensures model + `create_all()` works against SQLite**

```bash
cd chapter-ops/backend
pytest -x -q
```

Expected: all pre-existing tests still pass, plus the new tests from Tasks 1-3.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/migrations/versions/*_add_chapter_request_and_nphc_seed.py
git commit -m "feat(db): add chapter_request table and seed NPHC orgs with Unaffiliated regions"
```

---

## Task 5: Extract chapter-creation service function

**Purpose:** Move the chapter + billing-period + founder-membership creation logic out of `POST /api/onboarding/chapters` and into a reusable service function. The approve endpoint (Task 9) will call this; the legacy endpoint can keep calling it until removed in Task 11.

**Files:**
- Create: `chapter-ops/backend/app/services/chapter_service.py`
- Modify: `chapter-ops/backend/app/routes/onboarding.py` (refactor `create_chapter` to use the service)
- Test: `chapter-ops/backend/tests/test_chapter_service.py`

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_chapter_service.py`:

```python
"""Tests for chapter_service.create_chapter_with_founder."""

from app.extensions import db
from app.models import Chapter, ChapterMembership
from app.models.chapter_period import ChapterPeriod
from app.services.chapter_service import create_chapter_with_founder
from tests.conftest import make_user, make_organization, make_region


class TestCreateChapterWithFounder:
    def test_creates_chapter_period_and_membership(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        chapter, period, membership = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="Alpha Gamma Chapter",
            designation=None,
            chapter_type="undergraduate",
            city="Atlanta",
            state="Georgia",
            country="United States",
            timezone="America/New_York",
            founder_role="president",
        )
        db_session.commit()

        assert chapter.id is not None
        assert chapter.organization_id == org.id
        assert chapter.region_id == region.id
        assert chapter.name == "Alpha Gamma Chapter"

        assert period.chapter_id == chapter.id
        assert period.is_active is True

        assert membership.user_id == user.id
        assert membership.chapter_id == chapter.id
        assert membership.role == "president"

    def test_sets_active_chapter_on_founder(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        chapter, _, _ = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="New Chapter",
            designation=None,
            chapter_type="graduate",
            city=None, state=None, country="United States",
            timezone="America/New_York",
            founder_role="treasurer",
        )
        db_session.commit()

        db_session.expire_all()
        from app.models import User
        refreshed = db_session.get(User, user.id)
        assert refreshed.active_chapter_id == chapter.id

    def test_undergraduate_gets_semester_period(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        _, period, _ = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="Undergrad Chapter",
            designation=None,
            chapter_type="undergraduate",
            city=None, state=None, country="United States",
            timezone="America/New_York",
            founder_role="president",
        )
        db_session.commit()
        assert period.period_type == "semester"

    def test_graduate_gets_annual_period(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        _, period, _ = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="Graduate Chapter",
            designation=None,
            chapter_type="graduate",
            city=None, state=None, country="United States",
            timezone="America/New_York",
            founder_role="president",
        )
        db_session.commit()
        assert period.period_type == "annual"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest chapter-ops/backend/tests/test_chapter_service.py -v`
Expected: FAIL (`app.services.chapter_service` does not exist).

- [ ] **Step 3: Implement the service**

Create `chapter-ops/backend/app/services/chapter_service.py`:

```python
"""
Chapter creation service.

Single source of truth for creating a new Chapter + initial ChapterPeriod +
founder ChapterMembership. Called by the chapter-request approve endpoint
and (transitionally) by the legacy onboarding.create_chapter endpoint.

Caller is responsible for db.session.commit() — this function only flushes.
"""

from datetime import date

from app.extensions import db
from app.models import Chapter, ChapterMembership, Organization, Region, User
from app.models.chapter_period import ChapterPeriod


def _build_first_period(chapter_id: str, chapter_type: str) -> ChapterPeriod:
    """Mirror the auto-period logic previously inlined in onboarding.create_chapter."""
    today = date.today()
    year = today.year
    month = today.month

    if chapter_type == "undergraduate":
        if month <= 5:
            period_name, p_start, p_end = f"Spring {year}", date(year, 1, 1), date(year, 5, 31)
        elif month <= 7:
            period_name, p_start, p_end = f"Summer {year}", date(year, 6, 1), date(year, 7, 31)
        else:
            period_name, p_start, p_end = f"Fall {year}", date(year, 8, 1), date(year, 12, 31)
        period_type = "semester"
    else:
        period_name = f"FY {year}"
        p_start, p_end = date(year, 1, 1), date(year, 12, 31)
        period_type = "annual"

    return ChapterPeriod(
        chapter_id=chapter_id,
        name=period_name,
        period_type=period_type,
        start_date=p_start,
        end_date=p_end,
        is_active=True,
    )


def create_chapter_with_founder(
    *,
    requester: User,
    organization: Organization,
    region: Region,
    name: str,
    designation: str | None,
    chapter_type: str,
    city: str | None,
    state: str | None,
    country: str,
    timezone: str,
    founder_role: str,
) -> tuple[Chapter, ChapterPeriod, ChapterMembership]:
    """
    Atomically create a Chapter, initial ChapterPeriod, and founder ChapterMembership.

    Also flips the requester's active_chapter_id to the new chapter.
    Caller commits.
    """
    chapter = Chapter(
        organization_id=organization.id,
        region_id=region.id,
        name=name,
        designation=designation,
        chapter_type=chapter_type,
        city=city,
        state=state,
        country=country,
        timezone=timezone,
        config={
            "fee_types": [
                {"id": "dues", "label": "Dues", "default_amount": 0.00},
            ],
            "settings": {
                "allow_payment_plans": True,
            },
        },
    )
    db.session.add(chapter)
    db.session.flush()  # obtain chapter.id

    period = _build_first_period(chapter.id, chapter_type)
    db.session.add(period)

    membership = ChapterMembership(
        user_id=requester.id,
        chapter_id=chapter.id,
        role=founder_role,
        member_type=ChapterMembership.default_member_type_for(chapter),
    )
    db.session.add(membership)

    requester.active_chapter_id = chapter.id

    return chapter, period, membership
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest chapter-ops/backend/tests/test_chapter_service.py -v`
Expected: all 4 PASS.

- [ ] **Step 5: Refactor `onboarding.create_chapter` to use the service**

Modify `chapter-ops/backend/app/routes/onboarding.py`, replacing the body of `create_chapter` (the inline Chapter + ChapterPeriod + ChapterMembership construction, lines ~195-265) with a call to the service:

Add import near the top of the file:
```python
from app.services.chapter_service import create_chapter_with_founder
```

Replace the creation block inside `create_chapter`'s `try:` block (the `chapter = Chapter(...)` through `current_user.active_chapter_id = chapter.id` section) with:

```python
        chapter, first_period, membership = create_chapter_with_founder(
            requester=current_user,
            organization=org,
            region=region,
            name=data["name"].strip(),
            designation=data.get("designation", "").strip() or None,
            chapter_type=data["chapter_type"],
            city=data.get("city", "").strip() or None,
            state=data.get("state", "").strip() or None,
            country=data.get("country", "United States").strip(),
            timezone=data.get("timezone", "America/New_York").strip(),
            founder_role=founder_role,
        )
```

Remove the unused `from datetime import date` import and the `from app.models.chapter_period import ChapterPeriod` import at the top if nothing else in the file uses them. (Leave alone if they're still used.)

- [ ] **Step 6: Run existing onboarding tests to confirm no regression**

Run: `pytest chapter-ops/backend/tests/test_onboarding.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/backend/app/services/chapter_service.py chapter-ops/backend/app/routes/onboarding.py chapter-ops/backend/tests/test_chapter_service.py
git commit -m "refactor(onboarding): extract chapter creation into reusable service function"
```

---

## Task 6: Submit endpoint — `POST /api/onboarding/chapter-requests`

**Purpose:** Requester-facing endpoint. Validates input, runs dedup check against `Chapter` and pending `ChapterRequest`, resolves `approver_scope`, stores the request, notifies approvers.

**Files:**
- Create: `chapter-ops/backend/app/routes/chapter_requests.py`
- Modify: `chapter-ops/backend/app/__init__.py` (register blueprint)
- Modify: `chapter-ops/backend/app/routes/onboarding.py` (add a thin submit route that delegates, so the requester-facing path stays under `/api/onboarding/*`)
- Test: `chapter-ops/backend/tests/test_chapter_requests_submit.py`

Note: The spec places requester endpoints under `/api/onboarding/chapter-requests/*` and approver endpoints under `/api/chapter-requests/*`. We implement both in one blueprint mounted at `/api/chapter-requests/`, and add thin wrapper routes under `/api/onboarding/chapter-requests/*` that delegate. This keeps the approver blueprint registration simple while honoring the spec's URL structure.

Actually simpler: register ONE blueprint with `url_prefix=None` and declare routes individually with their full paths. This matches how `webhooks` etc. work. I'll do that — all routes in one module, explicit paths.

- [ ] **Step 1: Write the failing test**

Create `chapter-ops/backend/tests/test_chapter_requests_submit.py`:

```python
"""Tests for POST /api/onboarding/chapter-requests (submit)."""

from app.extensions import db
from app.models import Chapter, ChapterRequest, OrganizationMembership
from tests.conftest import (
    make_user, make_organization, make_region, make_chapter,
    make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestSubmitChapterRequest:
    def _submit_payload(self, org, region, overrides=None):
        base = {
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Alpha Chapter",
            "chapter_type": "undergraduate",
            "city": "Atlanta",
            "state": "Georgia",
            "founder_role": "president",
        }
        if overrides:
            base.update(overrides)
        return base

    def test_submit_claimed_org_routes_to_org_admin(self, app, client, db_session):
        """If the org has an admin, approver_scope is org_admin."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="newpres@example.com", password=VALID_PASSWORD)
        org = make_organization(name="Alpha Kappa Alpha", abbreviation="AKA", org_type="sorority")
        region = make_region(org, name="Eastern Region")
        make_org_membership(admin, org, role="admin")
        db_session.commit()

        login(client, "newpres@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region),
        )
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert data["request"]["status"] == "pending"
        assert data["request"]["approver_scope"] == "org_admin"

    def test_submit_unclaimed_org_routes_to_platform_admin(self, app, client, db_session):
        """If the org has no admins, approver_scope is platform_admin."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        requester = make_user(email="newpres@example.com", password=VALID_PASSWORD)
        org = make_organization(name="Zeta Phi Beta", abbreviation="ZPhiB", org_type="sorority")
        region = make_region(org, name="Unaffiliated")
        db_session.commit()

        login(client, "newpres@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region),
        )
        assert resp.status_code == 201
        assert resp.get_json()["request"]["approver_scope"] == "platform_admin"

    def test_submit_blocks_on_existing_active_chapter(self, app, client, db_session):
        """Dedup against the live Chapter table."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        requester = make_user(email="bob@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_chapter(org, name="Alpha Chapter", region=region)
        db_session.commit()

        login(client, "bob@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"name": "ALPHA chapter"}),
        )
        assert resp.status_code == 409
        assert "already exists" in resp.get_json()["error"].lower()

    def test_submit_blocks_on_existing_pending_request(self, app, client, db_session):
        """Dedup against pending ChapterRequest rows."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="first@example.com", password=VALID_PASSWORD)
        second = make_user(email="second@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "first@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"name": "Alpha Chapter"}),
        )
        assert resp.status_code == 201

        client.post("/api/auth/logout")
        login(client, "second@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"name": "Alpha-Chapter"}),
        )
        assert resp.status_code == 409

    def test_submit_rejects_invalid_founder_role(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="user@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "user@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"founder_role": "overlord"}),
        )
        assert resp.status_code == 400

    def test_submit_rejects_invalid_chapter_type(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="user@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "user@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json=self._submit_payload(org, region, {"chapter_type": "interstellar"}),
        )
        assert resp.status_code == 400

    def test_submit_rejects_region_org_mismatch(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="user@example.com", password=VALID_PASSWORD)
        org_a = make_organization(name="Org A", abbreviation="ORGA")
        org_b = make_organization(name="Org B", abbreviation="ORGB")
        region_b = make_region(org_b, name="Other Region")
        db_session.commit()

        login(client, "user@example.com")
        resp = client.post(
            "/api/onboarding/chapter-requests",
            json={
                "organization_id": org_a.id,
                "region_id": region_b.id,
                "name": "Mismatch Chapter",
                "chapter_type": "undergraduate",
                "founder_role": "president",
            },
        )
        assert resp.status_code == 400

    def test_submit_requires_auth(self, client):
        resp = client.post("/api/onboarding/chapter-requests", json={})
        assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_submit.py -v`
Expected: FAIL (404 on all POSTs — endpoint doesn't exist).

- [ ] **Step 3: Implement the blueprint + submit route**

Create `chapter-ops/backend/app/routes/chapter_requests.py`:

```python
"""
Chapter request routes.

Requester-facing (mounted under /api/onboarding/chapter-requests/*):
  POST   /                — submit a new chapter request
  GET    /mine            — the current user's latest request (for the pending screen)
  DELETE /<id>            — cancel own pending request

Approver-facing (mounted under /api/chapter-requests/*):
  GET    /pending         — list requests the current user is authorized to review
  POST   /<id>/approve    — create the chapter + period + founder membership
  POST   /<id>/reject     — reject with reason

Approver authority:
  approver_scope == "org_admin"      → user must have OrganizationMembership(role="admin") for the request's org
  approver_scope == "platform_admin" → user must match FOUNDER_EMAIL (via is_founder())
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import (
    Chapter, ChapterRequest, Organization, OrganizationMembership, Region, User,
)
from app.utils.naming import normalize_chapter_name
from app.utils.platform_admin import is_founder

chapter_requests_bp = Blueprint("chapter_requests", __name__)
logger = logging.getLogger(__name__)


VALID_FOUNDER_ROLES = {"member", "secretary", "treasurer", "vice_president", "president"}
VALID_CHAPTER_TYPES = {"undergraduate", "graduate"}


def _resolve_approver_scope(organization_id: str) -> str:
    """Return 'org_admin' if the org has any active admin, else 'platform_admin'."""
    has_admin = db.session.query(OrganizationMembership.id).filter_by(
        organization_id=organization_id, role="admin", active=True
    ).first() is not None
    return "org_admin" if has_admin else "platform_admin"


def _dedup_collides(organization_id: str, region_id: str, name_normalized: str) -> bool:
    """True if an active chapter or pending request already uses this normalized name."""
    # Active chapter in this org+region with a name that normalizes the same?
    existing_chapters = (
        db.session.query(Chapter.id, Chapter.name)
        .filter_by(organization_id=organization_id, region_id=region_id)
        .all()
    )
    for _, existing_name in existing_chapters:
        if normalize_chapter_name(existing_name) == name_normalized:
            return True

    # Pending request for the same (org, region, normalized_name)?
    pending_exists = db.session.query(ChapterRequest.id).filter_by(
        organization_id=organization_id,
        region_id=region_id,
        name_normalized=name_normalized,
        status="pending",
    ).first() is not None
    return pending_exists


# ── Requester endpoints ───────────────────────────────────────────────────────

@chapter_requests_bp.route("/api/onboarding/chapter-requests", methods=["POST"])
@login_required
def submit_chapter_request():
    """Submit a new chapter request. See module docstring for full flow."""
    data = request.get_json() or {}

    required = ["organization_id", "region_id", "name", "chapter_type", "founder_role"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if data["chapter_type"] not in VALID_CHAPTER_TYPES:
        return jsonify({"error": "chapter_type must be 'undergraduate' or 'graduate'."}), 400

    if data["founder_role"] not in VALID_FOUNDER_ROLES:
        return jsonify({
            "error": f"founder_role must be one of: {', '.join(sorted(VALID_FOUNDER_ROLES))}."
        }), 400

    org = db.session.get(Organization, data["organization_id"])
    if not org:
        return jsonify({"error": "Organization not found."}), 404

    region = db.session.get(Region, data["region_id"])
    if not region:
        return jsonify({"error": "Region not found."}), 404
    if region.organization_id != org.id:
        return jsonify({"error": "Region does not belong to this organization."}), 400

    name = data["name"].strip()
    name_normalized = normalize_chapter_name(name)
    if not name_normalized:
        return jsonify({"error": "Chapter name cannot be empty."}), 400

    if _dedup_collides(org.id, region.id, name_normalized):
        return jsonify({
            "error": (
                "A chapter with this name already exists in this region. "
                "If this is your chapter, submit a transfer request instead."
            )
        }), 409

    approver_scope = _resolve_approver_scope(org.id)

    req = ChapterRequest(
        requester_user_id=current_user.id,
        organization_id=org.id,
        region_id=region.id,
        name=name,
        name_normalized=name_normalized,
        designation=(data.get("designation") or "").strip() or None,
        chapter_type=data["chapter_type"],
        city=(data.get("city") or "").strip() or None,
        state=(data.get("state") or "").strip() or None,
        country=(data.get("country") or "United States").strip(),
        timezone=(data.get("timezone") or "America/New_York").strip(),
        founder_role=data["founder_role"],
        approver_scope=approver_scope,
        status="pending",
    )
    db.session.add(req)
    db.session.commit()

    # Notification side-effects (Task 7 in notifications subsection)
    try:
        from app.services.chapter_request_notifications import notify_approvers_of_new_request
        notify_approvers_of_new_request(req)
    except Exception:
        logger.exception("Failed to send approver notifications for request %s", req.id)

    return jsonify({"success": True, "request": req.to_dict()}), 201
```

- [ ] **Step 4: Register the blueprint + CSRF-exempt if needed**

Modify `chapter-ops/backend/app/__init__.py` — add import + registration (after the `tours_bp` registration):

Import block (add near other route imports):
```python
from app.routes.chapter_requests import chapter_requests_bp
```

Registration (add after `tours_bp`):
```python
    app.register_blueprint(chapter_requests_bp)
```

No CSRF exemption needed — endpoints are standard authenticated JSON POSTs that go through Axios with the X-CSRFToken header.

- [ ] **Step 5: Create stub notifications module (real implementation in Task 10)**

Create `chapter-ops/backend/app/services/chapter_request_notifications.py`:

```python
"""
Notification side-effects for ChapterRequest lifecycle events.

Stub module — full implementations land alongside the approve/reject routes.
Kept as a separate module so the submit route can import it without a circular
dependency, and so all lifecycle notifications live in one file.
"""

import logging

from app.models.chapter_request import ChapterRequest

logger = logging.getLogger(__name__)


def notify_approvers_of_new_request(req: ChapterRequest) -> None:
    """Notify the users authorized to approve this request (email + in-app)."""
    # Full implementation in Task 10.
    logger.info("notify_approvers_of_new_request: request=%s (stub)", req.id)


def notify_requester_approved(req: ChapterRequest) -> None:
    """Notify the requester that their chapter was approved."""
    logger.info("notify_requester_approved: request=%s (stub)", req.id)


def notify_requester_rejected(req: ChapterRequest) -> None:
    """Notify the requester that their chapter request was rejected."""
    logger.info("notify_requester_rejected: request=%s (stub)", req.id)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_submit.py -v`
Expected: all 8 PASS.

- [ ] **Step 7: Run full suite to confirm no regression**

Run: `pytest chapter-ops/backend -x -q`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add chapter-ops/backend/app/routes/chapter_requests.py chapter-ops/backend/app/__init__.py chapter-ops/backend/app/services/chapter_request_notifications.py chapter-ops/backend/tests/test_chapter_requests_submit.py
git commit -m "feat(onboarding): add chapter-request submit endpoint with dedup + approver-scope routing"
```

---

## Task 7: Requester endpoints — `GET /mine` and `DELETE /<id>`

**Files:**
- Modify: `chapter-ops/backend/app/routes/chapter_requests.py`
- Test: `chapter-ops/backend/tests/test_chapter_requests_mine.py`

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_chapter_requests_mine.py`:

```python
"""Tests for GET /mine and DELETE /<id>."""

from app.extensions import db
from app.models import ChapterRequest
from tests.conftest import make_user, make_organization, make_region

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _submit(client, org, region, name="Alpha Chapter"):
    return client.post("/api/onboarding/chapter-requests", json={
        "organization_id": org.id,
        "region_id": region.id,
        "name": name,
        "chapter_type": "undergraduate",
        "founder_role": "president",
    })


class TestMineEndpoint:
    def test_returns_current_users_pending_request(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        submit_resp = _submit(client, org, region)
        req_id = submit_resp.get_json()["request"]["id"]

        resp = client.get("/api/onboarding/chapter-requests/mine")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["request"]["id"] == req_id
        assert data["request"]["status"] == "pending"

    def test_returns_null_when_no_request(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="nobody@example.com", password=VALID_PASSWORD)
        db_session.commit()

        login(client, "nobody@example.com")
        resp = client.get("/api/onboarding/chapter-requests/mine")
        assert resp.status_code == 200
        assert resp.get_json()["request"] is None

    def test_returns_most_recent_when_multiple(self, app, client, db_session):
        """After a rejection, a new submit overrides the old one as 'mine'."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        first = _submit(client, org, region, "First Name")
        # Reject the first one manually
        req = db_session.get(ChapterRequest, first.get_json()["request"]["id"])
        req.status = "rejected"
        req.rejected_reason = "testing"
        db_session.commit()

        second = _submit(client, org, region, "Second Name")
        second_id = second.get_json()["request"]["id"]

        resp = client.get("/api/onboarding/chapter-requests/mine")
        assert resp.get_json()["request"]["id"] == second_id


class TestCancelEndpoint:
    def test_requester_can_cancel_own_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        submit_resp = _submit(client, org, region)
        req_id = submit_resp.get_json()["request"]["id"]

        resp = client.delete(f"/api/onboarding/chapter-requests/{req_id}")
        assert resp.status_code == 200

        req = db_session.get(ChapterRequest, req_id)
        assert req.status == "cancelled"

    def test_cannot_cancel_others_request(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        alice = make_user(email="alice@example.com", password=VALID_PASSWORD)
        make_user(email="bob@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        req_id = _submit(client, org, region).get_json()["request"]["id"]
        client.post("/api/auth/logout")

        login(client, "bob@example.com")
        resp = client.delete(f"/api/onboarding/chapter-requests/{req_id}")
        assert resp.status_code == 403

    def test_cannot_cancel_non_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        login(client, "alice@example.com")
        req_id = _submit(client, org, region).get_json()["request"]["id"]
        req = db_session.get(ChapterRequest, req_id)
        req.status = "approved"
        db_session.commit()

        resp = client.delete(f"/api/onboarding/chapter-requests/{req_id}")
        assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_mine.py -v`
Expected: FAIL (endpoints do not exist yet).

- [ ] **Step 3: Implement the endpoints**

Append to `chapter-ops/backend/app/routes/chapter_requests.py`:

```python
@chapter_requests_bp.route("/api/onboarding/chapter-requests/mine", methods=["GET"])
@login_required
def my_chapter_request():
    """Return the current user's most recent chapter request, or null if none."""
    req = (
        db.session.query(ChapterRequest)
        .filter_by(requester_user_id=current_user.id)
        .order_by(ChapterRequest.created_at.desc())
        .first()
    )
    return jsonify({"request": req.to_dict() if req else None}), 200


@chapter_requests_bp.route("/api/onboarding/chapter-requests/<request_id>", methods=["DELETE"])
@login_required
def cancel_chapter_request(request_id: str):
    """Requester cancels their own pending request."""
    req = db.session.get(ChapterRequest, request_id)
    if not req:
        return jsonify({"error": "Request not found."}), 404

    if req.requester_user_id != current_user.id:
        return jsonify({"error": "You cannot cancel another user's request."}), 403

    if req.status != "pending":
        return jsonify({"error": f"Cannot cancel a {req.status} request."}), 409

    req.status = "cancelled"
    req.acted_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({"success": True, "request": req.to_dict()}), 200
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_mine.py -v`
Expected: all 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/chapter_requests.py chapter-ops/backend/tests/test_chapter_requests_mine.py
git commit -m "feat(onboarding): add mine + cancel endpoints for chapter requests"
```

---

## Task 8: Approver list endpoint — `GET /api/chapter-requests/pending`

**Files:**
- Modify: `chapter-ops/backend/app/routes/chapter_requests.py`
- Test: `chapter-ops/backend/tests/test_chapter_requests_pending.py`

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_chapter_requests_pending.py`:

```python
"""Tests for GET /api/chapter-requests/pending (approver queue)."""

from app.extensions import db
from app.models import ChapterRequest
from tests.conftest import (
    make_user, make_organization, make_region, make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _insert_request(db_session, user, org, region, status="pending", approver_scope="org_admin", name="Alpha"):
    req = ChapterRequest(
        requester_user_id=user.id,
        organization_id=org.id,
        region_id=region.id,
        name=name,
        name_normalized=name.lower().replace(" ", ""),
        chapter_type="undergraduate",
        founder_role="president",
        status=status,
        approver_scope=approver_scope,
    )
    db_session.add(req)
    db_session.flush()
    return req


class TestPendingEndpoint:
    def test_org_admin_sees_their_orgs_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization(abbreviation="AKA")
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        _insert_request(db_session, requester, org, region, approver_scope="org_admin")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["requests"]) == 1
        assert data["requests"][0]["approver_scope"] == "org_admin"

    def test_org_admin_does_not_see_other_orgs(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        aka_admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        aka = make_organization(name="AKA", abbreviation="AKA")
        dst = make_organization(name="DST", abbreviation="DST")
        dst_region = make_region(dst, name="East")
        make_org_membership(aka_admin, aka, role="admin")
        _insert_request(db_session, requester, dst, dst_region, approver_scope="org_admin")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        assert resp.get_json()["requests"] == []

    def test_platform_admin_sees_platform_queue(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization(abbreviation="ZPhiB")
        region = make_region(org, name="Unaffiliated")
        _insert_request(db_session, requester, org, region, approver_scope="platform_admin")
        db_session.commit()

        login(client, "brandon@example.com")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["requests"]) == 1
        assert data["requests"][0]["approver_scope"] == "platform_admin"

    def test_random_user_gets_empty_list(self, app, client, db_session):
        """Users with no approval authority see an empty queue (not 403)."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="nobody@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "nobody@example.com")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.status_code == 200
        assert resp.get_json()["requests"] == []

    def test_non_pending_requests_excluded(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        _insert_request(db_session, requester, org, region, status="approved")
        _insert_request(db_session, requester, org, region, status="rejected", name="Beta")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.get("/api/chapter-requests/pending")
        assert resp.get_json()["requests"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_pending.py -v`
Expected: FAIL (404 on GET).

- [ ] **Step 3: Implement**

Append to `chapter-ops/backend/app/routes/chapter_requests.py`:

```python
# ── Approver endpoints ────────────────────────────────────────────────────────

def _orgs_user_admins(user_id: str) -> list[str]:
    """Return list of organization_ids where the user is an active admin."""
    rows = db.session.query(OrganizationMembership.organization_id).filter_by(
        user_id=user_id, role="admin", active=True
    ).all()
    return [r[0] for r in rows]


@chapter_requests_bp.route("/api/chapter-requests/pending", methods=["GET"])
@login_required
def list_pending_chapter_requests():
    """
    List chapter requests the caller is authorized to act on.

    - If the caller is an org admin of any org, they see pending `org_admin`-scoped
      requests for THOSE orgs.
    - If the caller is the platform founder, they additionally see pending
      `platform_admin`-scoped requests.
    - Everyone else sees an empty list (no 403 — approvers don't need to know
      this endpoint exists).
    """
    admin_org_ids = _orgs_user_admins(current_user.id)
    results: list[ChapterRequest] = []

    if admin_org_ids:
        results.extend(
            db.session.query(ChapterRequest)
            .filter(
                ChapterRequest.status == "pending",
                ChapterRequest.approver_scope == "org_admin",
                ChapterRequest.organization_id.in_(admin_org_ids),
            )
            .order_by(ChapterRequest.created_at.asc())
            .all()
        )

    if is_founder():
        results.extend(
            db.session.query(ChapterRequest)
            .filter(
                ChapterRequest.status == "pending",
                ChapterRequest.approver_scope == "platform_admin",
            )
            .order_by(ChapterRequest.created_at.asc())
            .all()
        )

    return jsonify({"requests": [r.to_dict() for r in results]}), 200
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_pending.py -v`
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/chapter_requests.py chapter-ops/backend/tests/test_chapter_requests_pending.py
git commit -m "feat(approvals): add GET /api/chapter-requests/pending for approver queue"
```

---

## Task 9: Approve endpoint — `POST /api/chapter-requests/<id>/approve`

**Files:**
- Modify: `chapter-ops/backend/app/routes/chapter_requests.py`
- Test: `chapter-ops/backend/tests/test_chapter_requests_approve.py`

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_chapter_requests_approve.py`:

```python
"""Tests for POST /api/chapter-requests/<id>/approve."""

from app.extensions import db
from app.models import Chapter, ChapterMembership, ChapterRequest
from tests.conftest import (
    make_user, make_organization, make_region, make_chapter,
    make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _insert_request(db_session, user, org, region, approver_scope="org_admin", name="Alpha Chapter"):
    req = ChapterRequest(
        requester_user_id=user.id,
        organization_id=org.id,
        region_id=region.id,
        name=name,
        name_normalized=name.lower().replace(" ", ""),
        chapter_type="undergraduate",
        founder_role="president",
        status="pending",
        approver_scope=approver_scope,
    )
    db_session.add(req)
    db_session.flush()
    return req


class TestApproveEndpoint:
    def test_org_admin_can_approve(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data["chapter"]["name"] == "Alpha Chapter"

        # ChapterRequest updated
        db_session.expire_all()
        refreshed = db_session.get(ChapterRequest, req.id)
        assert refreshed.status == "approved"
        assert refreshed.resulting_chapter_id == data["chapter"]["id"]
        assert refreshed.approved_by_user_id == admin.id
        assert refreshed.acted_at is not None

        # Real Chapter + founder ChapterMembership exist
        chapter = db_session.get(Chapter, data["chapter"]["id"])
        assert chapter is not None
        membership = db.session.query(ChapterMembership).filter_by(
            user_id=requester.id, chapter_id=chapter.id
        ).first()
        assert membership is not None
        assert membership.role == "president"

    def test_platform_admin_approves_platform_scope(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization(abbreviation="ZPhiB")
        region = make_region(org, name="Unaffiliated")
        req = _insert_request(db_session, requester, org, region, approver_scope="platform_admin")
        db_session.commit()

        login(client, "brandon@example.com")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 200

    def test_org_admin_cannot_approve_platform_scope(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region, approver_scope="platform_admin")
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 403

    def test_random_user_cannot_approve(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="random@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "random@example.com")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 403

    def test_cannot_approve_non_pending(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        req.status = "approved"
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 409

    def test_approve_rechecks_dedup_against_live_chapters(self, app, client, db_session):
        """If a chapter with the same name was created between submit and approve, 409."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region, name="Alpha Chapter")
        # Someone else created a chapter with the same name in the interim
        make_chapter(org, name="Alpha Chapter", region=region)
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{req.id}/approve")
        assert resp.status_code == 409
        assert "already" in resp.get_json()["error"].lower()
        db_session.expire_all()
        assert db_session.get(ChapterRequest, req.id).status == "pending"  # not flipped
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_approve.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement the approve endpoint**

Append to `chapter-ops/backend/app/routes/chapter_requests.py`:

```python
def _caller_can_act_on(req: ChapterRequest) -> bool:
    """True if the current user is authorized to approve/reject this request."""
    if req.approver_scope == "platform_admin":
        return is_founder()
    # org_admin scope — requires an admin OrganizationMembership for this specific org
    return db.session.query(OrganizationMembership.id).filter_by(
        user_id=current_user.id,
        organization_id=req.organization_id,
        role="admin",
        active=True,
    ).first() is not None


@chapter_requests_bp.route("/api/chapter-requests/<request_id>/approve", methods=["POST"])
@login_required
def approve_chapter_request(request_id: str):
    """Approve a pending chapter request: create the Chapter + period + membership."""
    # Lock the row for the duration of this transaction to prevent double-approve races.
    req = (
        db.session.query(ChapterRequest)
        .filter_by(id=request_id)
        .with_for_update()
        .first()
    )
    if not req:
        return jsonify({"error": "Request not found."}), 404

    if req.status != "pending":
        return jsonify({"error": f"Request is already {req.status}."}), 409

    if not _caller_can_act_on(req):
        return jsonify({"error": "You are not authorized to approve this request."}), 403

    # Re-check dedup against live chapters — the landscape may have changed
    # between submit and approve.
    if _dedup_collides(req.organization_id, req.region_id, req.name_normalized):
        return jsonify({
            "error": (
                "A chapter with this name already exists in this region. "
                "Reject this request or ask the founder to choose a different name."
            )
        }), 409

    requester = db.session.get(User, req.requester_user_id)
    org = db.session.get(Organization, req.organization_id)
    region = db.session.get(Region, req.region_id)

    from app.services.chapter_service import create_chapter_with_founder

    try:
        chapter, _period, _membership = create_chapter_with_founder(
            requester=requester,
            organization=org,
            region=region,
            name=req.name,
            designation=req.designation,
            chapter_type=req.chapter_type,
            city=req.city,
            state=req.state,
            country=req.country,
            timezone=req.timezone,
            founder_role=req.founder_role,
        )

        req.status = "approved"
        req.approved_by_user_id = current_user.id
        req.resulting_chapter_id = chapter.id
        req.acted_at = datetime.now(timezone.utc)

        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Failed to approve chapter request %s", req.id)
        return jsonify({"error": "Failed to approve request. Please try again."}), 500

    try:
        from app.services.chapter_request_notifications import notify_requester_approved
        notify_requester_approved(req)
    except Exception:
        logger.exception("Failed to send approval notification for %s", req.id)

    return jsonify({
        "success": True,
        "chapter": chapter.to_dict(),
        "request": req.to_dict(),
    }), 200
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_approve.py -v`
Expected: all 6 PASS.

- Note: `with_for_update()` is a no-op on SQLite, but the status-check immediately after still runs — so the idempotency guard holds in both test (SQLite) and prod (PostgreSQL).

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/chapter_requests.py chapter-ops/backend/tests/test_chapter_requests_approve.py
git commit -m "feat(approvals): add approve endpoint with row lock and dedup re-check"
```

---

## Task 10: Reject endpoint + email templates + notification wiring

**Files:**
- Modify: `chapter-ops/backend/app/routes/chapter_requests.py`
- Modify: `chapter-ops/backend/app/utils/email.py` (add three new email helpers)
- Modify: `chapter-ops/backend/app/services/chapter_request_notifications.py` (replace stubs with real impls)
- Test: `chapter-ops/backend/tests/test_chapter_requests_reject.py`

- [ ] **Step 1: Write the failing tests**

Create `chapter-ops/backend/tests/test_chapter_requests_reject.py`:

```python
"""Tests for POST /api/chapter-requests/<id>/reject."""

from app.extensions import db
from app.models import ChapterRequest
from tests.conftest import (
    make_user, make_organization, make_region, make_org_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _insert_request(db_session, user, org, region, approver_scope="org_admin"):
    req = ChapterRequest(
        requester_user_id=user.id,
        organization_id=org.id,
        region_id=region.id,
        name="Alpha Chapter",
        name_normalized="alphachapter",
        chapter_type="undergraduate",
        founder_role="president",
        status="pending",
        approver_scope=approver_scope,
    )
    db_session.add(req)
    db_session.flush()
    return req


class TestRejectEndpoint:
    def test_org_admin_can_reject_with_reason(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(
            f"/api/chapter-requests/{req.id}/reject",
            json={"reason": "Not a recognized chapter — please verify with IHQ."},
        )
        assert resp.status_code == 200
        db_session.expire_all()
        refreshed = db_session.get(ChapterRequest, req.id)
        assert refreshed.status == "rejected"
        assert "IHQ" in refreshed.rejected_reason
        assert refreshed.approved_by_user_id == admin.id

    def test_reject_requires_reason(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        # Missing reason
        resp = client.post(f"/api/chapter-requests/{req.id}/reject", json={})
        assert resp.status_code == 400
        # Empty reason
        resp = client.post(f"/api/chapter-requests/{req.id}/reject", json={"reason": "   "})
        assert resp.status_code == 400

    def test_reject_authority_check(self, app, client, db_session):
        """Random users can't reject."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="random@example.com", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "random@example.com")
        resp = client.post(
            f"/api/chapter-requests/{req.id}/reject",
            json={"reason": "nope"},
        )
        assert resp.status_code == 403

    def test_reject_non_pending_returns_409(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        req.status = "rejected"
        db_session.commit()

        login(client, "admin@aka.org")
        resp = client.post(
            f"/api/chapter-requests/{req.id}/reject",
            json={"reason": "second attempt"},
        )
        assert resp.status_code == 409

    def test_requester_can_submit_new_request_after_rejection(self, app, client, db_session):
        """After rejection, dedup for the same normalized name is cleared (old row is no longer pending)."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        requester = make_user(email="new@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        make_org_membership(admin, org, role="admin")
        req = _insert_request(db_session, requester, org, region)
        db_session.commit()

        login(client, "admin@aka.org")
        client.post(f"/api/chapter-requests/{req.id}/reject", json={"reason": "try again"})
        client.post("/api/auth/logout")

        login(client, "new@example.com")
        resp = client.post("/api/onboarding/chapter-requests", json={
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Alpha Chapter",
            "chapter_type": "undergraduate",
            "founder_role": "president",
        })
        assert resp.status_code == 201
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_reject.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement the reject endpoint**

Append to `chapter-ops/backend/app/routes/chapter_requests.py`:

```python
@chapter_requests_bp.route("/api/chapter-requests/<request_id>/reject", methods=["POST"])
@login_required
def reject_chapter_request(request_id: str):
    """Reject a pending chapter request with a required reason."""
    data = request.get_json() or {}
    reason = (data.get("reason") or "").strip()
    if not reason:
        return jsonify({"error": "Rejection reason is required."}), 400

    req = (
        db.session.query(ChapterRequest)
        .filter_by(id=request_id)
        .with_for_update()
        .first()
    )
    if not req:
        return jsonify({"error": "Request not found."}), 404
    if req.status != "pending":
        return jsonify({"error": f"Request is already {req.status}."}), 409
    if not _caller_can_act_on(req):
        return jsonify({"error": "You are not authorized to reject this request."}), 403

    req.status = "rejected"
    req.rejected_reason = reason
    req.approved_by_user_id = current_user.id
    req.acted_at = datetime.now(timezone.utc)
    db.session.commit()

    try:
        from app.services.chapter_request_notifications import notify_requester_rejected
        notify_requester_rejected(req)
    except Exception:
        logger.exception("Failed to send rejection notification for %s", req.id)

    return jsonify({"success": True, "request": req.to_dict()}), 200
```

- [ ] **Step 4: Run tests to verify the endpoint itself passes**

Run: `pytest chapter-ops/backend/tests/test_chapter_requests_reject.py -v`
Expected: all 5 PASS.

- [ ] **Step 5: Add three email helpers**

Append to `chapter-ops/backend/app/utils/email.py`:

```python
# ---------------------------------------------------------------------------
# Chapter request lifecycle emails
# ---------------------------------------------------------------------------

def send_chapter_request_submitted_email(
    to: str,
    approver_name: str,
    requester_name: str,
    requester_email: str,
    chapter_name: str,
    organization_name: str,
    region_name: str,
) -> bool:
    """Notify an approver that a new chapter request is waiting."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New chapter request</h2>
        <p>Hi {_h(approver_name)},</p>
        <p>{_h(requester_name)} ({_h(requester_email)}) has requested to create a new chapter:</p>
        <ul style="line-height:1.8;">
            <li><strong>Chapter:</strong> {_h(chapter_name)}</li>
            <li><strong>Organization:</strong> {_h(organization_name)}</li>
            <li><strong>Region:</strong> {_h(region_name)}</li>
        </ul>
        <p>
            <a href="{frontend_url}/ihq"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Review in IHQ Dashboard
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Review the request and approve or reject it from the Pending Chapter Requests section.
        </p>
    </div>
    """
    return send_email(
        to=to,
        subject=f"New chapter request: {chapter_name} ({organization_name})",
        html=body,
    )


def send_chapter_request_approved_email(
    to: str,
    requester_name: str,
    chapter_name: str,
) -> bool:
    """Notify the requester that their chapter was approved."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your chapter has been approved</h2>
        <p>Hi {_h(requester_name)},</p>
        <p>Great news — <strong>{_h(chapter_name)}</strong> has been approved and your chapter is now live on ChapterOps.</p>
        <p>
            <a href="{frontend_url}/dashboard"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Go to your dashboard
            </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">
            Next steps: invite your officers, configure your fee types, and start tracking dues. We've included a setup checklist in-app.
        </p>
    </div>
    """
    return send_email(
        to=to,
        subject="Your chapter has been approved — welcome to ChapterOps",
        html=body,
    )


def send_chapter_request_rejected_email(
    to: str,
    requester_name: str,
    chapter_name: str,
    reason: str,
) -> bool:
    """Notify the requester that their chapter request was rejected."""
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173")
    body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your chapter request was not approved</h2>
        <p>Hi {_h(requester_name)},</p>
        <p>Your request to create <strong>{_h(chapter_name)}</strong> on ChapterOps was not approved.</p>
        <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:20px 0;">
            <strong>Reason:</strong><br>
            {_h(reason)}
        </div>
        <p>You can submit a new request anytime if the situation changes.</p>
        <p>
            <a href="{frontend_url}/onboarding"
               style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Start a new request
            </a>
        </p>
    </div>
    """
    return send_email(
        to=to,
        subject="Your chapter request was not approved",
        html=body,
    )
```

- [ ] **Step 6: Replace notification stubs with real implementations**

Replace the contents of `chapter-ops/backend/app/services/chapter_request_notifications.py` with:

```python
"""
Notification side-effects for ChapterRequest lifecycle events.

Sends both in-app notifications (via notification_service) and Resend emails.
All side-effects are best-effort: failures are logged but do not abort the
triggering route's transaction (caller wraps these in try/except).
"""

import logging

from flask import current_app

from app.extensions import db
from app.models import OrganizationMembership, User
from app.models.chapter_request import ChapterRequest
from app.models.notification import Notification
from app.utils.email import (
    send_chapter_request_approved_email,
    send_chapter_request_rejected_email,
    send_chapter_request_submitted_email,
)

logger = logging.getLogger(__name__)


def _in_app_for_user(
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    link: str | None = None,
    chapter_id: str | None = None,
) -> None:
    """
    Create a user-targeted in-app notification.

    The existing `Notification` model requires `chapter_id`, but chapter requests
    operate before a chapter exists. To keep this working, we pass `chapter_id=None`
    when no chapter context exists — the model's chapter_id column is nullable
    (verify in migration), OR we skip in-app for requesters pre-chapter and rely
    on email + polling only.
    """
    # Notification.chapter_id is NOT NULL in the schema today, so skip in-app
    # notifications when chapter_id is None (requester has no chapter yet).
    # Approver notifications always have chapter_id=None too since the chapter
    # doesn't exist yet. In-app for approvers is therefore email-only for now
    # (follow-up: add chapter_id-nullable support if in-app becomes important).
    if chapter_id is None:
        return
    try:
        db.session.add(Notification(
            chapter_id=chapter_id,
            recipient_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            link=link,
            is_read=False,
        ))
        db.session.commit()
    except Exception:
        logger.exception("Failed to create in-app notification")


def notify_approvers_of_new_request(req: ChapterRequest) -> None:
    """Email the approvers who can act on this request."""
    approver_emails: list[tuple[str, str]] = []

    if req.approver_scope == "org_admin":
        rows = (
            db.session.query(User.email, User.first_name, User.last_name)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .filter(
                OrganizationMembership.organization_id == req.organization_id,
                OrganizationMembership.role == "admin",
                OrganizationMembership.active == True,
            )
            .all()
        )
        approver_emails = [(r[0], f"{r[1]} {r[2]}") for r in rows]
    elif req.approver_scope == "platform_admin":
        founder_email = (current_app.config.get("FOUNDER_EMAIL") or "").strip()
        if founder_email:
            founder = db.session.query(User).filter(
                db.func.lower(User.email) == founder_email.lower()
            ).first()
            if founder:
                approver_emails = [(founder.email, founder.full_name)]

    requester_name = req.requester.full_name if req.requester else "A user"
    requester_email = req.requester.email if req.requester else ""
    for email, name in approver_emails:
        send_chapter_request_submitted_email(
            to=email,
            approver_name=name,
            requester_name=requester_name,
            requester_email=requester_email,
            chapter_name=req.name,
            organization_name=req.organization.name if req.organization else "",
            region_name=req.region.name if req.region else "",
        )


def notify_requester_approved(req: ChapterRequest) -> None:
    """Email + in-app notification to the requester."""
    if not req.requester:
        return
    send_chapter_request_approved_email(
        to=req.requester.email,
        requester_name=req.requester.full_name,
        chapter_name=req.name,
    )
    _in_app_for_user(
        user_id=req.requester.id,
        notification_type="chapter_request_approved",
        title="Chapter approved",
        message=f"{req.name} is now live. Welcome aboard.",
        link="/dashboard",
        chapter_id=req.resulting_chapter_id,
    )


def notify_requester_rejected(req: ChapterRequest) -> None:
    """Email + in-app notification to the requester on rejection."""
    if not req.requester:
        return
    send_chapter_request_rejected_email(
        to=req.requester.email,
        requester_name=req.requester.full_name,
        chapter_name=req.name,
        reason=req.rejected_reason or "(no reason provided)",
    )
    # No chapter_id → in-app skipped; requester learns via email + polling.
```

- [ ] **Step 7: Run full backend suite**

Run: `pytest chapter-ops/backend -x -q`
Expected: all PASS. (Email helpers aren't exercised in tests — they depend on Resend, and failures are swallowed by the route's try/except.)

- [ ] **Step 8: Commit**

```bash
git add chapter-ops/backend/app/routes/chapter_requests.py chapter-ops/backend/app/utils/email.py chapter-ops/backend/app/services/chapter_request_notifications.py chapter-ops/backend/tests/test_chapter_requests_reject.py
git commit -m "feat(approvals): add reject endpoint, lifecycle emails, and approver/requester notifications"
```

---

## Task 11: Remove legacy `POST /api/onboarding/chapters`

**Purpose:** Clean up now that the approval flow fully supplants the direct-create endpoint. Frontend still calls it at this point — removal coordinates with Task 13 (frontend update). Do this commit AFTER Task 13 lands so the frontend has already been migrated.

**Note:** This task's position in the plan is intentional — the preceding backend-only work is complete. But **execute this task AFTER Task 13** so the frontend isn't broken mid-deploy. Move this below Task 13 if executing strictly in order.

**Files:**
- Modify: `chapter-ops/backend/app/routes/onboarding.py` (remove `create_chapter`)
- Modify: `chapter-ops/backend/tests/test_onboarding.py` (delete `TestCreateChapter` class and `TestFullOnboardingFlow.test_founder_flow` — the latter belongs rewritten as a chapter-request flow, which Task 15 covers)

- [ ] **Step 1: Delete the route function**

In `chapter-ops/backend/app/routes/onboarding.py`, remove:
- The entire `create_chapter()` function and its `@onboarding_bp.route("/chapters", methods=["POST"])` decorator
- The `from app.services.chapter_service import create_chapter_with_founder` import if nothing else in the file uses it

- [ ] **Step 2: Delete obsolete tests**

In `chapter-ops/backend/tests/test_onboarding.py`, delete:
- The entire `class TestCreateChapter:` (all its test methods)
- The `test_founder_flow` method inside `class TestFullOnboardingFlow:` (it references the removed endpoint; Task 15 rewrites this as an E2E test)

- [ ] **Step 3: Run full suite — confirm no new failures**

Run: `pytest chapter-ops/backend -x -q`
Expected: all PASS.

- [ ] **Step 4: Confirm endpoint is gone with a 404 probe**

```bash
pytest chapter-ops/backend -k "chapter_requests" -q
```

Expected: the chapter-request test suite still passes.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/backend/app/routes/onboarding.py chapter-ops/backend/tests/test_onboarding.py
git commit -m "refactor(onboarding): remove legacy POST /api/onboarding/chapters (superseded by approval flow)"
```

---

## Task 12: Frontend — TypeScript types + `chapterRequestService.ts`

**Files:**
- Create: `chapter-ops/frontend/src/types/chapterRequest.ts`
- Modify: `chapter-ops/frontend/src/types/index.ts` (re-export)
- Create: `chapter-ops/frontend/src/services/chapterRequestService.ts`

- [ ] **Step 1: Create the types file**

Create `chapter-ops/frontend/src/types/chapterRequest.ts`:

```ts
export type ChapterRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type ChapterRequestApproverScope = "org_admin" | "platform_admin";

export type ChapterRequestFounderRole =
  | "member"
  | "secretary"
  | "treasurer"
  | "vice_president"
  | "president";

export interface ChapterRequest {
  id: string;
  requester_user_id: string;
  requester_name: string | null;
  requester_email: string | null;
  organization_id: string;
  organization_name: string | null;
  region_id: string;
  region_name: string | null;
  name: string;
  designation: string | null;
  chapter_type: "undergraduate" | "graduate";
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  founder_role: ChapterRequestFounderRole;
  status: ChapterRequestStatus;
  approver_scope: ChapterRequestApproverScope;
  approved_by_user_id: string | null;
  rejected_reason: string | null;
  resulting_chapter_id: string | null;
  acted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitChapterRequestPayload {
  organization_id: string;
  region_id: string;
  name: string;
  designation?: string;
  chapter_type: "undergraduate" | "graduate";
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  founder_role: ChapterRequestFounderRole;
}
```

- [ ] **Step 2: Re-export from types index**

Modify `chapter-ops/frontend/src/types/index.ts`, add:
```ts
export * from "./chapterRequest";
```

- [ ] **Step 3: Create the service file**

Create `chapter-ops/frontend/src/services/chapterRequestService.ts`:

```ts
import api from "@/lib/api";
import type {
  ChapterRequest,
  SubmitChapterRequestPayload,
} from "@/types/chapterRequest";

interface ChapterApprovedResponse {
  success: true;
  chapter: { id: string; name: string; [k: string]: unknown };
  request: ChapterRequest;
}

export async function submitChapterRequest(
  payload: SubmitChapterRequestPayload
): Promise<ChapterRequest> {
  const { data } = await api.post<{ success: true; request: ChapterRequest }>(
    "/api/onboarding/chapter-requests",
    payload
  );
  return data.request;
}

export async function fetchMyChapterRequest(): Promise<ChapterRequest | null> {
  const { data } = await api.get<{ request: ChapterRequest | null }>(
    "/api/onboarding/chapter-requests/mine"
  );
  return data.request;
}

export async function cancelMyChapterRequest(requestId: string): Promise<void> {
  await api.delete(`/api/onboarding/chapter-requests/${requestId}`);
}

export async function fetchPendingChapterRequests(): Promise<ChapterRequest[]> {
  const { data } = await api.get<{ requests: ChapterRequest[] }>(
    "/api/chapter-requests/pending"
  );
  return data.requests;
}

export async function approveChapterRequest(
  requestId: string
): Promise<ChapterApprovedResponse> {
  const { data } = await api.post<ChapterApprovedResponse>(
    `/api/chapter-requests/${requestId}/approve`
  );
  return data;
}

export async function rejectChapterRequest(
  requestId: string,
  reason: string
): Promise<ChapterRequest> {
  const { data } = await api.post<{ success: true; request: ChapterRequest }>(
    `/api/chapter-requests/${requestId}/reject`,
    { reason }
  );
  return data.request;
}
```

- [ ] **Step 4: Typecheck**

```bash
cd chapter-ops/frontend
npm run typecheck
```

(or `npx tsc --noEmit` if no typecheck script exists)

Expected: no errors introduced.

- [ ] **Step 5: Commit**

```bash
git add chapter-ops/frontend/src/types/chapterRequest.ts chapter-ops/frontend/src/types/index.ts chapter-ops/frontend/src/services/chapterRequestService.ts
git commit -m "feat(frontend): add ChapterRequest types and service layer"
```

---

## Task 13: Frontend — `ChapterStep` submits request + `PendingApprovalScreen`

**Files:**
- Modify: `chapter-ops/frontend/src/pages/onboarding/ChapterStep.tsx` (submit target change + navigate to pending screen)
- Create: `chapter-ops/frontend/src/pages/onboarding/PendingApprovalScreen.tsx`
- Modify: `chapter-ops/frontend/src/pages/Onboarding.tsx` (register pending step in the onboarding state machine)
- Modify: `chapter-ops/frontend/src/stores/onboardingStore.ts` (add pending-request state if this is how the store models steps)

- [ ] **Step 1: Read the current onboarding state machine**

Read the following files to understand the current state model — this informs exactly what to wire up:

```bash
cat chapter-ops/frontend/src/pages/Onboarding.tsx
cat chapter-ops/frontend/src/stores/onboardingStore.ts
cat chapter-ops/frontend/src/pages/onboarding/ChapterStep.tsx
cat chapter-ops/frontend/src/pages/onboarding/SuccessStep.tsx
```

- [ ] **Step 2: Update `ChapterStep.tsx` to submit a chapter request**

In the submit handler of `ChapterStep.tsx`, replace the existing call to `onboardingService.createChapter(...)` (or however chapters are currently submitted — check the current code) with:

```ts
import { submitChapterRequest } from "@/services/chapterRequestService";

// ... inside the submit handler:
try {
  const req = await submitChapterRequest({
    organization_id,
    region_id,
    name,
    designation,
    chapter_type,
    city,
    state,
    country,
    timezone,
    founder_role,
  });
  // Navigate to the pending approval screen instead of the success/checklist screen
  goToPendingStep(req);  // wire this through the onboarding store/state
} catch (err: any) {
  setError(err?.response?.data?.error ?? "Failed to submit request. Please try again.");
}
```

Note: the exact plumbing (`goToPendingStep`, route navigation, or local state flag) depends on how `Onboarding.tsx` drives step progression. If the current pattern uses a `step` enum in `onboardingStore`, add a new `"pending_approval"` variant and set it on success; `Onboarding.tsx` then renders `PendingApprovalScreen` for that variant.

- [ ] **Step 3: Create `PendingApprovalScreen.tsx`**

Create `chapter-ops/frontend/src/pages/onboarding/PendingApprovalScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  cancelMyChapterRequest,
  fetchMyChapterRequest,
} from "@/services/chapterRequestService";
import type { ChapterRequest } from "@/types/chapterRequest";
import { useAuthStore } from "@/stores/authStore";

const POLL_INTERVAL_MS = 30_000;

export default function PendingApprovalScreen({
  initialRequest,
}: {
  initialRequest: ChapterRequest;
}) {
  const [req, setReq] = useState<ChapterRequest>(initialRequest);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const refreshAuth = useAuthStore((s) => s.refresh);

  useEffect(() => {
    const tick = async () => {
      try {
        const latest = await fetchMyChapterRequest();
        if (!latest) return;
        setReq(latest);
        if (latest.status === "approved") {
          await refreshAuth?.();
          navigate("/dashboard", { replace: true });
        }
      } catch (err) {
        // silent — polling continues
      }
    };
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [navigate, refreshAuth]);

  const approverLabel =
    req.approver_scope === "org_admin"
      ? `${req.organization_name} IHQ`
      : "a ChapterOps platform admin";

  const handleCancel = async () => {
    if (!confirm("Cancel this chapter request? You can submit a new one afterward.")) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelMyChapterRequest(req.id);
      navigate("/onboarding", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to cancel. Please try again.");
      setCancelling(false);
    }
  };

  if (req.status === "rejected") {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <h1 className="font-heading text-4xl font-black tracking-tight mb-4">
          Your chapter request wasn't approved
        </h1>
        <div className="border-l-4 border-red-500 bg-red-50 text-red-900 px-4 py-3 mb-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-1">
            Reason
          </div>
          <div>{req.rejected_reason}</div>
        </div>
        <button
          onClick={() => navigate("/onboarding", { replace: true })}
          className="px-4 py-2.5 bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] font-semibold"
        >
          Start a new request
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-16 px-6">
      <h1 className="font-heading text-4xl font-black tracking-tight mb-2">
        Chapter request pending
      </h1>
      <p className="text-content-secondary mb-8">
        Waiting on {approverLabel} to review your request. We'll email you when
        a decision is made.
      </p>
      <div className="border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 mb-8">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-content-muted">Chapter</dt>
            <dd className="font-semibold">{req.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-muted">Organization</dt>
            <dd>{req.organization_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-muted">Region</dt>
            <dd>{req.region_name}</dd>
          </div>
          {req.city && req.state && (
            <div className="flex justify-between">
              <dt className="text-content-muted">Location</dt>
              <dd>
                {req.city}, {req.state}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-content-muted">Submitted</dt>
            <dd>{new Date(req.created_at).toLocaleString()}</dd>
          </div>
        </dl>
      </div>
      {error && (
        <div className="border-l-4 border-red-500 bg-red-50 text-red-900 px-4 py-3 mb-4">
          {error}
        </div>
      )}
      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="text-sm text-content-muted underline hover:text-content-primary disabled:opacity-50"
      >
        {cancelling ? "Cancelling…" : "Cancel this request"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire the pending screen into `Onboarding.tsx`**

In `Onboarding.tsx`, at page load (or after successful submit in ChapterStep), call `fetchMyChapterRequest()`. If a pending request exists, render `PendingApprovalScreen` instead of the multi-step flow. Rough sketch:

```tsx
const [pendingRequest, setPendingRequest] = useState<ChapterRequest | null>(null);
const [loaded, setLoaded] = useState(false);

useEffect(() => {
  (async () => {
    const req = await fetchMyChapterRequest();
    if (req && req.status === "pending") setPendingRequest(req);
    setLoaded(true);
  })();
}, []);

if (!loaded) return <FullScreenSpinner />;
if (pendingRequest) return <PendingApprovalScreen initialRequest={pendingRequest} />;

// else render existing multi-step onboarding
```

- [ ] **Step 5: Gate `ProtectedRoute` — users with pending requests route to `/onboarding`**

If a logged-in user has no `active_chapter_id` AND has a pending chapter request, the existing logic that redirects them to `/onboarding` is sufficient — they land on the pending screen via the `Onboarding.tsx` change in Step 4. Verify by reading `ProtectedRoute.tsx`; no change likely needed.

- [ ] **Step 6: Typecheck + manual smoke**

```bash
cd chapter-ops/frontend
npm run typecheck
npm run dev
```

In a browser, complete the onboarding flow up to chapter submission; confirm the pending screen renders. Approve via the backend (either manually in psql or via the IHQ dashboard after Task 14) and confirm the pending screen auto-redirects within 30 seconds.

- [ ] **Step 7: Commit**

```bash
git add chapter-ops/frontend/src/pages/onboarding/ChapterStep.tsx chapter-ops/frontend/src/pages/onboarding/PendingApprovalScreen.tsx chapter-ops/frontend/src/pages/Onboarding.tsx chapter-ops/frontend/src/stores/onboardingStore.ts
git commit -m "feat(frontend): route chapter creation through approval flow with pending screen"
```

---

## Task 14: Frontend — IHQ Dashboard pending-requests section + reject modal

**Files:**
- Modify: `chapter-ops/frontend/src/pages/IHQDashboard.tsx`

- [ ] **Step 1: Add state + fetch**

At the top of `IHQDashboard`, add:

```tsx
import {
  approveChapterRequest,
  fetchPendingChapterRequests,
  rejectChapterRequest,
} from "@/services/chapterRequestService";
import type { ChapterRequest } from "@/types/chapterRequest";

// ...inside the component:
const [pendingRequests, setPendingRequests] = useState<ChapterRequest[]>([]);
const [actioningId, setActioningId] = useState<string | null>(null);
const [rejectingReq, setRejectingReq] = useState<ChapterRequest | null>(null);
const [rejectReason, setRejectReason] = useState("");
const [rejectError, setRejectError] = useState<string | null>(null);

useEffect(() => {
  (async () => {
    try {
      setPendingRequests(await fetchPendingChapterRequests());
    } catch {
      /* empty array is fine */
    }
  })();
}, []);

const handleApprove = async (reqId: string) => {
  setActioningId(reqId);
  try {
    await approveChapterRequest(reqId);
    setPendingRequests((rs) => rs.filter((r) => r.id !== reqId));
  } catch (err: any) {
    alert(err?.response?.data?.error ?? "Failed to approve.");
  } finally {
    setActioningId(null);
  }
};

const submitRejection = async () => {
  if (!rejectingReq) return;
  if (!rejectReason.trim()) {
    setRejectError("Reason is required.");
    return;
  }
  setActioningId(rejectingReq.id);
  setRejectError(null);
  try {
    await rejectChapterRequest(rejectingReq.id, rejectReason.trim());
    setPendingRequests((rs) => rs.filter((r) => r.id !== rejectingReq.id));
    setRejectingReq(null);
    setRejectReason("");
  } catch (err: any) {
    setRejectError(err?.response?.data?.error ?? "Failed to reject.");
  } finally {
    setActioningId(null);
  }
};
```

- [ ] **Step 2: Render the section**

Near the top of the IHQDashboard JSX (above the KPI cards), add:

```tsx
{pendingRequests.length > 0 && (
  <section className="border border-[var(--color-border)] bg-[var(--color-bg-card)] mb-8">
    <div className="border-t-2 border-[var(--color-text-heading)] mt-[2px] border-b border-[var(--color-border)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
        Pending Chapter Requests
      </div>
      <h2 className="font-heading text-2xl font-black tracking-tight">
        {pendingRequests.length} request{pendingRequests.length === 1 ? "" : "s"} awaiting review
      </h2>
    </div>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted border-b border-[var(--color-border)]">
          <th className="text-left px-4 py-2">Requester</th>
          <th className="text-left px-4 py-2">Chapter</th>
          <th className="text-left px-4 py-2">Region</th>
          <th className="text-left px-4 py-2">Type</th>
          <th className="text-left px-4 py-2">Scope</th>
          <th className="text-left px-4 py-2">Submitted</th>
          <th className="text-right px-4 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {pendingRequests.map((r) => (
          <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
            <td className="px-4 py-3">
              <div className="font-semibold">{r.requester_name}</div>
              <div className="text-content-muted text-xs">{r.requester_email}</div>
            </td>
            <td className="px-4 py-3">
              <div className="font-semibold">{r.name}</div>
              <div className="text-content-muted text-xs">
                {r.city && r.state ? `${r.city}, ${r.state}` : ""}
              </div>
            </td>
            <td className="px-4 py-3">{r.region_name}</td>
            <td className="px-4 py-3 capitalize">{r.chapter_type}</td>
            <td className="px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 bg-amber-50 text-amber-700">
                {r.approver_scope === "platform_admin" ? "Platform" : "Org"}
              </span>
            </td>
            <td className="px-4 py-3 text-content-muted">
              {new Date(r.created_at).toLocaleDateString()}
            </td>
            <td className="px-4 py-3 text-right space-x-2">
              <button
                onClick={() => handleApprove(r.id)}
                disabled={actioningId === r.id}
                className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => {
                  setRejectingReq(r);
                  setRejectReason("");
                  setRejectError(null);
                }}
                disabled={actioningId === r.id}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
              >
                Reject
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
)}

{rejectingReq && (
  <div
    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4"
    onClick={() => setRejectingReq(null)}
  >
    <div
      className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)] max-w-md w-full p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="font-heading text-2xl font-black tracking-tight mb-2">
        Reject chapter request
      </h3>
      <p className="text-sm text-content-secondary mb-4">
        {rejectingReq.name} — {rejectingReq.organization_name}
      </p>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted mb-1">
        Reason (required, visible to the requester)
      </label>
      <textarea
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
        rows={4}
        className="w-full mb-2"
        placeholder="e.g. This chapter is not on our current roster; please verify with IHQ before resubmitting."
      />
      {rejectError && <div className="text-red-600 text-sm mb-2">{rejectError}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={() => setRejectingReq(null)}
          className="px-3 py-2 text-sm text-content-muted hover:text-content-primary"
        >
          Cancel
        </button>
        <button
          onClick={submitRejection}
          disabled={actioningId === rejectingReq.id}
          className="px-4 py-2 bg-red-600 text-white text-sm font-semibold uppercase tracking-wider disabled:opacity-50"
        >
          Confirm reject
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Typecheck + smoke test**

```bash
cd chapter-ops/frontend
npm run typecheck
npm run dev
```

In a browser:
1. Log in as an org admin (or as the founder email configured in `FOUNDER_EMAIL`).
2. Navigate to `/ihq`.
3. Confirm a pending request (submitted via Task 13 flow) appears at the top.
4. Click Approve — row disappears, and if you're viewing as the requester in another window, the pending screen redirects to `/dashboard` within 30s.
5. Submit another request, click Reject, enter a reason, confirm — row disappears, requester sees the rejection reason.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/frontend/src/pages/IHQDashboard.tsx
git commit -m "feat(frontend): add pending chapter requests section to IHQ dashboard"
```

---

## Task 15: End-to-end integration test

**Purpose:** Replace the deleted `TestFullOnboardingFlow::test_founder_flow` with one that covers the new approval-gated flow.

**Files:**
- Modify: `chapter-ops/backend/tests/test_onboarding.py`

- [ ] **Step 1: Add new E2E test class**

Append to `chapter-ops/backend/tests/test_onboarding.py`:

```python
class TestChapterRequestFullFlow:
    """E2E: register → submit chapter request → approve → chapter exists and active_chapter set."""

    def test_org_admin_approval_flow(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        # Org admin already exists
        admin = make_user(email="admin@aka.org", password=VALID_PASSWORD)
        org = make_organization(name="Alpha Kappa Alpha", abbreviation="AKA", org_type="sorority")
        region = make_region(org, name="Unaffiliated")
        from tests.conftest import make_org_membership
        make_org_membership(admin, org, role="admin")
        db_session.commit()

        # 1. Requester registers
        resp = client.post("/api/auth/register", json={
            "email": "pres@example.com",
            "password": VALID_PASSWORD,
            "first_name": "New",
            "last_name": "President",
        })
        assert resp.status_code == 201

        # 2. Requester submits chapter request
        resp = client.post("/api/onboarding/chapter-requests", json={
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Beta Zeta Chapter",
            "chapter_type": "undergraduate",
            "founder_role": "president",
        })
        assert resp.status_code == 201
        request_id = resp.get_json()["request"]["id"]
        assert resp.get_json()["request"]["approver_scope"] == "org_admin"

        # 3. Requester checks /mine
        resp = client.get("/api/onboarding/chapter-requests/mine")
        assert resp.get_json()["request"]["status"] == "pending"

        # 4. Switch to admin, approve
        client.post("/api/auth/logout")
        login(client, "admin@aka.org")
        resp = client.post(f"/api/chapter-requests/{request_id}/approve")
        assert resp.status_code == 200
        chapter_id = resp.get_json()["chapter"]["id"]

        # 5. Requester logs back in, should have active chapter
        client.post("/api/auth/logout")
        login(client, "pres@example.com")
        resp = client.get("/api/auth/user")
        assert resp.get_json()["user"]["active_chapter_id"] == chapter_id

    def test_platform_admin_approval_flow(self, app, client, db_session):
        """Grassroots path: unclaimed org, platform admin approves."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password=VALID_PASSWORD)
        org = make_organization(name="Zeta Phi Beta", abbreviation="ZPhiB", org_type="sorority")
        region = make_region(org, name="Unaffiliated")
        db_session.commit()

        # Requester registers and submits
        client.post("/api/auth/register", json={
            "email": "zeta@example.com",
            "password": VALID_PASSWORD,
            "first_name": "Zeta",
            "last_name": "Founder",
        })
        resp = client.post("/api/onboarding/chapter-requests", json={
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Pioneer Chapter",
            "chapter_type": "graduate",
            "founder_role": "president",
        })
        request_id = resp.get_json()["request"]["id"]
        assert resp.get_json()["request"]["approver_scope"] == "platform_admin"

        # Platform admin (founder) approves
        client.post("/api/auth/logout")
        login(client, "brandon@example.com")
        resp = client.post(f"/api/chapter-requests/{request_id}/approve")
        assert resp.status_code == 200
```

- [ ] **Step 2: Run tests**

Run: `pytest chapter-ops/backend/tests/test_onboarding.py::TestChapterRequestFullFlow -v`
Expected: both PASS.

- [ ] **Step 3: Run full suite one more time**

Run: `pytest chapter-ops/backend -x -q`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/backend/tests/test_onboarding.py
git commit -m "test(onboarding): add E2E coverage for chapter-request approval flow"
```

---

## Self-review

Before marking this plan done, walk through the spec's sections and confirm each has a task:

| Spec section | Covered by |
|---|---|
| Org seeding + locked org creation | Task 1 (gate), Task 4 (seed) |
| ChapterRequest entity + indexes | Task 3 (model), Task 4 (table + indexes) |
| Approval routing (approver_scope resolution) | Task 6 (submit computes it) |
| "Unaffiliated" default region per seeded org | Task 4 |
| Submit API | Task 6 |
| Mine / Cancel API | Task 7 |
| Pending approver queue API | Task 8 |
| Approve transaction w/ row lock + dedup re-check | Task 9 |
| Reject API | Task 10 |
| Notifications (email + in-app) | Task 10 |
| Modified `POST /api/onboarding/organizations` gate | Task 1 |
| Removed `POST /api/onboarding/chapters` | Task 11 |
| Frontend types + service | Task 12 |
| Frontend submit → pending screen | Task 13 |
| Frontend approver UI + reject modal | Task 14 |
| E2E coverage | Task 15 |

Tasks in dependency order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 12 → 13 → 14 → 11 → 15. (Task 11, frontend-dependent removal, moved after Task 14 to avoid mid-deploy breakage.)
