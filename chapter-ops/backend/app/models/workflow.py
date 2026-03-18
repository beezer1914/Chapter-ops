"""
Workflow models — workflow templates, steps, and runtime instances.

WorkflowTemplate: chapter_id nullable (null = org-wide template)
WorkflowStep:     step definition with approver, condition, parallel group
WorkflowInstance: runtime execution of a template for a trigger object
WorkflowStepInstance: per-step execution state
"""

from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.extensions import db
from app.models.base import BaseModel


class WorkflowTemplate(BaseModel):
    __tablename__ = "workflow_template"

    organization_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("organization.id"), nullable=False, index=True
    )
    # nullable = org-wide template; non-null = chapter-specific
    chapter_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=True, index=True
    )
    created_by: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(db.String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(db.Text, nullable=True)
    # "document" | "expense" | "event" | "member_application"
    trigger_type: Mapped[str] = mapped_column(db.String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(db.Boolean, default=True, nullable=False)
    # JSON array of hook configs e.g. [{"type": "notify_submitter"}, ...]
    completion_actions: Mapped[list] = mapped_column(
        db.JSON, nullable=False, default=list
    )

    # Relationships
    steps: Mapped[list["WorkflowStep"]] = relationship(
        "WorkflowStep",
        back_populates="template",
        order_by="WorkflowStep.step_order",
        cascade="all, delete-orphan",
    )
    instances: Mapped[list["WorkflowInstance"]] = relationship(
        "WorkflowInstance", back_populates="template", lazy="dynamic"
    )

    VALID_TRIGGER_TYPES = {"document", "expense", "event", "member_application"}

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "organization_id": self.organization_id,
            "chapter_id": self.chapter_id,
            "created_by": self.created_by,
            "name": self.name,
            "description": self.description,
            "trigger_type": self.trigger_type,
            "is_active": self.is_active,
            "completion_actions": self.completion_actions or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class WorkflowStep(BaseModel):
    __tablename__ = "workflow_step"

    template_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("workflow_template.id"), nullable=False, index=True
    )
    step_order: Mapped[int] = mapped_column(db.Integer, nullable=False)
    name: Mapped[str] = mapped_column(db.String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(db.Text, nullable=True)
    # Steps sharing the same non-null parallel_group run concurrently
    parallel_group: Mapped[str | None] = mapped_column(
        db.String(100), nullable=True
    )
    # "role" | "specific_user"
    approver_type: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="role"
    )
    approver_role: Mapped[str | None] = mapped_column(db.String(30), nullable=True)
    approver_user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    # e.g. {"field": "amount", "operator": ">", "value": 500}
    condition_json: Mapped[dict | None] = mapped_column(db.JSON, nullable=True)
    is_required: Mapped[bool] = mapped_column(
        db.Boolean, default=True, nullable=False
    )

    # Relationships
    template: Mapped["WorkflowTemplate"] = relationship(
        "WorkflowTemplate", back_populates="steps"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "template_id": self.template_id,
            "step_order": self.step_order,
            "name": self.name,
            "description": self.description,
            "parallel_group": self.parallel_group,
            "approver_type": self.approver_type,
            "approver_role": self.approver_role,
            "approver_user_id": self.approver_user_id,
            "condition_json": self.condition_json,
            "is_required": self.is_required,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class WorkflowInstance(BaseModel):
    __tablename__ = "workflow_instance"

    template_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("workflow_template.id"), nullable=False, index=True
    )
    chapter_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("chapter.id"), nullable=False, index=True
    )
    initiated_by: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=False
    )
    trigger_type: Mapped[str] = mapped_column(db.String(50), nullable=False)
    # UUID string of the document/expense/etc. that triggered this workflow
    trigger_id: Mapped[str] = mapped_column(db.String(36), nullable=False)
    # JSON snapshot of the trigger object at initiation time
    trigger_metadata: Mapped[dict] = mapped_column(
        db.JSON, nullable=False, default=dict
    )
    # "pending"|"in_progress"|"approved"|"rejected"|"cancelled"
    status: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="pending"
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )

    # Relationships
    template: Mapped["WorkflowTemplate"] = relationship(
        "WorkflowTemplate", back_populates="instances"
    )
    step_instances: Mapped[list["WorkflowStepInstance"]] = relationship(
        "WorkflowStepInstance",
        back_populates="instance",
        order_by="WorkflowStepInstance.created_at",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "template_id": self.template_id,
            "chapter_id": self.chapter_id,
            "initiated_by": self.initiated_by,
            "trigger_type": self.trigger_type,
            "trigger_id": self.trigger_id,
            "trigger_metadata": self.trigger_metadata or {},
            "status": self.status,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class WorkflowStepInstance(BaseModel):
    __tablename__ = "workflow_step_instance"

    instance_id: Mapped[str] = mapped_column(
        db.String(36),
        db.ForeignKey("workflow_instance.id"),
        nullable=False,
        index=True,
    )
    step_id: Mapped[str] = mapped_column(
        db.String(36), db.ForeignKey("workflow_step.id"), nullable=False, index=True
    )
    # "pending"|"waiting"|"in_progress"|"approved"|"rejected"|"skipped"
    status: Mapped[str] = mapped_column(
        db.String(20), nullable=False, default="pending"
    )
    assigned_to_role: Mapped[str | None] = mapped_column(
        db.String(30), nullable=True
    )
    assigned_to_user_id: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    action_taken_by: Mapped[str | None] = mapped_column(
        db.String(36), db.ForeignKey("user.id"), nullable=True
    )
    action_taken_at: Mapped[datetime | None] = mapped_column(
        db.DateTime(timezone=True), nullable=True
    )
    comments: Mapped[str | None] = mapped_column(db.Text, nullable=True)

    # Relationships
    instance: Mapped["WorkflowInstance"] = relationship(
        "WorkflowInstance", back_populates="step_instances"
    )
    step: Mapped["WorkflowStep"] = relationship("WorkflowStep")

    def to_dict(self, include_step: bool = False) -> dict:
        d = {
            "id": self.id,
            "instance_id": self.instance_id,
            "step_id": self.step_id,
            "status": self.status,
            "assigned_to_role": self.assigned_to_role,
            "assigned_to_user_id": self.assigned_to_user_id,
            "action_taken_by": self.action_taken_by,
            "action_taken_at": (
                self.action_taken_at.isoformat() if self.action_taken_at else None
            ),
            "comments": self.comments,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_step and self.step:
            d["step"] = self.step.to_dict()
        return d
