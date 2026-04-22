"""
Workflow routes — /api/workflows/*

Template routes (treasurer+):
  GET  /templates                  list templates (chapter + org-wide)
  POST /templates                  create template
  GET  /templates/<id>             detail with steps
  PUT  /templates/<id>             update template
  DELETE /templates/<id>           soft delete (deactivate)

Step routes (treasurer+, nested under template):
  POST   /templates/<id>/steps            add step
  PUT    /templates/<id>/steps/<step_id>  update step
  DELETE /templates/<id>/steps/<step_id>  remove step
  PATCH  /templates/<id>/steps/reorder    reorder steps

Instance routes:
  GET  /instances                          list instances (member sees own; officer sees all)
  POST /instances                          start workflow instance
  GET  /instances/<id>                     detail with step instances
  POST /instances/<id>/steps/<si_id>/action  approve or reject a step
  POST /instances/<id>/cancel              cancel instance (treasurer+)
"""

from flask import Blueprint, g, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.utils.decorators import _is_org_admin, chapter_required, role_required
from app.utils.permissions import enforce_module_access

workflows_bp = Blueprint("workflows", __name__, url_prefix="/api/workflows")


@workflows_bp.before_request
def _gate_module():
    return enforce_module_access("workflows")


# ── Permission helpers ────────────────────────────────────────────────────────


def _can_edit_template(user, template, chapter) -> bool:
    """True if the user may modify this template."""
    if template.chapter_id is None:
        # Org-wide template — only org admin
        return _is_org_admin(user, template.organization_id)
    # Chapter-specific — must be treasurer+ in that chapter
    if template.chapter_id != chapter.id:
        return False
    membership = user.get_membership(chapter.id)
    return membership is not None and membership.has_role("treasurer")


def _get_template_or_404(template_id):
    """Load WorkflowTemplate or return a 404 response tuple."""
    from app.models import WorkflowTemplate

    t = db.session.get(WorkflowTemplate, template_id)
    if not t:
        return None, jsonify({"error": "Workflow template not found."}), 404
    return t, None, None


def _template_accessible(template, chapter) -> bool:
    """True if this template is visible to the current chapter."""
    # Chapter-specific template for this chapter
    if template.chapter_id == chapter.id:
        return True
    # Org-wide template for the same org
    if template.chapter_id is None and template.organization_id == chapter.organization_id:
        return True
    return False


# ── Template routes ───────────────────────────────────────────────────────────


@workflows_bp.route("/templates", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def list_templates():
    """List all templates accessible to the current chapter."""
    from app.models import WorkflowTemplate, WorkflowInstance

    chapter = g.current_chapter

    templates = db.session.query(WorkflowTemplate).filter(
        db.or_(
            # Chapter-specific templates for this chapter
            WorkflowTemplate.chapter_id == chapter.id,
            # Org-wide templates for the same org
            db.and_(
                WorkflowTemplate.chapter_id.is_(None),
                WorkflowTemplate.organization_id == chapter.organization_id,
            ),
        )
    ).all()

    result = []
    for t in templates:
        d = t.to_dict()
        d["step_count"] = len(t.steps)
        d["active_instance_count"] = (
            db.session.query(WorkflowInstance)
            .filter(
                WorkflowInstance.template_id == t.id,
                WorkflowInstance.chapter_id == chapter.id,
                WorkflowInstance.status.in_(["pending", "in_progress"]),
            )
            .count()
        )
        result.append(d)

    return jsonify({"templates": result}), 200


@workflows_bp.route("/templates", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def create_template():
    """Create a new workflow template."""
    chapter = g.current_chapter
    data = request.get_json() or {}

    name = (data.get("name") or "").strip()
    trigger_type = data.get("trigger_type")

    if not name:
        return jsonify({"error": "name is required."}), 400

    from app.models import WorkflowTemplate

    if trigger_type not in WorkflowTemplate.VALID_TRIGGER_TYPES:
        return jsonify(
            {"error": f"trigger_type must be one of: {', '.join(sorted(WorkflowTemplate.VALID_TRIGGER_TYPES))}"}
        ), 400

    # Determine chapter_id for the template
    requested_chapter_id = data.get("chapter_id", chapter.id)  # default = current chapter
    if requested_chapter_id is None:
        # Org-wide — only org admins can create these
        if not _is_org_admin(current_user, chapter.organization_id):
            return jsonify({"error": "Only organization admins can create org-wide templates."}), 403
        template_chapter_id = None
    else:
        template_chapter_id = chapter.id

    template = WorkflowTemplate(
        organization_id=chapter.organization_id,
        chapter_id=template_chapter_id,
        created_by=current_user.id,
        name=name,
        description=(data.get("description") or "").strip() or None,
        trigger_type=trigger_type,
        completion_actions=data.get("completion_actions") or [],
    )
    db.session.add(template)
    db.session.commit()

    result = template.to_dict()
    result["step_count"] = 0
    result["active_instance_count"] = 0
    return jsonify({"template": result}), 201


@workflows_bp.route("/templates/<template_id>", methods=["GET"])
@login_required
@chapter_required
@role_required("treasurer")
def get_template(template_id):
    """Get template detail including ordered steps."""
    from app.models import WorkflowInstance

    chapter = g.current_chapter
    template, err, code = _get_template_or_404(template_id)
    if err:
        return err, code

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Template not found."}), 404

    result = template.to_dict()
    result["steps"] = [s.to_dict() for s in template.steps]
    result["step_count"] = len(template.steps)
    result["active_instance_count"] = (
        db.session.query(WorkflowInstance)
        .filter(
            WorkflowInstance.template_id == template.id,
            WorkflowInstance.chapter_id == chapter.id,
            WorkflowInstance.status.in_(["pending", "in_progress"]),
        )
        .count()
    )
    return jsonify({"template": result}), 200


@workflows_bp.route("/templates/<template_id>", methods=["PUT"])
@login_required
@chapter_required
@role_required("treasurer")
def update_template(template_id):
    """Update a workflow template."""
    chapter = g.current_chapter
    template, err, code = _get_template_or_404(template_id)
    if err:
        return err, code

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Template not found."}), 404

    if not _can_edit_template(current_user, template, chapter):
        return jsonify({"error": "You do not have permission to edit this template."}), 403

    from app.models import WorkflowTemplate

    data = request.get_json() or {}

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "name cannot be empty."}), 400
        template.name = name

    if "description" in data:
        template.description = (data["description"] or "").strip() or None

    if "trigger_type" in data:
        if data["trigger_type"] not in WorkflowTemplate.VALID_TRIGGER_TYPES:
            return jsonify({"error": "Invalid trigger_type."}), 400
        template.trigger_type = data["trigger_type"]

    if "is_active" in data:
        template.is_active = bool(data["is_active"])

    if "completion_actions" in data:
        template.completion_actions = data["completion_actions"] or []

    db.session.commit()

    result = template.to_dict()
    result["steps"] = [s.to_dict() for s in template.steps]
    result["step_count"] = len(template.steps)
    return jsonify({"template": result}), 200


@workflows_bp.route("/templates/<template_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("treasurer")
def delete_template(template_id):
    """Soft-delete a template (set is_active=False)."""
    chapter = g.current_chapter
    template, err, code = _get_template_or_404(template_id)
    if err:
        return err, code

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Template not found."}), 404

    if not _can_edit_template(current_user, template, chapter):
        return jsonify({"error": "You do not have permission to delete this template."}), 403

    from app.models import WorkflowInstance

    active_count = (
        db.session.query(WorkflowInstance)
        .filter(
            WorkflowInstance.template_id == template.id,
            WorkflowInstance.status.in_(["pending", "in_progress"]),
        )
        .count()
    )

    if active_count > 0:
        membership = current_user.get_membership(chapter.id)
        is_president = membership and membership.has_role("president")
        if not _is_org_admin(current_user, template.organization_id) and not is_president:
            return jsonify(
                {"error": f"Cannot delete template with {active_count} active instance(s)."}
            ), 409

    template.is_active = False
    db.session.commit()
    return jsonify({"success": True}), 200


# ── Step routes ───────────────────────────────────────────────────────────────


@workflows_bp.route("/templates/<template_id>/steps", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def add_step(template_id):
    """Add a step to a template."""
    from app.models import WorkflowStep

    chapter = g.current_chapter
    template, err, code = _get_template_or_404(template_id)
    if err:
        return err, code

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Template not found."}), 404

    if not _can_edit_template(current_user, template, chapter):
        return jsonify({"error": "You do not have permission to edit this template."}), 403

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required."}), 400

    approver_type = data.get("approver_type", "role")
    if approver_type not in ("role", "specific_user"):
        return jsonify({"error": "approver_type must be 'role' or 'specific_user'."}), 400

    # Auto-assign step_order as max + 1
    current_max = max((s.step_order for s in template.steps), default=0)
    step_order = data.get("step_order", current_max + 1)

    step = WorkflowStep(
        template_id=template.id,
        step_order=step_order,
        name=name,
        description=(data.get("description") or "").strip() or None,
        parallel_group=data.get("parallel_group") or None,
        approver_type=approver_type,
        approver_role=data.get("approver_role") or None,
        approver_user_id=data.get("approver_user_id") or None,
        condition_json=data.get("condition_json") or None,
        is_required=bool(data.get("is_required", True)),
    )
    db.session.add(step)
    db.session.commit()

    return jsonify({"step": step.to_dict()}), 201


@workflows_bp.route("/templates/<template_id>/steps/<step_id>", methods=["PUT"])
@login_required
@chapter_required
@role_required("treasurer")
def update_step(template_id, step_id):
    """Update a step on a template."""
    from app.models import WorkflowStep

    chapter = g.current_chapter
    template, err, code = _get_template_or_404(template_id)
    if err:
        return err, code

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Template not found."}), 404

    if not _can_edit_template(current_user, template, chapter):
        return jsonify({"error": "You do not have permission to edit this template."}), 403

    step = db.session.get(WorkflowStep, step_id)
    if not step or step.template_id != template_id:
        return jsonify({"error": "Step not found."}), 404

    data = request.get_json() or {}

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "name cannot be empty."}), 400
        step.name = name

    if "description" in data:
        step.description = (data["description"] or "").strip() or None

    if "approver_type" in data:
        if data["approver_type"] not in ("role", "specific_user"):
            return jsonify({"error": "Invalid approver_type."}), 400
        step.approver_type = data["approver_type"]

    if "approver_role" in data:
        step.approver_role = data["approver_role"] or None

    if "approver_user_id" in data:
        step.approver_user_id = data["approver_user_id"] or None

    if "parallel_group" in data:
        step.parallel_group = data["parallel_group"] or None

    if "condition_json" in data:
        step.condition_json = data["condition_json"] or None

    if "is_required" in data:
        step.is_required = bool(data["is_required"])

    if "step_order" in data:
        step.step_order = int(data["step_order"])

    db.session.commit()
    return jsonify({"step": step.to_dict()}), 200


@workflows_bp.route("/templates/<template_id>/steps/<step_id>", methods=["DELETE"])
@login_required
@chapter_required
@role_required("treasurer")
def delete_step(template_id, step_id):
    """Remove a step from a template and re-sequence remaining steps."""
    from app.models import WorkflowStep

    chapter = g.current_chapter
    template, err, code = _get_template_or_404(template_id)
    if err:
        return err, code

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Template not found."}), 404

    if not _can_edit_template(current_user, template, chapter):
        return jsonify({"error": "You do not have permission to edit this template."}), 403

    step = db.session.get(WorkflowStep, step_id)
    if not step or step.template_id != template_id:
        return jsonify({"error": "Step not found."}), 404

    deleted_id = step.id

    # Delete any step instances referencing this step (FK constraint)
    from app.models import WorkflowStepInstance
    WorkflowStepInstance.query.filter_by(step_id=deleted_id).delete()

    db.session.delete(step)
    db.session.flush()

    # Re-sequence remaining steps (exclude the just-deleted step)
    remaining = sorted(
        [s for s in template.steps if s.id != deleted_id],
        key=lambda s: s.step_order,
    )
    for idx, s in enumerate(remaining, start=1):
        s.step_order = idx

    db.session.commit()
    return jsonify({"success": True}), 200


@workflows_bp.route("/templates/<template_id>/steps/reorder", methods=["PATCH"])
@login_required
@chapter_required
@role_required("treasurer")
def reorder_steps(template_id):
    """Bulk-update step_order values. Body: {"steps": [{"id": "...", "step_order": N}]}"""
    from app.models import WorkflowStep

    chapter = g.current_chapter
    template, err, code = _get_template_or_404(template_id)
    if err:
        return err, code

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Template not found."}), 404

    if not _can_edit_template(current_user, template, chapter):
        return jsonify({"error": "You do not have permission to edit this template."}), 403

    data = request.get_json() or {}
    steps_data = data.get("steps")
    if not isinstance(steps_data, list):
        return jsonify({"error": "steps must be a list."}), 400

    # Validate all IDs belong to this template
    template_step_ids = {s.id for s in template.steps}
    for item in steps_data:
        if item.get("id") not in template_step_ids:
            return jsonify({"error": f"Step {item.get('id')} does not belong to this template."}), 400

    # Apply new orders
    step_map = {s.id: s for s in template.steps}
    for item in steps_data:
        step_map[item["id"]].step_order = int(item["step_order"])

    db.session.commit()

    updated_steps = sorted(template.steps, key=lambda s: s.step_order)
    return jsonify({"steps": [s.to_dict() for s in updated_steps]}), 200


# ── Instance routes ───────────────────────────────────────────────────────────


@workflows_bp.route("/my-tasks", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def my_tasks():
    """
    Return all in_progress workflow step instances the current user can act on.

    Includes steps assigned directly to the user, or steps assigned to their exact role.
    """
    from app.models.workflow import WorkflowInstance, WorkflowStepInstance

    chapter = g.current_chapter
    membership = current_user.get_membership(chapter.id)

    REGIONAL_ROLES = {"regional_director", "regional_1st_vice", "regional_2nd_vice", "regional_secretary", "regional_treasurer"}

    # Look up region membership once if chapter has a region
    from app.models.region_membership import RegionMembership
    region_membership = None
    if chapter.region_id:
        region_membership = RegionMembership.query.filter_by(
            user_id=current_user.id, region_id=chapter.region_id, active=True
        ).first()

    # Load all in_progress step instances for active chapter instances
    step_instances = (
        db.session.query(WorkflowStepInstance)
        .join(WorkflowInstance, WorkflowStepInstance.instance_id == WorkflowInstance.id)
        .filter(
            WorkflowInstance.chapter_id == chapter.id,
            WorkflowInstance.status == "in_progress",
            WorkflowStepInstance.status == "in_progress",
        )
        .all()
    )

    tasks = []
    for si in step_instances:
        # Check if this user can act on this step — exact role match required
        if si.assigned_to_user_id:
            if si.assigned_to_user_id != current_user.id:
                continue
        elif si.assigned_to_role:
            if si.assigned_to_role in REGIONAL_ROLES:
                if not region_membership or region_membership.role != si.assigned_to_role:
                    continue
            else:
                if not membership or membership.role != si.assigned_to_role:
                    continue

        task = si.to_dict(include_step=True)
        task["trigger_title"] = (si.instance.trigger_metadata or {}).get(
            "title", si.instance.trigger_id
        )
        task["trigger_type"] = si.instance.trigger_type
        tasks.append(task)

    return jsonify({"tasks": tasks}), 200


@workflows_bp.route("/instances", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def list_instances():
    """List workflow instances. Members see own; officers see all chapter instances."""
    from app.models import WorkflowInstance

    chapter = g.current_chapter
    membership = current_user.get_membership(chapter.id)

    query = db.session.query(WorkflowInstance).filter(
        WorkflowInstance.chapter_id == chapter.id
    )

    # Members only see their own instances
    if membership and not membership.has_role("secretary"):
        query = query.filter(WorkflowInstance.initiated_by == current_user.id)

    instances = query.order_by(WorkflowInstance.created_at.desc()).all()
    result = []
    for i in instances:
        d = i.to_dict()
        d["trigger_title"] = (i.trigger_metadata or {}).get("title", i.trigger_id)
        result.append(d)
    return jsonify({"instances": result}), 200


@workflows_bp.route("/instances", methods=["POST"])
@login_required
@chapter_required
@role_required("member")
def start_instance():
    """Start a new workflow instance."""
    from app.models import WorkflowTemplate
    from app.services.workflow_engine import start_workflow

    chapter = g.current_chapter
    data = request.get_json() or {}

    template_id = data.get("template_id")
    trigger_type = data.get("trigger_type")
    trigger_id = data.get("trigger_id")

    if not template_id or not trigger_type or not trigger_id:
        return jsonify({"error": "template_id, trigger_type, and trigger_id are required."}), 400

    template = db.session.get(WorkflowTemplate, template_id)
    if not template or not template.is_active:
        return jsonify({"error": "Workflow template not found or inactive."}), 404

    if not _template_accessible(template, chapter):
        return jsonify({"error": "Workflow template not found."}), 404

    instance = start_workflow(
        template=template,
        trigger_type=trigger_type,
        trigger_id=trigger_id,
        trigger_metadata=data.get("trigger_metadata") or {},
        initiated_by_user=current_user,
        chapter=chapter,
    )

    return jsonify({"instance": instance.to_dict()}), 201


@workflows_bp.route("/instances/<instance_id>", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_instance(instance_id):
    """Get full instance detail including step instances with step definitions."""
    from app.models import WorkflowInstance

    chapter = g.current_chapter
    instance = db.session.get(WorkflowInstance, instance_id)

    if not instance or instance.chapter_id != chapter.id:
        return jsonify({"error": "Instance not found."}), 404

    # Members may only view their own instances
    membership = current_user.get_membership(chapter.id)
    if membership and not membership.has_role("secretary"):
        if instance.initiated_by != current_user.id:
            return jsonify({"error": "Instance not found."}), 404

    result = instance.to_dict()
    result["step_instances"] = [
        si.to_dict(include_step=True) for si in instance.step_instances
    ]
    result["template"] = instance.template.to_dict()
    return jsonify({"instance": result}), 200


@workflows_bp.route(
    "/instances/<instance_id>/steps/<step_instance_id>/action", methods=["POST"]
)
@login_required
@chapter_required
@role_required("member")
def step_action(instance_id, step_instance_id):
    """Approve or reject a step instance."""
    from app.models import WorkflowInstance, WorkflowStepInstance
    from app.services.workflow_engine import process_step_action

    chapter = g.current_chapter
    instance = db.session.get(WorkflowInstance, instance_id)
    if not instance or instance.chapter_id != chapter.id:
        return jsonify({"error": "Instance not found."}), 404

    step_instance = db.session.get(WorkflowStepInstance, step_instance_id)
    if not step_instance or step_instance.instance_id != instance_id:
        return jsonify({"error": "Step instance not found."}), 404

    if step_instance.status != "in_progress":
        return jsonify({"error": f"Step is not awaiting action (status: {step_instance.status})."}), 409

    # Verify the actor has the required role
    step = step_instance.step
    if step.approver_type == "specific_user":
        if step_instance.assigned_to_user_id != current_user.id:
            return jsonify({"error": "You are not the assigned approver for this step."}), 403
    else:
        # Role-based: exact match required
        required_role = step_instance.assigned_to_role or "member"
        REGIONAL_ROLES = {"regional_director", "regional_1st_vice", "regional_2nd_vice", "regional_secretary", "regional_treasurer"}
        if required_role in REGIONAL_ROLES:
            # Check the user's region membership for this chapter's region
            from app.models.region_membership import RegionMembership
            if not chapter.region_id:
                return jsonify({"error": "This chapter has no assigned region."}), 403
            region_membership = RegionMembership.query.filter_by(
                user_id=current_user.id, region_id=chapter.region_id, active=True
            ).first()
            if not region_membership or region_membership.role != required_role:
                return jsonify(
                    {"error": f"This step is assigned to the '{required_role}' role."}
                ), 403
        else:
            membership = current_user.get_membership(chapter.id)
            if not membership or membership.role != required_role:
                return jsonify(
                    {"error": f"This step is assigned to the '{required_role}' role."}
                ), 403

    data = request.get_json() or {}
    action = data.get("action")
    if action not in ("approve", "reject"):
        return jsonify({"error": "action must be 'approve' or 'reject'."}), 400

    try:
        updated_instance = process_step_action(
            step_instance=step_instance,
            action=action,
            actor_user=current_user,
            comments=data.get("comments") or None,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409

    result = updated_instance.to_dict()
    result["step_instances"] = [
        si.to_dict(include_step=True) for si in updated_instance.step_instances
    ]
    result["template"] = updated_instance.template.to_dict()
    return jsonify({"instance": result}), 200


@workflows_bp.route("/instances/<instance_id>/cancel", methods=["POST"])
@login_required
@chapter_required
@role_required("treasurer")
def cancel_instance(instance_id):
    """Cancel an in-progress workflow instance."""
    from app.models import WorkflowInstance

    chapter = g.current_chapter
    instance = db.session.get(WorkflowInstance, instance_id)

    if not instance or instance.chapter_id != chapter.id:
        return jsonify({"error": "Instance not found."}), 404

    if instance.status not in ("pending", "in_progress"):
        return jsonify(
            {"error": f"Cannot cancel instance with status '{instance.status}'."}
        ), 409

    from datetime import datetime, timezone

    instance.status = "cancelled"
    instance.completed_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({"success": True, "instance": instance.to_dict()}), 200
