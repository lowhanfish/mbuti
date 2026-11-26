"""Lingkungan Alembic untuk SQLAlchemy async dan PostgreSQL."""

import asyncio
from logging.config import fileConfig

from alembic import context
from pgvector.sqlalchemy import Vector
from sqlalchemy import pool
from sqlalchemy.engine import Connection

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.db.engine import build_async_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def render_item(type_: str, obj: object, autogen_context) -> str | bool:
    """Tulis impor pgvector pada migrasi otomatis yang memakai kolom vector."""
    if type_ == "type" and isinstance(obj, Vector):
        autogen_context.imports.add("from pgvector.sqlalchemy import Vector")
        return f"Vector({obj.dim})"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=settings.get_database_url().render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_item=render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    # Agar autogenerate mengenali kolom vector yang sudah ada di database.
    connection.dialect.ischema_names["vector"] = Vector
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_item=render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = build_async_engine(poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
