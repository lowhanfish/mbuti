"""Pengguna organisasi A tidak bisa membaca atau mengubah data organisasi B."""

import pytest
from sqlalchemy import select

from app.models import Membership, Organization, Unit

ADMIN = "/api/v1/admin"


async def snapshot(world):
    """Isi organisasi B, untuk memastikan tidak ada yang berubah."""
    org = world.organizations["b"].id
    async with world.sessions() as session:
        name = await session.scalar(select(Organization.name).where(Organization.id == org))
        units = (
            await session.execute(
                select(Unit.id, Unit.name, Unit.parent_id, Unit.lead_member_id).where(
                    Unit.organization_id == org
                )
            )
        ).all()
        members = (
            await session.execute(
                select(
                    Membership.id,
                    Membership.access_role,
                    Membership.status,
                    Membership.unit_id,
                )
                .where(Membership.organization_id == org)
                .order_by(Membership.id)
            )
        ).all()
    return name, units, members


async def test_reads_only_show_own_organisation(world, sign_in):
    client = await sign_in("a_owner")
    other_ids = {world.unit_id("b"), world.member_id("b_owner"), world.member_id("b_member")}

    profile = (await client.get(f"{ADMIN}/organisasi/profil")).json()["data"]
    units = (await client.get(f"{ADMIN}/unit/read")).json()["data"]
    options = (await client.get(f"{ADMIN}/unit/option")).json()["data"]
    members = (await client.get(f"{ADMIN}/pengguna/read", params={"limit": 200})).json()

    assert profile["id"] == str(world.organizations["a"].id)
    assert {u["id"] for u in units} == {world.unit_id("a")}
    assert {o["id"] for o in options} == {world.unit_id("a")}
    assert not other_ids & {m["id"] for m in members["data"]}
    assert sum(members["summary"].values()) == 4
    search = await client.get(f"{ADMIN}/pengguna/read", params={"search": "b_owner"})
    assert search.json()["total"] == 0


async def test_cannot_change_other_organisation(world, sign_in):
    client = await sign_in("a_owner")
    before = await snapshot(world)
    unit = world.unit_id("b")
    member = world.member_id("b_member")

    responses = [
        await client.put(f"{ADMIN}/unit/update/{unit}", json={"name": "Diambil"}),
        await client.delete(f"{ADMIN}/unit/delete/{unit}"),
        await client.put(
            f"{ADMIN}/pengguna/update/{member}",
            json={"access_role": "viewer", "status": "disabled"},
        ),
        await client.delete(f"{ADMIN}/pengguna/delete/{member}"),
    ]

    assert [r.status_code for r in responses] == [404, 404, 404, 404]
    assert await snapshot(world) == before


@pytest.mark.parametrize("field", ["parent_id", "lead_member_id"])
async def test_cannot_link_unit_to_other_organisation(world, sign_in, field):
    client = await sign_in("a_owner")
    foreign = world.unit_id("b") if field == "parent_id" else world.member_id("b_member")
    body = {"name": "Unit Silang", field: foreign}

    created = await client.post(f"{ADMIN}/unit/create", json=body)
    updated = await client.put(f"{ADMIN}/unit/update/{world.unit_id('a')}", json=body)

    assert (created.status_code, updated.status_code) == (422, 422)


async def test_cannot_assign_member_to_other_unit(world, sign_in):
    client = await sign_in("a_owner")
    unit = world.unit_id("b")

    invited = await client.post(
        f"{ADMIN}/pengguna/invite",
        json={
            "full_name": "Baru",
            "email": "baru@uji.test",
            "access_role": "member",
            "unit_id": unit,
        },
    )
    updated = await client.put(
        f"{ADMIN}/pengguna/update/{world.member_id('a_member')}",
        json={"access_role": "member", "status": "active", "unit_id": unit},
    )

    assert (invited.status_code, updated.status_code) == (422, 422)


async def test_cannot_invite_member_of_other_organisation(world, sign_in):
    client = await sign_in("a_owner")
    before = await snapshot(world)

    response = await client.post(
        f"{ADMIN}/pengguna/invite",
        json={"full_name": "Orang B", "email": "b_member@uji.test", "access_role": "member"},
    )

    assert response.status_code == 409
    assert "organisasi lain" not in response.json()["message"]
    assert await snapshot(world) == before


async def test_organisation_id_in_request_is_ignored(world, sign_in):
    client = await sign_in("a_owner")
    foreign = str(world.organizations["b"].id)

    created = await client.post(
        f"{ADMIN}/unit/create", json={"name": "Sisipan", "organization_id": foreign}
    )

    assert created.status_code == 201
    assert len((await snapshot(world))[1]) == 1


async def test_malformed_ids_are_not_found(sign_in):
    client = await sign_in("a_owner")

    assert (await client.delete(f"{ADMIN}/unit/delete/bukan-uuid")).status_code == 404
    assert (await client.delete(f"{ADMIN}/pengguna/delete/bukan-uuid")).status_code == 404


@pytest.mark.parametrize(
    "path",
    ["organisasi/profil", "unit/read", "unit/option", "pengguna/read"],
)
async def test_every_read_requires_sign_in(client, database, path):
    assert (await client.get(f"{ADMIN}/{path}")).status_code == 401
