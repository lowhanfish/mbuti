"""Jejak audit, hak melihatnya, dan batas laju."""

from sqlalchemy import select

from app.core.config import settings
from app.models import AuditLog
from tests.integration.world import PASSWORD, add_agents, new_client

AUDIT = "/api/v1/admin/audit/read"
ROLE = "/api/v1/admin/role"
LOGIN = "/api/v1/auth/login"


async def entries(world) -> list[AuditLog]:
    async with world.sessions() as session:
        return list(await session.scalars(select(AuditLog).order_by(AuditLog.seq)))


async def test_changes_and_sign_ins_are_recorded(application, world, sign_in):
    owner = await sign_in("a_owner")
    created = await owner.post(f"{ROLE}/create", json={"name": "Dina", "title": "Analis"})
    assert created.status_code == 201, created.text
    role_id = created.json()["data"]["id"]
    assert (await owner.put(f"{ROLE}/update/{role_id}", json={"name": ""})).status_code == 422
    assert (await owner.delete(f"{ROLE}/delete/{role_id}")).status_code == 200
    assert (await owner.get(f"{ROLE}/read")).status_code == 200
    async with new_client(application) as visitor:
        for email, password in (
            ("a_owner@uji.test", "salah-sekali"),
            ("tak@dikenal.test", "salah-sekali"),
        ):
            await visitor.post(LOGIN, json={"email": email, "password": password})
    await owner.post("/api/v1/auth/logout")

    rows = await entries(world)
    assert [(r.action, r.target) for r in rows] == [
        ("auth.masuk", ""),
        ("role.buat", "Dina"),
        # Yang gagal dan yang hanya membaca tidak dicatat; nama tetap ada setelah dihapus
        ("role.hapus", "Dina"),
        ("auth.gagal", ""),
        ("auth.gagal", ""),
        ("auth.keluar", ""),
    ]
    organization = world.organizations["a"].id
    known, unknown = rows[3], rows[4]
    assert known.organization_id == organization and known.actor_name == "A Owner"
    assert unknown.organization_id is None and unknown.actor_email == "tak@dikenal.test"
    assert all(PASSWORD not in f"{r.target}{r.actor_name}{r.actor_email}" for r in rows)


async def test_only_managers_read_their_own_organisation(world, sign_in):
    owner = await sign_in("a_owner")
    admin = await sign_in("a_admin")
    member = await sign_in("a_member")
    stranger = await sign_in("b_owner")
    await add_agents(world, "a", "Rani")
    await owner.post(f"{ROLE}/create", json={"name": "Dina", "title": "Analis"})

    refused = await member.get(AUDIT)
    assert refused.status_code == 403

    seen = (await admin.get(AUDIT, params={"group": "role"})).json()
    assert [e["target"] for e in seen["data"]] == ["Dina"] and seen["total"] == 1
    for params, total in (
        ({"search": "dina"}, 1),
        ({"search": "a_admin@"}, 1),
        ({"search": "%"}, 0),
    ):
        assert (await owner.get(AUDIT, params=params)).json()["total"] == total, params
    theirs = (await stranger.get(AUDIT)).json()
    assert [e["actor_email"] for e in theirs["data"]] == ["b_owner@uji.test"]


async def test_expensive_actions_are_limited_per_user(world, sign_in, monkeypatch):
    monkeypatch.setattr(settings, "RATE_SEARCH_PER_MINUTE", 2)
    owner = await sign_in("a_owner")
    admin = await sign_in("a_admin")
    search = "/api/v1/admin/pengetahuan/search"

    codes = [(await owner.get(search, params={"q": "ab"})).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    limited = await owner.get(search, params={"q": "ab"})
    assert limited.json()["message"] == "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi."
    # Pengguna lain tidak ikut kena
    assert (await admin.get(search, params={"q": "ab"})).status_code == 200
