import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Add the backend directory to the path so we can import the app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from app.extensions import db

# Import all models so Alembic can detect them
from app.models import *  # noqa: F401, F403

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

app = create_app()
config.set_main_option("sqlalchemy.url", app.config["SQLALCHEMY_DATABASE_URI"])

target_metadata = db.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
