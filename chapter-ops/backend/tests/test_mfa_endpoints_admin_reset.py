"""Tests for POST /api/auth/mfa/reset/<target_user_id> (admin reset)."""

from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_org_membership,
)
from app.models import UserMFA, MFAResetEvent
from app.services.mfa_service import generate_secret, encrypt_secret, generate_backup_codes, hash_backup_codes
from app.extensions import db


def _login(client, email, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _enroll(db_session, user, enabled=True):
    secret = generate_secret()
    record = UserMFA(
        user_id=user.id,
        secret=encrypt_secret(secret),
        enabled=enabled,
        backup_codes_hashed=hash_backup_codes(generate_backup_codes()),
    )
    db_session.add(record)
    db_session.commit()


class TestAdminReset:
    def test_president_can_reset_treasurer_in_same_chapter(self, app, client, db_session):
        org = make_organization()
        ch = make_chapter(org)
        pres = make_user(email="p@example.com", password="Str0ng!Password1")
        treas = make_user(email="t@example.com", password="Str0ng!Password1")
        make_membership(pres, ch, role="president")
        make_membership(treas, ch, role="treasurer")
        _enroll(db_session, pres)
        _enroll(db_session, treas)

        _login(client, "p@example.com")
        resp = client.post(
            f"/api/auth/mfa/reset/{treas.id}",
            json={"reason": "Lost phone"},
        )
        assert resp.status_code == 200
        assert UserMFA.query.filter_by(user_id=treas.id).first() is None
        ev = MFAResetEvent.query.filter_by(target_user_id=treas.id).first()
        assert ev is not None
        assert ev.actor_user_id == pres.id
        assert ev.reason == "Lost phone"

    def test_secretary_cannot_reset(self, app, client, db_session):
        org = make_organization()
        ch = make_chapter(org)
        sec = make_user(email="s@example.com", password="Str0ng!Password1")
        treas = make_user(email="t2@example.com", password="Str0ng!Password1")
        make_membership(sec, ch, role="secretary")
        make_membership(treas, ch, role="treasurer")
        _enroll(db_session, sec)
        _enroll(db_session, treas)

        _login(client, "s@example.com")
        resp = client.post(
            f"/api/auth/mfa/reset/{treas.id}",
            json={"reason": "I want to"},
        )
        assert resp.status_code == 403

    def test_unenrolled_actor_cannot_reset(self, app, client, db_session):
        """Even a president can't reset if their own MFA isn't enabled."""
        org = make_organization()
        ch = make_chapter(org)
        pres = make_user(email="p2@example.com", password="Str0ng!Password1")
        treas = make_user(email="t3@example.com", password="Str0ng!Password1")
        make_membership(pres, ch, role="president")
        make_membership(treas, ch, role="treasurer")
        # NOT enrolling pres
        _enroll(db_session, treas)

        _login(client, "p2@example.com")
        resp = client.post(
            f"/api/auth/mfa/reset/{treas.id}",
            json={"reason": "test"},
        )
        assert resp.status_code == 403
