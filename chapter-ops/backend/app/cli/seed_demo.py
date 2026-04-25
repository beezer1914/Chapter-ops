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
