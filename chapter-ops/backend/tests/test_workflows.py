"""Tests for workflow builder — /api/workflows/*."""

import pytest

from app.extensions import db
from app.models import WorkflowInstance, WorkflowStepInstance
from app.services.workflow_engine import (
    _evaluate_condition,
    process_step_action,
    start_workflow,
)
from tests.conftest import (
    make_chapter,
    make_membership,
    make_org_membership,
    make_organization,
    make_region,
    make_user,
    make_workflow_step,
    make_workflow_template,
)

VALID_PASSWORD = "Str0ng!Password1"


def _login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


# ── Shared setup helpers ──────────────────────────────────────────────────────


def _setup_treasurer(org, chapter=None):
    """Create a treasurer user with a chapter membership."""
    user = make_user(email="treasurer@example.com", password=VALID_PASSWORD)
    if chapter is None:
        chapter = make_chapter(org)
    make_membership(user, chapter, role="treasurer")
    user.active_chapter_id = chapter.id
    db.session.flush()
    return user, chapter


def _setup_member(org, chapter):
    """Create a plain member user."""
    user = make_user(email="member@example.com", password=VALID_PASSWORD)
    make_membership(user, chapter, role="member")
    user.active_chapter_id = chapter.id
    db.session.flush()
    return user


def _setup_org_admin(org, chapter=None):
    """Create an org-admin user."""
    user = make_user(email="orgadmin@example.com", password=VALID_PASSWORD)
    make_org_membership(user, org, role="admin")
    if chapter is None:
        chapter = make_chapter(org)
    make_membership(user, chapter, role="treasurer")
    user.active_chapter_id = chapter.id
    db.session.flush()
    return user, chapter


# ── TestTemplateList ──────────────────────────────────────────────────────────


class TestTemplateList:
    def test_treasurer_sees_chapter_templates(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            make_workflow_template(chapter, treasurer, org, name="Doc Review")
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.get("/api/workflows/templates")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["templates"]) == 1
        assert data["templates"][0]["name"] == "Doc Review"

    def test_treasurer_sees_org_wide_templates(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            # Org-wide template (chapter_id=None)
            make_workflow_template(chapter, treasurer, org, name="Org Template", chapter_id=None)
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.get("/api/workflows/templates")
        assert resp.status_code == 200
        templates = resp.get_json()["templates"]
        assert any(t["name"] == "Org Template" for t in templates)

    def test_member_cannot_list_templates(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            member = _setup_member(org, chapter)
            db.session.commit()

        _login(client, "member@example.com")
        resp = client.get("/api/workflows/templates")
        assert resp.status_code == 403

    def test_unauthenticated_returns_401(self, client, app):
        resp = client.get("/api/workflows/templates")
        assert resp.status_code == 401

    def test_template_includes_step_count(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=1)
            make_workflow_step(template, order=2)
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.get("/api/workflows/templates")
        assert resp.status_code == 200
        t = resp.get_json()["templates"][0]
        assert t["step_count"] == 2


# ── TestTemplateCreate ────────────────────────────────────────────────────────


class TestTemplateCreate:
    def test_treasurer_can_create(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.post("/api/workflows/templates", json={
            "name": "New Template",
            "trigger_type": "document",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["template"]["name"] == "New Template"
        assert data["template"]["trigger_type"] == "document"

    def test_member_cannot_create(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            member = _setup_member(org, chapter)
            db.session.commit()

        _login(client, "member@example.com")
        resp = client.post("/api/workflows/templates", json={
            "name": "New Template",
            "trigger_type": "document",
        })
        assert resp.status_code == 403

    def test_invalid_trigger_type_rejected(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.post("/api/workflows/templates", json={
            "name": "Bad Template",
            "trigger_type": "invalid_type",
        })
        assert resp.status_code == 400

    def test_org_wide_requires_org_admin(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.post("/api/workflows/templates", json={
            "name": "Org Template",
            "trigger_type": "document",
            "chapter_id": None,
        })
        assert resp.status_code == 403

    def test_org_admin_can_create_org_wide(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, chapter = _setup_org_admin(org)
            db.session.commit()

        _login(client, "orgadmin@example.com")
        resp = client.post("/api/workflows/templates", json={
            "name": "Org-Wide Template",
            "trigger_type": "document",
            "chapter_id": None,
        })
        assert resp.status_code == 201
        assert resp.get_json()["template"]["chapter_id"] is None


# ── TestTemplateDetail ────────────────────────────────────────────────────────


class TestTemplateDetail:
    def test_returns_steps_in_order(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=2, name="Step B")
            make_workflow_step(template, order=1, name="Step A")
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        resp = client.get(f"/api/workflows/templates/{template_id}")
        assert resp.status_code == 200
        steps = resp.get_json()["template"]["steps"]
        assert steps[0]["name"] == "Step A"
        assert steps[1]["name"] == "Step B"

    def test_not_found_returns_404(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.get("/api/workflows/templates/nonexistent-id")
        assert resp.status_code == 404


# ── TestTemplateUpdate ────────────────────────────────────────────────────────


class TestTemplateUpdate:
    def test_treasurer_can_update_own_template(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org, name="Old Name")
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        resp = client.put(f"/api/workflows/templates/{template_id}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.get_json()["template"]["name"] == "New Name"

    def test_other_chapter_treasurer_cannot_update(self, client, app):
        with app.app_context():
            org = make_organization()
            # Template owned by chapter A
            region = make_region(org)
            chapter_a = make_chapter(org, name="Chapter A", region=region)
            owner = make_user(email="owner@example.com", password=VALID_PASSWORD)
            make_membership(owner, chapter_a, role="treasurer")
            owner.active_chapter_id = chapter_a.id

            template = make_workflow_template(chapter_a, owner, org)

            # Intruder is treasurer in chapter B
            chapter_b = make_chapter(org, name="Chapter B", region=region)
            intruder = make_user(email="intruder@example.com", password=VALID_PASSWORD)
            make_membership(intruder, chapter_b, role="treasurer")
            intruder.active_chapter_id = chapter_b.id

            db.session.commit()
            template_id = template.id

        _login(client, "intruder@example.com")
        resp = client.put(f"/api/workflows/templates/{template_id}", json={"name": "Hack"})
        # Template belongs to chapter A, intruder is in chapter B → 404 (not visible)
        assert resp.status_code == 404


# ── TestStepCRUD ──────────────────────────────────────────────────────────────


class TestStepCRUD:
    def test_add_step(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        resp = client.post(f"/api/workflows/templates/{template_id}/steps", json={
            "name": "Review Step",
            "approver_type": "role",
            "approver_role": "treasurer",
        })
        assert resp.status_code == 201
        step = resp.get_json()["step"]
        assert step["name"] == "Review Step"
        assert step["approver_role"] == "treasurer"
        assert step["step_order"] == 1  # auto-assigned

    def test_update_step(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            step = make_workflow_step(template, order=1, name="Old Step")
            db.session.commit()
            template_id = template.id
            step_id = step.id

        _login(client, "treasurer@example.com")
        resp = client.put(
            f"/api/workflows/templates/{template_id}/steps/{step_id}",
            json={"name": "Updated Step"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["step"]["name"] == "Updated Step"

    def test_delete_step_resequences(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            s1 = make_workflow_step(template, order=1, name="Step 1")
            s2 = make_workflow_step(template, order=2, name="Step 2")
            s3 = make_workflow_step(template, order=3, name="Step 3")
            db.session.commit()
            template_id = template.id
            s1_id = s1.id
            s2_id = s2.id

        _login(client, "treasurer@example.com")
        # Delete step 1
        resp = client.delete(f"/api/workflows/templates/{template_id}/steps/{s1_id}")
        assert resp.status_code == 200

        # Get updated template
        resp = client.get(f"/api/workflows/templates/{template_id}")
        steps = resp.get_json()["template"]["steps"]
        assert len(steps) == 2
        assert steps[0]["step_order"] == 1
        assert steps[1]["step_order"] == 2

    def test_reorder_steps(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            s1 = make_workflow_step(template, order=1, name="A")
            s2 = make_workflow_step(template, order=2, name="B")
            db.session.commit()
            template_id = template.id
            s1_id = s1.id
            s2_id = s2.id

        _login(client, "treasurer@example.com")
        resp = client.patch(f"/api/workflows/templates/{template_id}/steps/reorder", json={
            "steps": [
                {"id": s1_id, "step_order": 2},
                {"id": s2_id, "step_order": 1},
            ]
        })
        assert resp.status_code == 200
        steps = resp.get_json()["steps"]
        # B is now first
        assert steps[0]["name"] == "B"
        assert steps[1]["name"] == "A"

    def test_reorder_with_foreign_step_id_rejected(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        resp = client.patch(f"/api/workflows/templates/{template_id}/steps/reorder", json={
            "steps": [{"id": "foreign-id", "step_order": 1}]
        })
        assert resp.status_code == 400


# ── TestWorkflowEngine (unit tests) ──────────────────────────────────────────


class TestEvaluateCondition:
    def test_none_condition_always_true(self):
        assert _evaluate_condition(None, {}) is True

    def test_greater_than_passes(self):
        cond = {"field": "amount", "operator": ">", "value": 500}
        assert _evaluate_condition(cond, {"amount": 600}) is True

    def test_greater_than_fails(self):
        cond = {"field": "amount", "operator": ">", "value": 500}
        assert _evaluate_condition(cond, {"amount": 400}) is False

    def test_equal_string(self):
        cond = {"field": "status", "operator": "==", "value": "pending"}
        assert _evaluate_condition(cond, {"status": "pending"}) is True
        assert _evaluate_condition(cond, {"status": "approved"}) is False

    def test_missing_field_defaults_to_true(self):
        cond = {"field": "amount", "operator": ">", "value": 500}
        assert _evaluate_condition(cond, {}) is True

    def test_invalid_operator_defaults_to_true(self):
        cond = {"field": "amount", "operator": "BETWEEN", "value": 500}
        assert _evaluate_condition(cond, {"amount": 600}) is True


class TestStartWorkflow:
    def test_sequential_only_first_step_active(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="member")
            template = make_workflow_template(chapter, user, org)
            make_workflow_step(template, order=1, name="Step 1")
            make_workflow_step(template, order=2, name="Step 2")
            make_workflow_step(template, order=3, name="Step 3")
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)

            step_instances = list(instance.step_instances)
            statuses = [si.status for si in step_instances]
            assert statuses == ["in_progress", "waiting", "waiting"]

    def test_parallel_group_all_active(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="member")
            template = make_workflow_template(chapter, user, org)
            # Steps 1 and 2 in parallel group "A"
            make_workflow_step(template, order=1, name="Step 1", parallel_group="A")
            make_workflow_step(template, order=2, name="Step 2", parallel_group="A")
            make_workflow_step(template, order=3, name="Step 3")
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)

            step_instances = list(instance.step_instances)
            statuses = [si.status for si in step_instances]
            assert statuses == ["in_progress", "in_progress", "waiting"]

    def test_condition_skip_on_start(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="member")
            template = make_workflow_template(chapter, user, org)
            # Step 1: condition amount > 500 (will fail with amount=100)
            cond = {"field": "amount", "operator": ">", "value": 500}
            make_workflow_step(template, order=1, name="Skip Me", condition=cond)
            make_workflow_step(template, order=2, name="Run Me")
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(
                template, "document", "doc-1", {"amount": 100}, user, chapter
            )

            step_instances = list(instance.step_instances)
            assert step_instances[0].status == "skipped"
            assert step_instances[1].status == "in_progress"


class TestProcessStepAction:
    def test_approve_sequential_advances_to_next(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="treasurer")
            template = make_workflow_template(chapter, user, org)
            make_workflow_step(template, order=1)
            make_workflow_step(template, order=2)
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)
            step_instances = list(instance.step_instances)

            # Approve step 1
            process_step_action(step_instances[0], "approve", user)

            db.session.refresh(instance)
            step_instances = list(instance.step_instances)
            assert step_instances[0].status == "approved"
            assert step_instances[1].status == "in_progress"
            assert instance.status == "in_progress"

    def test_approve_all_steps_completes_instance(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="treasurer")
            template = make_workflow_template(chapter, user, org)
            make_workflow_step(template, order=1)
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)
            step_instances = list(instance.step_instances)

            process_step_action(step_instances[0], "approve", user)

            db.session.refresh(instance)
            assert instance.status == "approved"
            assert instance.completed_at is not None

    def test_reject_terminates_instance(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="treasurer")
            template = make_workflow_template(chapter, user, org)
            make_workflow_step(template, order=1)
            make_workflow_step(template, order=2)
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)
            step_instances = list(instance.step_instances)

            process_step_action(step_instances[0], "reject", user, comments="Not approved.")

            db.session.refresh(instance)
            assert instance.status == "rejected"
            assert instance.completed_at is not None
            step_instances = list(instance.step_instances)
            assert step_instances[0].comments == "Not approved."

    def test_parallel_approve_one_keeps_instance_in_progress(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="treasurer")
            template = make_workflow_template(chapter, user, org)
            make_workflow_step(template, order=1, parallel_group="A")
            make_workflow_step(template, order=2, parallel_group="A")
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)
            step_instances = list(instance.step_instances)

            # Approve only the first parallel step
            process_step_action(step_instances[0], "approve", user)

            db.session.refresh(instance)
            assert instance.status == "in_progress"

    def test_parallel_approve_both_completes_instance(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="treasurer")
            template = make_workflow_template(chapter, user, org)
            make_workflow_step(template, order=1, parallel_group="A")
            make_workflow_step(template, order=2, parallel_group="A")
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)
            step_instances = list(instance.step_instances)

            process_step_action(step_instances[0], "approve", user)
            db.session.refresh(instance)
            step_instances = list(instance.step_instances)
            process_step_action(step_instances[1], "approve", user)

            db.session.refresh(instance)
            assert instance.status == "approved"

    def test_non_in_progress_step_raises_error(self, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            user = make_user()
            make_membership(user, chapter, role="treasurer")
            template = make_workflow_template(chapter, user, org)
            make_workflow_step(template, order=1)
            make_workflow_step(template, order=2)
            db.session.commit()

            template = db.session.get(type(template), template.id)
            instance = start_workflow(template, "document", "doc-1", {}, user, chapter)
            step_instances = list(instance.step_instances)

            # Step 2 is 'waiting', not 'in_progress'
            with pytest.raises(ValueError, match="not in_progress"):
                process_step_action(step_instances[1], "approve", user)


# ── TestStartInstance (API) ───────────────────────────────────────────────────


class TestStartInstance:
    def test_member_can_start_workflow(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            member = _setup_member(org, chapter)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=1)
            db.session.commit()
            template_id = template.id

        _login(client, "member@example.com")
        resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "some-doc-id",
            "trigger_metadata": {"amount": 100},
        })
        assert resp.status_code == 201
        instance = resp.get_json()["instance"]
        assert instance["status"] == "in_progress"

    def test_inactive_template_rejected(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            template.is_active = False
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "doc-1",
        })
        assert resp.status_code == 404

    def test_missing_fields_rejected(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.post("/api/workflows/instances", json={"trigger_type": "document"})
        assert resp.status_code == 400


# ── TestStepAction (API) ──────────────────────────────────────────────────────


class TestStepAction:
    def test_correct_role_can_approve(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            # Step requires treasurer role
            make_workflow_step(template, order=1, role="treasurer")
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        # Start instance
        start_resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "doc-1",
        })
        assert start_resp.status_code == 201
        instance_id = start_resp.get_json()["instance"]["id"]

        # Get instance detail to get step_instance ID
        detail_resp = client.get(f"/api/workflows/instances/{instance_id}")
        step_instance_id = detail_resp.get_json()["instance"]["step_instances"][0]["id"]

        # Approve
        resp = client.post(
            f"/api/workflows/instances/{instance_id}/steps/{step_instance_id}/action",
            json={"action": "approve", "comments": "LGTM"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["instance"]["status"] == "approved"

    def test_member_cannot_approve_treasurer_step(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            member = _setup_member(org, chapter)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=1, role="treasurer")
            db.session.commit()
            template_id = template.id

        # Member starts the workflow
        _login(client, "member@example.com")
        start_resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "doc-1",
        })
        instance_id = start_resp.get_json()["instance"]["id"]

        # Member tries to approve treasurer step
        detail_resp = client.get(f"/api/workflows/instances/{instance_id}")
        step_instance_id = detail_resp.get_json()["instance"]["step_instances"][0]["id"]

        resp = client.post(
            f"/api/workflows/instances/{instance_id}/steps/{step_instance_id}/action",
            json={"action": "approve"},
        )
        assert resp.status_code == 403

    def test_invalid_action_rejected(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=1, role="treasurer")
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        start_resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "doc-1",
        })
        instance_id = start_resp.get_json()["instance"]["id"]
        detail_resp = client.get(f"/api/workflows/instances/{instance_id}")
        step_instance_id = detail_resp.get_json()["instance"]["step_instances"][0]["id"]

        resp = client.post(
            f"/api/workflows/instances/{instance_id}/steps/{step_instance_id}/action",
            json={"action": "delegate"},  # invalid
        )
        assert resp.status_code == 400


# ── TestCancelInstance ────────────────────────────────────────────────────────


class TestCancelInstance:
    def test_treasurer_can_cancel(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=1)
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        start_resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "doc-1",
        })
        instance_id = start_resp.get_json()["instance"]["id"]

        resp = client.post(f"/api/workflows/instances/{instance_id}/cancel")
        assert resp.status_code == 200
        assert resp.get_json()["instance"]["status"] == "cancelled"

    def test_member_cannot_cancel(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            member = _setup_member(org, chapter)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=1)
            db.session.commit()
            template_id = template.id

        # Member starts instance
        _login(client, "member@example.com")
        start_resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "doc-1",
        })
        instance_id = start_resp.get_json()["instance"]["id"]

        # Member tries to cancel
        resp = client.post(f"/api/workflows/instances/{instance_id}/cancel")
        assert resp.status_code == 403

    def test_cannot_cancel_completed_instance(self, client, app):
        with app.app_context():
            org = make_organization()
            treasurer, chapter = _setup_treasurer(org)
            template = make_workflow_template(chapter, treasurer, org)
            make_workflow_step(template, order=1, role="treasurer")
            db.session.commit()
            template_id = template.id

        _login(client, "treasurer@example.com")
        # Start and approve to completion
        start_resp = client.post("/api/workflows/instances", json={
            "template_id": template_id,
            "trigger_type": "document",
            "trigger_id": "doc-1",
        })
        instance_id = start_resp.get_json()["instance"]["id"]
        detail_resp = client.get(f"/api/workflows/instances/{instance_id}")
        si_id = detail_resp.get_json()["instance"]["step_instances"][0]["id"]
        client.post(
            f"/api/workflows/instances/{instance_id}/steps/{si_id}/action",
            json={"action": "approve"},
        )

        # Now try to cancel (already approved)
        resp = client.post(f"/api/workflows/instances/{instance_id}/cancel")
        assert resp.status_code == 409
