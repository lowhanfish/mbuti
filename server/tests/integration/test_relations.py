"""Peta relasi (kontrak bagian 6)."""

from tests.integration.world import add_agents

BASE = "/api/v1/admin/relasi"
MEMBERS = "/api/v1/admin/pengguna"
RELATION_KEYS = {
    "id",
    "source_id",
    "target_id",
    "source_kind",
    "target_kind",
    "relation_type",
    "trigger",
    "condition",
    "payload_spec",
    "expected_output",
    "max_revisions",
    "requires_approval",
    "label",
    "created_at",
    "updated_at",
}


def link(source, target, kind="review", **extra):
    return {"source_id": source, "target_id": target, "relation_type": kind, **extra}


async def graph(client):
    return (await client.get(f"{BASE}/graph")).json()["data"]


async def test_create_update_and_delete(world, sign_in):
    client = await sign_in("a_owner")
    rani, tegar = await add_agents(world, "a", "Rani", "Tegar")

    created = await client.post(f"{BASE}/create", json=link(rani, tegar))
    assert created.status_code == 201, created.text
    relation = created.json()["data"]
    assert set(relation) == RELATION_KEYS
    assert (relation["target_kind"], relation["max_revisions"], relation["trigger"]) == (
        "agent",
        2,
        "on_complete",
    )

    updated = await client.put(
        f"{BASE}/update/{relation['id']}", json={"max_revisions": 4, "label": "Periksa"}
    )
    assert updated.status_code == 200, updated.text
    data = updated.json()["data"]
    assert (data["max_revisions"], data["label"], data["relation_type"]) == (4, "Periksa", "review")

    assert (await client.delete(f"{BASE}/delete/{relation['id']}")).status_code == 200
    assert (await client.put(f"{BASE}/update/{relation['id']}", json={})).status_code == 404
    # Setelah dihapus, pasangan yang sama boleh dibuat lagi
    assert (await client.post(f"{BASE}/create", json=link(rani, tegar))).status_code == 201


async def test_rules(world, sign_in):
    client = await sign_in("a_owner")
    rani, tegar = await add_agents(world, "a", "Rani", "Tegar")
    human = world.member_id("a_member")
    assert (await client.post(f"{BASE}/create", json=link(rani, tegar))).status_code == 201

    cases = [
        (link(rani, tegar), "Relasi dengan jenis yang sama di antara keduanya sudah ada."),
        (link(human, tegar), "Relasi harus dimulai dari sebuah role."),
        (link(rani, rani), "Role tidak bisa berelasi dengan dirinya sendiri."),
        (link(rani, human), "Ke manusia hanya bisa memakai relasi Eskalasi."),
        (link(rani, tegar, "escalate"), "Eskalasi ditujukan ke manusia, bukan ke role."),
        (
            link(rani, world.member_id("a_viewer"), "escalate"),
            "Pemantau tidak bisa menjadi tujuan eskalasi.",
        ),
        (
            link(rani, tegar, "consult", trigger="on_condition", condition="ya"),
            "Tuliskan kondisi kapan relasi ini dijalankan.",
        ),
        (link(rani, world.member_id("b_owner"), "escalate"), "Tujuan relasi tidak ditemukan."),
    ]
    for body, message in cases:
        response = await client.post(f"{BASE}/create", json=body)
        assert (response.status_code, response.json()["message"]) == (422, message), body

    too_many = await client.post(
        f"{BASE}/create", json=link(rani, tegar, "consult", max_revisions=9)
    )
    assert too_many.status_code == 422


async def test_handoff_cannot_form_a_loop(world, sign_in):
    client = await sign_in("a_owner")
    a, b, c = await add_agents(world, "a", "Ani", "Budi", "Citra")
    for source, target in ((a, b), (b, c)):
        response = await client.post(f"{BASE}/create", json=link(source, target, "handoff"))
        assert response.status_code == 201, response.text

    loop = await client.post(f"{BASE}/create", json=link(c, a, "handoff"))

    assert loop.status_code == 422
    assert "Citra → Ani → Budi → Citra" in loop.json()["message"]
    # Bolak-balik lewat Periksa tetap boleh
    assert (await client.post(f"{BASE}/create", json=link(c, a, "review"))).status_code == 201


async def test_escalation_places_human_on_map(world, sign_in):
    client = await sign_in("a_owner")
    (rani,) = await add_agents(world, "a", "Rani")
    human = world.member_id("a_member")

    created = await client.post(f"{BASE}/create", json=link(rani, human, "escalate"))
    assert created.json()["data"]["requires_approval"] is True
    assert created.json()["data"]["target_kind"] == "human"
    nodes = (await graph(client))["nodes"]
    assert nodes[-1] == {"id": human, "kind": "human", "name": "A Member", "title": "Anggota"}

    held = await client.delete(f"{BASE}/humans/{human}")
    demote = await client.put(
        f"{MEMBERS}/update/{human}", json={"access_role": "viewer", "status": "active"}
    )
    assert (held.status_code, demote.status_code) == (409, 409)

    # Mengeluarkan orang itu menghapus eskalasinya dan mengosongkannya dari peta
    assert (await client.delete(f"{MEMBERS}/delete/{human}")).status_code == 200
    after = await graph(client)
    assert after["relations"] == []
    assert [n["kind"] for n in after["nodes"]] == ["agent"]


async def test_humans_and_positions(world, sign_in):
    client = await sign_in("a_owner")
    (rani,) = await add_agents(world, "a", "Rani")
    (foreign,) = await add_agents(world, "b", "Asing")
    human = world.member_id("a_member")

    for member, status in (
        (human, 200),
        (human, 200),
        (world.member_id("a_viewer"), 422),
        (world.member_id("b_member"), 422),
    ):
        response = await client.post(f"{BASE}/humans", json={"member_id": member})
        assert response.status_code == status, response.text

    saved = await client.put(
        f"{BASE}/positions",
        json={
            "positions": {
                rani: {"x": 10.4, "y": -5.6},
                foreign: {"x": 1, "y": 1},
                "bukan-id": {"x": 1, "y": 1},
            }
        },
    )
    assert saved.status_code == 200, saved.text
    await client.put(f"{BASE}/positions", json={"positions": {human: {"x": 7, "y": 8}}})

    data = await graph(client)
    assert data["positions"] == {rani: {"x": 10, "y": -6}, human: {"x": 7, "y": 8}}
    assert data["revision_limit"] == 3
    assert {n["id"] for n in data["nodes"]} == {rani, human}

    assert (await client.delete(f"{BASE}/positions")).status_code == 200
    assert (await client.delete(f"{BASE}/humans/{human}")).status_code == 200
    cleared = await graph(client)
    assert cleared["positions"] == {} and len(cleared["nodes"]) == 1


async def test_isolation_and_permissions(world, sign_in):
    owner_b = await sign_in("b_owner")
    x, y = await add_agents(world, "b", "Xena", "Yudi")
    foreign = (await owner_b.post(f"{BASE}/create", json=link(x, y))).json()["data"]["id"]
    client = await sign_in("a_owner")
    (rani,) = await add_agents(world, "a", "Rani")

    statuses = [
        (await client.put(f"{BASE}/update/{foreign}", json={"label": "Diambil"})).status_code,
        (await client.delete(f"{BASE}/delete/{foreign}")).status_code,
        (await client.post(f"{BASE}/create", json=link(rani, x))).status_code,
        (await client.post(f"{BASE}/create", json=link(x, rani))).status_code,
    ]
    assert statuses == [404, 404, 422, 422]
    assert (await graph(client))["relations"] == []
    assert len((await graph(owner_b))["relations"]) == 1

    member = await sign_in("a_member")
    assert (await member.get(f"{BASE}/graph")).status_code == 200
    refused = await member.put(f"{BASE}/positions", json={"positions": {}})
    assert refused.status_code == 403
