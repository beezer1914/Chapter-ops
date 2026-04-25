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
