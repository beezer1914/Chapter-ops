"""Tests for the UserTourState model."""

from app.models import UserTourState
from tests.conftest import make_user


def test_user_tour_state_defaults_to_empty_seen(db_session):
    user = make_user()
    state = UserTourState(user_id=user.id)
    db_session.add(state)
    db_session.commit()

    fetched = UserTourState.query.filter_by(user_id=user.id).first()
    assert fetched is not None
    assert fetched.seen == {}


def test_user_tour_state_stores_jsonb(db_session):
    user = make_user()
    state = UserTourState(user_id=user.id, seen={"welcome": {"seen_at": "2026-04-19T00:00:00Z", "role": "member"}})
    db_session.add(state)
    db_session.commit()

    fetched = UserTourState.query.filter_by(user_id=user.id).first()
    assert fetched.seen["welcome"]["role"] == "member"
