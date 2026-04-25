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


def _set_active_chapters(users_by_slug):
    """
    Set each demo user's active_chapter_id so they don't get bounced to the
    onboarding wizard on first login. Defaults to the first ChapterMembership
    for that user (deterministic via order of insertion).
    """
    from app.models import ChapterMembership

    updated = 0
    skipped = 0
    for user in users_by_slug.values():
        if user.active_chapter_id:
            skipped += 1
            continue
        membership = (
            ChapterMembership.query
            .filter_by(user_id=user.id, active=True)
            .order_by(ChapterMembership.created_at)
            .first()
        )
        if membership:
            user.active_chapter_id = membership.chapter_id
            updated += 1
        else:
            # Org admin with no chapter membership at all — leave null and let
            # them go through onboarding (shouldn't happen for our seed since
            # the IHQ admin has a dual-anchor ChapterMembership in Eastern Grad)
            skipped += 1

    _log_phase("ActiveChapter", updated, skipped)


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

                # Idempotency: one payment per (chapter, user, fee_type_id).
                # Using fee_type_id + the "Demo seed:" notes prefix avoids
                # double-recording on re-runs. notes is String(500) and queryable.
                existing = Payment.query.filter_by(
                    chapter_id=chapter.id,
                    user_id=m.user_id,
                    fee_type_id=ft["id"],
                ).first()
                if existing:
                    continue

                payment = Payment(
                    chapter_id=chapter.id,
                    user_id=m.user_id,
                    amount=amount,
                    payment_type="one-time",
                    method="manual",
                    fee_type_id=ft["id"],
                    notes=f"Demo seed: {ft['label']}",
                )
                db.session.add(payment)
                payments_created += 1

                # Update dues row + recompute financial status
                dues_service.apply_payment(chapter, m.user_id, ft["id"], amount)

    click.echo(f"  Payments: {payments_created} demo payments recorded")


# ── Teardown ──────────────────────────────────────────────────────────────────


def _count_for_teardown(org):
    """Return a dict of table name → row count that would be deleted."""
    from app.models import (
        Announcement,
        Chapter,
        ChapterMembership,
        ChapterMilestone,
        ChapterPeriod,
        ChapterRequest,
        ChapterTransferRequest,
        Donation,
        Document,
        Event,
        EventAttendance,
        Expense,
        Incident,
        IncidentAttachment,
        IncidentStatusEvent,
        IntakeCandidate,
        IntakeDocument,
        InviteCode,
        Invoice,
        KnowledgeArticle,
        OrganizationMembership,
        Payment,
        PaymentPlan,
        Region,
        RegionMembership,
        User,
        Notification,
        WorkflowInstance,
        WorkflowTemplate,
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
        counts["PaymentPlans"] = PaymentPlan.query.filter(
            PaymentPlan.chapter_id.in_(chapter_ids)
        ).count()
        counts["InviteCodes"] = InviteCode.query.filter(
            InviteCode.chapter_id.in_(chapter_ids)
        ).count()
        counts["Announcements"] = Announcement.query.filter(
            Announcement.chapter_id.in_(chapter_ids)
        ).count()
        counts["EventAttendances"] = EventAttendance.query.filter(
            EventAttendance.chapter_id.in_(chapter_ids)
        ).count()
        counts["Events"] = Event.query.filter(
            Event.chapter_id.in_(chapter_ids)
        ).count()
        counts["Expenses"] = Expense.query.filter(
            Expense.chapter_id.in_(chapter_ids)
        ).count()
        counts["Donations"] = Donation.query.filter(
            Donation.chapter_id.in_(chapter_ids)
        ).count()
        counts["Documents"] = Document.query.filter(
            Document.chapter_id.in_(chapter_ids)
        ).count()
        counts["IntakeDocuments"] = IntakeDocument.query.filter(
            IntakeDocument.chapter_id.in_(chapter_ids)
        ).count()
        counts["IntakeCandidates"] = IntakeCandidate.query.filter(
            IntakeCandidate.chapter_id.in_(chapter_ids)
        ).count()
        counts["ChapterMilestones"] = ChapterMilestone.query.filter(
            ChapterMilestone.chapter_id.in_(chapter_ids)
        ).count()
        counts["WorkflowInstances"] = WorkflowInstance.query.filter(
            WorkflowInstance.chapter_id.in_(chapter_ids)
        ).count()
        # ChapterTransferRequest uses from_chapter_id / to_chapter_id (no single chapter_id)
        counts["ChapterTransferRequests"] = ChapterTransferRequest.query.filter(
            db.or_(
                ChapterTransferRequest.from_chapter_id.in_(chapter_ids),
                ChapterTransferRequest.to_chapter_id.in_(chapter_ids),
            )
        ).count()
        # Invoices can reference chapter_id or billed_chapter_id
        counts["Invoices"] = Invoice.query.filter(
            db.or_(
                Invoice.chapter_id.in_(chapter_ids),
                Invoice.billed_chapter_id.in_(chapter_ids),
            )
        ).count()
        # Incidents reference chapter_id, region_id, and organization_id
        incident_ids = [
            i.id for i in Incident.query.filter(
                Incident.chapter_id.in_(chapter_ids)
            ).all()
        ]
        counts["Incidents"] = len(incident_ids)
        counts["IncidentAttachments"] = IncidentAttachment.query.filter(
            IncidentAttachment.incident_id.in_(incident_ids)
        ).count() if incident_ids else 0
        counts["IncidentStatusEvents"] = IncidentStatusEvent.query.filter(
            IncidentStatusEvent.incident_id.in_(incident_ids)
        ).count() if incident_ids else 0
    else:
        for key in [
            "ChapterMemberships", "ChapterPeriods", "ChapterPeriodDues", "Payments",
            "Notifications", "PaymentPlans", "InviteCodes", "Announcements",
            "EventAttendances", "Events", "Expenses", "Donations", "Documents",
            "IntakeDocuments", "IntakeCandidates", "ChapterMilestones",
            "WorkflowInstances", "ChapterTransferRequests", "Invoices",
            "Incidents", "IncidentAttachments", "IncidentStatusEvents",
        ]:
            counts[key] = 0

    if region_ids:
        counts["RegionMemberships"] = RegionMembership.query.filter(
            RegionMembership.region_id.in_(region_ids)
        ).count()
        # ChapterRequests reference region_id
        counts["ChapterRequests"] = ChapterRequest.query.filter(
            ChapterRequest.region_id.in_(region_ids)
        ).count()
    else:
        counts["RegionMemberships"] = 0
        counts["ChapterRequests"] = 0

    counts["OrgMemberships"] = OrganizationMembership.query.filter_by(
        organization_id=org.id
    ).count()

    # KnowledgeArticles are scoped to org (org-wide) or chapter (chapter-specific)
    counts["KnowledgeArticles"] = KnowledgeArticle.query.filter_by(
        organization_id=org.id
    ).count()

    # WorkflowTemplates are org-scoped (chapter_id may be null for org-wide templates)
    counts["WorkflowTemplates"] = WorkflowTemplate.query.filter_by(
        organization_id=org.id
    ).count()

    counts["Users"] = User.query.filter(
        User.email.like(f"{DEMO_EMAIL_PREFIX}%")
    ).count()

    return counts


def _check_no_real_stripe_charges(org):
    """
    Refuse to teardown if any DGLO chapter has a real Stripe charge.

    Raises click.ClickException if a non-null Stripe session/charge ID is found
    on any Payment row for any DGLO chapter.
    """
    from app.models import Chapter, Payment

    chapter_ids = [c.id for c in Chapter.query.filter_by(organization_id=org.id).all()]
    if not chapter_ids:
        return

    suspect = Payment.query.filter(
        Payment.chapter_id.in_(chapter_ids),
        Payment.stripe_session_id.isnot(None),
    ).first()
    if suspect:
        raise click.ClickException(
            f"Refusing to teardown: Payment {suspect.id} on chapter "
            f"{suspect.chapter_id} has stripe_session_id={suspect.stripe_session_id}. "
            "The demo should never have real Stripe charges. Investigate manually."
        )


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
        _seed_region_memberships(users_by_slug, regions_by_name)
        chapters_by_slug = _seed_chapters(org, regions_by_name)
        _seed_chapter_memberships(users_by_slug, chapters_by_slug)
        _seed_org_membership(org, users_by_slug)
        _set_active_chapters(users_by_slug)
        _seed_periods_and_dues(chapters_by_slug)
        _seed_financial_payments(chapters_by_slug, users_by_slug)

        db.session.commit()

        click.echo("")
        click.echo("[OK] Demo organization seeded.")
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
            Announcement,
            Chapter,
            ChapterMembership,
            ChapterMilestone,
            ChapterPeriod,
            ChapterRequest,
            ChapterTransferRequest,
            Donation,
            Document,
            Event,
            EventAttendance,
            Expense,
            Incident,
            IncidentAttachment,
            IncidentStatusEvent,
            IntakeCandidate,
            IntakeDocument,
            InviteCode,
            Invoice,
            KnowledgeArticle,
            Organization,
            OrganizationMembership,
            Payment,
            PaymentPlan,
            Region,
            RegionMembership,
            User,
            Notification,
            WorkflowInstance,
            WorkflowTemplate,
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
                click.echo(f"  {label:30s} {count}")
            return

        click.echo(f"Deleting demo data for {DEMO_ORG_ABBREV}...")

        chapter_ids = [c.id for c in Chapter.query.filter_by(organization_id=org.id).all()]
        region_ids = [r.id for r in Region.query.filter_by(organization_id=org.id).all()]

        # ── Delete in FK-safe order (children before parents) ────────────────

        if chapter_ids:
            # Incident children first (cascade="all, delete-orphan" is ORM-level,
            # won't fire with bulk .delete(); need explicit deletes)
            incident_ids = [
                i.id for i in Incident.query.filter(
                    Incident.chapter_id.in_(chapter_ids)
                ).all()
            ]
            if incident_ids:
                IncidentAttachment.query.filter(
                    IncidentAttachment.incident_id.in_(incident_ids)
                ).delete(synchronize_session=False)
                IncidentStatusEvent.query.filter(
                    IncidentStatusEvent.incident_id.in_(incident_ids)
                ).delete(synchronize_session=False)
            Incident.query.filter(
                Incident.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)

            # Workflow: step instances cascade from WorkflowInstance (ORM cascade
            # won't fire with bulk delete — but WorkflowStepInstance has no
            # chapter_id of its own, so we must go through instance_ids)
            instance_ids = [
                i.id for i in WorkflowInstance.query.filter(
                    WorkflowInstance.chapter_id.in_(chapter_ids)
                ).all()
            ]
            if instance_ids:
                from app.models import WorkflowStepInstance
                WorkflowStepInstance.query.filter(
                    WorkflowStepInstance.instance_id.in_(instance_ids)
                ).delete(synchronize_session=False)
            WorkflowInstance.query.filter(
                WorkflowInstance.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)

            # Intake: IntakeDocument references intake_candidate.id
            IntakeDocument.query.filter(
                IntakeDocument.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            IntakeCandidate.query.filter(
                IntakeCandidate.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)

            # EventAttendance references events.id — delete before Event
            EventAttendance.query.filter(
                EventAttendance.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Event.query.filter(
                Event.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)

            # Invoice: can reference chapter_id (member invoice) or billed_chapter_id (regional)
            Invoice.query.filter(
                db.or_(
                    Invoice.chapter_id.in_(chapter_ids),
                    Invoice.billed_chapter_id.in_(chapter_ids),
                )
            ).delete(synchronize_session=False)

            # ChapterTransferRequest references from_chapter_id and to_chapter_id
            ChapterTransferRequest.query.filter(
                db.or_(
                    ChapterTransferRequest.from_chapter_id.in_(chapter_ids),
                    ChapterTransferRequest.to_chapter_id.in_(chapter_ids),
                )
            ).delete(synchronize_session=False)

            # Leaf tables scoped to chapter_id
            ChapterPeriodDues.query.filter(
                ChapterPeriodDues.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            ChapterPeriod.query.filter(
                ChapterPeriod.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Payment.query.filter(
                Payment.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            PaymentPlan.query.filter(
                PaymentPlan.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Notification.query.filter(
                Notification.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            InviteCode.query.filter(
                InviteCode.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Announcement.query.filter(
                Announcement.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Expense.query.filter(
                Expense.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Donation.query.filter(
                Donation.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            Document.query.filter(
                Document.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            ChapterMilestone.query.filter(
                ChapterMilestone.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)
            ChapterMembership.query.filter(
                ChapterMembership.chapter_id.in_(chapter_ids)
            ).delete(synchronize_session=False)

        if region_ids:
            RegionMembership.query.filter(
                RegionMembership.region_id.in_(region_ids)
            ).delete(synchronize_session=False)
            # ChapterRequests reference region_id
            ChapterRequest.query.filter(
                ChapterRequest.region_id.in_(region_ids)
            ).delete(synchronize_session=False)
            # Invoices that reference region_id (regional head-tax invoices)
            Invoice.query.filter(
                Invoice.region_id.in_(region_ids)
            ).delete(synchronize_session=False)

        # Org-scoped tables (not chapter-specific)
        OrganizationMembership.query.filter_by(
            organization_id=org.id
        ).delete(synchronize_session=False)

        # KnowledgeArticles are org-scoped (or chapter-scoped with same org)
        KnowledgeArticle.query.filter_by(
            organization_id=org.id
        ).delete(synchronize_session=False)

        # WorkflowTemplates are org-scoped; chapter-specific ones already have no instances
        # (instances were deleted above), so WorkflowStep children cascade at DB level
        # (cascade="all, delete-orphan" on steps relationship — but again ORM-level).
        # Use explicit step deletion via template_ids to be safe.
        template_ids = [
            t.id for t in WorkflowTemplate.query.filter_by(
                organization_id=org.id
            ).all()
        ]
        if template_ids:
            from app.models import WorkflowStep
            WorkflowStep.query.filter(
                WorkflowStep.template_id.in_(template_ids)
            ).delete(synchronize_session=False)
        WorkflowTemplate.query.filter_by(
            organization_id=org.id
        ).delete(synchronize_session=False)

        # ChapterRequests that reference org directly (belt-and-suspenders — region
        # filter above may have caught most, but org-wide ones with no region match)
        ChapterRequest.query.filter_by(
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
        click.echo("[OK] Demo organization torn down.")
        for label, count in counts.items():
            if label == "Users":
                click.echo(f"  Removed {deleted_users} demo users")
            else:
                click.echo(f"  Removed {count} {label}")
        click.echo("")
        click.echo("Re-run `flask seed-demo-org` to recreate.")
