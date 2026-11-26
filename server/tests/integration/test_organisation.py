"""Profil organisasi dan unit."""

PROFILE = "/api/v1/admin/organisasi/profil"
UNIT = "/api/v1/admin/unit"
PROFILE_KEYS = {
    "id",
    "slug",
    "name",
    "description",
    "sector",
    "timezone",
    "email",
    "phone",
    "address",
    "website",
    "created_at",
    "updated_at",
    "stats",
}
UNIT_KEYS = {
    "id",
    "name",
    "code",
    "description",
    "parent_id",
    "parent_name",
    "color",
    "lead_member_id",
    "lead_name",
    "sort_order",
    "member_count",
    "agent_count",
    "child_count",
    "created_at",
    "updated_at",
}


def profile_body(**changes):
    return {
        "name": "Dinas Uji",
        "description": "",
        "sector": "pemerintahan",
        "timezone": "Asia/Makassar",
        "email": "",
        "phone": "",
        "address": "",
        "website": "",
        **changes,
    }


async def test_profile_can_be_read_by_viewer(sign_in):
    response = await (await sign_in("a_viewer")).get(PROFILE)

    data = response.json()["data"]
    assert set(data) == PROFILE_KEYS
    assert data["stats"] == {"unit_count": 1, "member_count": 4, "agent_count": 0}


async def test_only_managers_update_profile(sign_in):
    member = await sign_in("a_member")
    admin = await sign_in("a_admin")

    refused = await member.put(f"{PROFILE}/update", json=profile_body())
    updated = await admin.put(f"{PROFILE}/update", json=profile_body(name="  Dinas Baru  "))

    assert refused.status_code == 403
    assert updated.json()["data"]["name"] == "Dinas Baru"
    assert updated.json()["data"]["slug"] == "org-uji-a"


async def test_profile_validation_messages(sign_in):
    client = await sign_in("a_owner")
    cases = {
        "Nama organisasi minimal 3 karakter.": {"name": "ab"},
        "Format email tidak valid.": {"email": "salah"},
        "Situs web harus diawali http:// atau https://.": {"website": "www.contoh.test"},
        "Zona waktu tidak dikenal.": {"timezone": "Bulan/Selatan"},
        "Deskripsi maksimal 1000 karakter.": {"description": "x" * 1001},
    }
    for message, change in cases.items():
        response = await client.put(f"{PROFILE}/update", json=profile_body(**change))
        assert (response.status_code, response.json()["message"]) == (422, message)


async def test_unit_lifecycle(world, sign_in):
    client = await sign_in("a_owner")
    root = world.unit_id("a")

    created = await client.post(
        f"{UNIT}/create",
        json={
            "name": "Persuratan",
            "code": "srt",
            "parent_id": root,
            "lead_member_id": world.member_id("a_member"),
        },
    )
    assert created.status_code == 201, created.text
    unit = created.json()["data"]
    assert set(unit) == UNIT_KEYS
    assert (unit["code"], unit["parent_name"], unit["lead_name"], unit["color"]) == (
        "SRT",
        "Sekretariat",
        "A Member",
        "violet",
    )

    listing = (await client.get(f"{UNIT}/read")).json()
    assert (listing["total"], listing["limit"]) == (2, 10)
    assert {u["name"]: u["child_count"] for u in listing["data"]}["Sekretariat"] == 1

    options = (await client.get(f"{UNIT}/option")).json()["data"]
    assert [(o["value"], o["sub_value"]) for o in options] == [
        ("Persuratan", "SRT"),
        ("Sekretariat", "SEK"),
    ]

    blocked = await client.delete(f"{UNIT}/delete/{root}")
    assert blocked.status_code == 409

    assert (await client.delete(f"{UNIT}/delete/{unit['id']}")).status_code == 200
    assert (await client.delete(f"{UNIT}/delete/{root}")).status_code == 200


async def test_unit_rules(world, sign_in):
    client = await sign_in("a_owner")
    root = world.unit_id("a")
    child = (await client.post(f"{UNIT}/create", json={"name": "Anak", "parent_id": root})).json()[
        "data"
    ]

    for body, message in (
        ({"name": "sekretariat"}, "Nama unit sudah dipakai."),
        ({"name": "Lain", "code": "sek"}, "Kode unit sudah dipakai."),
        ({"name": "x"}, "Nama unit minimal 2 karakter."),
    ):
        response = await client.post(f"{UNIT}/create", json=body)
        assert (response.status_code, response.json()["message"]) == (422, message)

    for parent in (root, child["id"]):
        response = await client.put(
            f"{UNIT}/update/{root}", json={"name": "Sekretariat", "parent_id": parent}
        )
        assert response.status_code == 422, response.text

    # Dua unit tanpa kode boleh ada
    assert (await client.post(f"{UNIT}/create", json={"name": "Tanpa Kode"})).status_code == 201


async def test_deleting_unit_clears_members_unit(world, sign_in):
    client = await sign_in("a_owner")
    unit_id = world.unit_id("a")
    await client.put(
        f"/api/v1/admin/pengguna/update/{world.member_id('a_member')}",
        json={"access_role": "member", "unit_id": unit_id, "status": "active"},
    )

    assert (await client.delete(f"{UNIT}/delete/{unit_id}")).status_code == 200
    members = (await client.get("/api/v1/admin/pengguna/read")).json()["data"]
    assert all(m["unit_id"] is None for m in members)


async def test_unit_search_and_paging(sign_in):
    client = await sign_in("a_owner")

    assert (await client.get(f"{UNIT}/read", params={"search": "SEKRE"})).json()["total"] == 1
    # Karakter khusus pola dicari apa adanya
    assert (await client.get(f"{UNIT}/read", params={"search": "%"})).json()["total"] == 0
    capped = (await client.get(f"{UNIT}/read", params={"limit": 999, "skip": -3})).json()
    assert (capped["limit"], capped["skip"]) == (200, 0)


async def test_viewer_cannot_change_units(world, sign_in):
    client = await sign_in("a_viewer")

    assert (await client.get(f"{UNIT}/read")).status_code == 200
    assert (await client.post(f"{UNIT}/create", json={"name": "Baru"})).status_code == 403
    assert (await client.delete(f"{UNIT}/delete/{world.unit_id('a')}")).status_code == 403
