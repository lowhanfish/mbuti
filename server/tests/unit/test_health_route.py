"""Respons health check tanpa layanan sungguhan."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from app.api.deps import get_db
from app.api.v1.endpoints.health import service


class FakeSession:
    def __init__(self, result: bool | Exception):
        self.result = result

    async def scalar(self, _: object) -> bool:
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def use_services(
    application: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
    database: bool | Exception,
    redis: bool,
) -> None:
    async def fake_redis() -> bool:
        return redis

    application.dependency_overrides[get_db] = lambda: FakeSession(database)
    monkeypatch.setattr(service, "check_redis", fake_redis)


async def test_healthy(
    application: FastAPI, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_services(application, monkeypatch, database=True, redis=True)

    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "statusCode": 200,
        "message": "Layanan berjalan normal.",
        "data": {
            "status": "ok",
            "version": "0.1.0",
            "database": "up",
            "pgvector": "up",
            "redis": "up",
        },
    }


@pytest.mark.parametrize(
    ("database", "redis", "expected"),
    [
        (ConnectionError("rahasia"), True, ("down", "down", "up")),
        (False, True, ("up", "down", "up")),
        (True, False, ("up", "up", "down")),
    ],
)
async def test_degraded(
    application: FastAPI,
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    database: bool | Exception,
    redis: bool,
    expected: tuple[str, str, str],
) -> None:
    use_services(application, monkeypatch, database=database, redis=redis)

    response = await client.get("/api/v1/health")
    body = response.json()

    assert response.status_code == 503
    assert body["success"] is False
    assert body["statusCode"] == 503
    assert body["message"] == "Sebagian layanan belum siap."
    data = body["data"]
    assert (data["database"], data["pgvector"], data["redis"]) == expected
    assert "rahasia" not in response.text


async def test_unreachable_redis_is_reported_down(monkeypatch: pytest.MonkeyPatch) -> None:
    # Port 1 tidak dipakai layanan apa pun.
    monkeypatch.setattr(service.settings, "REDIS_URL", "redis://127.0.0.1:1/0")

    assert await service.check_redis() is False
