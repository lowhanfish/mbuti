"""Pencarian internet per role dan usulan pengetahuan (kontrak 16.7)."""

from sqlalchemy import select

from app.core.config import settings
from app.models import LlmCall
from app.services.llm.generation import MockLlm
from app.services.search import free
from tests.integration.tasks import create_task, detail, run
from tests.integration.test_knowledge import BASE, run_queue, upload  # noqa: F401
from tests.integration.world import add_agents

ROLE = "/api/v1/admin/role"
PROPOSALS = f"{BASE}/usulan"


async def allow_web(client, role_id: str, allowed: bool = True) -> None:
    response = await client.put(f"{ROLE}/update/{role_id}", json={"web_search": allowed})
    assert response.status_code == 200, response.text


async def web_calls(database) -> list[str]:
    async with database() as session:
        return list(
            await session.scalars(select(LlmCall.status).where(LlmCall.kind == "web_search"))
        )


async def test_trial_searches_only_when_allowed_and_needed(
    world,
    sign_in,
    database,
    run_queue,  # noqa: F811
    monkeypatch,
):
    client = await sign_in("a_admin")
    [lumi] = await add_agents(world, "a", "Lumi")
    brief = {"brief": "Kabar terbaru layanan kependudukan daring"}

    # Bawaan mati
    result = (await client.post(f"{ROLE}/{lumi}/trial", json=brief)).json()["data"]
    assert result["status"] == "not_in_documents" and result["web_sources"] == []

    await allow_web(client, lumi)
    result = (await client.post(f"{ROLE}/{lumi}/trial", json=brief)).json()["data"]
    assert result["status"] == "done"
    assert [s["no"] for s in result["web_sources"]] == [1, 2]
    assert result["web_sources"][0]["url"].startswith("https://pustaka-terbuka.test/")
    assert (
        "INTERNET" in result["prompt_preview"]
        and '<internet nomor="W1">' in result["prompt_preview"]
    )
    assert "di luar dokumen organisasi" in result["notes"]
    assert await web_calls(database) == ["ok"]

    # Dokumen yang cocok dan arahan biasa: tidak mencari
    await upload(
        client,
        b"# Layanan kependudukan\nLayanan kependudukan daring dibuka setiap hari kerja.",
        "sop.md",
    )
    await run_queue()
    plain = {"brief": "layanan kependudukan daring dibuka setiap hari kerja"}
    result = (await client.post(f"{ROLE}/{lumi}/trial", json=plain)).json()["data"]
    assert result["web_sources"] == []

    # Batas harian organisasi
    monkeypatch.setattr(settings, "WEB_SEARCH_PER_DAY", 1)
    result = (await client.post(f"{ROLE}/{lumi}/trial", json=brief)).json()["data"]
    assert result["web_sources"] == []

    models = (await client.get("/api/v1/admin/pengaturan/model-ai")).json()["data"]
    assert {r["purpose"]: r["calls"] for r in models["usage_today"]}["web_search"] == 1


async def test_task_records_web_sources_and_can_turn_them_off(world, sign_in, database):
    client = await sign_in("a_admin")
    [lumi] = await add_agents(world, "a", "Lumi")
    await allow_web(client, lumi)

    searching = await create_task(client, lumi, brief="Rangkum kabar terbaru layanan daring")
    await run(database, searching, MockLlm())
    task = await detail(client, searching)
    assert task["web_search"] == "role"
    assert len(task["steps"][0]["web_sources"]) == 2
    assert any("mencari di internet" in e["message"] for e in task["events"])

    quiet = await create_task(
        client, lumi, brief="Rangkum kabar terbaru layanan daring", web_search="off"
    )
    await run(database, quiet, MockLlm())
    task = await detail(client, quiet)
    assert task["web_search"] == "off" and task["steps"][0]["web_sources"] == []
    assert await web_calls(database) == ["ok"]


async def test_proposals_flow_and_permissions(world, sign_in, queued_versions):
    member = await sign_in("a_member")
    admin = await sign_in("a_admin")
    viewer = await sign_in("a_viewer")
    outsider = await sign_in("b_owner")
    [lumi] = await add_agents(world, "a", "Lumi")
    body = {
        "url": "https://pustaka-terbuka.test/panduan/bahasa-pelayanan",
        "title": "  Panduan bahasa pelayanan ",
        "excerpt": "Kalimat pendek dan salam pembuka.",
        "agent_id": lumi,
        "task_id": "bukan-id",
    }

    response = await member.post(PROPOSALS, json=body)
    assert response.status_code == 201, response.text
    proposal = response.json()["data"]
    assert proposal["title"] == "Panduan bahasa pelayanan" and proposal["agent_name"] == "Lumi"
    assert proposal["task_id"] is None and proposal["proposed_by_name"] == "A Member"
    assert (await member.post(PROPOSALS, json=body)).status_code == 409
    assert (await member.post(PROPOSALS, json={"url": "javascript:alert(1)"})).status_code == 422
    assert (await viewer.post(PROPOSALS, json=body)).status_code == 403

    listed = (await admin.get(PROPOSALS, params={"status": "pending"})).json()
    assert [p["id"] for p in listed["data"]] == [proposal["id"]]
    assert listed["summary"] == {"pending": 1, "approved": 0, "rejected": 0}
    assert (await outsider.get(PROPOSALS)).json()["data"] == []
    # Organisasi lain tidak melihat usulan ini sama sekali
    assert (await outsider.post(f"{PROPOSALS}/{proposal['id']}/setujui")).status_code == 404
    assert (await member.post(f"{PROPOSALS}/{proposal['id']}/setujui")).status_code == 403

    response = await admin.post(f"{PROPOSALS}/{proposal['id']}/setujui")
    assert response.status_code == 200, response.text
    approved = response.json()["data"]
    assert approved["status"] == "approved" and approved["decided_by_name"] == "A Admin"
    assert len(queued_versions) == 1
    document = (await admin.get(f"{BASE}/{approved['document_id']}")).json()["data"]
    assert document["category"] == "web" and document["source_url"] == body["url"]
    assert document["scope"] == "organization"
    assert (await admin.post(f"{PROPOSALS}/{proposal['id']}/tolak")).status_code == 409

    # Alamat yang sama boleh diusulkan lagi setelah diputuskan, lalu ditolak
    again = (await member.post(PROPOSALS, json=body)).json()["data"]
    response = await admin.post(f"{PROPOSALS}/{again['id']}/tolak")
    assert response.json()["data"]["status"] == "rejected"


async def test_free_search_comes_first_and_gemini_is_the_fallback(
    world, sign_in, database, monkeypatch
):
    client = await sign_in("a_admin")
    [lumi] = await add_agents(world, "a", "Lumi")
    await allow_web(client, lumi)
    monkeypatch.setattr(settings, "WEB_SEARCH_FREE", True)
    queries: list[str] = []
    found = [
        {
            "title": "Panduan naskah",
            "url": "https://gratis.test/panduan",
            "domain": "gratis.test",
            "snippet": "Susunan surat.",
        }
    ]

    async def fake(query: str):
        queries.append(query)
        return ("yahoo", found) if len(queries) == 1 else ("", [])

    monkeypatch.setattr(free, "search", fake)
    brief = {"brief": "Format surat undangan terbaru untuk Pak Budi, 081234567890"}

    first = (await client.post(f"{ROLE}/{lumi}/trial", json=brief)).json()["data"]
    second = (await client.post(f"{ROLE}/{lumi}/trial", json=brief)).json()["data"]

    assert [s["domain"] for s in first["web_sources"]] == ["gratis.test"]
    assert second["web_sources"][0]["domain"] == "pustaka-terbuka.test"
    # Nama dan nomor tidak ikut terkirim ke mesin pencari
    # Nama role (Lumi) juga disembunyikan dari jabatannya
    assert queries[0] == "Format surat undangan terbaru untuk Jabatan"
    async with database() as session:
        calls = await session.execute(
            select(LlmCall.provider, LlmCall.cost)
            .where(LlmCall.kind == "web_search")
            .order_by(LlmCall.created_at)
        )
        calls = calls.all()
    assert [provider for provider, _ in calls] == ["ddgs", "mock"]
    assert calls[0].cost == 0
