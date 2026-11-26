"""Migrasi bisa dipasang, dibatalkan, dan cocok dengan model."""

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


def test_downgrade_and_upgrade(alembic_config: Config) -> None:
    command.downgrade(alembic_config, "base")
    command.upgrade(alembic_config, "head")


def test_models_match_migrations(alembic_config: Config) -> None:
    command.check(alembic_config)


async def test_vector_extension_is_active(test_engine: AsyncEngine) -> None:
    async with test_engine.connect() as connection:
        version = await connection.scalar(
            text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        )

    assert version
