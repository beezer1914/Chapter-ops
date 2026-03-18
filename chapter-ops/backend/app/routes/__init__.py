from app.routes.auth import auth_bp
from app.routes.onboarding import onboarding_bp
from app.routes.invites import invites_bp
from app.routes.members import members_bp
from app.routes.payments import payments_bp
from app.routes.payment_plans import payment_plans_bp
from app.routes.donations import donations_bp
from app.routes.config import config_bp
from app.routes.notifications import notifications_bp
from app.routes.transfers import transfers_bp
from app.routes.events import events_bp
from app.routes.comms import comms_bp
from app.routes.documents import documents_bp
from app.routes.kb import kb_bp

__all__ = [
    "auth_bp", "onboarding_bp", "invites_bp", "members_bp",
    "payments_bp", "payment_plans_bp", "donations_bp", "config_bp",
    "notifications_bp", "transfers_bp", "events_bp", "comms_bp", "documents_bp", "kb_bp",
]
