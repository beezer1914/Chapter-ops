"""
File upload routes — /api/files/*

Handles image uploads for:
- User profile pictures
- Organization logos
- Chapter logos
- Organization favicons
- Chapter favicons
"""

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import User, Organization, Chapter
from app.utils.s3 import upload_file, delete_file, extract_filename_from_url, validate_favicon_file

files_bp = Blueprint("files", __name__, url_prefix="/api/files")


# ── User Profile Pictures ─────────────────────────────────────────────────────

@files_bp.route("/profile-picture", methods=["POST"])
@login_required
def upload_profile_picture():
    """Upload a new profile picture for the current user."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files['file']

    # Upload to S3
    success, url_or_error, filename = upload_file(
        file=file,
        resource_type='users',
        resource_id=current_user.id
    )

    if not success:
        return jsonify({"error": url_or_error}), 400

    # Delete old profile picture if exists
    if current_user.profile_picture_url:
        old_filename = extract_filename_from_url(current_user.profile_picture_url)
        if old_filename:
            delete_file(old_filename)

    # Update user record
    current_user.profile_picture_url = url_or_error
    db.session.commit()

    return jsonify({
        "success": True,
        "url": url_or_error,
        "user": current_user.to_dict()
    }), 200


@files_bp.route("/profile-picture", methods=["DELETE"])
@login_required
def delete_profile_picture():
    """Remove the current user's profile picture."""
    if not current_user.profile_picture_url:
        return jsonify({"error": "No profile picture to delete."}), 400

    # Delete from S3
    filename = extract_filename_from_url(current_user.profile_picture_url)
    if filename:
        delete_file(filename)

    # Update user record
    current_user.profile_picture_url = None
    db.session.commit()

    return jsonify({
        "success": True,
        "user": current_user.to_dict()
    }), 200


# ── Chapter Logos ──────────────────────────────────────────────────────────────

@files_bp.route("/chapter/<chapter_id>/logo", methods=["POST"])
@login_required
def upload_chapter_logo(chapter_id):
    """Upload a chapter logo (requires president role)."""
    chapter = db.session.get(Chapter, chapter_id)

    if not chapter or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    # Check membership and role
    membership = current_user.get_membership(chapter_id)
    if not membership or not membership.active:
        return jsonify({"error": "You are not a member of this chapter."}), 403

    if not membership.has_role("president"):
        return jsonify({"error": "Requires president role."}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files['file']

    # Upload to S3
    success, url_or_error, filename = upload_file(
        file=file,
        resource_type='chapters',
        resource_id=chapter_id
    )

    if not success:
        return jsonify({"error": url_or_error}), 400

    # Delete old logo if exists
    if chapter.logo_url:
        old_filename = extract_filename_from_url(chapter.logo_url)
        if old_filename:
            delete_file(old_filename)

    # Update chapter record
    chapter.logo_url = url_or_error
    db.session.commit()

    return jsonify({
        "success": True,
        "url": url_or_error,
        "chapter": chapter.to_dict()
    }), 200


@files_bp.route("/chapter/<chapter_id>/logo", methods=["DELETE"])
@login_required
def delete_chapter_logo(chapter_id):
    """Delete a chapter logo (requires president role)."""
    chapter = db.session.get(Chapter, chapter_id)

    if not chapter or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    # Check membership and role
    membership = current_user.get_membership(chapter_id)
    if not membership or not membership.active:
        return jsonify({"error": "You are not a member of this chapter."}), 403

    if not membership.has_role("president"):
        return jsonify({"error": "Requires president role."}), 403

    if not chapter.logo_url:
        return jsonify({"error": "No logo to delete."}), 400

    # Delete from S3
    filename = extract_filename_from_url(chapter.logo_url)
    if filename:
        delete_file(filename)

    # Update chapter record
    chapter.logo_url = None
    db.session.commit()

    return jsonify({
        "success": True,
        "chapter": chapter.to_dict()
    }), 200


# ── Organization Logos ─────────────────────────────────────────────────────────

@files_bp.route("/organization/<organization_id>/logo", methods=["POST"])
@login_required
def upload_organization_logo(organization_id):
    """Upload an organization logo (requires org admin role)."""
    org = db.session.get(Organization, organization_id)

    if not org or not org.active:
        return jsonify({"error": "Organization not found."}), 404

    # Check org admin membership
    org_membership = current_user.get_org_membership(organization_id)
    if not org_membership or not org_membership.active or org_membership.role != "admin":
        return jsonify({"error": "Requires organization admin role."}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files['file']

    # Upload to S3
    success, url_or_error, filename = upload_file(
        file=file,
        resource_type='organizations',
        resource_id=organization_id
    )

    if not success:
        return jsonify({"error": url_or_error}), 400

    # Delete old logo if exists
    if org.logo_url:
        old_filename = extract_filename_from_url(org.logo_url)
        if old_filename:
            delete_file(old_filename)

    # Update organization record
    org.logo_url = url_or_error
    db.session.commit()

    return jsonify({
        "success": True,
        "url": url_or_error,
        "organization": org.to_dict()
    }), 200


@files_bp.route("/organization/<organization_id>/logo", methods=["DELETE"])
@login_required
def delete_organization_logo(organization_id):
    """Delete an organization logo (requires org admin role)."""
    org = db.session.get(Organization, organization_id)

    if not org or not org.active:
        return jsonify({"error": "Organization not found."}), 404

    # Check org admin membership
    org_membership = current_user.get_org_membership(organization_id)
    if not org_membership or not org_membership.active or org_membership.role != "admin":
        return jsonify({"error": "Requires organization admin role."}), 403

    if not org.logo_url:
        return jsonify({"error": "No logo to delete."}), 400

    # Delete from S3
    filename = extract_filename_from_url(org.logo_url)
    if filename:
        delete_file(filename)

    # Update organization record
    org.logo_url = None
    db.session.commit()

    return jsonify({
        "success": True,
        "organization": org.to_dict()
    }), 200


# ── Organization Favicons ──────────────────────────────────────────────────────

@files_bp.route("/organization/<organization_id>/favicon", methods=["POST"])
@login_required
def upload_organization_favicon(organization_id):
    """Upload an organization favicon (requires org admin role)."""
    org = db.session.get(Organization, organization_id)

    if not org or not org.active:
        return jsonify({"error": "Organization not found."}), 404

    # Check org admin membership
    org_membership = current_user.get_org_membership(organization_id)
    if not org_membership or not org_membership.active or org_membership.role != "admin":
        return jsonify({"error": "Requires organization admin role."}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files['file']

    # Validate favicon file (stricter than regular images)
    is_valid, error = validate_favicon_file(file)
    if not is_valid:
        return jsonify({"error": error}), 400

    # Upload to S3
    success, url_or_error, filename = upload_file(
        file=file,
        resource_type='organizations',
        resource_id=organization_id
    )

    if not success:
        return jsonify({"error": url_or_error}), 400

    # Delete old favicon if exists (read from org.config.branding.favicon_url)
    current_config = org.config or {}
    branding = current_config.get("branding", {})
    old_favicon_url = branding.get("favicon_url")

    if old_favicon_url:
        old_filename = extract_filename_from_url(old_favicon_url)
        if old_filename:
            delete_file(old_filename)

    # Update organization config with new favicon URL
    if "branding" not in current_config:
        current_config["branding"] = {}
    current_config["branding"]["favicon_url"] = url_or_error

    org.config = current_config
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(org, "config")
    db.session.commit()

    return jsonify({
        "success": True,
        "url": url_or_error,
        "organization": org.to_dict()
    }), 200


@files_bp.route("/organization/<organization_id>/favicon", methods=["DELETE"])
@login_required
def delete_organization_favicon(organization_id):
    """Delete an organization favicon (requires org admin role)."""
    org = db.session.get(Organization, organization_id)

    if not org or not org.active:
        return jsonify({"error": "Organization not found."}), 404

    # Check org admin membership
    org_membership = current_user.get_org_membership(organization_id)
    if not org_membership or not org_membership.active or org_membership.role != "admin":
        return jsonify({"error": "Requires organization admin role."}), 403

    current_config = org.config or {}
    branding = current_config.get("branding", {})
    favicon_url = branding.get("favicon_url")

    if not favicon_url:
        return jsonify({"error": "No favicon to delete."}), 400

    # Delete from S3
    filename = extract_filename_from_url(favicon_url)
    if filename:
        delete_file(filename)

    # Update organization config
    current_config.setdefault("branding", {})["favicon_url"] = None
    org.config = current_config
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(org, "config")
    db.session.commit()

    return jsonify({
        "success": True,
        "organization": org.to_dict()
    }), 200


# ── Chapter Favicons ───────────────────────────────────────────────────────────

@files_bp.route("/chapter/<chapter_id>/favicon", methods=["POST"])
@login_required
def upload_chapter_favicon(chapter_id):
    """Upload a chapter favicon (requires president role)."""
    chapter = db.session.get(Chapter, chapter_id)

    if not chapter or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    # Check membership and role
    membership = current_user.get_membership(chapter_id)
    if not membership or not membership.active:
        return jsonify({"error": "You are not a member of this chapter."}), 403

    if not membership.has_role("president"):
        return jsonify({"error": "Requires president role."}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files['file']

    # Validate favicon file
    is_valid, error = validate_favicon_file(file)
    if not is_valid:
        return jsonify({"error": error}), 400

    # Upload to S3
    success, url_or_error, filename = upload_file(
        file=file,
        resource_type='chapters',
        resource_id=chapter_id
    )

    if not success:
        return jsonify({"error": url_or_error}), 400

    # Delete old favicon if exists
    current_config = chapter.config or {}
    branding = current_config.get("branding", {})
    old_favicon_url = branding.get("favicon_url")

    if old_favicon_url:
        old_filename = extract_filename_from_url(old_favicon_url)
        if old_filename:
            delete_file(old_filename)

    # Update chapter config with new favicon URL
    if "branding" not in current_config:
        current_config["branding"] = {}
    current_config["branding"]["favicon_url"] = url_or_error

    chapter.config = current_config
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(chapter, "config")
    db.session.commit()

    return jsonify({
        "success": True,
        "url": url_or_error,
        "chapter": chapter.to_dict()
    }), 200


@files_bp.route("/chapter/<chapter_id>/favicon", methods=["DELETE"])
@login_required
def delete_chapter_favicon(chapter_id):
    """Delete a chapter favicon (requires president role)."""
    chapter = db.session.get(Chapter, chapter_id)

    if not chapter or not chapter.active:
        return jsonify({"error": "Chapter not found."}), 404

    # Check membership and role
    membership = current_user.get_membership(chapter_id)
    if not membership or not membership.active:
        return jsonify({"error": "You are not a member of this chapter."}), 403

    if not membership.has_role("president"):
        return jsonify({"error": "Requires president role."}), 403

    current_config = chapter.config or {}
    branding = current_config.get("branding", {})
    favicon_url = branding.get("favicon_url")

    if not favicon_url:
        return jsonify({"error": "No favicon to delete."}), 400

    # Delete from S3
    filename = extract_filename_from_url(favicon_url)
    if filename:
        delete_file(filename)

    # Update chapter config
    current_config.setdefault("branding", {})["favicon_url"] = None
    chapter.config = current_config
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(chapter, "config")
    db.session.commit()

    return jsonify({
        "success": True,
        "chapter": chapter.to_dict()
    }), 200
