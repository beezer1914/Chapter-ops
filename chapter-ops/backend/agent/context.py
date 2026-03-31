"""
AgentContext — shared state object passed through all check modules in a single run.

Each check appends Finding objects to ctx.findings.
Actions log themselves to ctx.actions_taken.
Approval requests are staged in ctx.approval_requests.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class Finding:
    severity: str           # "info" | "warning" | "critical"
    check: str              # e.g. "stripe.webhook_health"
    summary: str            # One-line human-readable summary
    detail: str             # Full context for digest/email
    recommended_action: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "severity": self.severity,
            "check": self.check,
            "summary": self.summary,
            "detail": self.detail,
            "recommended_action": self.recommended_action,
        }


@dataclass
class AgentContext:
    run_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    triggered_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    findings: list[Finding] = field(default_factory=list)
    actions_taken: list[str] = field(default_factory=list)
    approval_requests: list[str] = field(default_factory=list)

    @property
    def highest_severity(self) -> str:
        """Returns the worst severity level across all findings."""
        if any(f.severity == "critical" for f in self.findings):
            return "critical"
        if any(f.severity == "warning" for f in self.findings):
            return "warning"
        return "ok"

    def findings_by_severity(self, severity: str) -> list[Finding]:
        return [f for f in self.findings if f.severity == severity]
