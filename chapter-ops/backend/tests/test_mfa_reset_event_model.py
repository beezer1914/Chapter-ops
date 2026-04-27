"""Tests for the MFAResetEvent audit model."""

from tests.conftest import make_user
from app.models import MFAResetEvent
from app.extensions import db


class TestMFAResetEventModel:
    def test_minimum_record(self, db_session):
        target = make_user(email="target@example.com")
        actor = make_user(email="actor@example.com")
        db_session.commit()
        ev = MFAResetEvent(
            target_user_id=target.id,
            actor_user_id=actor.id,
            actor_role_at_reset="president",
        )
        db_session.add(ev)
        db_session.commit()
        assert ev.id is not None
        assert ev.created_at is not None
        assert ev.reason is None  # Optional

    def test_reason_optional_text(self, db_session):
        target = make_user(email="target2@example.com")
        actor = make_user(email="actor2@example.com")
        db_session.commit()
        ev = MFAResetEvent(
            target_user_id=target.id,
            actor_user_id=actor.id,
            actor_role_at_reset="org_admin",
            reason="Lost phone, no backup codes",
        )
        db_session.add(ev)
        db_session.commit()
        assert ev.reason == "Lost phone, no backup codes"
