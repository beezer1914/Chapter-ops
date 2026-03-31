"""
AgentRun model — persists a record of every ops agent execution.

Stores the findings and actions from each run for audit trail and
the /api/agent/status endpoint.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, JSON, DateTime

from app.extensions import db
from app.models.base import BaseModel


class AgentRun(BaseModel):
    __tablename__ = "agent_run"

    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    run_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="scheduled"
    )  # "scheduled" | "manual"
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="ok"
    )  # "ok" | "warning" | "critical"
    findings_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    actions_taken_json: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "run_type": self.run_type,
            "status": self.status,
            "findings": self.findings_json or [],
            "actions_taken": self.actions_taken_json or [],
        }
