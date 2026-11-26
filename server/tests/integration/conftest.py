"""
Fixture untuk PostgreSQL sungguhan (database `mbuti_test`) dan Redis.

Database dibuat sekali secara manual (lihat README); skemanya disiapkan lewat Alembic.
"""

from collections.abc import AsyncGenerator, Awaitable, Callable
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.api.deps import get_db
from app.core.config import SERVER_DIR, settings
from app.core.rate_limit import key_prefix
from app.db.engine import build_async_engine
from app.workers.ingestion import process_version
from tests.integration.world import PASSWORD, World, build_world, new_client


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


@pytest_asyncio.fixture
async def database(
    application: FastAPI, test_engine: AsyncEngine
) -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    """
    Sesi yang semuanya berada dalam satu transaksi luar dan dibatalkan setelah tes.
    `commit` di aplikasi hanya menutup savepoint, jadi database uji tetap kosong.
    """
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        factory = async_sessionmaker(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )

        async def override() -> AsyncGenerator[AsyncSession, None]:
            async with factory() as session:
                yield session

        application.dependency_overrides[get_db] = override
        try:
            yield factory
        finally:
            await transaction.rollback()


@pytest_asyncio.fixture(autouse=True)
async def clean_rate_limits() -> AsyncGenerator[None, None]:
    """Hapus hanya kunci pembatas milik lingkungan uji."""

    async def clear() -> None:
        async with Redis.from_url(settings.REDIS_URL) as client:
            keys = [key async for key in client.scan_iter(f"{key_prefix()}*")]
            if keys:
                await client.delete(*keys)

    assert key_prefix().startswith("mbuti:testing:")
    await clear()
    yield
    await clear()


@pytest.fixture(autouse=True)
def queued_versions(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Pekerjaan olah tidak dikirim ke Redis; ID versinya dicatat agar tes bisa menjalankannya."""
    queued: list[str] = []
    monkeypatch.setattr(process_version, "apply_async", lambda args, **_: queued.append(args[0]))
    return queued


@pytest.fixture(autouse=True)
def upload_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    folder = tmp_path / "uploads"
    monkeypatch.setattr(settings, "UPLOAD_DIR", folder)
    return folder


@pytest_asyncio.fixture
async def world(database: async_sessionmaker[AsyncSession]) -> World:
    return await build_world(database)


@pytest_asyncio.fixture
async def sign_in(
    application: FastAPI, world: World
) -> AsyncGenerator[Callable[..., Awaitable[AsyncClient]], None]:
    """`await sign_in("a_owner")` mengembalikan klien yang sudah masuk beserta header CSRF."""
    clients: list[AsyncClient] = []

    async def factory(name: str) -> AsyncClient:
        client = new_client(application)
        clients.append(client)
        response = await client.post(
            "/api/v1/auth/login", json={"email": world.email(name), "password": PASSWORD}
        )
        assert response.status_code == 200, response.text
        client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]
        return client

    yield factory
    for client in clients:
        await client.aclose()
