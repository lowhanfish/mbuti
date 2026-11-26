"""
Fixture untuk PostgreSQL sungguhan (database `mbuti_test`) dan Redis.

Database dibuat sekali secara manual (lihat README); skemanya disiapkan lewat Alembic.
"""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.api.deps import get_db
from app.core.config import SERVER_DIR, settings
from app.db.engine import build_async_engine


@pytest.fixture(scope="session")
def alembic_config() -> Config:
    return Config(str(SERVER_DIR / "alembic.ini"))


@pytest.fixture(scope="session", autouse=True)
def migrated_database(alembic_config: Config) -> None:
    database = settings.get_database_url().database or ""
    assert database.endswith("_test"), "Tes hanya boleh memakai database uji."
    command.upgrade(alembic_config, "head")


@pytest_asyncio.fixture
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    # NullPool: tiap tes punya event loop sendiri, jadi koneksi tidak boleh dipakai ulang.
    engine = build_async_engine(poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(
    application: FastAPI, test_engine: AsyncEngine
) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(bind=test_engine, expire_on_commit=False)
    async with factory() as session:
        application.dependency_overrides[get_db] = lambda: session
        yield session
