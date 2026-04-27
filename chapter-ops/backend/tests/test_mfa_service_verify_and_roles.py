"""Tests for TOTP verification + role-based enforcement helpers."""

import pyotp
import pytest

from tests.conftest import (
    make_user, make_organization, make_chapter, make_membership,
    make_org_membership, make_region, make_region_membership,
)
from app.services.mfa_service import (
    verify_totp, user_role_requires_mfa, can_reset_mfa,
    encrypt_secret, generate_secret,
)
from app.models import UserMFA
from app.extensions import db


class TestVerifyTOTP:
    def test_correct_code_returns_true(self, app):
        with app.app_context():
            secret = "JBSWY3DPEHPK3PXP"
            current_code = pyotp.TOTP(secret).now()
            assert verify_totp(secret, current_code) is True

    def test_wrong_code_returns_false(self, app):
        with app.app_context():
            secret = "JBSWY3DPEHPK3PXP"
            assert verify_totp(secret, "000000") is False

    def test_accepts_codes_within_clock_drift_window(self, app):
        """valid_window=1 means ±30 sec is accepted."""
        with app.app_context():
            secret = "JBSWY3DPEHPK3PXP"
            totp = pyotp.TOTP(secret)
            # Code from 30 sec ago should still verify
            import time
            past_code = totp.at(int(time.time()) - 30)
            assert verify_totp(secret, past_code) is True


class TestUserRoleRequiresMFA:
    def test_returns_false_when_enforcement_disabled(self, app, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = False
        u = make_user(email="t@example.com")
        org = make_organization()
        ch = make_chapter(org)
        make_membership(u, ch, role="treasurer")
        db_session.commit()
        with app.app_context():
            assert user_role_requires_mfa(u) is False

    def test_treasurer_required_when_enforcement_enabled(self, app, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = True
        u = make_user(email="t2@example.com")
        org = make_organization()
        ch = make_chapter(org)
        make_membership(u, ch, role="treasurer")
        db_session.commit()
        with app.app_context():
            assert user_role_requires_mfa(u) is True

    def test_member_not_required_when_enforcement_enabled(self, app, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = True
        u = make_user(email="m@example.com")
        org = make_organization()
        ch = make_chapter(org)
        make_membership(u, ch, role="member")
        db_session.commit()
        with app.app_context():
            assert user_role_requires_mfa(u) is False

    def test_secretary_not_required(self, app, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = True
        u = make_user(email="s@example.com")
        org = make_organization()
        ch = make_chapter(org)
        make_membership(u, ch, role="secretary")
        db_session.commit()
        with app.app_context():
            assert user_role_requires_mfa(u) is False

    def test_org_admin_required(self, app, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = True
        u = make_user(email="oa@example.com")
        org = make_organization()
        make_org_membership(u, org, role="admin")
        db_session.commit()
        with app.app_context():
            assert user_role_requires_mfa(u) is True

    def test_regional_officer_required(self, app, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = True
        u = make_user(email="rd@example.com")
        org = make_organization()
        region = make_region(org)
        make_region_membership(u, region, role="regional_director")
        db_session.commit()
        with app.app_context():
            assert user_role_requires_mfa(u) is True

    def test_platform_admin_required(self, app, db_session):
        app.config["MFA_ENFORCEMENT_ENABLED"] = True
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        u = make_user(email="founder@example.com")
        db_session.commit()
        with app.app_context():
            assert user_role_requires_mfa(u) is True


class TestCanResetMFA:
    def test_president_can_reset_treasurer_in_same_chapter(self, app, db_session):
        org = make_organization()
        ch = make_chapter(org)
        pres = make_user(email="p@example.com")
        treas = make_user(email="t@example.com")
        make_membership(pres, ch, role="president")
        make_membership(treas, ch, role="treasurer")
        # President must be MFA-enrolled
        db_session.add(UserMFA(user_id=pres.id, secret="x", enabled=True))
        db_session.commit()
        with app.app_context():
            assert can_reset_mfa(actor=pres, target=treas) is True

    def test_president_cannot_reset_treasurer_in_different_chapter(self, app, db_session):
        org = make_organization()
        ch1 = make_chapter(org, name="Ch1")
        ch2 = make_chapter(org, name="Ch2", region=ch1.region)
        pres = make_user(email="p2@example.com")
        treas = make_user(email="t2@example.com")
        make_membership(pres, ch1, role="president")
        make_membership(treas, ch2, role="treasurer")
        db_session.add(UserMFA(user_id=pres.id, secret="x", enabled=True))
        db_session.commit()
        with app.app_context():
            assert can_reset_mfa(actor=pres, target=treas) is False

    def test_unenrolled_actor_cannot_reset(self, app, db_session):
        """Downgrade-attack guard: caller must themselves be MFA-enrolled."""
        org = make_organization()
        ch = make_chapter(org)
        pres = make_user(email="p3@example.com")
        treas = make_user(email="t3@example.com")
        make_membership(pres, ch, role="president")
        make_membership(treas, ch, role="treasurer")
        # NO UserMFA record for pres
        db_session.commit()
        with app.app_context():
            assert can_reset_mfa(actor=pres, target=treas) is False

    def test_org_admin_can_reset_president(self, app, db_session):
        org = make_organization()
        ch = make_chapter(org)
        oa = make_user(email="oa@example.com")
        pres = make_user(email="p4@example.com")
        make_org_membership(oa, org, role="admin")
        make_membership(pres, ch, role="president")
        db_session.add(UserMFA(user_id=oa.id, secret="x", enabled=True))
        db_session.commit()
        with app.app_context():
            assert can_reset_mfa(actor=oa, target=pres) is True

    def test_platform_admin_can_reset_anyone(self, app, db_session):
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        founder = make_user(email="founder@example.com")
        org = make_organization()
        ch = make_chapter(org)
        anyone = make_user(email="x@example.com")
        make_membership(anyone, ch, role="member")
        db_session.add(UserMFA(user_id=founder.id, secret="x", enabled=True))
        db_session.commit()
        with app.app_context():
            assert can_reset_mfa(actor=founder, target=anyone) is True

    def test_secretary_cannot_reset_anyone(self, app, db_session):
        org = make_organization()
        ch = make_chapter(org)
        sec = make_user(email="s@example.com")
        treas = make_user(email="t5@example.com")
        make_membership(sec, ch, role="secretary")
        make_membership(treas, ch, role="treasurer")
        db_session.add(UserMFA(user_id=sec.id, secret="x", enabled=True))
        db_session.commit()
        with app.app_context():
            assert can_reset_mfa(actor=sec, target=treas) is False
