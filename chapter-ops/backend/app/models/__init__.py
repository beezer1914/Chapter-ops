"""
Database models package.

Import all models here so Alembic and Flask-Migrate can discover them.
"""

from app.models.base import BaseModel
from app.models.organization import Organization
from app.models.org_membership import OrganizationMembership
from app.models.region import Region
from app.models.region_membership import RegionMembership
from app.models.chapter import Chapter
from app.models.user import User
from app.models.membership import ChapterMembership
from app.models.payment import Payment
from app.models.payment_plan import PaymentPlan
from app.models.invite import InviteCode
from app.models.donation import Donation
from app.models.notification import Notification
from app.models.transfer_request import ChapterTransferRequest
from app.models.workflow import (
    WorkflowTemplate,
    WorkflowStep,
    WorkflowInstance,
    WorkflowStepInstance,
)
from app.models.event import Event, EventAttendance
from app.models.announcement import Announcement
from app.models.invoice import Invoice
from app.models.document import Document
from app.models.knowledge_article import KnowledgeArticle
from app.models.intake import IntakeCandidate, IntakeDocument
from app.models.expense import Expense
from app.models.milestone import ChapterMilestone
from app.models.auth_event import AuthEvent
from app.models.agent_run import AgentRun
from app.models.agent_approval import AgentApproval

__all__ = [
    "BaseModel",
    "Organization",
    "OrganizationMembership",
    "Region",
    "RegionMembership",
    "Chapter",
    "User",
    "ChapterMembership",
    "Payment",
    "PaymentPlan",
    "InviteCode",
    "Donation",
    "Notification",
    "ChapterTransferRequest",
    "WorkflowTemplate",
    "WorkflowStep",
    "WorkflowInstance",
    "WorkflowStepInstance",
    "Event",
    "EventAttendance",
    "Announcement",
    "Invoice",
    "Document",
    "KnowledgeArticle",
    "IntakeCandidate",
    "IntakeDocument",
    "Expense",
    "ChapterMilestone",
    "AuthEvent",
    "AgentRun",
    "AgentApproval",
]
