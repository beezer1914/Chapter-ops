"""
Config routes — /api/config/*

Provides organization and chapter configuration:
- Role display titles (org-level)
- Custom member field definitions (org-level)
- Fee types (chapter-level)
- Operational settings (chapter-level)
- Branding configuration (org-level and chapter-level)
"""

import re
from flask import Blueprint, g, jsonify, request
from flask_login import login_required
from sqlalchemy.orm.attributes import flag_modified

from app.extensions import db
from app.utils.decorators import chapter_required, role_required, _is_org_admin

config_bp = Blueprint("config", __name__, url_prefix="/api/config")

# Valid field types for custom member fields
VALID_FIELD_TYPES = {"text", "number", "date"}

# Internal role keys that can have custom titles
VALID_ROLE_KEYS = {"member", "secretary", "treasurer", "vice_president", "president"}

# Hex color validation pattern (#RRGGBB)
HEX_COLOR_REGEX = re.compile(r'^#[0-9a-fA-F]{6}$')

# rgba() color validation pattern — used for semi-transparent accent swatches
RGBA_COLOR_REGEX = re.compile(r'^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\)$')

# Allowed Google Fonts — must stay in sync with frontend HEADING_FONTS + BODY_FONTS
GOOGLE_FONTS_WHITELIST = [
    # Heading fonts (display serifs)
    "Cormorant Garamond", "Playfair Display", "DM Serif Display",
    "Libre Baskerville", "Cinzel", "EB Garamond",
    # Body fonts (geometric sans)
    "Outfit", "DM Sans", "Plus Jakarta Sans", "Nunito", "Raleway", "Jost",
]

# Allowed system fonts
SYSTEM_FONTS = ["system-ui", "Georgia", "Times New Roman", "Arial", "Helvetica", "Verdana"]


def validate_color_palette(colors):
    """
    Validate color palette structure and hex values.

    Returns:
        (is_valid: bool, error_message: str | None)
    """
    if not isinstance(colors, dict):
        return False, "colors must be an object."

    required_palettes = ["primary", "secondary", "accent"]
    for palette_name in required_palettes:
        if palette_name not in colors:
            return False, f"Missing color palette: {palette_name}"

        palette = colors[palette_name]
        if not isinstance(palette, dict):
            return False, f"{palette_name} palette must be an object."

        required_shades = ["light", "main", "dark"]
        for shade in required_shades:
            if shade not in palette:
                return False, f"Missing {shade} shade in {palette_name} palette."

            color_value = palette[shade]
            if not isinstance(color_value, str) or (
                not HEX_COLOR_REGEX.match(color_value) and not RGBA_COLOR_REGEX.match(color_value)
            ):
                return False, f"Invalid color '{color_value}' in {palette_name}.{shade}. Must be #RRGGBB or rgba(R,G,B,alpha)."

    return True, None


def validate_typography(typo):
    """
    Validate typography configuration.

    Returns:
        (is_valid: bool, error_message: str | None)
    """
    if not isinstance(typo, dict):
        return False, "typography must be an object."

    required_fields = ["heading_font", "body_font", "font_source"]
    for field in required_fields:
        if field not in typo:
            return False, f"Missing typography field: {field}"

    font_source = typo["font_source"]
    if font_source not in ["google", "system"]:
        return False, "font_source must be 'google' or 'system'."

    # Validate font names based on source
    if font_source == "google":
        for font_key in ["heading_font", "body_font"]:
            font_name = typo[font_key]
            if not isinstance(font_name, str) or font_name not in GOOGLE_FONTS_WHITELIST:
                return False, f"Font '{font_name}' not allowed. Allowed Google Fonts: {', '.join(GOOGLE_FONTS_WHITELIST)}"
    elif font_source == "system":
        for font_key in ["heading_font", "body_font"]:
            font_name = typo[font_key]
            if not isinstance(font_name, str) or font_name not in SYSTEM_FONTS:
                return False, f"Font '{font_name}' not allowed. Allowed system fonts: {', '.join(SYSTEM_FONTS)}"

    return True, None


@config_bp.route("", methods=["GET"])
@login_required
@chapter_required
@role_required("member")
def get_config():
    """
    Returns merged org + chapter config for the current chapter.
    Called once on app load and cached in the frontend store.
    """
    chapter = g.current_chapter
    org = chapter.organization

    return jsonify({
        "organization_config": org.config or {},
        "chapter_config": chapter.config or {},
        "organization_id": org.id,
        "chapter_id": chapter.id,
        "organization": org.to_dict(),
        "chapter": chapter.to_dict(),
    }), 200


@config_bp.route("/organization", methods=["PUT"])
@login_required
@chapter_required
@role_required("president")
def update_org_config():
    """Update organization-level configuration (president+ or org admin)."""
    from flask_login import current_user
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required."}), 400

    chapter = g.current_chapter
    org = chapter.organization

    # Org admins can always update; presidents are restricted to their own org
    if not _is_org_admin(current_user, org.id):
        membership = current_user.get_membership(chapter.id)
        if not membership or not membership.has_role("president"):
            return jsonify({"error": "Insufficient permissions."}), 403
    current_config = dict(org.config or {})

    # ── Role titles ──────────────────────────────────────────────────
    if "role_titles" in data:
        role_titles = data["role_titles"]
        if not isinstance(role_titles, dict):
            return jsonify({"error": "role_titles must be an object."}), 400
        for key in role_titles:
            if key not in VALID_ROLE_KEYS:
                return jsonify({"error": f"Invalid role key: {key}"}), 400
            if not isinstance(role_titles[key], str) or not role_titles[key].strip():
                return jsonify({"error": f"Role title for '{key}' must be a non-empty string."}), 400
        current_config["role_titles"] = {k: v.strip() for k, v in role_titles.items()}

    # ── Custom member fields ─────────────────────────────────────────
    if "custom_member_fields" in data:
        fields = data["custom_member_fields"]
        if not isinstance(fields, list):
            return jsonify({"error": "custom_member_fields must be an array."}), 400

        seen_keys = set()
        validated_fields = []
        for field in fields:
            if not isinstance(field, dict):
                return jsonify({"error": "Each custom field must be an object."}), 400
            key = field.get("key", "").strip()
            label = field.get("label", "").strip()
            field_type = field.get("type", "text")
            required = bool(field.get("required", False))

            if not key or not label:
                return jsonify({"error": "Each custom field must have 'key' and 'label'."}), 400
            if field_type not in VALID_FIELD_TYPES:
                return jsonify({"error": f"Invalid field type: {field_type}. Must be one of: {', '.join(VALID_FIELD_TYPES)}"}), 400
            if key in seen_keys:
                return jsonify({"error": f"Duplicate field key: {key}"}), 400
            seen_keys.add(key)

            validated_fields.append({
                "key": key,
                "label": label,
                "type": field_type,
                "required": required,
            })
        current_config["custom_member_fields"] = validated_fields

    # ── Branding ─────────────────────────────────────────────────────
    if "branding" in data:
        branding = data["branding"]
        if not isinstance(branding, dict):
            return jsonify({"error": "branding must be an object."}), 400

        # Validate colors if provided
        if "colors" in branding:
            is_valid, error = validate_color_palette(branding["colors"])
            if not is_valid:
                return jsonify({"error": error}), 400

        # Validate typography if provided
        if "typography" in branding:
            is_valid, error = validate_typography(branding["typography"])
            if not is_valid:
                return jsonify({"error": error}), 400

        # Validate favicon_url if provided (must be a string or null)
        if "favicon_url" in branding:
            if branding["favicon_url"] is not None and not isinstance(branding["favicon_url"], str):
                return jsonify({"error": "favicon_url must be a string or null."}), 400

        current_config["branding"] = branding

    org.config = current_config
    flag_modified(org, "config")
    db.session.commit()

    return jsonify({
        "organization_config": org.config,
    }), 200


@config_bp.route("/chapter", methods=["PUT"])
@login_required
@chapter_required
@role_required("president")
def update_chapter_config():
    """Update chapter-level configuration (president+ or org admin)."""
    from flask_login import current_user
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required."}), 400

    chapter = g.current_chapter

    if not _is_org_admin(current_user, chapter.organization_id):
        membership = current_user.get_membership(chapter.id)
        if not membership or not membership.has_role("president"):
            return jsonify({"error": "Insufficient permissions."}), 403

    current_config = dict(chapter.config or {})

    # ── Fee types ────────────────────────────────────────────────────
    if "fee_types" in data:
        fee_types = data["fee_types"]
        if not isinstance(fee_types, list):
            return jsonify({"error": "fee_types must be an array."}), 400

        seen_ids = set()
        validated_types = []
        for ft in fee_types:
            if not isinstance(ft, dict):
                return jsonify({"error": "Each fee type must be an object."}), 400
            ft_id = ft.get("id", "").strip()
            label = ft.get("label", "").strip()
            default_amount = ft.get("default_amount", 0)

            if not ft_id or not label:
                return jsonify({"error": "Each fee type must have 'id' and 'label'."}), 400
            if ft_id in seen_ids:
                return jsonify({"error": f"Duplicate fee type id: {ft_id}"}), 400
            if not isinstance(default_amount, (int, float)) or default_amount < 0:
                return jsonify({"error": f"Invalid default_amount for '{ft_id}'."}), 400
            seen_ids.add(ft_id)

            validated_types.append({
                "id": ft_id,
                "label": label,
                "default_amount": round(float(default_amount), 2),
            })
        current_config["fee_types"] = validated_types

    # ── Settings ─────────────────────────────────────────────────────
    if "settings" in data:
        settings = data["settings"]
        if not isinstance(settings, dict):
            return jsonify({"error": "settings must be an object."}), 400

        current_settings = current_config.get("settings", {})

        if "default_dues_amount" in settings:
            val = settings["default_dues_amount"]
            if not isinstance(val, (int, float)) or val < 0:
                return jsonify({"error": "default_dues_amount must be a non-negative number."}), 400
            current_settings["default_dues_amount"] = round(float(val), 2)

        if "fiscal_year_start_month" in settings:
            val = settings["fiscal_year_start_month"]
            if not isinstance(val, int) or val < 1 or val > 12:
                return jsonify({"error": "fiscal_year_start_month must be 1-12."}), 400
            current_settings["fiscal_year_start_month"] = val

        if "payment_deadline_day" in settings:
            val = settings["payment_deadline_day"]
            if not isinstance(val, int) or val < 1 or val > 28:
                return jsonify({"error": "payment_deadline_day must be 1-28."}), 400
            current_settings["payment_deadline_day"] = val

        if "allow_payment_plans" in settings:
            current_settings["allow_payment_plans"] = bool(settings["allow_payment_plans"])

        current_config["settings"] = current_settings

    # ── Branding ─────────────────────────────────────────────────────
    if "branding" in data:
        branding = data["branding"]
        if not isinstance(branding, dict):
            return jsonify({"error": "branding must be an object."}), 400

        # Validate enabled flag if provided
        if "enabled" in branding:
            if not isinstance(branding["enabled"], bool):
                return jsonify({"error": "branding.enabled must be a boolean."}), 400

        # Validate colors if provided
        if "colors" in branding:
            is_valid, error = validate_color_palette(branding["colors"])
            if not is_valid:
                return jsonify({"error": error}), 400

        # Validate typography if provided
        if "typography" in branding:
            is_valid, error = validate_typography(branding["typography"])
            if not is_valid:
                return jsonify({"error": error}), 400

        # Validate favicon_url if provided (must be a string or null)
        if "favicon_url" in branding:
            if branding["favicon_url"] is not None and not isinstance(branding["favicon_url"], str):
                return jsonify({"error": "favicon_url must be a string or null."}), 400

        current_config["branding"] = branding

    chapter.config = current_config
    flag_modified(chapter, "config")
    db.session.commit()

    return jsonify({
        "chapter_config": chapter.config,
    }), 200
