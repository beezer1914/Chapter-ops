"""
Base model providing common fields for all database models.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.extensions import db


class BaseModel(db.Model):
    """Abstract base model with UUID primary key and timestamps."""

    __abstract__ = True

    id: Mapped[str] = mapped_column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    created_at: Mapped[datetime] = mapped_column(
        db.DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        db.DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def to_dict(self) -> dict:
        """Override in subclasses for JSON serialization."""
        raise NotImplementedError
