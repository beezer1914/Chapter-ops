"""
Flask application factory.

Creates and configures the Flask app with all extensions, middleware,
blueprints, and error handlers.
"""

import logging
import os

import click
from flask import Flask, jsonify

from app.config import LocalConfig, ProductionConfig, TestingConfig
from app.extensions import db, bcrypt, login_manager, cache, limiter, cors, csrf, migrate
from app.middleware import init_tenant_middleware

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app(config_class=None):
    """
    Application factory.

    Args:
        config_class: Configuration class to use. Defaults to LocalConfig
                      unless CONFIG_CLASS env var is set.
    """
    app = Flask(__name__)

    # Resolve configuration
    if config_class is None:
        config_name = os.environ.get("CONFIG_CLASS", "app.config.LocalConfig")
        config_map = {
            "app.config.LocalConfig": LocalConfig,
            "app.config.ProductionConfig": ProductionConfig,
            "app.config.TestingConfig": TestingConfig,
        }
        config_class = config_map.get(config_name, LocalConfig)

    app.config.from_object(config_class)
    logger.info(f"Using configuration: {config_class.__name__}")

    # Initialize Stripe SDK with platform secret key
    import stripe as _stripe
    _stripe.api_key = app.config["STRIPE_SECRET_KEY"]

    # Validate production config
    if config_class == ProductionConfig:
        ProductionConfig.validate()
        logger.info("Production configuration validated.")

    # ── Initialize extensions ──────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)
    migrate.init_app(app, db)
    cache.init_app(app)
    limiter.init_app(app)
    csrf.init_app(app)

    login_manager.init_app(app)
    login_manager.login_view = None  # API-only, no redirect

    # CORS — allow React dev server in development
    cors.init_app(app, resources={
        r"/api/*": {
            "origins": [app.config["FRONTEND_URL"]],
            "supports_credentials": True,
        }
    })

    # ── User loader ────────────────────────────────────────────────────
    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, user_id)

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Authentication required."}), 401

    # ── Tenant middleware ──────────────────────────────────────────────
    init_tenant_middleware(app)

    # ── Register blueprints ────────────────────────────────────────────
    from app.routes.auth import auth_bp
    from app.routes.onboarding import onboarding_bp
    from app.routes.invites import invites_bp
    from app.routes.members import members_bp
    from app.routes.payments import payments_bp
    from app.routes.payment_plans import payment_plans_bp
    from app.routes.donations import donations_bp
    from app.routes.config import config_bp
    from app.routes.regions import regions_bp
    from app.routes.workflows import workflows_bp
    from app.routes.stripe_connect import stripe_connect_bp
    from app.routes.webhooks import webhooks_bp
    from app.routes.files import files_bp
    from app.routes.notifications import notifications_bp
    from app.routes.transfers import transfers_bp
    from app.routes.events import events_bp
    from app.routes.comms import comms_bp
    from app.routes.documents import documents_bp
    from app.routes.kb import kb_bp
    from app.routes.invoices import invoices_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(invites_bp)
    app.register_blueprint(members_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(payment_plans_bp)
    app.register_blueprint(donations_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(regions_bp)
    app.register_blueprint(workflows_bp)
    app.register_blueprint(stripe_connect_bp)
    app.register_blueprint(webhooks_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(transfers_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(comms_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(kb_bp)
    app.register_blueprint(invoices_bp)

    # Exempt API routes from CSRF (using session cookies + SameSite instead)
    csrf.exempt(auth_bp)
    csrf.exempt(onboarding_bp)
    csrf.exempt(invites_bp)
    csrf.exempt(members_bp)
    csrf.exempt(payments_bp)
    csrf.exempt(payment_plans_bp)
    csrf.exempt(donations_bp)
    csrf.exempt(config_bp)
    csrf.exempt(regions_bp)
    csrf.exempt(workflows_bp)
    csrf.exempt(notifications_bp)
    csrf.exempt(transfers_bp)
    csrf.exempt(events_bp)
    csrf.exempt(comms_bp)
    csrf.exempt(documents_bp)
    csrf.exempt(kb_bp)
    csrf.exempt(invoices_bp)
    csrf.exempt(stripe_connect_bp)
    csrf.exempt(webhooks_bp)
    csrf.exempt(files_bp)

    # ── CLI commands ───────────────────────────────────────────────────
    @app.cli.command("make-org-admin")
    @click.argument("email")
    @click.argument("org_abbreviation")
    def make_org_admin(email, org_abbreviation):
        """Grant org-admin role to a user.

        \b
        Usage:
            flask make-org-admin user@example.com PBS
        """
        from app.models import User, Organization, OrganizationMembership

        user = User.query.filter_by(email=email.lower().strip()).first()
        if not user:
            click.echo(f"Error: no user found with email '{email}'", err=True)
            return

        org = Organization.query.filter_by(abbreviation=org_abbreviation.upper()).first()
        if not org:
            click.echo(f"Error: no organization found with abbreviation '{org_abbreviation}'", err=True)
            return

        existing = OrganizationMembership.query.filter_by(
            user_id=user.id, organization_id=org.id
        ).first()

        if existing:
            if existing.role == "admin" and existing.active:
                click.echo(f"{user.full_name} is already an org admin of {org.name}.")
                return
            existing.role = "admin"
            existing.active = True
        else:
            db.session.add(OrganizationMembership(
                user_id=user.id,
                organization_id=org.id,
                role="admin",
            ))

        db.session.commit()
        click.echo(f"✓ {user.full_name} ({email}) is now an org admin of {org.name}.")

    @app.cli.command("remove-org-admin")
    @click.argument("email")
    @click.argument("org_abbreviation")
    def remove_org_admin(email, org_abbreviation):
        """Revoke org-admin role from a user.

        \b
        Usage:
            flask remove-org-admin user@example.com PBS
        """
        from app.models import User, Organization, OrganizationMembership

        user = User.query.filter_by(email=email.lower().strip()).first()
        if not user:
            click.echo(f"Error: no user found with email '{email}'", err=True)
            return

        org = Organization.query.filter_by(abbreviation=org_abbreviation.upper()).first()
        if not org:
            click.echo(f"Error: no organization found with abbreviation '{org_abbreviation}'", err=True)
            return

        membership = OrganizationMembership.query.filter_by(
            user_id=user.id, organization_id=org.id, role="admin"
        ).first()

        if not membership or not membership.active:
            click.echo(f"{user.full_name} is not an org admin of {org.name}.")
            return

        membership.active = False
        db.session.commit()
        click.echo(f"✓ Removed org-admin from {user.full_name} ({email}) for {org.name}.")

    @app.cli.command("list-org-admins")
    @click.argument("org_abbreviation")
    def list_org_admins(org_abbreviation):
        """List all org admins for an organization.

        \b
        Usage:
            flask list-org-admins PBS
        """
        from app.models import Organization, OrganizationMembership, User

        org = Organization.query.filter_by(abbreviation=org_abbreviation.upper()).first()
        if not org:
            click.echo(f"Error: no organization found with abbreviation '{org_abbreviation}'", err=True)
            return

        admins = (
            db.session.query(OrganizationMembership, User)
            .join(User, User.id == OrganizationMembership.user_id)
            .filter(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.role == "admin",
                OrganizationMembership.active == True,
            )
            .all()
        )

        if not admins:
            click.echo(f"No org admins found for {org.name}.")
            return

        click.echo(f"Org admins for {org.name} ({org.abbreviation}):")
        for _, user in admins:
            click.echo(f"  • {user.full_name} — {user.email}")

    # ── Health check ───────────────────────────────────────────────────
    @app.route("/health")
    def health():
        return jsonify({"status": "healthy", "service": "chapterops-api"}), 200

    # ── Error handlers ─────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(429)
    def rate_limit_exceeded(error):
        return jsonify({
            "error": "Too many requests. Please try again later.",
            "retry_after": 900,
        }), 429

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({"error": "Internal server error."}), 500

    # ── Log routes in development ──────────────────────────────────────
    if app.debug:
        for rule in app.url_map.iter_rules():
            logger.debug(f"{rule.endpoint}: {rule.rule} [{', '.join(rule.methods)}]")

    return app
