"""Tests for region management routes — /api/regions/*."""

from app.extensions import db
from app.models import RegionMembership
from tests.conftest import (
    make_user,
    make_organization,
    make_region,
    make_chapter,
    make_membership,
    make_org_membership,
    make_region_membership,
)

VALID_PASSWORD = "Str0ng!Password1"


def _login(client, email, password=VALID_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _setup_org_admin(org):
    """Create a user who is an org admin and has a chapter membership."""
    user = make_user(email="orgadmin@example.com", password=VALID_PASSWORD)
    make_org_membership(user, org, role="admin")
    chapter = make_chapter(org)
    make_membership(user, chapter, role="president")
    user.active_chapter_id = chapter.id
    db.session.flush()
    return user, chapter


def _setup_regional_director(org, region):
    """Create a user who is a regional director."""
    user = make_user(email="director@example.com", password=VALID_PASSWORD)
    make_region_membership(user, region, role="regional_director")
    chapter = make_chapter(org, name="Director Chapter")
    make_membership(user, chapter, role="member")
    user.active_chapter_id = chapter.id
    db.session.flush()
    return user


def _setup_regular_member(org):
    """Create a regular member with no org admin or region role."""
    user = make_user(email="regular@example.com", password=VALID_PASSWORD)
    chapter = make_chapter(org, name="Regular Chapter")
    make_membership(user, chapter, role="member")
    user.active_chapter_id = chapter.id
    db.session.flush()
    return user


class TestListRegions:
    def test_org_admin_sees_all_regions(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            make_region(org, name="Southern Region")
            make_region(org, name="Eastern Region")
            db.session.commit()

        _login(client, "orgadmin@example.com")
        resp = client.get("/api/regions")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["is_org_admin"] is True
        assert len(data["regions"]) == 3  # Default + Southern + Eastern

    def test_regional_director_sees_only_their_regions(self, client, app):
        with app.app_context():
            org = make_organization()
            region1 = make_region(org, name="Southern Region")
            make_region(org, name="Eastern Region")
            director = _setup_regional_director(org, region1)
            db.session.commit()

        _login(client, "director@example.com")
        resp = client.get("/api/regions")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["is_org_admin"] is False
        assert len(data["regions"]) == 1
        assert data["regions"][0]["name"] == "Southern Region"

    def test_regular_member_sees_no_regions(self, client, app):
        with app.app_context():
            org = make_organization()
            make_region(org, name="Southern Region")
            _setup_regular_member(org)
            db.session.commit()

        _login(client, "regular@example.com")
        resp = client.get("/api/regions")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["is_org_admin"] is False
        assert len(data["regions"]) == 0

    def test_includes_chapter_and_member_counts(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            ch = make_chapter(org, name="Test Chapter", region=region)
            user2 = make_user(email="u2@example.com")
            make_membership(user2, ch, role="member")
            make_region_membership(user2, region, role="regional_director")
            db.session.commit()

        _login(client, "orgadmin@example.com")
        resp = client.get("/api/regions")
        data = resp.get_json()
        southern = next(r for r in data["regions"] if r["name"] == "Southern Region")
        assert southern["chapter_count"] == 1
        assert southern["member_count"] == 1

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/regions")
        assert resp.status_code == 401


class TestGetRegionDetail:
    def test_org_admin_can_view(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            ch = make_chapter(org, name="Alpha Chapter", region=region)
            user2 = make_user(email="member@example.com")
            make_membership(user2, ch, role="member")
            db.session.commit()
            region_id = region.id

        _login(client, "orgadmin@example.com")
        resp = client.get(f"/api/regions/{region_id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["region"]["name"] == "Southern Region"
        assert len(data["chapters"]) == 1
        assert data["chapters"][0]["name"] == "Alpha Chapter"
        assert data["chapters"][0]["member_count"] == 1
        assert data["is_org_admin"] is True

    def test_regional_director_can_view(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            director = _setup_regional_director(org, region)
            db.session.commit()
            region_id = region.id

        _login(client, "director@example.com")
        resp = client.get(f"/api/regions/{region_id}")
        assert resp.status_code == 200

    def test_regular_member_denied(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            _setup_regular_member(org)
            db.session.commit()
            region_id = region.id

        _login(client, "regular@example.com")
        resp = client.get(f"/api/regions/{region_id}")
        assert resp.status_code == 403

    def test_nonexistent_region_returns_404(self, client, app):
        with app.app_context():
            org = make_organization()
            _setup_org_admin(org)
            db.session.commit()

        _login(client, "orgadmin@example.com")
        resp = client.get("/api/regions/nonexistent-id")
        assert resp.status_code == 404


class TestUpdateRegion:
    def test_org_admin_can_update(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Default Region 2")
            db.session.commit()
            region_id = region.id

        _login(client, "orgadmin@example.com")
        resp = client.put(f"/api/regions/{region_id}", json={
            "name": "Southern Region",
            "abbreviation": "SR",
            "description": "The southern states",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["region"]["name"] == "Southern Region"
        assert data["region"]["abbreviation"] == "SR"

    def test_regional_director_can_update(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            director = _setup_regional_director(org, region)
            db.session.commit()
            region_id = region.id

        _login(client, "director@example.com")
        resp = client.put(f"/api/regions/{region_id}", json={
            "description": "Updated description",
        })
        assert resp.status_code == 200

    def test_regular_member_cannot_update(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            user = _setup_regular_member(org)
            make_region_membership(user, region, role="member")
            db.session.commit()
            region_id = region.id

        _login(client, "regular@example.com")
        resp = client.put(f"/api/regions/{region_id}", json={"name": "Hacked"})
        assert resp.status_code == 403

    def test_duplicate_name_returns_409(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            make_region(org, name="Southern Region")
            region2 = make_region(org, name="Eastern Region")
            db.session.commit()
            region2_id = region2.id

        _login(client, "orgadmin@example.com")
        resp = client.put(f"/api/regions/{region2_id}", json={"name": "Southern Region"})
        assert resp.status_code == 409


class TestAssignRegionMember:
    def test_org_admin_can_assign(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            target = make_user(email="target@example.com")
            ch = make_chapter(org, name="Target Chapter", region=region)
            make_membership(target, ch, role="member")
            db.session.commit()
            region_id = region.id
            target_id = target.id

        _login(client, "orgadmin@example.com")
        resp = client.post(f"/api/regions/{region_id}/members", json={
            "user_id": target_id,
            "role": "regional_director",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["membership"]["role"] == "regional_director"
        assert data["membership"]["user"]["email"] == "target@example.com"

    def test_non_admin_cannot_assign(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            director = _setup_regional_director(org, region)
            target = make_user(email="target@example.com")
            db.session.commit()
            region_id = region.id
            target_id = target.id

        _login(client, "director@example.com")
        resp = client.post(f"/api/regions/{region_id}/members", json={
            "user_id": target_id,
            "role": "member",
        })
        assert resp.status_code == 403

    def test_duplicate_assignment_returns_409(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            target = make_user(email="target@example.com")
            make_region_membership(target, region, role="member")
            db.session.commit()
            region_id = region.id
            target_id = target.id

        _login(client, "orgadmin@example.com")
        resp = client.post(f"/api/regions/{region_id}/members", json={
            "user_id": target_id,
            "role": "regional_director",
        })
        assert resp.status_code == 409

    def test_invalid_role_returns_400(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            target = make_user(email="target@example.com")
            db.session.commit()
            region_id = region.id
            target_id = target.id

        _login(client, "orgadmin@example.com")
        resp = client.post(f"/api/regions/{region_id}/members", json={
            "user_id": target_id,
            "role": "superadmin",
        })
        assert resp.status_code == 400


class TestUpdateRegionMember:
    def test_org_admin_can_update_role(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            target = make_user(email="target@example.com")
            rm = make_region_membership(target, region, role="member")
            db.session.commit()
            region_id = region.id
            rm_id = rm.id

        _login(client, "orgadmin@example.com")
        resp = client.patch(f"/api/regions/{region_id}/members/{rm_id}", json={
            "role": "regional_director",
        })
        assert resp.status_code == 200
        assert resp.get_json()["membership"]["role"] == "regional_director"

    def test_non_admin_cannot_update(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            director = _setup_regional_director(org, region)
            target = make_user(email="target@example.com")
            rm = make_region_membership(target, region, role="member")
            db.session.commit()
            region_id = region.id
            rm_id = rm.id

        _login(client, "director@example.com")
        resp = client.patch(f"/api/regions/{region_id}/members/{rm_id}", json={
            "role": "regional_director",
        })
        assert resp.status_code == 403


class TestRemoveRegionMember:
    def test_org_admin_can_remove(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            target = make_user(email="target@example.com")
            rm = make_region_membership(target, region, role="member")
            db.session.commit()
            region_id = region.id
            rm_id = rm.id

        _login(client, "orgadmin@example.com")
        resp = client.delete(f"/api/regions/{region_id}/members/{rm_id}")
        assert resp.status_code == 200

        # Verify deactivated
        with app.app_context():
            membership = db.session.get(RegionMembership, rm_id)
            assert membership.active is False

    def test_non_admin_cannot_remove(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            director = _setup_regional_director(org, region)
            target = make_user(email="target@example.com")
            rm = make_region_membership(target, region, role="member")
            db.session.commit()
            region_id = region.id
            rm_id = rm.id

        _login(client, "director@example.com")
        resp = client.delete(f"/api/regions/{region_id}/members/{rm_id}")
        assert resp.status_code == 403


class TestSearchEligibleUsers:
    def test_org_admin_can_search(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, admin_chapter = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            # Create a user in the org who is NOT in the region
            target = make_user(email="searchable@example.com", first_name="Jane", last_name="Doe")
            make_membership(target, admin_chapter, role="member")
            db.session.commit()
            region_id = region.id

        _login(client, "orgadmin@example.com")
        resp = client.get(f"/api/regions/{region_id}/users?q=Jane")
        assert resp.status_code == 200
        users = resp.get_json()["users"]
        assert len(users) == 1
        assert users[0]["email"] == "searchable@example.com"

    def test_excludes_existing_region_members(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, admin_chapter = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            already_member = make_user(email="already@example.com", first_name="Already")
            make_membership(already_member, admin_chapter, role="member")
            make_region_membership(already_member, region, role="member")
            db.session.commit()
            region_id = region.id

        _login(client, "orgadmin@example.com")
        resp = client.get(f"/api/regions/{region_id}/users?q=Already")
        assert resp.status_code == 200
        assert len(resp.get_json()["users"]) == 0

    def test_non_admin_cannot_search(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            director = _setup_regional_director(org, region)
            db.session.commit()
            region_id = region.id

        _login(client, "director@example.com")
        resp = client.get(f"/api/regions/{region_id}/users")
        assert resp.status_code == 403


class TestReassignChapter:
    def test_org_admin_can_reassign_chapter(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, admin_chapter = _setup_org_admin(org)
            region1 = make_region(org, name="Southern Region")
            region2 = make_region(org, name="Eastern Region")
            # Create a chapter in region1
            chapter = make_chapter(org, name="Test Chapter")
            chapter.region_id = region1.id
            db.session.commit()
            region2_id = region2.id
            chapter_id = chapter.id

        _login(client, "orgadmin@example.com")
        resp = client.patch(f"/api/regions/{region2_id}/chapters/{chapter_id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["chapter"]["id"] == chapter_id

    def test_non_admin_cannot_reassign_chapter(self, client, app):
        with app.app_context():
            org = make_organization()
            region = make_region(org, name="Southern Region")
            director = _setup_regional_director(org, region)
            chapter = make_chapter(org, name="Move Me Chapter")
            chapter.region_id = region.id
            db.session.commit()
            region_id = region.id
            chapter_id = chapter.id

        _login(client, "director@example.com")
        resp = client.patch(f"/api/regions/{region_id}/chapters/{chapter_id}")
        assert resp.status_code == 403

    def test_reassign_chapter_not_found(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            db.session.commit()
            region_id = region.id

        _login(client, "orgadmin@example.com")
        resp = client.patch(f"/api/regions/{region_id}/chapters/nonexistent-id")
        assert resp.status_code == 404

    def test_reassign_chapter_already_in_region(self, client, app):
        with app.app_context():
            org = make_organization()
            admin, _ = _setup_org_admin(org)
            region = make_region(org, name="Southern Region")
            chapter = make_chapter(org, name="Already Here")
            chapter.region_id = region.id
            db.session.commit()
            region_id = region.id
            chapter_id = chapter.id

        _login(client, "orgadmin@example.com")
        resp = client.patch(f"/api/regions/{region_id}/chapters/{chapter_id}")
        assert resp.status_code == 400
        assert "already in this region" in resp.get_json()["error"]

    def test_reassign_chapter_wrong_org(self, client, app):
        with app.app_context():
            org1 = make_organization(name="Org One")
            org2 = make_organization(name="Org Two")
            admin, _ = _setup_org_admin(org1)
            region = make_region(org1, name="Southern Region")
            chapter = make_chapter(org2, name="Other Org Chapter")
            db.session.commit()
            region_id = region.id
            chapter_id = chapter.id

        _login(client, "orgadmin@example.com")
        resp = client.patch(f"/api/regions/{region_id}/chapters/{chapter_id}")
        assert resp.status_code == 400
        assert "does not belong" in resp.get_json()["error"]


class TestOrgMembershipAutoCreation:
    def test_creating_org_creates_org_membership(self, client, app):
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        with app.app_context():
            user = make_user(email="founder@example.com", password=VALID_PASSWORD)
            db.session.commit()
            user_id = user.id

        _login(client, "founder@example.com")
        resp = client.post("/api/onboarding/organizations", json={
            "name": "Test Org",
            "abbreviation": "TO",
            "org_type": "fraternity",
        })
        assert resp.status_code == 201

        # Verify org membership was created
        with app.app_context():
            from app.models import OrganizationMembership
            org_id = resp.get_json()["organization"]["id"]
            om = OrganizationMembership.query.filter_by(
                organization_id=org_id, user_id=user_id
            ).first()
            assert om is not None
            assert om.role == "admin"
            assert om.active is True
