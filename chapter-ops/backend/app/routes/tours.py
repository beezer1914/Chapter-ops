"""User onboarding tour state endpoints."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db, limiter
from app.models import UserTourState

tours_bp = Blueprint("tours", __name__, url_prefix="/api/tours")

TOUR_ID_RE = re.compile(r"^[a-z_]{1,50}$")
VALID_ROLES = {"member", "secretary", "treasurer", "vice_president", "president", "admin"}


def _get_or_create_state(user_id) -> UserTourState:
    state = UserTourState.query.filter_by(user_id=user_id).first()
    if state is None:
        state = UserTourState(user_id=user_id, seen={})
        db.session.add(state)
    return state


@tours_bp.route("/state", methods=["GET"])
@login_required
def get_state():
    state = UserTourState.query.filter_by(user_id=current_user.id).first()
    return jsonify({"seen": state.seen if state else {}}), 200
