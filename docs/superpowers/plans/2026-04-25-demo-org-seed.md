# Demo Organization Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Flask CLI commands — `flask seed-demo-org` and `flask teardown-demo-org` — that stand up and tear down a persistent fictional organization (DGLO) for prospect demos.

**Architecture:** Single CLI module at `app/cli/seed_demo.py` with all seed and teardown logic. Commands are registered in `app/__init__.py` alongside the existing `make-org-admin` and `send-dues-reminders` commands. Idempotent find-or-create on every insert. Teardown is hard-gated to the DGLO org and requires an explicit `--confirm` flag.

**Tech Stack:** Flask 3.x, SQLAlchemy 2.x, click (already in the project), bcrypt for passwords, the existing `dues_service` helpers.

**Spec:** [docs/superpowers/specs/2026-04-25-demo-org-seed-design.md](../specs/2026-04-25-demo-org-seed-design.md)

---

## Verified Facts (resolved during planning)

These overrides any conflicting language in the spec:

- `Chapter.chapter_type` values are **`"undergraduate"`** or **`"graduate"`** (not "collegiate" — that's the `ChapterMembership.member_type` value).
- Fee types in `chapter.config["fee_types"]` use **`"default_amount"`** as the dollar field name (not `"amount"`). See [dues_service.py:83](../../../chapter-ops/backend/app/services/dues_service.py#L83).
- Stripe stub fields confirmed: `Chapter.stripe_account_id` (String, nullable) and `Chapter.stripe_onboarding_complete` (Boolean, default False).
- `RegionMembership.role` valid values: `"member"`, `"regional_director"`, `"regional_1st_vice"`, `"regional_2nd_vice"`, `"regional_secretary"`, `"regional_treasurer"`.
- `OrganizationMembership.role` valid values: `"member"`, `"admin"`.
- `User.set_password(plaintext)` is the only correct way to set a password — handles bcrypt internally.
- `dues_service.seed_period_dues(chapter, period)` is fully idempotent. Skips existing rows.
- `dues_service.apply_payment(chapter, user_id, fee_type_id, amount)` updates dues rows but does **not** create a Payment record. The seed will create Payment rows separately for the financial members.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `chapter-ops/backend/app/cli/__init__.py` | Create (empty) | Mark `cli` as a package |
| `chapter-ops/backend/app/cli/seed_demo.py` | Create (~400 lines) | All seed and teardown logic, constants, helpers |
| `chapter-ops/backend/app/__init__.py` | Modify (~lines 300+) | Register `seed-demo-org` and `teardown-demo-org` CLI commands |

The `app/cli/` package is new. Existing CLI commands (`make-org-admin`, etc.) stay inline in `app/__init__.py` — we are not refactoring them.

---

## Task 1: Scaffold the cli package and constants

**Files:**
- Create: `chapter-ops/backend/app/cli/__init__.py`
- Create: `chapter-ops/backend/app/cli/seed_demo.py`

- [ ] **Step 1: Create the empty package init**

Create `chapter-ops/backend/app/cli/__init__.py` with a single line of content:

```python
"""CLI command modules. Imported by app/__init__.py to register Flask CLI commands."""
```

- [ ] **Step 2: Create seed_demo.py with constants only**

Create `chapter-ops/backend/app/cli/seed_demo.py`:

```python
"""
Demo organization seed.

Two Flask CLI commands:
- seed-demo-org: idempotent create/upsert of the DGLO demo organization.
- teardown-demo-org: hard-gated destructive reset, requires --confirm.

See docs/superpowers/specs/2026-04-25-demo-org-seed-design.md for design rationale.
"""

from datetime import date, timedelta
from decimal import Decimal

import click
from flask import current_app

from app.extensions import db


# ── Constants ─────────────────────────────────────────────────────────────────

DEMO_ORG_ABBREV = "DGLO"
DEMO_ORG_NAME = "Demo Greek Letter Organization"
DEMO_PASSWORD = "DemoChapter2026!"
DEMO_EMAIL_PREFIX = "bholi1914+demo-"
DEMO_EMAIL_DOMAIN = "@gmail.com"

# Fee types applied to every demo chapter
DEMO_FEE_TYPES = [
    {"id": "chapter_dues", "label": "Chapter Dues", "default_amount": "200.00"},
    {"id": "national_regional", "label": "National & Regional", "default_amount": "225.00"},
]

# Region definitions
DEMO_REGIONS = [
    {"name": "Eastern Region", "abbreviation": "EAST"},
    {"name": "Western Region", "abbreviation": "WEST"},
]

# Chapter definitions (region by name; will be resolved during seeding)
DEMO_CHAPTERS = [
    {"name": "Alpha Chapter",            "region": "Eastern Region", "chapter_type": "undergraduate", "slug": "alpha"},
    {"name": "Beta Chapter",             "region": "Eastern Region", "chapter_type": "undergraduate", "slug": "beta"},
    {"name": "Eastern Graduate Chapter", "region": "Eastern Region", "chapter_type": "graduate",      "slug": "east_grad"},
    {"name": "Gamma Chapter",            "region": "Western Region", "chapter_type": "undergraduate", "slug": "gamma"},
    {"name": "Delta Chapter",            "region": "Western Region", "chapter_type": "undergraduate", "slug": "delta"},
    {"name": "Western Graduate Chapter", "region": "Western Region", "chapter_type": "graduate",      "slug": "west_grad"},
]

# User definitions
# Each entry: (slug, first_name, last_name, anchor) where anchor is one of:
#   ("chapter_role", chapter_slug, role)              — chapter membership with role
#   ("region_role",  region_name, role)                — region membership only
#   ("org_admin",)                                     — org admin (also gets a chapter membership separately)
DEMO_USERS = [
    # IHQ admin (also a graduate member of Eastern Graduate Chapter)
    ("ihq", "Demo", "IHQ Admin", ("org_admin",)),

    # Eastern regional officers (also chapter officers in Eastern Graduate)
    ("east-rd", "Eastern", "Director",  ("region_role", "Eastern Region", "regional_director")),
    ("east-rt", "Eastern", "Treasurer", ("region_role", "Eastern Region", "regional_treasurer")),

    # Western regional officers (also chapter officers in Western Graduate)
    ("west-rd", "Western", "Director",  ("region_role", "Western Region", "regional_director")),
    ("west-rt", "Western", "Treasurer", ("region_role", "Western Region", "regional_treasurer")),

    # Eastern Graduate Chapter — VP, Secretary, two general grad members
    ("east-grad-vp",  "East Grad", "VP",        ("chapter_role", "east_grad", "vice_president")),
    ("east-grad-sec", "East Grad", "Secretary", ("chapter_role", "east_grad", "secretary")),
    ("east-grad-m1",  "East Grad", "Member 1",  ("chapter_role", "east_grad", "member")),
    ("east-grad-m2",  "East Grad", "Member 2",  ("chapter_role", "east_grad", "member")),

    # Western Graduate Chapter — VP, Secretary, two general grad members
    ("west-grad-vp",  "West Grad", "VP",        ("chapter_role", "west_grad", "vice_president")),
    ("west-grad-sec", "West Grad", "Secretary", ("chapter_role", "west_grad", "secretary")),
    ("west-grad-m1",  "West Grad", "Member 1",  ("chapter_role", "west_grad", "member")),
    ("west-grad-m2",  "West Grad", "Member 2",  ("chapter_role", "west_grad", "member")),
]

# Add the 16 collegiate officers + 24 collegiate general members
for _slug, _first in [("alpha", "Alpha"), ("beta", "Beta"), ("gamma", "Gamma"), ("delta", "Delta")]:
    DEMO_USERS.extend([
        (f"{_slug}-pres",  _first, "President",      ("chapter_role", _slug, "president")),
        (f"{_slug}-vp",    _first, "Vice President", ("chapter_role", _slug, "vice_president")),
        (f"{_slug}-treas", _first, "Treasurer",      ("chapter_role", _slug, "treasurer")),
        (f"{_slug}-sec",   _first, "Secretary",      ("chapter_role", _slug, "secretary")),
    ])
    for _i in range(1, 7):
        DEMO_USERS.append(
            (f"{_slug}-m{_i}", _first, f"Member {_i}", ("chapter_role", _slug, "member"))
        )

# Mappings for the dual-anchored users (regional officers also hold grad-chapter office,
# IHQ admin is also a general member of Eastern Graduate)
DUAL_ANCHORS = {
    # slug → (chapter_slug, role, member_type)
    "ihq":     ("east_grad", "member",    "graduate"),
    "east-rd": ("east_grad", "president", "graduate"),
    "east-rt": ("east_grad", "treasurer", "graduate"),
    "west-rd": ("west_grad", "president", "graduate"),
    "west-rt": ("west_grad", "treasurer", "graduate"),
}


def email_for(slug: str) -> str:
    """Build the plus-addressed email for a demo user slug."""
    return f"{DEMO_EMAIL_PREFIX}{slug}{DEMO_EMAIL_DOMAIN}"
```

- [ ] **Step 3: Sanity-check imports compile**

Run: `cd chapter-ops/backend && python -c "from app.cli import seed_demo; print(len(seed_demo.DEMO_USERS))"`
Expected output: `53`

- [ ] **Step 4: Commit**

```bash
git add chapter-ops/backend/app/cli/__init__.py chapter-ops/backend/app/cli/seed_demo.py
git commit -m "chore(cli): scaffold seed_demo module with constants"
```

---

## Task 2: Add find-or-create helpers

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append after constants)

- [ ] **Step 1: Add the helpers**

Append to `chapter-ops/backend/app/cli/seed_demo.py`:

```python
# ── Find-or-create helpers ────────────────────────────────────────────────────


def _find_or_create(model, lookup: dict, defaults: dict | None = None):
    """
    Find an instance of `model` matching `lookup`, or create one with the
    union of `lookup` and `defaults`.

    Returns (instance, created) where `created` is True if a new row was inserted.
    Does not commit — caller is responsible.
    """
    instance = model.query.filter_by(**lookup).first()
    if instance:
        return instance, False
    instance = model(**lookup, **(defaults or {}))
    db.session.add(instance)
    return instance, True


def _log_phase(phase: str, created: int, skipped: int) -> None:
    click.echo(f"  {phase}: {created} created, {skipped} existed")
```

- [ ] **Step 2: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "chore(cli): add find_or_create helper for seed_demo"
```

---

## Task 3: Seed the organization and users

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append)

- [ ] **Step 1: Add organization + user seeding**

Append to `chapter-ops/backend/app/cli/seed_demo.py`:

```python
# ── Seed phase functions ──────────────────────────────────────────────────────


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


def _seed_users():
    """Create or find every demo user. Returns dict[slug -> User]."""
    from app.models import User

    users_by_slug = {}
    created_count = 0
    skipped_count = 0

    for slug, first_name, last_name, _anchor in DEMO_USERS:
        user, created = _find_or_create(
            User,
            lookup={"email": email_for(slug)},
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "active": True,
            },
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            created_count += 1
        else:
            skipped_count += 1
        users_by_slug[slug] = user

    _log_phase("Users", created_count, skipped_count)
    return users_by_slug
```

- [ ] **Step 2: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): seed organization and demo users"
```

---

## Task 4: Seed regions and region memberships

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append)

- [ ] **Step 1: Add region seeding**

Append:

```python
def _seed_regions(org):
    """Create or find both demo regions. Returns dict[name -> Region]."""
    from app.models import Region

    regions_by_name = {}
    created_count = 0
    skipped_count = 0

    for cfg in DEMO_REGIONS:
        region, created = _find_or_create(
            Region,
            lookup={"organization_id": org.id, "name": cfg["name"]},
            defaults={
                "abbreviation": cfg["abbreviation"],
                "active": True,
                "config": {},
            },
        )
        if created:
            created_count += 1
        else:
            skipped_count += 1
        regions_by_name[cfg["name"]] = region

    _log_phase("Regions", created_count, skipped_count)
    return regions_by_name


def _seed_region_memberships(users_by_slug, regions_by_name):
    """Create RegionMembership rows for users with region anchors."""
    from app.models import RegionMembership

    created_count = 0
    skipped_count = 0

    for slug, _first, _last, anchor in DEMO_USERS:
        if anchor[0] != "region_role":
            continue
        _, region_name, role = anchor
        region = regions_by_name[region_name]
        user = users_by_slug[slug]

        _, created = _find_or_create(
            RegionMembership,
            lookup={"user_id": user.id, "region_id": region.id},
            defaults={"role": role, "active": True},
        )
        if created:
            created_count += 1
        else:
            skipped_count += 1

    _log_phase("RegionMemberships", created_count, skipped_count)
```

- [ ] **Step 2: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): seed regions and region memberships"
```

---

## Task 5: Seed chapters with stubbed Stripe

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append)

- [ ] **Step 1: Add chapter seeding**

Append:

```python
def _seed_chapters(org, regions_by_name):
    """Create or find every chapter with stubbed Stripe and seeded fee types."""
    from app.models import Chapter

    chapters_by_slug = {}
    created_count = 0
    skipped_count = 0

    for cfg in DEMO_CHAPTERS:
        region = regions_by_name[cfg["region"]]
        chapter, created = _find_or_create(
            Chapter,
            lookup={"organization_id": org.id, "name": cfg["name"]},
            defaults={
                "region_id": region.id,
                "chapter_type": cfg["chapter_type"],
                "active": True,
                "stripe_account_id": f"acct_demo_{cfg['slug']}",
                "stripe_onboarding_complete": True,
                "subscription_tier": "starter",
                "config": {"fee_types": DEMO_FEE_TYPES},
            },
        )
        if created:
            created_count += 1
        else:
            # Ensure existing chapter has fee types (in case seed evolved)
            cfg_dict = dict(chapter.config or {})
            if not cfg_dict.get("fee_types"):
                cfg_dict["fee_types"] = DEMO_FEE_TYPES
                chapter.config = cfg_dict
            skipped_count += 1
        chapters_by_slug[cfg["slug"]] = chapter

    _log_phase("Chapters", created_count, skipped_count)
    return chapters_by_slug
```

- [ ] **Step 2: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): seed chapters with stubbed Stripe and fee types"
```

---

## Task 6: Seed chapter memberships (including dual-anchored officers)

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append)

- [ ] **Step 1: Add chapter membership seeding**

Append:

```python
def _seed_chapter_memberships(users_by_slug, chapters_by_slug):
    """
    Create ChapterMembership rows.

    Most users have a single chapter anchor from DEMO_USERS. Regional officers
    and the IHQ admin also get a second chapter membership in their graduate
    chapter via DUAL_ANCHORS.
    """
    from app.models import ChapterMembership

    created_count = 0
    skipped_count = 0

    # First pass: primary anchor from DEMO_USERS
    for slug, _first, _last, anchor in DEMO_USERS:
        if anchor[0] != "chapter_role":
            continue
        _, chapter_slug, role = anchor
        chapter = chapters_by_slug[chapter_slug]
        user = users_by_slug[slug]
        member_type = "graduate" if chapter.chapter_type == "graduate" else "collegiate"

        _, created = _find_or_create(
            ChapterMembership,
            lookup={"user_id": user.id, "chapter_id": chapter.id},
            defaults={
                "role": role,
                "financial_status": "not_financial",  # corrected later by apply_payment phase
                "member_type": member_type,
                "active": True,
            },
        )
        if created:
            created_count += 1
        else:
            skipped_count += 1

    # Second pass: dual anchors (regional officers + IHQ admin → grad chapter)
    for slug, (chapter_slug, role, member_type) in DUAL_ANCHORS.items():
        chapter = chapters_by_slug[chapter_slug]
        user = users_by_slug[slug]

        _, created = _find_or_create(
            ChapterMembership,
            lookup={"user_id": user.id, "chapter_id": chapter.id},
            defaults={
                "role": role,
                "financial_status": "not_financial",
                "member_type": member_type,
                "active": True,
            },
        )
        if created:
            created_count += 1
        else:
            skipped_count += 1

    _log_phase("ChapterMemberships", created_count, skipped_count)
```

- [ ] **Step 2: Add organization membership seeding (for IHQ admin)**

Append:

```python
def _seed_org_membership(org, users_by_slug):
    """Mark the IHQ admin user as an org admin on DGLO."""
    from app.models import OrganizationMembership

    user = users_by_slug["ihq"]
    _, created = _find_or_create(
        OrganizationMembership,
        lookup={"user_id": user.id, "organization_id": org.id},
        defaults={"role": "admin", "active": True},
    )
    _log_phase("OrgMemberships", 1 if created else 0, 0 if created else 1)
```

- [ ] **Step 3: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): seed chapter and organization memberships"
```

---

## Task 7: Seed billing periods and dues

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append)

- [ ] **Step 1: Add period and dues seeding**

Append:

```python
def _seed_periods_and_dues(chapters_by_slug):
    """
    Create one active 'Spring 2026' period per chapter and seed dues rows
    for every member × fee type via the existing dues_service.
    """
    from app.models import ChapterPeriod
    from app.services import dues_service

    today = date.today()
    period_start = today - timedelta(days=30)
    period_end = today + timedelta(days=120)

    created_periods = 0
    skipped_periods = 0
    total_dues_rows_created = 0

    for chapter in chapters_by_slug.values():
        period, created = _find_or_create(
            ChapterPeriod,
            lookup={"chapter_id": chapter.id, "name": "Spring 2026"},
            defaults={
                "period_type": "semester",
                "start_date": period_start,
                "end_date": period_end,
                "is_active": True,
            },
        )
        if created:
            created_periods += 1
        else:
            skipped_periods += 1
            # Make sure a re-seed leaves it active even if previous run set otherwise
            period.is_active = True

        # seed_period_dues is idempotent and returns the new row count
        # Need to flush so the chapter members are visible to the query inside
        db.session.flush()
        new_rows = dues_service.seed_period_dues(chapter, period)
        total_dues_rows_created += new_rows

    _log_phase("ChapterPeriods", created_periods, skipped_periods)
    click.echo(f"  ChapterPeriodDues: {total_dues_rows_created} new rows seeded")
```

- [ ] **Step 2: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): seed billing periods and dues rows"
```

---

## Task 8: Apply payments for the financial members

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append)

- [ ] **Step 1: Read the Payment model first to confirm field names**

Run: `cat chapter-ops/backend/app/models/payment.py | head -60`

Look for: `chapter_id`, `user_id`, `amount`, `source` (or `payment_method`), and how `created_by` / `recorded_by` works. Adjust the next step's code if the field names differ from the assumptions below.

- [ ] **Step 2: Add the financial-payment phase**

Append:

```python
def _seed_financial_payments(chapters_by_slug, users_by_slug):
    """
    For ~70% of members in each chapter, record a manual payment for each fee type
    so they appear as Financial. Uses dues_service.apply_payment to update the
    dues rows; creates a Payment record for the audit trail.

    Pattern: in each chapter, the first ceil(members * 0.7) members are marked paid.
    """
    import math
    from app.models import ChapterMembership, Payment
    from app.services import dues_service

    payments_created = 0

    for chapter in chapters_by_slug.values():
        # Sort by user_id for deterministic ordering across re-runs
        memberships = (
            ChapterMembership.query
            .filter_by(chapter_id=chapter.id, active=True)
            .order_by(ChapterMembership.user_id)
            .all()
        )
        n_paid = math.ceil(len(memberships) * 0.7)
        paid_memberships = memberships[:n_paid]

        for m in paid_memberships:
            for ft in DEMO_FEE_TYPES:
                amount = Decimal(str(ft["default_amount"]))

                # Skip if a Payment already exists for this user + fee type in this chapter
                # (idempotency — re-runs shouldn't double-record)
                existing = Payment.query.filter_by(
                    chapter_id=chapter.id,
                    user_id=m.user_id,
                    notes=f"Demo seed: {ft['label']}",
                ).first()
                if existing:
                    continue

                payment = Payment(
                    chapter_id=chapter.id,
                    user_id=m.user_id,
                    amount=amount,
                    source="manual",
                    notes=f"Demo seed: {ft['label']}",
                )
                db.session.add(payment)
                payments_created += 1

                # Update dues row + recompute financial status
                dues_service.apply_payment(chapter, m.user_id, ft["id"], amount)

    click.echo(f"  Payments: {payments_created} demo payments recorded")
```

> **Note for the executor:** if `Payment` requires fields beyond `chapter_id`, `user_id`, `amount`, `source`, `notes` (e.g., `payment_method`, `recorded_by_id`, `payment_date`), add them with sensible defaults (e.g., `payment_date=date.today()`, `recorded_by_id=users_by_slug['ihq'].id`). Read the Payment model from Step 1 to confirm. Stay surgical — don't add fields the model doesn't require.

- [ ] **Step 3: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): record demo payments for financial members"
```

---

## Task 9: Compose the seed command and register it

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append the click command)
- Modify: `chapter-ops/backend/app/__init__.py` (register command)

- [ ] **Step 1: Add the seed command**

Append to `seed_demo.py`:

```python
# ── CLI commands ──────────────────────────────────────────────────────────────


def register_commands(app):
    """Register seed-demo-org and teardown-demo-org with the Flask app."""

    @app.cli.command("seed-demo-org")
    def seed_demo_org():
        """Seed the persistent DGLO demo organization (idempotent).

        \b
        Usage:
            flask seed-demo-org
        """
        click.echo(f"Seeding {DEMO_ORG_NAME} ({DEMO_ORG_ABBREV})...")
        org = _seed_organization()
        users_by_slug = _seed_users()
        regions_by_name = _seed_regions(org)
        chapters_by_slug = _seed_chapters(org, regions_by_name)
        _seed_chapter_memberships(users_by_slug, chapters_by_slug)
        _seed_org_membership(org, users_by_slug)
        _seed_periods_and_dues(chapters_by_slug)
        _seed_financial_payments(chapters_by_slug, users_by_slug)

        db.session.commit()

        click.echo("")
        click.echo("✅ Demo organization seeded.")
        click.echo("")
        click.echo(f"  Organization:  {DEMO_ORG_NAME} ({DEMO_ORG_ABBREV})")
        click.echo(f"  Regions:       {len(DEMO_REGIONS)}")
        click.echo(f"  Chapters:      {len(DEMO_CHAPTERS)}")
        click.echo(f"  Users:         {len(DEMO_USERS)}")
        click.echo("")
        click.echo("  Login URL:     https://chapterops.bluecolumnsystems.com/login")
        click.echo(f"  Password:      {DEMO_PASSWORD}  (same for all demo users)")
        click.echo("")
        click.echo("  Quick-pick accounts:")
        click.echo(f"    IHQ admin:               {email_for('ihq')}")
        click.echo(f"    Eastern Reg. Director:   {email_for('east-rd')}")
        click.echo(f"    Eastern Reg. Treasurer:  {email_for('east-rt')}")
        click.echo(f"    Western Reg. Director:   {email_for('west-rd')}")
        click.echo(f"    Western Reg. Treasurer:  {email_for('west-rt')}")
        click.echo(f"    Collegiate president:    {email_for('alpha-pres')}")
        click.echo(f"    Collegiate treasurer:    {email_for('alpha-treas')}")
        click.echo(f"    Collegiate member:       {email_for('alpha-m1')}")
        click.echo(f"    Graduate member:         {email_for('east-grad-m1')}")
        click.echo("")
        click.echo("  Note: Stripe is stubbed for all demo chapters — Pay Now buttons appear")
        click.echo("  but actual checkout will fail at the Stripe API.")
```

- [ ] **Step 2: Wire the command into `app/__init__.py`**

Open `chapter-ops/backend/app/__init__.py`, find the section where existing CLI commands are registered (around the `make-org-admin` definition near line 190), and add this line at the end of the `create_app` function (right before the existing CLI block, or anywhere inside `create_app` after `app` is fully built):

```python
        from app.cli import seed_demo
        seed_demo.register_commands(app)
```

Place it just after the existing `@app.cli.command("send-dues-reminders")` block but inside `create_app`. Use Read first to find the exact insertion point.

- [ ] **Step 3: Verify the command is registered**

Run: `cd chapter-ops/backend && flask --help 2>&1 | grep seed-demo-org`
Expected output: `  seed-demo-org      Seed the persistent DGLO demo organization (idempotent).`

- [ ] **Step 4: Run the seed against local dev DB**

Run: `cd chapter-ops/backend && flask seed-demo-org`

Expected output: the success block from Step 1 with non-zero counts.

If errors: read the traceback, fix, and re-run. The script is idempotent so retries are safe.

- [ ] **Step 5: Run a second time to verify idempotency**

Run: `cd chapter-ops/backend && flask seed-demo-org`

Expected: every phase reports `0 created, N existed`. Total user/chapter/region counts match the first run.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py chapter-ops/backend/app/__init__.py
git commit -m "feat(cli): wire seed-demo-org command and verify on local DB"
```

---

## Task 10: Teardown — safety gates and dry-run mode

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append)

- [ ] **Step 1: Add the teardown command with dry-run as default**

Append to `seed_demo.py`:

```python
# ── Teardown ──────────────────────────────────────────────────────────────────


def _count_for_teardown(org):
    """Return a dict of table name → row count that would be deleted."""
    from app.models import (
        Chapter, ChapterMembership, ChapterPeriod, OrganizationMembership,
        Payment, Region, RegionMembership, User, Notification,
    )
    from app.models.chapter_period_dues import ChapterPeriodDues

    chapter_ids = [c.id for c in Chapter.query.filter_by(organization_id=org.id).all()]
    region_ids = [r.id for r in Region.query.filter_by(organization_id=org.id).all()]

    counts = {
        "Organizations": 1,
        "Regions": len(region_ids),
        "Chapters": len(chapter_ids),
    }

    if chapter_ids:
        counts["ChapterMemberships"] = ChapterMembership.query.filter(
            ChapterMembership.chapter_id.in_(chapter_ids)
        ).count()
        counts["ChapterPeriods"] = ChapterPeriod.query.filter(
            ChapterPeriod.chapter_id.in_(chapter_ids)
        ).count()
        counts["ChapterPeriodDues"] = ChapterPeriodDues.query.filter(
            ChapterPeriodDues.chapter_id.in_(chapter_ids)
        ).count()
        counts["Payments"] = Payment.query.filter(
            Payment.chapter_id.in_(chapter_ids)
        ).count()
        counts["Notifications"] = Notification.query.filter(
            Notification.chapter_id.in_(chapter_ids)
        ).count()
    else:
        counts["ChapterMemberships"] = 0
        counts["ChapterPeriods"] = 0
        counts["ChapterPeriodDues"] = 0
        counts["Payments"] = 0
        counts["Notifications"] = 0

    if region_ids:
        counts["RegionMemberships"] = RegionMembership.query.filter(
            RegionMembership.region_id.in_(region_ids)
        ).count()
    else:
        counts["RegionMemberships"] = 0

    counts["OrgMemberships"] = OrganizationMembership.query.filter_by(
        organization_id=org.id
    ).count()

    counts["Users"] = User.query.filter(
        User.email.like(f"{DEMO_EMAIL_PREFIX}%")
    ).count()

    return counts


def _check_no_real_stripe_charges(org):
    """
    Refuse to teardown if any DGLO chapter has a real Stripe charge.

    Raises click.ClickException if a non-null Stripe charge is found on any
    Payment row for any DGLO chapter.
    """
    from app.models import Chapter, Payment

    chapter_ids = [c.id for c in Chapter.query.filter_by(organization_id=org.id).all()]
    if not chapter_ids:
        return

    suspect = Payment.query.filter(
        Payment.chapter_id.in_(chapter_ids),
        Payment.stripe_charge_id.isnot(None),
    ).first()
    if suspect:
        raise click.ClickException(
            f"Refusing to teardown: Payment {suspect.id} on chapter "
            f"{suspect.chapter_id} has stripe_charge_id={suspect.stripe_charge_id}. "
            "The demo should never have real Stripe charges. Investigate manually."
        )
```

> **Note for the executor:** if `Payment.stripe_charge_id` doesn't exist (the field may be named `stripe_payment_intent_id`, `stripe_session_id`, etc.), adjust the field reference accordingly. Read `chapter-ops/backend/app/models/payment.py` before writing this block. The check is "any non-null Stripe-side identifier" — pick whichever field represents that.

- [ ] **Step 2: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): add teardown safety helpers (counts, stripe charge gate)"
```

---

## Task 11: Teardown — actual deletion and command registration

**Files:**
- Modify: `chapter-ops/backend/app/cli/seed_demo.py` (append teardown command + register)

- [ ] **Step 1: Add the teardown command**

Append to `seed_demo.py`, **inside** the existing `register_commands` function (after the `seed_demo_org` definition):

```python
    @app.cli.command("teardown-demo-org")
    @click.option("--confirm", is_flag=True, help="Required to actually delete.")
    def teardown_demo_org(confirm):
        """Delete the DGLO demo organization and all its data.

        \b
        Usage:
            flask teardown-demo-org              # dry run (prints counts, no changes)
            flask teardown-demo-org --confirm    # actually delete
        """
        from app.models import (
            Chapter, ChapterMembership, ChapterPeriod, Organization,
            OrganizationMembership, Payment, Region, RegionMembership,
            User, Notification,
        )
        from app.models.chapter_period_dues import ChapterPeriodDues

        org = Organization.query.filter_by(abbreviation=DEMO_ORG_ABBREV).first()
        if not org:
            click.echo(f"No organization with abbreviation '{DEMO_ORG_ABBREV}' found. Nothing to do.")
            return

        _check_no_real_stripe_charges(org)
        counts = _count_for_teardown(org)

        if not confirm:
            click.echo("DRY RUN — no changes made. Pass --confirm to actually delete.")
            click.echo("")
            click.echo(f"Would delete from {DEMO_ORG_ABBREV}:")
            for label, count in counts.items():
                click.echo(f"  {label:20s} {count}")
            return

        click.echo(f"Deleting demo data for {DEMO_ORG_ABBREV}...")

        chapter_ids = [c.id for c in Chapter.query.filter_by(organization_id=org.id).all()]
        region_ids = [r.id for r in Region.query.filter_by(organization_id=org.id).all()]

        # Delete in FK-safe order
        if chapter_ids:
            ChapterPeriodDues.query.filter(
                ChapterPeriodDues.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            ChapterPeriod.query.filter(
                ChapterPeriod.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Payment.query.filter(
                Payment.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Notification.query.filter(
                Notification.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            ChapterMembership.query.filter(
                ChapterMembership.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)

        if region_ids:
            RegionMembership.query.filter(
                RegionMembership.region_id.in_(region_ids)
            ).delete(synchronize_session=False)

        OrganizationMembership.query.filter_by(
            organization_id=org.id
        ).delete(synchronize_session=False)

        Chapter.query.filter_by(organization_id=org.id).delete(synchronize_session=False)
        Region.query.filter_by(organization_id=org.id).delete(synchronize_session=False)

        # Clear active_chapter_id on demo users so the User delete doesn't violate FK
        demo_users = User.query.filter(User.email.like(f"{DEMO_EMAIL_PREFIX}%")).all()
        for u in demo_users:
            u.active_chapter_id = None
        db.session.flush()

        db.session.delete(org)

        # Delete demo users — double-gated: must match prefix AND have no
        # surviving memberships in any non-DGLO entity
        deleted_users = 0
        for u in demo_users:
            db.session.refresh(u)
            still_in_chapter = u.memberships.first()
            still_in_region = u.region_memberships.first()
            still_in_org = u.org_memberships.first()
            if still_in_chapter or still_in_region or still_in_org:
                click.echo(f"  Skipping {u.email} — still has non-DGLO memberships")
                continue
            db.session.delete(u)
            deleted_users += 1

        db.session.commit()

        click.echo("")
        click.echo("✅ Demo organization torn down.")
        for label, count in counts.items():
            if label == "Users":
                click.echo(f"  ✓ Removed {deleted_users} demo users")
            else:
                click.echo(f"  ✓ Removed {count} {label}")
        click.echo("")
        click.echo("Re-run `flask seed-demo-org` to recreate.")
```

> **Note for the executor:** the deletion list above covers the core models. Other tables (`Expense`, `Donation`, `Invoice`, `Event`, `EventAttendance`, `Workflow*`, `Document`, `KnowledgeArticle`, `Announcement`, `Committee`, `ChapterTransferRequest`, `Intake*`, `Lineage*`, `AuthEvent`, `AgentRun`, `AgentApproval`, `IncidentReport`) may also reference DGLO chapters and trigger FK errors during deletion. **If `db.session.commit()` fails with an `IntegrityError` mentioning a table not in this list, add a `<Model>.query.filter(<Model>.chapter_id.in_(chapter_ids)).delete(...)` line for that table BEFORE the `ChapterMembership` delete and re-run.** This is intentional — the seed only ever creates the core entities, so other tables should be empty for DGLO; if they aren't, they were created by manual demo activity and should be cleared too.

- [ ] **Step 2: Run dry-run on local DB**

Run: `cd chapter-ops/backend && flask teardown-demo-org`

Expected: prints `DRY RUN` header followed by counts matching what was seeded. Database unchanged (verify with: `flask seed-demo-org` should still report all entities exist).

- [ ] **Step 3: Run the actual teardown on local DB**

Run: `cd chapter-ops/backend && flask teardown-demo-org --confirm`

Expected: prints `✅ Demo organization torn down` with non-zero counts. If an `IntegrityError` appears, follow the note above to add the missing table to the deletion list.

- [ ] **Step 4: Verify zero residue**

Run these one-liners; each should print `0`:

```bash
cd chapter-ops/backend
flask shell <<'EOF'
from app.models import Organization, User
print(Organization.query.filter_by(abbreviation="DGLO").count())
print(User.query.filter(User.email.like("bholi1914+demo-%")).count())
EOF
```

- [ ] **Step 5: Re-seed and re-teardown to confirm round-trip works**

Run:
```bash
cd chapter-ops/backend
flask seed-demo-org
flask seed-demo-org             # idempotent — should be no-op
flask teardown-demo-org         # dry run
flask teardown-demo-org --confirm
```

Each should complete without errors.

- [ ] **Step 6: Commit**

```bash
git add chapter-ops/backend/app/cli/seed_demo.py
git commit -m "feat(cli): teardown-demo-org command with dry-run default and FK-safe deletion"
```

---

## Task 12: Production verification

**Files:**
- None (verification only)

This task runs the seed once on production and verifies the demo via real login. Only do this after all prior tasks are committed and pushed and Render has deployed.

- [ ] **Step 1: Wait for Render to deploy the latest commits**

Open Render dashboard → backend service → Events. Confirm the latest deploy hash matches `git rev-parse HEAD`.

- [ ] **Step 2: Open Render shell and run the seed**

In Render dashboard → backend service → **Shell** tab, run:

```
flask seed-demo-org
```

Expected: the success block from Task 9 with non-zero `created` counts.

- [ ] **Step 3: Verify each role tier loads correctly**

In a private browser window, log in to https://chapterops.bluecolumnsystems.com/login as each:

| Email | Expected landing experience |
|---|---|
| `bholi1914+demo-ihq@gmail.com` | IHQ Dashboard visible in sidebar; shows 6 chapters, 53 members |
| `bholi1914+demo-east-rd@gmail.com` | Region Dashboard visible; Eastern region with 3 chapters |
| `bholi1914+demo-alpha-pres@gmail.com` | Standard chapter dashboard; sidebar shows full officer nav; inbox shows "X members not financial" item |
| `bholi1914+demo-alpha-m1@gmail.com` | Member view; My Dues populated; Pay Now button visible (will fail at Stripe — expected) |
| `bholi1914+demo-east-grad-m1@gmail.com` | Graduate-chapter member view; same dues experience |

Password for all: `DemoChapter2026!`

- [ ] **Step 4: If everything checks out, save the demo URL + credentials somewhere durable**

This is for Brandon's reference — paste the seed command's success block into a 1Password note or similar. The credentials don't change between runs.

No commit for this task — verification only.

---

## Self-Review

1. **Spec coverage:** ✓
   - Org/region/chapter shape — Tasks 3, 4, 5
   - 53 user accounts with role tiers — Tasks 3, 6
   - Stripe stub — Task 5
   - Active billing period + fee types + dues — Task 7
   - 70/30 financial split — Task 8
   - Idempotency — every seeding task uses `_find_or_create`; verified in Task 9 Step 5
   - Output summary — Task 9 Step 1
   - Teardown safety gates (org gate, --confirm, double-gate user delete, no-real-Stripe gate) — Tasks 10, 11
   - Teardown FK-safe deletion order — Task 11 Step 1 (with executor note about extending the list)
   - Production verification with role-by-role login — Task 12

2. **Placeholder scan:** Two intentional executor notes survive — one in Task 8 (Payment field names) and one in Task 11 (additional FK tables). Both are framed as "verify and adjust if needed" with concrete fallback instructions. No "TBD"/"TODO" placeholders.

3. **Type consistency:** ✓
   - `users_by_slug`, `regions_by_name`, `chapters_by_slug` consistently named across tasks 3-8
   - `_find_or_create` returns `(instance, created)` tuple — same shape used in every call site
   - `email_for(slug)` helper used consistently for email construction
