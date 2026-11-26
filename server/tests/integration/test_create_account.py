"""Skrip pembuat akun pertama."""

import pytest

from scripts.create_account import AccountError, create_owner
from tests.integration.world import new_client

PASSWORD = "sandi-skrip-uji-123"


async def test_creates_organisation_and_owner_who_can_sign_in(application, database):
    async with database() as session:
        organization, created = await create_owner(
            session, "Dinas Uji Skrip", "Pemilik@Uji.test", "Pemilik Uji", PASSWORD
        )
    assert created and organization.slug == "dinas-uji-skrip"

    async with database() as session:
        again, created_again = await create_owner(
            session, "Dinas Uji Skrip", "kedua@uji.test", "Pemilik Kedua", PASSWORD
        )
    assert again.id == organization.id and not created_again

    async with new_client(application) as client:
        response = await client.post(
            "/api/v1/auth/login", json={"email": "pemilik@uji.test", "password": PASSWORD}
        )
    assert response.json()["data"]["user"]["access_role"] == "owner"


@pytest.mark.parametrize(
    ("email", "password", "message"),
    [
        ("salah", PASSWORD, "Format email"),
        ("baru@uji.test", "pendek", "Kata sandi minimal"),
    ],
)
async def test_rejects_invalid_input(database, email, password, message):
    async with database() as session:
        with pytest.raises(AccountError, match=message):
            await create_owner(session, "Dinas Uji", email, "Nama Uji", password)


async def test_rejects_existing_email(database):
    async with database() as session:
        await create_owner(session, "Dinas Uji", "ada@uji.test", "Nama Uji", PASSWORD)
    async with database() as session:
        with pytest.raises(AccountError, match="sudah terdaftar"):
            await create_owner(session, "Dinas Uji", "ada@uji.test", "Nama Uji", PASSWORD)
