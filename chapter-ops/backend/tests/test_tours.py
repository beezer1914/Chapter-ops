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


def test_patch_state_creates_row_on_first_write(client, db_session):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "member"})
    assert res.status_code == 200
    assert "welcome" in res.json["seen"]
    assert res.json["seen"]["welcome"]["role"] == "member"
    assert "seen_at" in res.json["seen"]["welcome"]


def test_patch_state_upserts_without_clobbering(client, db_session):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "member"})
    res = client.patch("/api/tours/state", json={"tour_id": "chapter_dues", "role": "treasurer"})

    assert res.status_code == 200
    assert set(res.json["seen"].keys()) == {"welcome", "chapter_dues"}
    assert res.json["seen"]["welcome"]["role"] == "member"
    assert res.json["seen"]["chapter_dues"]["role"] == "treasurer"


def test_patch_state_rejects_invalid_tour_id(client, db_session):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.patch("/api/tours/state", json={"tour_id": "BAD-ID", "role": "member"})
    assert res.status_code == 400


def test_patch_state_rejects_invalid_role(client, db_session):
    user = make_user(password=VALID_PASSWORD)
    db_session.commit()
    _login(client, user.email)

    res = client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "wizard"})
    assert res.status_code == 400


def test_patch_state_requires_auth(client):
    res = client.patch("/api/tours/state", json={"tour_id": "welcome", "role": "member"})
    assert res.status_code == 401
