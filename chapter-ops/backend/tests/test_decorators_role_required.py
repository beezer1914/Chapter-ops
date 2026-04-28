"""Tests for the role_required decorator's admin bypass logic.

Org admins and platform admins (founders) should be able to invoke
@role_required-protected routes regardless of their chapter role,
because their authority is scoped above the chapter level.
"""

import pytest
from flask import Blueprint, jsonify
from flask_login import login_required

from app.extensions import db
from app.utils.decorators import chapter_required, role_required
from tests.conftest import (
    make_chapter,
    make_membership,
    make_org_membership,
    make_organization,
    make_user,
)


@pytest.fixture(scope="session")
def register_role_probe_blueprint(app):
    """Register a probe blueprint exercising role_required("president")."""
    if "probe_role_required" in app.blueprints:
        yield
        return

    probe = Blueprint("probe_role_required", __name__)

    @probe.route("/probe/role-required-president", methods=["GET"])
    @login_required
    @chapter_required
    @role_required("president")
    def probe_view():
        return jsonify({"ok": True}), 200

    was_started = app._got_first_request
    app._got_first_request = False
    try:
        app.register_blueprint(probe)
        from app.extensions import csrf
        csrf.exempt(probe)
    finally:
        app._got_first_request = was_started
    yield


def _login(client, email):
    return client.post("/api/auth/login", json={
        "email": email, "password": "Str0ng!Password1",
    })


@pytest.fixture
def isolated_admin_config(app, monkeypatch):
    """Set FOUNDER_EMAIL/PLATFORM_ADMIN_EMAIL via monkeypatch so changes don't
    leak into the next test (the `app` fixture is session-scoped)."""
    def _set(founder=None, platform_admin=None):
        monkeypatch.setitem(app.config, "FOUNDER_EMAIL", founder or "")
        monkeypatch.setitem(app.config, "PLATFORM_ADMIN_EMAIL", platform_admin or "")
    return _set


class TestRoleRequiredAdminBypass:
    def test_org_admin_with_low_chapter_role_bypasses_president_requirement(
        self, app, client, db_session, register_role_probe_blueprint, isolated_admin_config
    ):
        """An org admin holding only a 'member' (or treasurer) role in a chapter
        should still pass role_required("president") via the org admin bypass."""
        # Ensure platform admin doesn't accidentally apply
        isolated_admin_config(
            founder="someone-else@example.com",
            platform_admin="someone-else@example.com",
        )

        org = make_organization()
        chapter = make_chapter(org)
        user = make_user(email="orgadmin@example.com", active_chapter_id=chapter.id)
        # Low chapter role — wouldn't pass without bypass
        make_membership(user, chapter, role="member")
        # Org-level admin role — this is what triggers the bypass
        make_org_membership(user, org, role="admin")
        db.session.commit()

        _login(client, "orgadmin@example.com")
        resp = client.get("/probe/role-required-president")

        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True

    def test_platform_admin_with_low_chapter_role_bypasses_president_requirement(
        self, app, client, db_session, register_role_probe_blueprint, isolated_admin_config
    ):
        """The platform admin (founder) should pass role_required regardless of
        their chapter role."""
        isolated_admin_config(
            founder="founder@example.com",
            platform_admin="founder@example.com",
        )

        org = make_organization()
        chapter = make_chapter(org)
        user = make_user(email="founder@example.com", active_chapter_id=chapter.id)
        # Low chapter role — wouldn't pass without bypass
        make_membership(user, chapter, role="treasurer")
        # NOT org admin — only the platform admin identity
        db.session.commit()

        _login(client, "founder@example.com")
        resp = client.get("/probe/role-required-president")

        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True

    def test_plain_treasurer_is_still_rejected(
        self, app, client, db_session, register_role_probe_blueprint, isolated_admin_config
    ):
        """A treasurer with no org admin or platform admin status should still
        be rejected when role_required("president") is enforced."""
        isolated_admin_config(
            founder="founder@example.com",
            platform_admin="founder@example.com",
        )

        org = make_organization()
        chapter = make_chapter(org)
        user = make_user(email="treasurer@example.com", active_chapter_id=chapter.id)
        make_membership(user, chapter, role="treasurer")
        db.session.commit()

        _login(client, "treasurer@example.com")
        resp = client.get("/probe/role-required-president")

        assert resp.status_code == 403
        assert "Insufficient permissions" in resp.get_json()["error"]
