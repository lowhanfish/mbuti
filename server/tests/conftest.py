"""Fixture bersama. Pengujian tidak pernah memakai database pengembangan."""

import os

# Harus diatur sebelum aplikasi diimpor; variabel lingkungan mengalahkan isi .env.
# APP_ENV=testing membuat aplikasi memakai database TEST_DB_NAME.
os.environ["APP_ENV"] = "testing"
os.environ["APP_DEBUG"] = "true"
os.environ["ALLOWED_ORIGINS"] = '["http://localhost:3000"]'

from collections.abc import AsyncGenerator  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from main import create_application  # noqa: E402


@pytest.fixture
def application() -> FastAPI:
    """Aplikasi baru per tes agar rute tambahan dan penggantian dependency tidak bocor."""
    return create_application()


@pytest_asyncio.fixture
async def client(application: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
