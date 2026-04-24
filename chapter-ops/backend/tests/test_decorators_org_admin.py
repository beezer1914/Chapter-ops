"""Tests for the org_admin_required decorator."""

import pytest
from flask import Blueprint, jsonify
from flask_login import login_required

from app.extensions import db
from app.utils.decorators import org_admin_required
from tests.conftest import make_user, make_organization, make_org_membership


@pytest.fixture(scope="session")
def register_probe_blueprint(app):
    """Register a probe blueprint that exercises the decorator."""
    if "probe_org_admin" in app.blueprints:
        yield
        return

    probe = Blueprint("probe_org_admin", __name__)

    @probe.route("/probe/org-admin/<org_id>", methods=["GET"])
    @login_required
    @org_admin_required
    def probe_view(org_id):
        return jsonify({"ok": True, "org_id": org_id}), 200

    # Flask locks setup methods after the first request; since other tests
    # in the suite may have already hit the app, briefly unlock it so we
    # can attach this test-only blueprint.
    was_started = app._got_first_request
    app._got_first_request = False
    try:
        app.register_blueprint(probe)
        from app.extensions import csrf
        csrf.exempt(probe)
    finally:
        app._got_first_request = was_started
    yield


class TestOrgAdminRequired:
    def test_allows_org_admin(self, app, client, db_session, register_probe_blueprint):
        org = make_organization()
        user = make_user()
        make_org_membership(user, org, role="admin")
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get(f"/probe/org-admin/{org.id}")
        assert resp.status_code == 200
        assert resp.get_json()["org_id"] == org.id

    def test_blocks_non_admin_member(self, app, client, db_session, register_probe_blueprint):
        org = make_organization()
        user = make_user()
        make_org_membership(user, org, role="member")
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get(f"/probe/org-admin/{org.id}")
        assert resp.status_code == 403

    def test_blocks_user_with_no_org_membership(self, app, client, db_session, register_probe_blueprint):
        org = make_organization()
        user = make_user()
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get(f"/probe/org-admin/{org.id}")
        assert resp.status_code == 403

    def test_404_when_org_not_found(self, app, client, db_session, register_probe_blueprint):
        user = make_user()
        db.session.commit()

        client.post("/api/auth/login", json={
            "email": user.email, "password": "Str0ng!Password1",
        })
        resp = client.get("/probe/org-admin/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404
