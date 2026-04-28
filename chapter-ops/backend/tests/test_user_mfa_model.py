"""Tests for the UserMFA model."""

from tests.conftest import make_user
from app.models import UserMFA
from app.extensions import db


class TestUserMFAModel:
    def test_default_state_disabled(self, db_session):
        u = make_user(email="mfa1@example.com")
        db_session.commit()
        record = UserMFA(user_id=u.id, secret="encrypted-blob")
        db_session.add(record)
        db_session.commit()
        assert record.enabled is False
        assert record.backup_codes_hashed == []
        assert record.enrolled_at is None
        assert record.last_used_at is None

    def test_unique_per_user(self, db_session):
        u = make_user(email="mfa2@example.com")
        db_session.commit()
        db_session.add(UserMFA(user_id=u.id, secret="x"))
        db_session.commit()
        # Second insert should fail unique constraint
        db_session.add(UserMFA(user_id=u.id, secret="y"))
        import pytest
        from sqlalchemy.exc import IntegrityError
        with pytest.raises(IntegrityError):
            db_session.commit()
