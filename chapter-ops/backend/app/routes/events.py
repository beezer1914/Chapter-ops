"""
Event routes — /api/events/*

Handles chapter event management, RSVPs, check-in, and Stripe ticketing.
Public event routes (/api/events/public/*) are exempt from auth and tenant middleware.
"""

import stripe

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request, g
from flask_login import current_user, login_required

from app.extensions import db
from app.models import Chapter, ChapterMembership, User
from app.models.event import Event, EventAttendance
from app.models.workflow import WorkflowTemplate
from app.services import notification_service, workflow_engine
from app.utils.decorators import chapter_required, role_required
from app.utils.pagination import paginate

events_bp = Blueprint("events", __name__, url_prefix="/api/events")

VALID_EVENT_TYPES = {"social", "fundraiser", "community_service"}
VALID_STATUSES = {"draft", "published", "cancelled"}
VALID_RSVP_STATUSES = {"going", "not_going", "maybe"}


# ── Authenticated routes ──────────────────────────────────────────────────────

@events_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_events():
    """List chapter events. Members only see published; officers also see draft."""
    chapter = g.current_chapter
    membership = current_user.get_membership(chapter.id)
    is_officer = membership and membership.has_role("secretary")

    show_past = request.args.get("past", "false").lower() == "true"
    now = datetime.now(timezone.utc)

    if is_officer:
        # Officers see both published and draft (pending approval); not cancelled
        query = Event.query.filter(
            Event.chapter_id == chapter.id,
            Event.status != "cancelled",
        )
    else:
        # Members only see fully published events
        query = Event.query.filter(
            Event.chapter_id == chapter.id,
            Event.status == "published",
        )

    if show_past:
        query = query.filter(Event.start_datetime < now)
        query = query.order_by(Event.start_datetime.desc())
    else:
        query = query.filter(Event.start_datetime >= now)
        query = query.order_by(Event.start_datetime.asc())

    paged, meta = paginate(query)

    from app.models.workflow import WorkflowInstance

    result = []
    for event in paged.items:
        data = event.to_dict()
        data["attendee_count"] = EventAttendance.query.filter_by(
            event_id=event.id, rsvp_status="going"
        ).count()
        my_attendance = EventAttendance.query.filter_by(
            event_id=event.id, user_id=current_user.id
        ).first()
        data["my_attendance"] = my_attendance.to_dict() if my_attendance else None
        if event.status == "draft":
            wi = WorkflowInstance.query.filter_by(
                trigger_type="event",
                trigger_id=event.id,
                chapter_id=chapter.id,
            ).filter(WorkflowInstance.status == "in_progress").first()
            data["workflow_instance_id"] = wi.id if wi else None
        result.append(data)

    return jsonify({"events": result, "pagination": meta}), 200


@events_bp.route("", methods=["POST"])
@login_required
@chapter_required
@role_required("secretary")
def create_event():
    """Create a new chapter event."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    # Validate required fields
    required = ["title", "event_type", "start_datetime"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if data["event_type"] not in VALID_EVENT_TYPES:
        return jsonify({"error": f"Invalid event_type. Must be one of: {', '.join(sorted(VALID_EVENT_TYPES))}"}), 400

    try:
        start_dt = datetime.fromisoformat(data["start_datetime"])
    except ValueError:
        return jsonify({"error": "Invalid start_datetime format. Use ISO 8601."}), 400

    end_dt = None
    if data.get("end_datetime"):
        try:
            end_dt = datetime.fromisoformat(data["end_datetime"])
        except ValueError:
            return jsonify({"error": "Invalid end_datetime format. Use ISO 8601."}), 400

    # Paid event validation
    is_paid = bool(data.get("is_paid", False))
    ticket_price = None
    if is_paid:
        try:
            ticket_price = float(data.get("ticket_price", 0))
            if ticket_price <= 0:
                return jsonify({"error": "ticket_price must be greater than zero for paid events."}), 400
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid ticket_price."}), 400

    is_public = bool(data.get("is_public", False))
    public_slug = Event.generate_slug() if is_public else None

    # If an active event workflow template exists, create event as draft pending approval
    event_template = (
        WorkflowTemplate.query
        .filter_by(chapter_id=chapter.id, trigger_type="event", is_active=True)
        .first()
    ) or (
        WorkflowTemplate.query
        .filter_by(organization_id=chapter.organization_id, chapter_id=None, trigger_type="event", is_active=True)
        .first()
    )
    initial_status = "draft" if event_template else data.get("status", "published")

    event = Event(
        chapter_id=chapter.id,
        created_by=current_user.id,
        title=data["title"].strip(),
        description=data.get("description", "").strip() or None,
        event_type=data["event_type"],
        start_datetime=start_dt,
        end_datetime=end_dt,
        location=data.get("location", "").strip() or None,
        capacity=data.get("capacity") or None,
        is_paid=is_paid,
        ticket_price=ticket_price,
        is_public=is_public,
        public_slug=public_slug,
        status=initial_status,
        service_hours=data.get("service_hours") or None,
    )
    db.session.add(event)
    db.session.commit()

    # Notify all chapter members about the new event (only if published immediately)
    if event.status == "published":
        try:
            notification_service.create_event_notification(
                chapter_id=chapter.id,
                event=event,
            )
        except Exception as exc:
            current_app.logger.error(f"Failed to create event notification: {exc}")

    # Auto-start the event workflow template if one exists
    workflow_instance_id = None
    if event_template:
        try:
            instance = workflow_engine.start_workflow(
                template=event_template,
                trigger_type="event",
                trigger_id=event.id,
                trigger_metadata={
                    "title": event.title,
                    "event_type": event.event_type,
                    "start_datetime": event.start_datetime.isoformat(),
                    "is_paid": event.is_paid,
                    "ticket_price": float(event.ticket_price) if event.ticket_price else 0,
                    "created_by": current_user.full_name,
                },
                initiated_by_user=current_user,
                chapter=chapter,
            )
            workflow_instance_id = instance.id
        except Exception as exc:
            current_app.logger.error(f"Failed to auto-start event workflow for {event.id}: {exc}")

    result = event.to_dict()
    result["attendee_count"] = 0
    result["my_attendance"] = None
    if workflow_instance_id:
        result["workflow_instance_id"] = workflow_instance_id
    return jsonify({"success": True, "event": result}), 201


@events_bp.route("/service-hours", methods=["GET"])
@login_required
@chapter_required
@role_required("secretary")
def get_service_hours():
    """Return per-member community service hour totals for the chapter."""
    from sqlalchemy.orm import joinedload

    chapter = g.current_chapter
    year = request.args.get("year", type=int)

    query = Event.query.options(
        joinedload(Event.attendances).joinedload(EventAttendance.user)
    ).filter(
        Event.chapter_id == chapter.id,
        Event.event_type == "community_service",
        Event.service_hours.isnot(None),
        Event.status != "cancelled",
    )
    if year:
        query = query.filter(db.extract("year", Event.start_datetime) == year)

    events = query.order_by(Event.start_datetime.desc()).all()

    member_map: dict[str, dict] = {}
    for event in events:
        hours = float(event.service_hours)
        for att in event.attendances:
            if att.rsvp_status != "going" or att.user_id is None or att.user is None:
                continue
            if att.user_id not in member_map:
                u = att.user
                member_map[att.user_id] = {
                    "user_id": u.id,
                    "full_name": u.full_name,
                    "profile_picture_url": u.profile_picture_url,
                    "total_hours": 0.0,
                    "events_count": 0,
                    "events": [],
                }
            member_map[att.user_id]["total_hours"] += hours
            member_map[att.user_id]["events_count"] += 1
            member_map[att.user_id]["events"].append({
                "id": event.id,
                "title": event.title,
                "date": event.start_datetime.isoformat(),
                "hours": hours,
                "checked_in": att.checked_in,
            })

    chapter_total_hours = sum(float(e.service_hours) for e in events)
    members = sorted(member_map.values(), key=lambda x: x["total_hours"], reverse=True)

    # Available years for the year-filter picker
    yr_rows = db.session.query(
        db.extract("year", Event.start_datetime).label("yr")
    ).filter(
        Event.chapter_id == chapter.id,
        Event.event_type == "community_service",
        Event.service_hours.isnot(None),
        Event.status != "cancelled",
    ).distinct().all()
    available_years = sorted({int(r.yr) for r in yr_rows}, reverse=True)

    return jsonify({
        "chapter_total_hours": chapter_total_hours,
        "total_events": len(events),
        "members": members,
        "available_years": available_years,
    }), 200


@events_bp.route("/<event_id>", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_event(event_id: str):
    """Get a single event by ID."""
    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    result = event.to_dict()
    result["attendee_count"] = EventAttendance.query.filter_by(
        event_id=event.id, rsvp_status="going"
    ).count()
    my_attendance = EventAttendance.query.filter_by(
        event_id=event.id, user_id=current_user.id
    ).first()
    result["my_attendance"] = my_attendance.to_dict() if my_attendance else None
    return jsonify({"event": result}), 200


@events_bp.route("/<event_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("secretary")
def update_event(event_id: str):
    """Update an event's details."""
    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    if event.status == "cancelled":
        return jsonify({"error": "Cannot update a cancelled event."}), 400

    data = request.get_json() or {}

    if "title" in data:
        event.title = data["title"].strip()
    if "description" in data:
        event.description = data["description"].strip() or None
    if "event_type" in data:
        if data["event_type"] not in VALID_EVENT_TYPES:
            return jsonify({"error": f"Invalid event_type."}), 400
        event.event_type = data["event_type"]
    if "start_datetime" in data:
        try:
            event.start_datetime = datetime.fromisoformat(data["start_datetime"])
        except ValueError:
            return jsonify({"error": "Invalid start_datetime format."}), 400
    if "end_datetime" in data:
        if data["end_datetime"]:
            try:
                event.end_datetime = datetime.fromisoformat(data["end_datetime"])
            except ValueError:
                return jsonify({"error": "Invalid end_datetime format."}), 400
        else:
            event.end_datetime = None
    if "location" in data:
        event.location = data["location"].strip() or None
    if "capacity" in data:
        event.capacity = data["capacity"] or None
    if "is_paid" in data:
        event.is_paid = bool(data["is_paid"])
    if "ticket_price" in data:
        event.ticket_price = data["ticket_price"] or None
    if "is_public" in data:
        event.is_public = bool(data["is_public"])
        if event.is_public and not event.public_slug:
            event.public_slug = Event.generate_slug()
    if "service_hours" in data:
        event.service_hours = data["service_hours"] or None
    if "status" in data and data["status"] in VALID_STATUSES:
        event.status = data["status"]

    db.session.commit()

    result = event.to_dict()
    result["attendee_count"] = EventAttendance.query.filter_by(
        event_id=event.id, rsvp_status="going"
    ).count()
    return jsonify({"success": True, "event": result}), 200


@events_bp.route("/<event_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("secretary")
def cancel_event(event_id: str):
    """Soft-cancel an event (sets status=cancelled). Also cancels any active workflow instances."""
    from app.models.workflow import WorkflowInstance

    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    event.status = "cancelled"

    # Cancel any in-progress workflow instances tied to this event
    active_instances = WorkflowInstance.query.filter_by(
        trigger_type="event",
        trigger_id=event.id,
        chapter_id=chapter.id,
    ).filter(WorkflowInstance.status.in_(["pending", "in_progress"])).all()
    now = datetime.now(timezone.utc)
    for inst in active_instances:
        inst.status = "cancelled"
        inst.completed_at = now

    db.session.commit()
    return jsonify({"success": True}), 200


@events_bp.route("/<event_id>/attendees", methods=["GET"])
@login_required
@chapter_required
@role_required("secretary")
def list_attendees(event_id: str):
    """List all attendees for an event with user info and check-in status."""
    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    attendances = EventAttendance.query.filter_by(event_id=event.id).order_by(
        EventAttendance.created_at.asc()
    ).all()

    result = []
    for attendance in attendances:
        data = attendance.to_dict()
        if attendance.user_id:
            user = db.session.get(User, attendance.user_id)
            if user:
                data["user"] = {
                    "id": user.id,
                    "full_name": user.full_name,
                    "email": user.email,
                    "profile_picture_url": user.profile_picture_url,
                }
        result.append(data)

    return jsonify({"attendances": result}), 200


@events_bp.route("/<event_id>/rsvp", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def rsvp_to_event(event_id: str):
    """RSVP to an event. Creates or updates an EventAttendance record."""
    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    if event.status != "published":
        return jsonify({"error": "Cannot RSVP to a cancelled or draft event."}), 400

    if event.is_paid:
        return jsonify({
            "error": "This is a paid event. Use the checkout endpoint to register."
        }), 400

    # Check capacity
    if event.capacity:
        going_count = EventAttendance.query.filter_by(
            event_id=event.id, rsvp_status="going"
        ).count()
        if going_count >= event.capacity:
            return jsonify({"error": "This event is at capacity."}), 400

    data = request.get_json() or {}
    rsvp_status = data.get("rsvp_status", "going")
    if rsvp_status not in VALID_RSVP_STATUSES:
        return jsonify({"error": f"Invalid rsvp_status. Must be one of: {', '.join(sorted(VALID_RSVP_STATUSES))}"}), 400

    # Upsert attendance
    attendance = EventAttendance.query.filter_by(
        event_id=event.id, user_id=current_user.id
    ).first()

    if attendance:
        attendance.rsvp_status = rsvp_status
    else:
        attendance = EventAttendance(
            event_id=event.id,
            chapter_id=chapter.id,
            user_id=current_user.id,
            rsvp_status=rsvp_status,
            payment_status="free",
        )
        db.session.add(attendance)

        # Notify event creator on new RSVP
        if event.created_by and event.created_by != current_user.id:
            try:
                notification_service.create_notification(
                    chapter_id=chapter.id,
                    notification_type="event",
                    title="New RSVP",
                    message=f"{current_user.full_name} RSVP'd to {event.title}",
                    recipient_id=event.created_by,
                    link="/events",
                )
            except Exception as exc:
                current_app.logger.error(f"Failed to create RSVP notification: {exc}")

    db.session.commit()
    return jsonify({"success": True, "attendance": attendance.to_dict()}), 200


@events_bp.route("/<event_id>/rsvp", methods=["DELETE"])
@login_required
@chapter_required
@role_required("member")
def cancel_rsvp(event_id: str):
    """Cancel the current user's RSVP for an event."""
    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    attendance = EventAttendance.query.filter_by(
        event_id=event.id, user_id=current_user.id
    ).first()
    if not attendance:
        return jsonify({"error": "RSVP not found."}), 404

    if attendance.payment_status == "paid":
        return jsonify({"error": "Cannot cancel an RSVP for a paid ticket."}), 400

    db.session.delete(attendance)
    db.session.commit()
    return jsonify({"success": True}), 200


@events_bp.route("/<event_id>/attendees/<attendance_id>", methods=["PATCH"])
@login_required
@chapter_required
@role_required("secretary")
def toggle_check_in(event_id: str, attendance_id: str):
    """Toggle check-in status for an attendee."""
    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    attendance = db.session.get(EventAttendance, attendance_id)
    if not attendance or attendance.event_id != event.id:
        return jsonify({"error": "Attendance record not found."}), 404

    attendance.checked_in = not attendance.checked_in
    attendance.checked_in_at = datetime.now(timezone.utc) if attendance.checked_in else None
    db.session.commit()

    result = attendance.to_dict()
    if attendance.user_id:
        user = db.session.get(User, attendance.user_id)
        if user:
            result["user"] = {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "profile_picture_url": user.profile_picture_url,
            }
    return jsonify({"success": True, "attendance": result}), 200


@events_bp.route("/<event_id>/checkout", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def create_event_checkout(event_id: str):
    """Create a Stripe Checkout session for a paid event ticket (member)."""
    chapter = g.current_chapter
    event = db.session.get(Event, event_id)
    if not event or event.chapter_id != chapter.id:
        return jsonify({"error": "Event not found."}), 404

    if event.status != "published":
        return jsonify({"error": "This event is not available."}), 400

    if not event.is_paid or not event.ticket_price:
        return jsonify({"error": "This event does not require a ticket purchase."}), 400

    if not chapter.stripe_account_id or not chapter.stripe_onboarding_complete:
        return jsonify({"error": "This chapter has not connected a Stripe account yet."}), 400

    # Check if already registered
    existing = EventAttendance.query.filter_by(
        event_id=event.id, user_id=current_user.id
    ).first()
    if existing and existing.payment_status == "paid":
        return jsonify({"error": "You have already purchased a ticket for this event."}), 400

    # Check capacity
    if event.capacity:
        going_count = EventAttendance.query.filter_by(
            event_id=event.id, rsvp_status="going"
        ).count()
        if going_count >= event.capacity:
            return jsonify({"error": "This event is at capacity."}), 400

    amount_cents = int(float(event.ticket_price) * 100)
    frontend_url = current_app.config["FRONTEND_URL"]

    # Create pending attendance record (webhook will mark as paid)
    if existing:
        attendance = existing
        attendance.payment_status = "pending"
    else:
        attendance = EventAttendance(
            event_id=event.id,
            chapter_id=chapter.id,
            user_id=current_user.id,
            rsvp_status="going",
            payment_status="pending",
            ticket_price_paid=event.ticket_price,
        )
        db.session.add(attendance)
    db.session.flush()

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"{event.title} — {chapter.name}"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{frontend_url}/events?stripe_success=1",
            cancel_url=f"{frontend_url}/events?stripe_cancelled=1",
            metadata={
                "payment_type": "event_ticket",
                "chapter_id": chapter.id,
                "event_id": event.id,
                "attendance_id": attendance.id,
                "user_id": current_user.id,
            },
            stripe_account=chapter.stripe_account_id,
        )
    except stripe.error.StripeError as e:
        db.session.rollback()
        return jsonify({"error": str(e.user_message or e)}), 502

    attendance.stripe_session_id = session.id
    db.session.commit()
    return jsonify({"checkout_url": session.url}), 200


# ── Public routes (no auth required) ─────────────────────────────────────────

@events_bp.route("/public/<slug>", methods=["GET"])
def get_public_event(slug: str):
    """Get public event info by slug. No authentication required."""
    event = Event.query.filter_by(public_slug=slug, is_public=True).first()
    if not event or event.status != "published":
        return jsonify({"error": "Event not found."}), 404

    chapter = db.session.get(Chapter, event.chapter_id)

    result = event.to_dict()
    result["attendee_count"] = EventAttendance.query.filter_by(
        event_id=event.id, rsvp_status="going"
    ).count()
    result["chapter_name"] = chapter.name if chapter else None
    return jsonify({"event": result}), 200


@events_bp.route("/public/<slug>/rsvp", methods=["POST"])
def public_rsvp(slug: str):
    """RSVP to a free public event. No authentication required."""
    event = Event.query.filter_by(public_slug=slug, is_public=True).first()
    if not event or event.status != "published":
        return jsonify({"error": "Event not found."}), 404

    if event.is_paid:
        return jsonify({"error": "This is a paid event. Use the checkout endpoint."}), 400

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()

    if not name or not email:
        return jsonify({"error": "Name and email are required."}), 400

    # Check capacity
    if event.capacity:
        going_count = EventAttendance.query.filter_by(
            event_id=event.id, rsvp_status="going"
        ).count()
        if going_count >= event.capacity:
            return jsonify({"error": "This event is at capacity."}), 400

    # Prevent duplicate RSVP by email
    existing = EventAttendance.query.filter_by(
        event_id=event.id, attendee_email=email
    ).first()
    if existing:
        return jsonify({"success": True, "message": "Already registered."}), 200

    attendance = EventAttendance(
        event_id=event.id,
        chapter_id=event.chapter_id,
        attendee_name=name,
        attendee_email=email,
        rsvp_status="going",
        payment_status="free",
    )
    db.session.add(attendance)
    db.session.commit()
    return jsonify({"success": True}), 201


@events_bp.route("/public/<slug>/checkout", methods=["POST"])
def public_event_checkout(slug: str):
    """Create a Stripe Checkout session for a paid public event (non-member)."""
    event = Event.query.filter_by(public_slug=slug, is_public=True).first()
    if not event or event.status != "published":
        return jsonify({"error": "Event not found."}), 404

    if not event.is_paid or not event.ticket_price:
        return jsonify({"error": "This event does not require a ticket purchase."}), 400

    chapter = db.session.get(Chapter, event.chapter_id)
    if not chapter or not chapter.stripe_account_id or not chapter.stripe_onboarding_complete:
        return jsonify({"error": "Online ticketing is not available for this event."}), 400

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()

    if not name or not email:
        return jsonify({"error": "Name and email are required."}), 400

    # Check capacity
    if event.capacity:
        going_count = EventAttendance.query.filter_by(
            event_id=event.id, rsvp_status="going"
        ).count()
        if going_count >= event.capacity:
            return jsonify({"error": "This event is at capacity."}), 400

    # Check for existing pending/paid ticket by email
    existing = EventAttendance.query.filter_by(
        event_id=event.id, attendee_email=email
    ).first()
    if existing and existing.payment_status == "paid":
        return jsonify({"error": "A ticket for this email has already been purchased."}), 400

    amount_cents = int(float(event.ticket_price) * 100)
    frontend_url = current_app.config["FRONTEND_URL"]

    # Create pending attendance
    if existing:
        attendance = existing
        attendance.payment_status = "pending"
    else:
        attendance = EventAttendance(
            event_id=event.id,
            chapter_id=event.chapter_id,
            attendee_name=name,
            attendee_email=email,
            rsvp_status="going",
            payment_status="pending",
            ticket_price_paid=event.ticket_price,
        )
        db.session.add(attendance)
    db.session.flush()

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"{event.title} — {chapter.name}"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            customer_email=email,
            success_url=f"{frontend_url}/e/{slug}?stripe_success=1",
            cancel_url=f"{frontend_url}/e/{slug}?stripe_cancelled=1",
            metadata={
                "payment_type": "event_ticket",
                "chapter_id": chapter.id,
                "event_id": event.id,
                "attendance_id": attendance.id,
            },
            stripe_account=chapter.stripe_account_id,
        )
    except stripe.error.StripeError as e:
        db.session.rollback()
        return jsonify({"error": str(e.user_message or e)}), 502

    attendance.stripe_session_id = session.id
    db.session.commit()
    return jsonify({"checkout_url": session.url}), 200
