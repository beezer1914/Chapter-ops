"""
Workflow Engine — core business logic for workflow execution.

All public functions take explicit model instances (not IDs) so they are
fully unit-testable without Flask request context.
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models.workflow import WorkflowInstance, WorkflowStep, WorkflowStepInstance, WorkflowTemplate

logger = logging.getLogger(__name__)

VALID_OPERATORS = {">", "<", ">=", "<=", "==", "!="}
TERMINAL_STATUSES = {"approved", "rejected", "skipped"}


# ── Public API ────────────────────────────────────────────────────────────────


def start_workflow(
    template: WorkflowTemplate,
    trigger_type: str,
    trigger_id: str,
    trigger_metadata: dict,
    initiated_by_user,  # User model instance
    chapter,  # Chapter model instance
) -> WorkflowInstance:
    """
    Create a WorkflowInstance and its initial set of WorkflowStepInstances.

    Steps are created in step_order. Steps whose condition evaluates to False
    are immediately marked 'skipped'. The first non-skipped step (or all steps
    in the first non-skipped parallel group) is set to 'in_progress'; all
    later steps start as 'waiting'.

    Returns the committed WorkflowInstance.
    """
    instance = WorkflowInstance(
        template_id=template.id,
        chapter_id=chapter.id,
        initiated_by=initiated_by_user.id,
        trigger_type=trigger_type,
        trigger_id=trigger_id,
        trigger_metadata=trigger_metadata or {},
        status="in_progress",
    )
    db.session.add(instance)
    db.session.flush()  # get instance.id without committing

    steps = list(template.steps)  # ordered by step_order via relationship

    # Determine which group/step should start as "in_progress"
    active_group, first_active_step_id = _find_first_active(steps, trigger_metadata)

    for step in steps:
        condition_passed = _evaluate_condition(step.condition_json, trigger_metadata)

        if not condition_passed:
            initial_status = "skipped"
        elif _is_in_active_set(step, active_group, first_active_step_id):
            initial_status = "in_progress"
        else:
            initial_status = "waiting"

        step_instance = WorkflowStepInstance(
            instance_id=instance.id,
            step_id=step.id,
            status=initial_status,
            assigned_to_role=(
                step.approver_role if step.approver_type == "role" else None
            ),
            assigned_to_user_id=(
                step.approver_user_id if step.approver_type == "specific_user" else None
            ),
        )
        db.session.add(step_instance)

    db.session.commit()

    # Notify assignees of steps that started as in_progress
    from app.services import notification_service
    for si in instance.step_instances:
        if si.status == "in_progress":
            notification_service.notify_workflow_step_assignees(chapter.id, instance, si)

    return instance


def process_step_action(
    step_instance: WorkflowStepInstance,
    action: str,  # "approve" | "reject"
    actor_user,  # User model instance
    comments: str | None = None,
) -> WorkflowInstance:
    """
    Record an approve/reject action on a step instance.

    Advances the workflow if appropriate. Returns the updated WorkflowInstance.
    Raises ValueError if step_instance is not in 'in_progress' state.
    """
    if step_instance.status != "in_progress":
        raise ValueError(
            f"Step instance {step_instance.id} is not in_progress "
            f"(current status: {step_instance.status})"
        )

    now = datetime.now(timezone.utc)
    step_instance.status = action + "d"  # "approved" or "rejected"
    step_instance.action_taken_by = actor_user.id
    step_instance.action_taken_at = now
    step_instance.comments = comments

    instance = step_instance.instance
    db.session.flush()

    if action == "reject":
        instance.status = "rejected"
        instance.completed_at = now
        db.session.commit()
        _execute_completion_hooks(instance)
        return instance

    # On approve: try to advance the workflow
    _advance_workflow(instance)
    return instance


# ── Internal engine ───────────────────────────────────────────────────────────


def _advance_workflow(instance: WorkflowInstance) -> None:
    """
    After a step approval, determine the next state of the workflow.

    - If all step_instances are in terminal states → complete the workflow
    - If there are still 'in_progress' siblings in the same parallel group → wait
    - If all parallel siblings are resolved → activate the next waiting step/group
    """
    step_instances = list(instance.step_instances)

    # Check if all steps are done
    if all(si.status in TERMINAL_STATUSES for si in step_instances):
        instance.status = "approved"
        instance.completed_at = datetime.now(timezone.utc)
        db.session.commit()
        _execute_completion_hooks(instance)
        return

    # Check if any in-progress siblings remain (parallel execution in flight)
    if any(si.status == "in_progress" for si in step_instances):
        db.session.commit()
        return

    # Find the first waiting step and activate it (and its parallel siblings)
    newly_activated = []
    for idx, si in enumerate(step_instances):
        if si.status == "waiting":
            # Verify all prior step_instances are resolved
            prior = step_instances[:idx]
            if not all(p.status in TERMINAL_STATUSES for p in prior):
                break  # prior steps still pending — don't advance yet

            target_group = si.step.parallel_group
            # Activate this step and all waiting steps in the same parallel group
            for candidate in step_instances:
                if candidate.status == "waiting":
                    if target_group and candidate.step.parallel_group == target_group:
                        candidate.status = "in_progress"
                        newly_activated.append(candidate)
                    elif not target_group and candidate.id == si.id:
                        candidate.status = "in_progress"
                        newly_activated.append(candidate)
            break

    db.session.commit()

    # Notify assignees of steps that were just activated
    from app.services import notification_service
    for si in newly_activated:
        notification_service.notify_workflow_step_assignees(instance.chapter_id, instance, si)


def _evaluate_condition(
    condition_json: dict | None, trigger_metadata: dict
) -> bool:
    """
    Evaluate a condition dict against the trigger_metadata snapshot.

    Returns True (step is active) or False (step should be skipped).
    A None condition always returns True. Malformed conditions also return True
    (safe default — it's better to include an unexpected step than to silently
    skip a required approval).

    condition_json schema: {"field": "amount", "operator": ">", "value": 500}
    """
    if not condition_json:
        return True

    field = condition_json.get("field")
    operator = condition_json.get("operator")
    threshold = condition_json.get("value")

    if not field or operator not in VALID_OPERATORS:
        return True  # malformed — default to active

    actual = trigger_metadata.get(field)
    if actual is None:
        return True  # field absent — default to active

    # Try numeric comparison first, fall back to string
    try:
        actual_cmp = float(actual)
        threshold_cmp = float(threshold)
    except (TypeError, ValueError):
        actual_cmp = str(actual)
        threshold_cmp = str(threshold)

    ops = {
        ">": lambda a, b: a > b,
        "<": lambda a, b: a < b,
        ">=": lambda a, b: a >= b,
        "<=": lambda a, b: a <= b,
        "==": lambda a, b: a == b,
        "!=": lambda a, b: a != b,
    }
    try:
        return ops[operator](actual_cmp, threshold_cmp)
    except TypeError:
        return True


def _execute_completion_hooks(instance: WorkflowInstance) -> None:
    """
    Run completion_actions from the template after workflow reaches a terminal state.

    Phase 1 ships: notify_submitter, update_trigger_status (both stubbed as logs).
    Future: trigger_workflow, webhook, notify_role.

    Hook failures are caught individually so one bad hook never crashes the workflow.
    """
    # Apply domain-specific outcome first (publish event, activate membership, etc.)
    try:
        _apply_trigger_outcome(instance)
    except Exception as exc:  # noqa: BLE001
        logger.warning("_apply_trigger_outcome failed for instance %s: %s", instance.id, exc)

    template = db.session.get(WorkflowTemplate, instance.template_id)
    if not template:
        return

    for action in template.completion_actions or []:
        hook_type = action.get("type")
        try:
            if hook_type == "notify_submitter":
                _hook_notify_submitter(instance, action)
            elif hook_type == "update_trigger_status":
                _hook_update_trigger_status(instance, action)
            # Future hooks: trigger_workflow, webhook, notify_role
            # Unknown types are silently skipped
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Workflow hook '%s' failed for instance %s: %s",
                hook_type,
                instance.id,
                exc,
            )


def _hook_notify_submitter(instance: WorkflowInstance, action: dict) -> None:
    """
    Notify the user who initiated the workflow of the outcome.
    Phase 1 stub — logs intent. Real implementation will call email service.
    """
    from app.models import User  # local import to avoid circular deps

    user = db.session.get(User, instance.initiated_by)
    if user:
        logger.info(
            "WORKFLOW HOOK notify_submitter | instance=%s user=%s status=%s",
            instance.id,
            user.email,
            instance.status,
        )


def _hook_update_trigger_status(instance: WorkflowInstance, action: dict) -> None:
    """
    Update the trigger object's status field to reflect the workflow outcome.
    Phase 1 stub — logs intent. Real implementation requires a trigger registry
    mapping trigger_type → model class.
    """
    logger.info(
        "WORKFLOW HOOK update_trigger_status | instance=%s trigger_type=%s "
        "trigger_id=%s outcome=%s",
        instance.id,
        instance.trigger_type,
        instance.trigger_id,
        instance.status,
    )


# ── Private helpers ───────────────────────────────────────────────────────────


def _apply_trigger_outcome(instance: WorkflowInstance) -> None:
    """
    Apply domain-specific side-effects when a workflow reaches a terminal state.

    - event trigger + approved  → publish the event, notify chapter members
    - event trigger + rejected  → leave as draft, notify creator
    - member_application + approved → activate the membership
    - member_application + rejected → deactivate the membership, notify user
    """
    trigger_type = instance.trigger_type
    outcome = instance.status  # "approved" or "rejected"

    if trigger_type == "event":
        from app.models.event import Event
        from app.services import notification_service

        event = db.session.get(Event, instance.trigger_id)
        if not event:
            return

        if outcome == "approved":
            event.status = "published"
            db.session.commit()
            # Notify all chapter members now that the event is live
            try:
                notification_service.create_event_notification(
                    chapter_id=event.chapter_id,
                    event=event,
                )
            except Exception as exc:
                logger.warning("Failed to send event publish notification: %s", exc)
        else:
            # Rejected — event stays draft; notify the creator
            if event.created_by:
                try:
                    notification_service.create_notification(
                        chapter_id=event.chapter_id,
                        notification_type="workflow",
                        title="Event Proposal Rejected",
                        message=f'Your event "{event.title}" was not approved and remains a draft.',
                        recipient_id=event.created_by,
                        link="/events",
                    )
                except Exception as exc:
                    logger.warning("Failed to send event rejection notification: %s", exc)

    elif trigger_type == "member_application":
        from app.models.membership import ChapterMembership

        # trigger_id is user.id; find the membership for that user in this chapter
        membership = ChapterMembership.query.filter_by(
            user_id=instance.trigger_id,
            chapter_id=instance.chapter_id,
        ).first()
        if not membership:
            return

        if outcome == "approved":
            membership.active = True
            db.session.commit()
        else:
            # Rejected — leave membership inactive, notify the user
            membership.active = False
            db.session.commit()
            try:
                notification_service.create_notification(
                    chapter_id=instance.chapter_id,
                    notification_type="member",
                    title="Membership Application Not Approved",
                    message="Your membership application was reviewed and was not approved at this time.",
                    recipient_id=instance.trigger_id,
                    link="/",
                )
            except Exception as exc:
                logger.warning("Failed to send membership rejection notification: %s", exc)


def _find_first_active(
    steps: list[WorkflowStep], trigger_metadata: dict
) -> tuple:
    """
    Find the parallel_group (or None for sequential) and step ID of the
    first step whose condition passes. Used to determine which steps to
    immediately activate on workflow start.

    Returns (parallel_group, first_active_step_id):
    - parallel_group: the group string to activate (or None if sequential)
    - first_active_step_id: the id of the first passing step (used when no group)
    """
    for step in steps:
        if _evaluate_condition(step.condition_json, trigger_metadata):
            return step.parallel_group, step.id
    return None, None


def _is_in_active_set(
    step: WorkflowStep,
    active_group: str | None,
    first_active_step_id: str | None,
) -> bool:
    """True if this step should start as 'in_progress' on workflow creation."""
    if first_active_step_id is None:
        return False  # no steps passed condition — nothing to activate

    if active_group is not None:
        # Parallel: activate all steps sharing the first active group
        return step.parallel_group == active_group
    else:
        # Sequential: activate only the first passing step
        return step.id == first_active_step_id
