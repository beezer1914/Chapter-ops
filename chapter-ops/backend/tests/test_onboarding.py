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
    def test_create_org_success(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "alice@example.com"
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

    def test_create_org_duplicate_abbreviation(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "alice@example.com"
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

    def test_create_org_invalid_type(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "alice@example.com"
        make_user(email="alice@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "alice@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Bad Org",
            "abbreviation": "BAD",
            "org_type": "club",
        })
        assert resp.status_code == 400

    def test_create_org_missing_fields(self, app, client, db_session):
        app.config["FOUNDER_EMAIL"] = "alice@example.com"
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

    def test_create_org_requires_founder(self, app, client, db_session):
        """Non-founders cannot create organizations."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="nobody@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "nobody@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Some Org",
            "abbreviation": "SOM",
            "org_type": "fraternity",
        })
        assert resp.status_code == 403
        assert "Platform admin" in resp.get_json()["error"]

    def test_create_org_allowed_for_founder(self, app, client, db_session):
        """Platform founder can still create orgs."""
        app.config["FOUNDER_EMAIL"] = "brandon@example.com"
        make_user(email="brandon@example.com", password=VALID_PASSWORD)
        db_session.commit()
        login(client, "brandon@example.com")

        resp = client.post("/api/onboarding/organizations", json={
            "name": "Delta Sigma Theta Sorority, Inc.",
            "abbreviation": "DST",
            "org_type": "sorority",
        })
        assert resp.status_code == 201


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


