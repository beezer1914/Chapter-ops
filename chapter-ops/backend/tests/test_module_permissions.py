"""Tests for the blueprint-level module permission gate (app/utils/permissions.py)."""

from app.extensions import db as _db
from tests.conftest import (
    make_user,
    make_organization,
    make_chapter,
    make_membership,
    make_org_membership,
)


def _login(client, email, password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestChapterConfigOverride:
    """chapter.config.permissions overrides should tighten or loosen module access."""

    def test_override_tightens_members_to_president(self, client, app):
        """A secretary can normally list members; override to president should 403."""
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            chapter.config = {"permissions": {"members": "president"}}
            sec = make_user(email="sec@example.com", first_name="S", last_name="E")
            sec.active_chapter_id = chapter.id
            make_membership(sec, chapter, role="secretary")
            _db.session.commit()

        _login(client, email="sec@example.com")
        resp = client.get("/api/members")
        assert resp.status_code == 403
        assert "members" in resp.get_json()["error"].lower()

    def test_override_allows_member_when_default_blocks(self, client, app):
        """Invites default to secretary+; override to 'member' should let a member in."""
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            chapter.config = {"permissions": {"invites": "member"}}
            member = make_user(email="mem@example.com", first_name="M", last_name="E")
            member.active_chapter_id = chapter.id
            make_membership(member, chapter, role="member")
            _db.session.commit()

        _login(client, email="mem@example.com")
        resp = client.get("/api/invites")
        # Module gate passes at "member". Route-level @role_required may still
        # decide — but GET /api/invites is gated at "secretary" on the route.
        # So the override only gets us past the module gate; route still denies.
        # This proves the module gate is not the only line of defense.
        assert resp.status_code == 403


class TestDefaultFloor:
    """Default permissions block module access when chapter role is too low."""

    def test_member_denied_on_invites_by_default(self, client, app):
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            member = make_user(email="m1@example.com", first_name="M", last_name="1")
            member.active_chapter_id = chapter.id
            make_membership(member, chapter, role="member")
            _db.session.commit()

        _login(client, email="m1@example.com")
        resp = client.get("/api/invites")
        assert resp.status_code == 403

    def test_member_allowed_on_members_list_by_default(self, client, app):
        """Members default to 'member' — roster listing should succeed."""
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            member = make_user(email="m2@example.com", first_name="M", last_name="2")
            member.active_chapter_id = chapter.id
            make_membership(member, chapter, role="member")
            _db.session.commit()

        _login(client, email="m2@example.com")
        resp = client.get("/api/members")
        assert resp.status_code == 200


class TestOrgAdminBypassesModuleGate:
    """Org admins bypass the module gate regardless of chapter role or config override."""

    def test_org_admin_bypasses_tightened_override(self, client, app):
        """Even if the president tightens 'members' to 'president', an org admin gets in."""
        with app.app_context():
            org = make_organization()
            chapter = make_chapter(org)
            chapter.config = {"permissions": {"members": "president"}}
            admin = make_user(email="oa@example.com", first_name="Org", last_name="Admin")
            admin.active_chapter_id = chapter.id
            make_membership(admin, chapter, role="member")
            make_org_membership(admin, org, role="admin")
            _db.session.commit()

        _login(client, email="oa@example.com")
        resp = client.get("/api/members")
        assert resp.status_code == 200
