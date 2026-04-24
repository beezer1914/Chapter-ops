"""Tests for the ChapterRequest ORM model."""

import pytest

from app.extensions import db
from app.models.chapter_request import ChapterRequest
from tests.conftest import make_user, make_organization, make_region


def _base_request_kwargs(user, org, region):
    return {
        "requester_user_id": user.id,
        "organization_id": org.id,
        "region_id": region.id,
        "name": "Alpha Chapter",
        "name_normalized": "alphachapter",
        "chapter_type": "undergraduate",
        "founder_role": "president",
        "status": "pending",
        "approver_scope": "org_admin",
    }


class TestChapterRequestModel:
    def test_creates_with_required_fields(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        req = ChapterRequest(**_base_request_kwargs(user, org, region))
        db_session.add(req)
        db_session.commit()

        assert req.id is not None
        assert req.status == "pending"
        assert req.created_at is not None
        assert req.rejected_reason is None
        assert req.resulting_chapter_id is None

    def test_to_dict_shape(self, db_session):
        user = make_user()
        org = make_organization()
        region = make_region(org)
        db_session.commit()

        req = ChapterRequest(**_base_request_kwargs(user, org, region))
        db_session.add(req)
        db_session.commit()

        d = req.to_dict()
        assert d["id"] == req.id
        assert d["name"] == "Alpha Chapter"
        assert d["status"] == "pending"
        assert d["approver_scope"] == "org_admin"
        assert d["requester_email"] == user.email
        assert d["organization_name"] == org.name
        assert d["region_name"] == region.name
        assert d["chapter_type"] == "undergraduate"
        assert d["founder_role"] == "president"
        assert d["rejected_reason"] is None
        assert "created_at" in d
