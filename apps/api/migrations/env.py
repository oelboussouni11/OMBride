"""Alembic environment configuration."""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Ensure the app package is importable.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base  # noqa: E402
import models  # noqa: E402, F401 — force model registration for autogenerate

# Alembic Config object.
config = context.config

# Override sqlalchemy.url from the DATABASE_URL environment variable, falling
# back to a sensible default for local development.  The async driver
# (asyncpg) is swapped for the sync driver (psycopg2) because Alembic runs
# migrations synchronously.
database_url = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/rideapp",
)
# Alembic needs a sync driver; swap asyncpg -> psycopg2 if present.
database_url = database_url.replace("+asyncpg", "+psycopg2")
config.set_main_option("sqlalchemy.url", database_url)

# Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# MetaData for autogenerate support.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
