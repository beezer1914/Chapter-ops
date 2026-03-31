"""
AgentApproval model — stages destructive/irreversible actions for human confirmation.

The ops agent writes a pending approval here; Brandon receives an email with a
one-time confirmation link. The link hits /api/agent/approve/<token>, which
validates and executes the pre-staged command.

Approvals expire after 24 hours and are single-use only.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, JSON, DateTime, Boolean

from app.extensions import db
from app.models.base import BaseModel


class AgentApproval(BaseModel):
    __tablename__ = "agent_approval"

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    action_id: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    command_json: Mapped[dict] = mapped_column(JSON, nullable=False)

    approval_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    executed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "action_id": self.action_id,
            "description": self.description,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "rejected_at": self.rejected_at.isoformat() if self.rejected_at else None,
            "executed": self.executed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
