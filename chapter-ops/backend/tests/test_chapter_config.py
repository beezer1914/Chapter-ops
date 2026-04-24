"""Tests for config routes — /api/config/*"""

from app.extensions import db as _db
from tests.conftest import make_user, make_organization, make_region, make_chapter, make_membership


def _login(client, email="admin@example.com", password="Str0ng!Password1"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _setup_chapter():
    org = make_organization()
    org.config = {
        "role_titles": {
            "president": "President",
            "vice_president": "Vice President",
            "treasurer": "Treasurer",
            "secretary": "Secretary",
            "member": "Member",
        },
        "custom_member_fields": [],
    }
    chapter = make_chapter(org)
    chapter.config = {
        "fee_types": [{"id": "dues", "label": "Dues", "default_amount": 0.00}],
        "settings": {"allow_payment_plans": True},
    }
    return chapter


def _setup_admin(chapter):
    user = make_user(email="admin@example.com", first_name="Admin", last_name="User")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="admin")
    _db.session.commit()
    return user


def _setup_president(chapter):
    user = make_user(email="president@example.com", first_name="Pres", last_name="Ident")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="president")
    _db.session.commit()
    return user


def _setup_member(chapter):
    user = make_user(email="member@example.com", first_name="Basic", last_name="Member")
    user.active_chapter_id = chapter.id
    make_membership(user, chapter, role="member")
    _db.session.commit()
    return user


class TestGetConfig:
    def test_member_can_get_config(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_member(chapter)
            _db.session.commit()

        _login(client, email="member@example.com")
        resp = client.get("/api/config")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "organization_config" in data
        assert "chapter_config" in data
        assert data["organization_config"]["role_titles"]["president"] == "President"
        assert len(data["chapter_config"]["fee_types"]) == 1

    def test_unauthenticated_cannot_get_config(self, client, app):
        resp = client.get("/api/config")
        assert resp.status_code == 401


class TestUpdateOrgConfig:
    def test_admin_can_update_role_titles(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/organization", json={
            "role_titles": {
                "president": "Basileus",
                "vice_president": "Anti-Basileus",
                "treasurer": "Tamiouchos",
                "secretary": "Grammateus",
                "member": "Member",
            },
        })
        assert resp.status_code == 200
        data = resp.get_json()["organization_config"]
        assert data["role_titles"]["president"] == "Basileus"
        assert data["role_titles"]["treasurer"] == "Tamiouchos"

    def test_admin_can_add_custom_fields(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/organization", json={
            "custom_member_fields": [
                {"key": "line_number", "label": "Line Number", "type": "number", "required": False},
                {"key": "crossing_date", "label": "Crossing Date", "type": "date", "required": False},
            ],
        })
        assert resp.status_code == 200
        fields = resp.get_json()["organization_config"]["custom_member_fields"]
        assert len(fields) == 2
        assert fields[0]["key"] == "line_number"

    def test_president_can_update_org_config(self, client, app):
        """Presidents are allowed to update org config (president+ or org admin)."""
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _db.session.commit()

        _login(client, email="president@example.com")
        resp = client.put("/api/config/organization", json={
            "role_titles": {"president": "Basileus"},
        })
        assert resp.status_code == 200
        data = resp.get_json()["organization_config"]
        assert data["role_titles"]["president"] == "Basileus"

    def test_invalid_role_key_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/organization", json={
            "role_titles": {"dean_of_pledges": "Dean"},
        })
        assert resp.status_code == 400

    def test_empty_role_title_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/organization", json={
            "role_titles": {"president": ""},
        })
        assert resp.status_code == 400

    def test_invalid_field_type_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/organization", json={
            "custom_member_fields": [
                {"key": "test", "label": "Test", "type": "boolean"},
            ],
        })
        assert resp.status_code == 400

    def test_duplicate_field_key_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/organization", json={
            "custom_member_fields": [
                {"key": "line", "label": "Line Number", "type": "number"},
                {"key": "line", "label": "Line Name", "type": "text"},
            ],
        })
        assert resp.status_code == 400


class TestUpdateChapterConfig:
    def test_admin_can_update_fee_types(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/chapter", json={
            "fee_types": [
                {"id": "semester_dues", "label": "Semester Dues", "default_amount": 150.00},
                {"id": "initiation_fee", "label": "Initiation Fee", "default_amount": 500.00},
            ],
        })
        assert resp.status_code == 200
        types = resp.get_json()["chapter_config"]["fee_types"]
        assert len(types) == 2
        assert types[0]["default_amount"] == 150.00

    def test_admin_can_update_settings(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/chapter", json={
            "settings": {
                "fiscal_year_start_month": 9,
                "payment_deadline_day": 15,
                "allow_payment_plans": False,
            },
        })
        assert resp.status_code == 200
        settings = resp.get_json()["chapter_config"]["settings"]
        assert settings["fiscal_year_start_month"] == 9
        assert settings["payment_deadline_day"] == 15
        assert settings["allow_payment_plans"] is False

    def test_president_can_update_chapter_config(self, client, app):
        """Presidents (treasurer+) can update non-permissions/branding chapter config fields."""
        with app.app_context():
            chapter = _setup_chapter()
            _setup_president(chapter)
            _db.session.commit()

        _login(client, email="president@example.com")
        resp = client.put("/api/config/chapter", json={
            "fee_types": [{"id": "test", "label": "Test", "default_amount": 10}],
        })
        assert resp.status_code == 200
        fee_types = resp.get_json()["chapter_config"]["fee_types"]
        assert len(fee_types) == 1
        assert fee_types[0]["id"] == "test"

    def test_negative_amount_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/chapter", json={
            "fee_types": [{"id": "test", "label": "Test", "default_amount": -10}],
        })
        assert resp.status_code == 400

    def test_invalid_fiscal_month_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/chapter", json={
            "settings": {"fiscal_year_start_month": 13},
        })
        assert resp.status_code == 400

    def test_duplicate_fee_type_id_rejected(self, client, app):
        with app.app_context():
            chapter = _setup_chapter()
            _setup_admin(chapter)
            _db.session.commit()

        _login(client)
        resp = client.put("/api/config/chapter", json={
            "fee_types": [
                {"id": "dues", "label": "Dues", "default_amount": 100},
                {"id": "dues", "label": "Other Dues", "default_amount": 50},
            ],
        })
        assert resp.status_code == 400


class TestOnboardingSeeds:
    def test_org_creation_seeds_config(self, client, app):
        app.config["FOUNDER_EMAIL"] = "founder@example.com"
        with app.app_context():
            user = make_user(email="founder@example.com")
            _db.session.commit()

        _login(client, email="founder@example.com")
        resp = client.post("/api/onboarding/organizations", json={
            "name": "Test Org",
            "abbreviation": "TO",
            "org_type": "fraternity",
        })
        assert resp.status_code == 201
        config = resp.get_json()["organization"]["config"]
        assert "role_titles" in config
        assert config["role_titles"]["president"] == "President"
        assert config["custom_member_fields"] == []

    def test_chapter_creation_seeds_config(self, db_session):
        from app.services.chapter_service import create_chapter_with_founder

        user = make_user(email="founder@example.com")
        org = make_organization(abbreviation="TC")
        region = make_region(org)
        _db.session.commit()

        chapter, _, _ = create_chapter_with_founder(
            requester=user,
            organization=org,
            region=region,
            name="Test Chapter",
            designation=None,
            chapter_type="graduate",
            city=None,
            state=None,
            country="United States",
            timezone="America/New_York",
            founder_role="president",
        )
        _db.session.commit()

        assert "fee_types" in chapter.config
        assert chapter.config["fee_types"][0]["id"] == "dues"
        assert chapter.config["settings"]["allow_payment_plans"] is True
