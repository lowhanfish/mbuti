"""Pembentukan role, versi, dan katalog alat (kontrak 16.1–16.3)."""

import uuid

import pytest
from sqlalchemy import select

from app.models import Document, LlmCall, ToolRequest
from app.services.formation.job import run_job
from app.services.knowledge.ingest import ingest_version
from app.services.llm.embedding import MockEmbedding
from app.services.llm.generation import MockLlm
from tests.integration.world import add_agents

ROLE = "/api/v1/admin/role"
KNOWLEDGE = "/api/v1/admin/pengetahuan"
DESCRIPTION = (
    "Nara mencatat barang masuk dan keluar gudang setiap hari. Merekap stok mingguan untuk "
    "kepala gudang. Membuat surat permintaan barang bila stok menipis."
)
FORMATION_KEYS = {
    "id",
    "agent_id",
    "version_no",
    "status",
    "source",
    "processing",
    "can_edit",
    "materials",
    "material_documents",
    "card",
    "snapshot",
    "round_no",
    "messages",
    "open_required",
    "changed",
    "agent_satisfied",
    "error_message",
    "created_at",
    "updated_at",
}


@pytest.fixture
def run_jobs(database, queued_formations):
    """Kerjakan analisis dan putaran yang antre, seperti worker."""

    async def run():
        while queued_formations:
            await run_job(database, uuid.UUID(queued_formations.pop(0)), MockLlm())

    return run


@pytest.fixture
def run_ingestion(database, queued_versions):
    async def run():
        while queued_versions:
            await ingest_version(database, uuid.UUID(queued_versions.pop(0)), MockEmbedding())

    return run


async def create_role(client, mode="formation", name="Nara", owner: str | None = None) -> dict:
    response = await client.post(
        f"{ROLE}/create", json={"name": name, "title": "Admin Gudang", "mode": mode}
    )
    assert response.status_code == 201, response.text
    role = response.json()["data"]
    if owner:
        await client.put(f"{ROLE}/update/{role['id']}", json={"owner_member_id": owner})
    return role


async def formation(client, role_id: str) -> dict:
    response = await client.get(f"{ROLE}/{role_id}/pembentukan")
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def analysed(client, run_jobs, role_id: str, tools=("Excel", "Kalkulator")) -> dict:
    response = await client.put(
        f"{ROLE}/{role_id}/pembentukan/bahan",
        json={"description": DESCRIPTION, "tools": list(tools), "represented": "Pak Dodi"},
    )
    assert response.status_code == 200, response.text
    response = await client.post(f"{ROLE}/{role_id}/pembentukan/analisis", json={})
    assert response.status_code == 202, response.text
    assert response.json()["data"]["processing"] is True
    await run_jobs()
    return await formation(client, role_id)


async def test_manual_and_formation_paths(world, sign_in):
    client = await sign_in("a_admin")

    manual = await create_role(client, mode="manual", name="Rani")
    assert manual["active_version_no"] == 1 and manual["revision_status"] is None
    drafted = await create_role(client)
    assert drafted["status"] == "draft"
    assert drafted["active_version_no"] == 0 and drafted["revision_status"] == "draft"

    # Role yang belum Final tidak bisa diaktifkan
    response = await client.put(
        f"{ROLE}/update/{drafted['id']}", json={"status": "active", "goal": "Tujuan yang cukup."}
    )
    assert response.status_code == 409

    data = await formation(client, drafted["id"])
    assert set(data) == FORMATION_KEYS
    assert data["status"] == "draft" and data["can_edit"] is True and data["card"] is None

    # Tanpa uraian jabatan dan deskripsi pendek
    response = await client.post(f"{ROLE}/{drafted['id']}/pembentukan/analisis", json={})
    assert response.status_code == 422


async def test_analysis_questions_and_final(world, sign_in, run_jobs, queued_versions, database):
    client = await sign_in("a_admin")
    role = await create_role(client)

    data = await analysed(client, run_jobs, role["id"])
    assert data["status"] == "questioning" and data["processing"] is False
    assert data["round_no"] == 1 and data["card"]["skills"]
    first = data["card"]["skills"][0]
    assert {t["requested"]: t["support"] for t in first["tools"]} == {
        "Excel": "upcoming",
        "Kalkulator": "unsupported",
    }
    assert first["support"] == "unsupported"
    assert data["snapshot"]["input_spec"][0]["label"] == "Arahan tugas"
    questions = [m for m in data["messages"] if m["kind"] == "question"]
    assert questions[0]["question_id"] == questions[0]["id"]
    assert data["open_required"] == 1

    requests = (await client.get("/api/v1/admin/alat/permintaan")).json()["data"]
    assert [(r["requested"], r["agent_name"]) for r in requests] == [("Kalkulator", "Nara")]
    async with database() as session:
        calls = (await session.scalars(select(LlmCall.kind))).all()
    assert calls == ["formation"]

    # Pertanyaan wajib belum dijawab: Final butuh alasan
    response = await client.post(f"{ROLE}/{role['id']}/pembentukan/final", json={})
    assert response.status_code == 409

    required = next(q for q in questions if q["required"])
    response = await client.post(
        f"{ROLE}/{role['id']}/pembentukan/jawab",
        json={"answers": [{"question_id": required["id"], "text": "Ke kepala gudang, Excel."}]},
    )
    assert response.status_code == 202, response.text
    # Selama putaran berjalan, perubahan ditolak
    busy = await client.put(f"{ROLE}/{role['id']}/pembentukan/bahan", json={})
    assert busy.status_code == 409
    await run_jobs()

    data = await formation(client, role["id"])
    assert data["status"] == "ready" and data["agent_satisfied"] is True
    assert data["round_no"] == 2 and data["open_required"] == 0
    assert data["messages"][-1]["kind"] == "note"

    response = await client.post(
        f"{ROLE}/{role['id']}/pembentukan/final",
        json={"change_note": "Versi pertama", "status_after": "active"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "final"

    detail = (await client.get(f"{ROLE}/{role['id']}")).json()["data"]
    assert detail["status"] == "active" and detail["active_version_no"] == 1
    assert detail["goal"] and detail["revision_status"] is None

    # Hasil tanya jawab menjadi dokumen sistem yang diolah dan hanya-baca
    assert len(queued_versions) == 1
    docs = (await client.get(f"{KNOWLEDGE}/read", params={"category": "qa"})).json()["data"]
    assert [d["title"] for d in docs] == ["Hasil tanya jawab – Nara v1"]
    assert docs[0]["category"] == "qa"
    response = await client.delete(f"{KNOWLEDGE}/delete/{docs[0]['id']}")
    assert response.status_code == 409

    versions = (await client.get(f"{ROLE}/{role['id']}/versi")).json()["data"]
    assert [(v["version_no"], v["is_active"], v["question_count"]) for v in versions] == [
        (1, True, 2)
    ]


async def test_revision_keeps_old_version_working(world, sign_in, run_jobs):
    client = await sign_in("a_admin")
    role = await create_role(client)
    data = await analysed(client, run_jobs, role["id"])
    reason = {"override_reason": "Dilengkapi nanti"}
    await client.post(f"{ROLE}/{role['id']}/pembentukan/final", json=reason)

    response = await client.post(f"{ROLE}/{role['id']}/pembentukan/mulai", json={})
    assert response.status_code == 201
    revision = response.json()["data"]
    assert revision["version_no"] == 2 and revision["status"] == "ready"
    assert [s["key"] for s in revision["card"]["skills"]] == [
        s["key"] for s in data["card"]["skills"]
    ]
    again = await client.post(f"{ROLE}/{role['id']}/pembentukan/mulai", json={})
    assert again.status_code == 409

    # Versi 1 tetap bekerja; ubahan langsung tercatat sebagai versi manual
    detail = (await client.get(f"{ROLE}/{role['id']}")).json()["data"]
    assert detail["active_version_no"] == 1 and detail["revision_status"] == "ready"
    await client.put(f"{ROLE}/update/{role['id']}", json={"instructions": "Kerjakan dengan rapi."})
    await client.put(f"{ROLE}/update/{role['id']}", json={"name": "Nara Baru"})
    versions = (await client.get(f"{ROLE}/{role['id']}/versi")).json()["data"]
    assert [(v["version_no"], v["source"], v["status"]) for v in versions] == [
        (3, "manual", "final"),
        (2, "formation", "ready"),
        (1, "formation", "superseded"),
    ]

    # Pulihkan menunggu revisi terbuka dibuang
    old = versions[2]["id"]
    assert (
        await client.post(f"{ROLE}/{role['id']}/versi/{old}/pulihkan", json={})
    ).status_code == 409
    assert (await client.post(f"{ROLE}/{role['id']}/pembentukan/batal", json={})).status_code == 200
    response = await client.post(f"{ROLE}/{role['id']}/versi/{old}/pulihkan", json={})
    assert response.status_code == 201
    restored = response.json()["data"]
    assert restored["version_no"] == 4 and restored["source"] == "restore"
    response = await client.post(f"{ROLE}/{role['id']}/pembentukan/final", json={})
    assert response.status_code == 200, response.text
    detail = (await client.get(f"{ROLE}/{role['id']}")).json()["data"]
    assert detail["active_version_no"] == 4 and detail["instructions"] != "Kerjakan dengan rapi."
    version = (await client.get(f"{ROLE}/{role['id']}/versi/{old}")).json()["data"]
    assert version["status"] == "superseded" and version["card"]["skills"]


async def test_card_edit_maps_tools_and_keeps_keys(world, sign_in, run_jobs):
    client = await sign_in("a_admin")
    role = await create_role(client)
    data = await analysed(client, run_jobs, role["id"])
    skills = data["card"]["skills"]
    skills[0]["tools"] = [{"requested": "Ms Word"}, {"requested": "AutoCAD"}]
    skills.append(
        {"name": "Menyusun laporan bulanan", "steps": [{"text": "Rekap", "approval": True}]}
    )

    response = await client.put(
        f"{ROLE}/{role['id']}/pembentukan/kartu", json={"summary": "", "goal": "", "skills": skills}
    )
    assert response.status_code == 200, response.text
    card = response.json()["data"]["card"]
    assert card["skills"][0]["key"] == skills[0]["key"]
    assert [t["support"] for t in card["skills"][0]["tools"]] == ["upcoming", "substitute"]
    assert card["skills"][-1]["steps"] == [{"text": "Rekap", "approval": True}]
    assert card["summary"] == data["card"]["summary"]

    empty = await client.put(f"{ROLE}/{role['id']}/pembentukan/kartu", json={"skills": []})
    assert empty.status_code == 422


async def test_permissions_and_isolation(world, sign_in, run_jobs):
    admin = await sign_in("a_admin")
    owned = await create_role(admin, owner=world.member_id("a_member"))
    other = await create_role(admin, name="Bima")
    member = await sign_in("a_member")
    viewer = await sign_in("a_viewer")
    outsider = await sign_in("b_owner")

    # Penanggung jawab boleh membentuk role-nya dan mengunggah uraian jabatannya
    response = await member.put(
        f"{ROLE}/{owned['id']}/pembentukan/bahan", json={"description": DESCRIPTION}
    )
    assert response.status_code == 200
    upload = await member.post(
        f"{KNOWLEDGE}/create",
        data={"scope": "agent", "scope_id": owned["id"], "doc_type": "uraian_jabatan"},
        files={"file": ("uraian.md", b"# Tugas\nMenyusun laporan stok.", "text/markdown")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["data"]["category"] == "formation"
    formed = await formation(member, owned["id"])
    assert [d["status"] for d in formed["material_documents"]] == ["queued"]
    # Uraian jabatan masih diolah
    response = await member.post(f"{ROLE}/{owned['id']}/pembentukan/analisis", json={})
    assert response.status_code == 409

    response = await member.put(f"{ROLE}/{other['id']}/pembentukan/bahan", json={})
    assert response.status_code == 403
    other_upload = await member.post(
        f"{KNOWLEDGE}/create",
        data={"scope": "agent", "scope_id": other["id"], "doc_type": "uraian_jabatan"},
        files={"file": ("uraian.md", b"# Tugas\nIsi.", "text/markdown")},
    )
    assert other_upload.status_code == 403
    assert (await viewer.put(f"{ROLE}/{owned['id']}/pembentukan/bahan", json={})).status_code == 403
    assert (await formation(viewer, owned["id"]))["can_edit"] is False
    assert (await outsider.get(f"{ROLE}/{owned['id']}/pembentukan")).status_code == 404
    assert (await outsider.get(f"{ROLE}/{owned['id']}/versi")).status_code == 404

    # Revisi pertama tidak bisa dibuang
    response = await admin.post(f"{ROLE}/{other['id']}/pembentukan/batal", json={})
    assert response.status_code == 409


async def test_formation_documents_stay_with_their_role(
    world, sign_in, run_jobs, run_ingestion, database
):
    client = await sign_in("a_admin")
    role = await create_role(client)
    await analysed(client, run_jobs, role["id"])
    await client.post(f"{ROLE}/{role['id']}/pembentukan/final", json={"override_reason": "Nanti"})
    [reader] = await add_agents(world, "a", "Pembaca")
    await client.put(f"{ROLE}/update/{reader}", json={"knowledge_scope": "organization"})
    await client.post(
        f"{KNOWLEDGE}/create",
        data={"scope": "agent", "scope_id": role["id"], "doc_type": "uraian_jabatan"},
        files={"file": ("uraian.md", b"# Tugas gudang\nMencatat stok barang.", "text/markdown")},
    )
    await run_ingestion()

    own = (await client.get(f"{KNOWLEDGE}/read", params={"agent_id": role["id"]})).json()
    others = (await client.get(f"{KNOWLEDGE}/read", params={"agent_id": reader})).json()
    assert {d["category"] for d in own["data"]} == {"formation"}
    assert others["data"] == []
    hits = (
        await client.get(f"{KNOWLEDGE}/search", params={"q": "stok gudang", "agent_id": reader})
    ).json()
    assert hits["data"] == []

    # Menghapus role ikut mengarsipkan uraian jabatannya
    response = await client.delete(f"{ROLE}/delete/{role['id']}")
    assert response.status_code == 200, response.text
    async with database() as session:
        left = await session.scalars(
            select(Document.id).where(
                Document.agent_id == uuid.UUID(role["id"]), Document.deleted_at.is_(None)
            )
        )
        assert left.all() == []


async def test_catalog_and_usage_today(world, sign_in, run_jobs, database):
    client = await sign_in("a_owner")
    catalog = (await client.get("/api/v1/admin/alat/katalog")).json()["data"]
    supported = {item["key"] for item in catalog if item["support"] == "supported"}
    assert supported == {"read.document", "read.image", "search.web"}

    role = await create_role(client)
    await analysed(client, run_jobs, role["id"], tools=())
    models = (await client.get("/api/v1/admin/pengaturan/model-ai")).json()["data"]
    usage = {row["purpose"]: row["calls"] for row in models["usage_today"]}
    assert usage == {
        "task": 0,
        "trial": 0,
        "formation": 1,
        "vision_ingest": 0,
        "web_search": 0,
        "schedule_parse": 0,
        "letter_format": 0,
    }
    async with database() as session:
        assert (await session.scalars(select(ToolRequest))).all() == []
