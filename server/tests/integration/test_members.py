"""Pengguna dan hak akses."""

BASE = "/api/v1/admin/pengguna"
MEMBER_KEYS = {
    "id",
    "user_id",
    "full_name",
    "email",
    "access_role",
    "unit_id",
    "unit_name",
    "status",
    "joined_at",
    "last_active_at",
    "is_self",
}


def invitation(**changes):
    return {
        "full_name": "Orang Baru",
        "email": "baru@uji.test",
        "access_role": "member",
        **changes,
    }


def change(role="member", status="active", unit_id=None):
    return {"access_role": role, "status": status, "unit_id": unit_id}


async def test_list_has_summary_order_and_filters(sign_in):
    client = await sign_in("a_admin")

    listing = (await client.get(f"{BASE}/read")).json()
    assert set(listing["data"][0]) == MEMBER_KEYS
    assert [m["access_role"] for m in listing["data"]] == ["owner", "admin", "member", "viewer"]
    assert listing["summary"] == {"active": 4, "invited": 0, "disabled": 0}
    assert [m["is_self"] for m in listing["data"]] == [False, True, False, False]

    filtered = (
        await client.get(f"{BASE}/read", params={"access_role": "viewer", "search": "a_view"})
    ).json()
    assert (filtered["total"], filtered["summary"]["active"]) == (1, 4)
    paged = (await client.get(f"{BASE}/read", params={"skip": 3, "limit": 2})).json()
    assert (paged["total"], len(paged["data"])) == (4, 1)


async def test_invite(world, sign_in):
    client = await sign_in("a_admin")

    created = await client.post(
        f"{BASE}/invite", json=invitation(email="  Baru@Uji.test ", unit_id=world.unit_id("a"))
    )
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    assert (data["email"], data["status"], data["unit_name"]) == (
        "baru@uji.test",
        "invited",
        "Sekretariat",
    )

    duplicate = await client.post(f"{BASE}/invite", json=invitation())
    owner = await client.post(
        f"{BASE}/invite", json=invitation(email="bos@uji.test", access_role="owner")
    )
    invalid = await client.post(f"{BASE}/invite", json=invitation(email="salah"))
    assert (duplicate.status_code, owner.status_code, invalid.status_code) == (409, 403, 422)

    # Mengubah undangan tidak mengaktifkannya; menonaktifkan lalu mengaktifkan kembali boleh
    kept = await client.put(f"{BASE}/update/{data['id']}", json=change(role="viewer"))
    assert kept.json()["data"]["status"] == "invited"


async def test_removed_user_can_be_invited_again(world, sign_in):
    client = await sign_in("a_owner")
    assert (await client.delete(f"{BASE}/delete/{world.member_id('a_member')}")).status_code == 200

    again = await client.post(f"{BASE}/invite", json=invitation(email="a_member@uji.test"))

    assert again.status_code == 201, again.text


async def test_admin_cannot_touch_owners(world, sign_in):
    client = await sign_in("a_admin")
    owner = world.member_id("a_owner")

    demote = await client.put(f"{BASE}/update/{owner}", json=change(role="member"))
    promote = await client.put(
        f"{BASE}/update/{world.member_id('a_member')}", json=change(role="owner")
    )
    remove = await client.delete(f"{BASE}/delete/{owner}")

    assert [r.status_code for r in (demote, promote, remove)] == [403, 403, 403]


async def test_last_owner_and_self_protection(world, sign_in):
    client = await sign_in("a_owner")
    me = world.member_id("a_owner")

    for body in (change(role="admin"), change(role="owner", status="disabled")):
        response = await client.put(f"{BASE}/update/{me}", json=body)
        assert response.status_code == 409, response.text
    assert (await client.delete(f"{BASE}/delete/{me}")).status_code == 409

    # Setelah ada pemilik lain, pemilik lama boleh turun
    other = world.member_id("a_admin")
    assert (
        await client.put(f"{BASE}/update/{other}", json=change(role="owner"))
    ).status_code == 200
    assert (await client.put(f"{BASE}/update/{me}", json=change(role="admin"))).status_code == 200
    # Hak yang baru langsung berlaku
    assert (await client.put(f"{BASE}/update/{other}", json=change())).status_code == 403


async def test_disabling_or_removing_ends_sessions(world, sign_in):
    owner = await sign_in("a_owner")
    member = await sign_in("a_member")
    viewer = await sign_in("a_viewer")

    await owner.put(f"{BASE}/update/{world.member_id('a_member')}", json=change(status="disabled"))
    await owner.delete(f"{BASE}/delete/{world.member_id('a_viewer')}")

    for client in (member, viewer):
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_member_cannot_manage_people(world, sign_in):
    client = await sign_in("a_member")

    responses = (
        await client.post(f"{BASE}/invite", json=invitation()),
        await client.put(f"{BASE}/update/{world.member_id('a_viewer')}", json=change()),
        await client.delete(f"{BASE}/delete/{world.member_id('a_viewer')}"),
    )

    assert [r.status_code for r in responses] == [403, 403, 403]
