"""
Dashboard routes — /api/dashboard/*

GET /api/dashboard/inbox   Return prioritized action items for the current user.
"""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify
from flask_login import current_user, login_required

from app.extensions import db
from app.utils.decorators import chapter_required, role_required

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")

PRIORITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


def _item(id_, type_, priority, title, description, cta_label, cta_url, **metadata):
    return {
        "id": id_,
        "type": type_,
        "priority": priority,
        "title": title,
        "description": description,
        "cta_label": cta_label,
        "cta_url": cta_url,
        "metadata": metadata,
    }


@dashboard_bp.route("/inbox", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def inbox():
    """
    Return a prioritized list of action items for the current user.

    Items are sorted critical → warning → info. Officers receive additional
    chapter-level items. Each item has a stable id, type, priority label,
    human-readable title/description, and a CTA that routes into the app.
    """
    chapter = g.current_chapter
    membership = current_user.get_membership(chapter.id)
    is_officer = membership and membership.has_role("secretary")
    is_president = membership and membership.has_role("president")

    now = datetime.now(timezone.utc)
    today = now.date()
    items = []

    # ── 1. Dues outstanding ───────────────────────────────────────────────────
    if membership and membership.financial_status == "not_financial":
        items.append(_item(
            f"dues_overdue_{current_user.id}",
            "dues_overdue", "critical",
            "Your dues are outstanding",
            "You are not financial this term. Some chapter features may be restricted until your dues are paid.",
            "Pay dues", "/dues",
        ))

    # ── 2. Pending workflow tasks ─────────────────────────────────────────────
    try:
        from app.models.workflow import WorkflowInstance, WorkflowStepInstance
        from app.models.region_membership import RegionMembership

        REGIONAL_ROLES = {
            "regional_director", "regional_1st_vice", "regional_2nd_vice",
            "regional_secretary", "regional_treasurer",
        }
        region_mbr = None
        if chapter.region_id:
            region_mbr = RegionMembership.query.filter_by(
                user_id=current_user.id, region_id=chapter.region_id, active=True
            ).first()

        step_instances = (
            db.session.query(WorkflowStepInstance)
            .join(WorkflowInstance, WorkflowStepInstance.instance_id == WorkflowInstance.id)
            .filter(
                WorkflowInstance.chapter_id == chapter.id,
                WorkflowInstance.status == "in_progress",
                WorkflowStepInstance.status == "in_progress",
            )
            .limit(10)
            .all()
        )

        added = 0
        for si in step_instances:
            if si.assigned_to_user_id:
                if si.assigned_to_user_id != current_user.id:
                    continue
            elif si.assigned_to_role:
                if si.assigned_to_role in REGIONAL_ROLES:
                    if not region_mbr or region_mbr.role != si.assigned_to_role:
                        continue
                else:
                    if not membership or membership.role != si.assigned_to_role:
                        continue

            trigger_title = (si.instance.trigger_metadata or {}).get(
                "title", si.instance.trigger_id
            )
            step_name = si.step.name if si.step else "Approval step"
            items.append(_item(
                f"workflow_task_{si.id}",
                "workflow_task", "warning",
                step_name,
                f"Awaiting your action on: {trigger_title}",
                "Review", f"/workflows?instance={si.instance_id}",
                step_instance_id=si.id,
                instance_id=si.instance_id,
                trigger_title=trigger_title,
            ))
            added += 1
            if added >= 5:
                break
    except Exception:
        pass

    # ── 3. Payment plan ending soon ───────────────────────────────────────────
    try:
        from app.models.payment_plan import PaymentPlan

        cutoff = today + timedelta(days=14)
        soon_plans = PaymentPlan.query.filter(
            PaymentPlan.chapter_id == chapter.id,
            PaymentPlan.user_id == current_user.id,
            PaymentPlan.status == "active",
            PaymentPlan.end_date <= cutoff,
            PaymentPlan.end_date >= today,
        ).all()

        for plan in soon_plans:
            if plan.is_complete():
                continue
            days_left = (plan.end_date - today).days
            remaining = float(plan.total_amount) - float(plan.total_paid())
            day_word = "day" if days_left == 1 else "days"
            items.append(_item(
                f"plan_due_{plan.id}",
                "payment_plan_due", "warning",
                "Payment plan ending soon",
                f"Your {plan.frequency} plan ends in {days_left} {day_word}. ${remaining:.2f} still outstanding.",
                "View plan", "/payments?tab=plans",
                plan_id=plan.id,
                days_left=days_left,
            ))
    except Exception:
        pass

    # ── 4. Upcoming events without an RSVP ───────────────────────────────────
    try:
        from app.models.event import Event, EventAttendance

        lookahead = now + timedelta(days=14)
        upcoming = Event.query.filter(
            Event.chapter_id == chapter.id,
            Event.status == "published",
            Event.start_datetime >= now,
            Event.start_datetime <= lookahead,
        ).order_by(Event.start_datetime).limit(5).all()

        for event in upcoming:
            rsvp = EventAttendance.query.filter_by(
                event_id=event.id, user_id=current_user.id
            ).first()
            if rsvp:
                continue
            delta = event.start_datetime.replace(tzinfo=timezone.utc) - now
            days_until = max(0, delta.days)
            day_word = "day" if days_until == 1 else "days"
            items.append(_item(
                f"event_rsvp_{event.id}",
                "event_rsvp", "info",
                f"RSVP needed: {event.title}",
                f"Coming up in {days_until} {day_word}. Let the chapter know if you're attending.",
                "View event", "/events",
                event_id=event.id,
                event_title=event.title,
                days_until=days_until,
            ))
    except Exception:
        pass

    # ── Officer-only items ────────────────────────────────────────────────────
    if is_officer:

        # 5. Members not financial
        try:
            from app.models import ChapterMembership

            count = ChapterMembership.query.filter_by(
                chapter_id=chapter.id,
                financial_status="not_financial",
                active=True,
            ).count()

            if count > 0:
                member_word = "member" if count == 1 else "members"
                items.append(_item(
                    f"members_not_financial_{chapter.id}",
                    "members_not_financial", "warning",
                    f"{count} {member_word} not financial",
                    "These members have outstanding dues. Consider sending a reminder via Communications.",
                    "View members", "/members",
                    count=count,
                ))
        except Exception:
            pass

        # 6. Pending expense approvals
        try:
            from app.models.expense import Expense

            count = Expense.query.filter_by(
                chapter_id=chapter.id, status="pending"
            ).count()

            if count > 0:
                exp_word = "expense" if count == 1 else "expenses"
                items.append(_item(
                    f"expense_pending_{chapter.id}",
                    "expense_approval", "warning",
                    f"{count} {exp_word} awaiting approval",
                    "Members are waiting on reimbursement decisions.",
                    "Review expenses", "/expenses",
                    count=count,
                ))
        except Exception:
            pass

        # 7. Pending transfer requests (president only)
        if is_president:
            try:
                from app.models.transfer_request import ChapterTransferRequest

                count = ChapterTransferRequest.query.filter(
                    db.or_(
                        db.and_(
                            ChapterTransferRequest.from_chapter_id == chapter.id,
                            ChapterTransferRequest.status == "pending",
                        ),
                        db.and_(
                            ChapterTransferRequest.to_chapter_id == chapter.id,
                            ChapterTransferRequest.status.in_(["pending", "approved_by_from"]),
                        ),
                    )
                ).count()

                if count > 0:
                    req_word = "request" if count == 1 else "requests"
                    items.append(_item(
                        f"transfer_pending_{chapter.id}",
                        "transfer_pending", "warning",
                        f"{count} transfer {req_word} pending approval",
                        "Member transfer requests require presidential approval before they can proceed.",
                        "Review transfers", "/members?tab=transfers",
                        count=count,
                    ))
            except Exception:
                pass

        # 8. Overdue regional invoices
        try:
            from app.models.invoice import Invoice

            count = Invoice.query.filter(
                Invoice.billed_chapter_id == chapter.id,
                Invoice.status.in_(["sent", "overdue"]),
                Invoice.due_date < today,
            ).count()

            if count > 0:
                inv_word = "invoice" if count == 1 else "invoices"
                items.append(_item(
                    f"invoice_overdue_{chapter.id}",
                    "invoice_overdue", "critical",
                    f"{count} overdue {inv_word} from your region",
                    "Outstanding regional invoices are past due. Contact your regional treasurer.",
                    "View invoices", "/invoices",
                    count=count,
                ))
        except Exception:
            pass

    # Sort by priority then by insertion order (stable sort)
    items.sort(key=lambda x: PRIORITY_ORDER.get(x["priority"], 99))

    return jsonify({"items": items}), 200
