"""Tests for onboarding routes — /api/onboarding/*."""

from app.extensions import db
from app.models import Organization, Region, Chapter, ChapterMembership
from tests.conftest import make_user, make_organization, make_region, make_chapter, make_membership

VALID_PASSWORD = "Str0ng!Password1"


def login(client, email, password=VALID_PASSWORD):
    """Helper to log in and return the response."""
    return client.post("/api/auth/login", json={"email": email, "password": password})


class TestListOrganizations:
    def test_list_orgs_authenticated(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        make_organization(name="Alpha Phi Alpha", abbreviation="APA")
        make_organization(name="Delta Sigma Theta", abbreviation="DST", org_type="sorority")
        db_session.commit()

        login(client, "alice@example.com")
        resp = client.get("/api/onboarding/organizations")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["organizations"]) == 2
        # Should be ordered by name
        assert data["organizations"][0]["name"] == "Alpha Phi Alpha"
        assert data["organizations"][1]["name"] == "Delta Sigma Theta"

    def test_list_orgs_unauthenticated(self, client):
        resp = client.get("/api/onboarding/organizations")
        assert resp.status_code == 401

    def test_list_orgs_excludes_inactive(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization(name="Inactive Org", abbreviation="INO")
        org.active = False
        db_session.commit()

        login(client, "alice@example.com")
        resp = client.get("/api/onboarding/organizations")
        assert len(resp.get_json()["organizations"]) == 0


class TestCreateOrganization:
    def test_create_org_success(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Phi Beta Sigma Fraternity, Inc.",
            "abbreviation": "pbs",
            "org_type": "fraternity",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["organization"]["abbreviation"] == "PBS"  # uppercased

    def test_create_org_duplicate_abbreviation(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        make_organization(abbreviation="PBS")
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Some Other Org",
            "abbreviation": "PBS",
            "org_type": "fraternity",
        })
        assert resp.status_code == 409
        assert "already exists" in resp.get_json()["error"]

    def test_create_org_invalid_type(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Bad Org",
            "abbreviation": "BAD",
            "org_type": "club",
        })
        assert resp.status_code == 400

    def test_create_org_missing_fields(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Incomplete",
        })
        assert resp.status_code == 400
        assert "Missing required fields" in resp.get_json()["error"]

    def test_create_org_unauthenticated(self, client):
        resp = client.post("/api/onboarding/organizations", json={
            "name": "Test",
            "abbreviation": "TST",
            "org_type": "fraternity",
        })
        assert resp.status_code == 401


class TestListRegions:
    def test_list_regions_success(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        make_region(org, name="Eastern Region")
        make_region(org, name="Southern Region")
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.get(f"/api/onboarding/regions?organization_id={org.id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["regions"]) == 2
        assert data["regions"][0]["name"] == "Eastern Region"

    def test_list_regions_missing_org_id(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.get("/api/onboarding/regions")
        assert resp.status_code == 400

    def test_list_regions_invalid_org(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.get("/api/onboarding/regions?organization_id=nonexistent")
        assert resp.status_code == 404

    def test_list_regions_excludes_inactive(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org, name="Inactive Region")
        region.active = False
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.get(f"/api/onboarding/regions?organization_id={org.id}")
        assert len(resp.get_json()["regions"]) == 0


class TestCreateRegion:
    def test_create_region_success(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/regions", json={
            "organization_id": org.id,
            "name": "Southern Region",
            "abbreviation": "SR",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["region"]["name"] == "Southern Region"
        assert data["region"]["abbreviation"] == "SR"

    def test_create_region_duplicate_name(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        make_region(org, name="Southern Region")
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/regions", json={
            "organization_id": org.id,
            "name": "Southern Region",
        })
        assert resp.status_code == 409

    def test_create_region_missing_fields(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/regions", json={
            "organization_id": "some-id",
        })
        assert resp.status_code == 400

    def test_create_region_invalid_org(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/regions", json={
            "organization_id": "nonexistent",
            "name": "Ghost Region",
        })
        assert resp.status_code == 404


class TestCreateChapter:
    def test_create_chapter_success(self, client, db_session):
        user = make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/chapters", json={
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Alpha Gamma Chapter",
            "chapter_type": "undergraduate",
            "city": "Atlanta",
            "state": "Georgia",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["chapter"]["name"] == "Alpha Gamma Chapter"
        assert data["chapter"]["region_id"] == region.id
        assert data["membership"]["role"] == "president"
        assert data["membership"]["financial_status"] == "financial"

        # User's active_chapter_id should be set
        db_session.expire_all()
        from app.models import User
        updated_user = db_session.get(User, user.id)
        assert updated_user.active_chapter_id == data["chapter"]["id"]

    def test_create_chapter_invalid_org(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/chapters", json={
            "organization_id": "nonexistent-uuid",
            "region_id": "nonexistent-uuid",
            "name": "Ghost Chapter",
            "chapter_type": "undergraduate",
        })
        assert resp.status_code == 404

    def test_create_chapter_invalid_region(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/chapters", json={
            "organization_id": org.id,
            "region_id": "nonexistent-uuid",
            "name": "Ghost Chapter",
            "chapter_type": "undergraduate",
        })
        assert resp.status_code == 404

    def test_create_chapter_region_org_mismatch(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org1 = make_organization(name="Org One", abbreviation="O1")
        org2 = make_organization(name="Org Two", abbreviation="O2")
        region = make_region(org2, name="Other Region")
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/chapters", json={
            "organization_id": org1.id,
            "region_id": region.id,
            "name": "Mismatch Chapter",
            "chapter_type": "undergraduate",
        })
        assert resp.status_code == 400
        assert "does not belong" in resp.get_json()["error"]

    def test_create_chapter_invalid_type(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/chapters", json={
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Bad Type Chapter",
            "chapter_type": "invalid",
        })
        assert resp.status_code == 400

    def test_create_chapter_missing_fields(self, client, db_session):
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/chapters", json={
            "name": "No Org Chapter",
        })
        assert resp.status_code == 400

    def test_create_chapter_defaults(self, client, db_session):
        """Verify default values for country and timezone."""
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        org = make_organization()
        region = make_region(org)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/chapters", json={
            "organization_id": org.id,
            "region_id": region.id,
            "name": "Defaults Chapter",
            "chapter_type": "graduate",
        })
        assert resp.status_code == 201
        chapter = resp.get_json()["chapter"]
        assert chapter["country"] == "United States"
        assert chapter["timezone"] == "America/New_York"


class TestFullOnboardingFlow:
    """End-to-end: register → create org → create region → create chapter."""

    def test_founder_flow(self, client, db_session):
        # 1. Register without invite
        resp = client.post("/api/auth/register", json={
            "email": "founder@example.com",
            "password": VALID_PASSWORD,
            "first_name": "Jane",
            "last_name": "Founder",
        })
        assert resp.status_code == 201
        user_data = resp.get_json()["user"]
        assert user_data["active_chapter_id"] is None

        # 2. List orgs (should be empty)
        resp = client.get("/api/onboarding/organizations")
        assert resp.status_code == 200
        assert len(resp.get_json()["organizations"]) == 0

        # 3. Create org
        resp = client.post("/api/onboarding/organizations", json={
            "name": "Phi Beta Sigma Fraternity, Inc.",
            "abbreviation": "PBS",
            "org_type": "fraternity",
        })
        assert resp.status_code == 201
        org_id = resp.get_json()["organization"]["id"]

        # 4. Create region
        resp = client.post("/api/onboarding/regions", json={
            "organization_id": org_id,
            "name": "Southern Region",
        })
        assert resp.status_code == 201
        region_id = resp.get_json()["region"]["id"]

        # 5. Create chapter
        resp = client.post("/api/onboarding/chapters", json={
            "organization_id": org_id,
            "region_id": region_id,
            "name": "Sigma Delta Sigma Chapter",
            "chapter_type": "graduate",
            "city": "Washington",
            "state": "District of Columbia",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["membership"]["role"] == "president"

        # 6. Verify user now has active chapter
        resp = client.get("/api/auth/user")
        assert resp.status_code == 200
        user = resp.get_json()["user"]
        assert user["active_chapter_id"] is not None
        assert len(resp.get_json()["memberships"]) == 1
