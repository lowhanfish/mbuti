"""Role AI (kontrak bagian 4)."""

import uuid

from app.models import Agent
from tests.integration.world import add_agents

ROLE = "/api/v1/admin/role"
ROLE_KEYS = {
    "id",
    "name",
    "title",
    "unit_id",
    "goal",
    "status",
    "instructions",
    "input_spec",
    "output_format",
    "output_template",
    "acceptance_criteria",
    "knowledge_scope",
    "model_profile",
    "owner_member_id",
    "avatar",
    "unit_name",
    "unit_color",
    "owner_name",
    "document_count",
    "relation_count",
    "task_count",
    "created_at",
    "updated_at",
}


async def test_create_uses_defaults(world, sign_in):
    client = await sign_in("a_admin")

    response = await client.post(
        f"{ROLE}/create",
        json={"name": "Rani", "title": "Penyusun Surat", "unit_id": world.unit_id("a")},
    )

    assert response.status_code == 201, response.text
    role = response.json()["data"]
    assert set(role) == ROLE_KEYS
    assert (role["status"], role["knowledge_scope"], role["model_profile"]) == (
        "draft",
        "own",
        "balanced",
    )
    assert role["owner_member_id"] == world.member_id("a_admin")
    assert (role["owner_name"], role["unit_name"], role["unit_color"]) == (
        "A Admin",
        "Sekretariat",
        "#7c4dff",
    )
    assert role["avatar"]["shirt"] == "#7c4dff"


async def test_partial_update_changes_only_sent_fields(world, sign_in):
    client = await sign_in("a_owner")
    (role_id,) = await add_agents(world, "a", "Rani")

    response = await client.put(
        f"{ROLE}/update/{role_id}",
        json={
            "instructions": "Susun surat.",
            "input_spec": [
                {"label": "Jenis Surat", "type": "choice", "options": ["Undangan", ""]},
                {"label": "Jenis surat!", "required": True, "options": ["diabaikan"]},
            ],
            "acceptance_criteria": ["Sesuai pedoman", "  "],
        },
    )

    assert response.status_code == 200, response.text
    role = response.json()["data"]
    assert (role["name"], role["status"]) == ("Rani", "active")
    assert role["input_spec"] == [
        {
            "key": "jenis_surat",
            "label": "Jenis Surat",
            "type": "choice",
            "required": False,
            "options": ["Undangan"],
        },
        {"key": "jenis_surat_2", "label": "Jenis surat!", "type": "short_text", "required": True},
    ]
    assert role["acceptance_criteria"] == ["Sesuai pedoman"]

    cleared = await client.put(
        f"{ROLE}/update/{role_id}", json={"owner_member_id": None, "unit_id": None}
    )
    assert cleared.json()["data"]["instructions"] == "Susun surat."
    assert cleared.json()["data"]["unit_id"] is None


async def test_validation(world, sign_in):
    client = await sign_in("a_owner")
    (role_id,) = await add_agents(world, "a", "Rani")
    cases = [
        ({"name": "R"}, "Nama role minimal 2 karakter."),
        ({"goal": "pendek"}, "Role aktif harus punya tujuan kerja minimal 10 karakter."),
        ({"unit_id": world.unit_id("b")}, "Unit tidak ditemukan."),
        ({"owner_member_id": world.member_id("b_owner")}, "Penanggung jawab tidak ditemukan."),
    ]
    for body, message in cases:
        response = await client.put(f"{ROLE}/update/{role_id}", json=body)
        assert (response.status_code, response.json()["message"]) == (422, message), body

    for body in (
        {"name": None},
        {"instructions": "x" * 8001},
        {"input_spec": [{"label": f"Isian {i}"} for i in range(21)]},
        {"avatar": {"skin": "merah"}},
    ):
        response = await client.put(f"{ROLE}/update/{role_id}", json=body)
        assert response.status_code == 422, body


async def test_list_filters_summary_and_counts(world, sign_in):
    client = await sign_in("a_viewer")
    rani, tegar = await add_agents(world, "a", "Rani", "Tegar")
    owner = await sign_in("a_owner")
    await owner.put(f"{ROLE}/update/{tegar}", json={"unit_id": world.unit_id("a")})
    await owner.post(
        "/api/v1/admin/relasi/create",
        json={"source_id": rani, "target_id": tegar, "relation_type": "review"},
    )

    listing = (await client.get(f"{ROLE}/read")).json()
    # Role berunit lebih dulu, tanpa unit paling akhir
    assert [r["name"] for r in listing["data"]] == ["Tegar", "Rani"]
    assert [r["relation_count"] for r in listing["data"]] == [1, 1]
    assert listing["summary"] == {"draft": 0, "active": 2, "paused": 0}

    none = (await client.get(f"{ROLE}/read", params={"unit_id": "none"})).json()
    found = (await client.get(f"{ROLE}/read", params={"search": "sekre"})).json()
    assert [r["name"] for r in none["data"]] == ["Rani"]
    assert [r["name"] for r in found["data"]] == ["Tegar"]

    options = (await client.get(f"{ROLE}/option")).json()["data"]
    assert options[0] == {"id": rani, "value": "Rani", "sub_value": "Jabatan Rani"}
    profile = (await client.get("/api/v1/admin/organisasi/profil")).json()["data"]
    units = (await client.get("/api/v1/admin/unit/read")).json()["data"]
    assert (profile["stats"]["agent_count"], units[0]["agent_count"]) == (2, 1)

    assert (await client.post(f"{ROLE}/create", json={})).status_code in (403, 422)
    assert (await client.delete(f"{ROLE}/delete/{rani}")).status_code == 403


async def test_delete_hides_role_and_its_relations(world, sign_in):
    client = await sign_in("a_owner")
    rani, tegar = await add_agents(world, "a", "Rani", "Tegar")
    unit = world.unit_id("a")
    await client.put(f"{ROLE}/update/{rani}", json={"unit_id": unit})
    await client.post(
        "/api/v1/admin/relasi/create",
        json={"source_id": rani, "target_id": tegar, "relation_type": "handoff"},
    )

    blocked = await client.delete(f"/api/v1/admin/unit/delete/{unit}")
    assert blocked.status_code == 409 and "role" in blocked.json()["message"]

    assert (await client.delete(f"{ROLE}/delete/{rani}")).status_code == 200
    assert (await client.get(f"{ROLE}/{rani}")).status_code == 404
    graph = (await client.get("/api/v1/admin/relasi/graph")).json()["data"]
    assert [n["id"] for n in graph["nodes"]] == [tegar]
    assert graph["relations"] == []
    assert (await client.delete(f"/api/v1/admin/unit/delete/{unit}")).status_code == 200

    # Ditandai terhapus, bukan dibuang
    async with world.sessions() as session:
        stored = await session.get(Agent, uuid.UUID(rani))
        assert stored is not None and stored.deleted_at is not None


async def test_other_organisation_is_invisible(world, sign_in):
    client = await sign_in("a_owner")
    (foreign,) = await add_agents(world, "b", "Asing")

    statuses = [
        (await client.get(f"{ROLE}/{foreign}")).status_code,
        (await client.put(f"{ROLE}/update/{foreign}", json={"name": "Diambil"})).status_code,
        (await client.delete(f"{ROLE}/delete/{foreign}")).status_code,
    ]
    created = await client.post(
        f"{ROLE}/create",
        json={"name": "Silang", "title": "Jabatan", "unit_id": world.unit_id("b")},
    )

    assert statuses == [404, 404, 404]
    assert created.status_code == 422
    assert (await client.get(f"{ROLE}/read")).json()["total"] == 0
    async with world.sessions() as session:
        stored = await session.get(Agent, uuid.UUID(foreign))
        assert (stored.name, stored.deleted_at) == ("Asing", None)
