"""Tests for tour state endpoints — /api/tours/*."""

from tests.conftest import make_user

VALID_PASSWORD = "Str0ng!Password1"


def _login(client, email):
    client.post("/api/auth/login", json={"email": email, "password": VALID_PASSWORD})


def test_get_state_requires_auth(client):
    res = client.get("/api/tours/state")
    assert res.status_code == 401


def test_get_state_returns_empty_for_new_user(client, db_session):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.get("/api/tours/state")
    assert res.status_code == 200
    assert res.json == {"seen": {}}
