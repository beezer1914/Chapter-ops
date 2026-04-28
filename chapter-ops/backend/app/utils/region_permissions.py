"""Region-dashboard permission helper.

Single source of truth for whether a user may see a region's dashboard.
Used by the dashboard endpoint, the regions list endpoint (to populate
`regions_with_dashboard_access`), and the frontend route guard.
"""

from app.extensions import db
from app.models import RegionMembership
from app.utils.decorators import _is_org_admin
from app.utils.platform_admin import is_founder_email


REGIONAL_OFFICER_ROLES = frozenset({
    "regional_director",
    "regional_1st_vice",
    "regional_2nd_vice",
    "regional_secretary",
    "regional_treasurer",
})


def can_view_region_dashboard(user, region) -> bool:
    """Return True if the user may view the region dashboard."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False

    if is_founder_email(user.email):
        return True

    if _is_org_admin(user, region.organization_id):
        return True

    membership = db.session.query(RegionMembership).filter_by(
        user_id=user.id, region_id=region.id, active=True,
    ).first()

    return membership is not None and membership.role in REGIONAL_OFFICER_ROLES
