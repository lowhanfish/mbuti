"""Semua galat berbentuk `{success, statusCode, message}` (kontrak API bagian 1.2)."""

import pytest
from fastapi import FastAPI, HTTPException
from httpx import AsyncClient, Response
from pydantic import BaseModel, Field, field_validator

from app.core.exceptions import ConflictException, NotFoundException

ORIGIN = "http://localhost:3000"


class Payload(BaseModel):
    title: str = Field(min_length=5, max_length=20)
    budget: int = Field(default=500, ge=500)

    @field_validator("title")
    @classmethod
    def no_shouting(cls, value: str) -> str:
        if value.isupper():
            raise ValueError("Judul tidak boleh huruf besar semua.")
        return value


@pytest.fixture(autouse=True)
def test_routes(application: FastAPI) -> None:
    @application.post("/test/validate")
    async def validate(payload: Payload) -> None:
        return None

    @application.get("/test/query")
    async def query(limit: int) -> None:
        return None

    @application.get("/test/not-found")
    async def not_found() -> None:
        raise NotFoundException("Role tidak ditemukan.")

    @application.get("/test/conflict")
    async def conflict() -> None:
        raise ConflictException("Persetujuan sudah diputuskan.")

    @application.get("/test/http/{code}")
    async def http_error(code: int) -> None:
        raise HTTPException(status_code=code)

    @application.get("/test/crash")
    async def crash() -> None:
        raise RuntimeError("rincian internal")


def assert_error(response: Response, status_code: int, message: str) -> None:
    assert response.status_code == status_code
    assert response.json() == {"success": False, "statusCode": status_code, "message": message}


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({}, "Kolom 'title' wajib diisi."),
        ({"title": "abc"}, "Kolom 'title' minimal 5 karakter."),
        ({"title": "a" * 21}, "Kolom 'title' maksimal 20 karakter."),
        ({"title": "judul baik", "budget": 1}, "Kolom 'budget' minimal 500."),
        (
            {"title": "judul baik", "budget": "x"},
            "Kolom 'budget' harus berupa bilangan bulat.",
        ),
        ({"title": "HURUF BESAR"}, "Judul tidak boleh huruf besar semua."),
    ],
)
async def test_validation_error(client: AsyncClient, body: dict, message: str) -> None:
    assert_error(await client.post("/test/validate", json=body), 422, message)


async def test_missing_body(client: AsyncClient) -> None:
    assert_error(await client.post("/test/validate"), 422, "Isi permintaan wajib diisi.")


async def test_invalid_json(client: AsyncClient) -> None:
    response = await client.post(
        "/test/validate", content="{bukan json", headers={"Content-Type": "application/json"}
    )

    assert_error(response, 422, "Isi permintaan bukan JSON yang valid.")


async def test_query_validation(client: AsyncClient) -> None:
    assert_error(
        await client.get("/test/query?limit=abc"),
        422,
        "Kolom 'limit' harus berupa bilangan bulat.",
    )


async def test_application_exceptions(client: AsyncClient) -> None:
    assert_error(await client.get("/test/not-found"), 404, "Role tidak ditemukan.")
    assert_error(await client.get("/test/conflict"), 409, "Persetujuan sudah diputuskan.")


async def test_unknown_route(client: AsyncClient) -> None:
    assert_error(await client.get("/api/v1/tidak-ada"), 404, "Data atau alamat tidak ditemukan.")


async def test_method_not_allowed_keeps_allow_header(client: AsyncClient) -> None:
    response = await client.delete("/api/v1/health")

    assert_error(response, 405, "Metode tidak diizinkan untuk alamat ini.")
    assert response.headers["allow"] == "GET"


async def test_http_exception_without_detail_is_translated(client: AsyncClient) -> None:
    assert_error(
        await client.get("/test/http/403"),
        403,
        "Anda tidak memiliki hak akses untuk tindakan ini.",
    )


async def test_unhandled_error_hides_details_and_keeps_cors(client: AsyncClient) -> None:
    response = await client.get("/test/crash", headers={"Origin": ORIGIN})

    assert_error(response, 500, "Terjadi kesalahan pada server. Coba lagi nanti.")
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


async def test_cors_preflight_allows_frontend_with_credentials(client: AsyncClient) -> None:
    response = await client.options(
        "/api/v1/health",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "x-csrf-token" in response.headers["access-control-allow-headers"]


async def test_cors_rejects_other_origin(client: AsyncClient) -> None:
    response = await client.get("/test/not-found", headers={"Origin": "http://jahat.example"})

    assert "access-control-allow-origin" not in response.headers
