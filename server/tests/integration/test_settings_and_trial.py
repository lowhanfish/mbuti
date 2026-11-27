"""Pengaturan model dan biaya (kontrak bagian 11) serta uji coba role (bagian 4)."""

import uuid

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import LlmCall
from app.services.llm.generation import Generation, ModelFailed, ModelUnavailable
from tests.integration.world import add_agents

SETTINGS = "/api/v1/admin/pengaturan"
ROLE = "/api/v1/admin/role"
BUDGET = {
    "monthly_budget": 100_000,
    "default_task_budget": 15_000,
    "max_steps_per_task": 20,
    "max_revisions": 3,
}
TRIAL_KEYS = {
    "simulated",
    "status",
    "output",
    "notes",
    "prompt_preview",
    "missing_inputs",
    "citations",
    "cost",
    "model",
    "attachments",
    "findings",
    "web_sources",
}


class FakeLlm:
    """Menjawab menurut daftar perilaku per panggilan."""

    name = "fake"

    def __init__(self, *behaviours):
        self.behaviours = list(behaviours)
        self.models: list[str] = []
        self.prompts: list[tuple[str, str]] = []

    async def generate(self, model, system, user, schema):
        self.models.append(model)
        self.prompts.append((system, user))
        behaviour = self.behaviours.pop(0)
        if isinstance(behaviour, Exception):
            raise behaviour
        return Generation(behaviour, 1000, 500)


def answer(**changes):
    return {"status": "done", "output": "Sesuai [2].", "sources": [2], "notes": "", **changes}


@pytest.fixture
def use_llm(monkeypatch):
    def install(llm):
        monkeypatch.setattr("app.api.v1.endpoints.admin.role.service.get_llm_provider", lambda: llm)
        return llm

    return install


@pytest.fixture
async def library(world, sign_in, database, queued_versions):
    """Role Rani beserta satu dokumen yang sudah diolah."""
    from app.services.knowledge.ingest import ingest_version
    from app.services.llm.embedding import MockEmbedding

    client = await sign_in("a_owner")
    (rani,) = await add_agents(world, "a", "Rani")
    content = (
        b"# Undangan\nSurat undangan rapat dikirim tiga hari sebelumnya.\n"
        b"# Nomor\nNomor surat undangan memuat kode unit."
    )
    response = await client.post(
        "/api/v1/admin/pengetahuan/create",
        data={"scope": "organization"},
        files={"file": ("pedoman.md", content, "text/markdown")},
    )
    assert response.status_code == 201, response.text
    await ingest_version(database, uuid.UUID(queued_versions.pop()), MockEmbedding())
    return client, rani


async def calls(world):
    async with world.sessions() as session:
        return list(await session.scalars(select(LlmCall).order_by(LlmCall.created_at)))


async def test_defaults_and_updates(world, sign_in):
    owner = await sign_in("a_owner")
    member = await sign_in("a_member")

    models = (await member.get(f"{SETTINGS}/model-ai")).json()["data"]
    budget = (await member.get(f"{SETTINGS}/batas-biaya")).json()["data"]
    assert [p["slot"] for p in models["profiles"]] == ["fast", "balanced", "thorough", "fallback"]
    assert models["api_keys"] == []
    assert {k: budget[k] for k in BUDGET} == BUDGET
    assert budget["usage"] == {
        "month": budget["usage"]["month"],
        "used": 0,
        "trial_cost": 0,
        "remaining": 100_000,
        "task_count": 0,
    }

    chosen = {p["slot"]: "gemini-2.5-flash-lite" for p in models["profiles"]}
    saved = await owner.put(f"{SETTINGS}/model-ai/update", json={"models": chosen})
    assert saved.status_code == 200, saved.text
    assert {p["model"] for p in saved.json()["data"]["profiles"]} == {"gemini-2.5-flash-lite"}
    unknown = await owner.put(
        f"{SETTINGS}/model-ai/update", json={"models": {**chosen, "fast": "model-asing"}}
    )
    assert unknown.status_code == 422

    updated = await owner.put(f"{SETTINGS}/batas-biaya/update", json={**BUDGET, "max_revisions": 0})
    assert updated.json()["data"]["max_revisions"] == 0
    graph = (await member.get("/api/v1/admin/relasi/graph")).json()["data"]
    assert graph["revision_limit"] == 0
    # Menyimpan biaya tidak menghapus pilihan model
    after = (await owner.get(f"{SETTINGS}/model-ai")).json()["data"]
    assert after["profiles"][0]["model"] == "gemini-2.5-flash-lite"

    for body in (BUDGET, {"models": chosen}):
        path = "batas-biaya" if "monthly_budget" in body else "model-ai"
        assert (await member.put(f"{SETTINGS}/{path}/update", json=body)).status_code == 403


async def test_budget_validation(sign_in):
    client = await sign_in("a_owner")
    cases = [
        ({"monthly_budget": 999}, "Batas bulanan antara Rp1.000 dan Rp100.000.000."),
        ({"monthly_budget": 5000}, "Batas bawaan per tugas tidak boleh melebihi batas bulanan."),
        ({"max_steps_per_task": 0}, "Batas langkah antara 1 dan 50."),
        ({"max_revisions": 6}, "Batas revisi antara 0 dan 5."),
    ]
    for change, message in cases:
        response = await client.put(f"{SETTINGS}/batas-biaya/update", json={**BUDGET, **change})
        assert (response.status_code, response.json()["message"]) == (422, message)
    text = await client.put(
        f"{SETTINGS}/batas-biaya/update", json={**BUDGET, "monthly_budget": "100000"}
    )
    assert text.status_code == 422


async def test_trial_cites_documents_and_records_cost(world, library, use_llm):
    client, rani = library
    llm = use_llm(FakeLlm(answer()))

    response = await client.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan rapat"})

    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert set(result) == TRIAL_KEYS
    assert (result["status"], result["simulated"], result["output"]) == (
        "done",
        False,
        "Sesuai [1].",
    )
    assert len(result["citations"]) == 1 and result["citations"][0]["document_title"] == "pedoman"
    assert llm.models == [settings.LLM_MODEL_BALANCED]
    assert "Anda adalah Rani" in llm.prompts[0][0] and '<dokumen nomor="2">' in llm.prompts[0][1]

    (call,) = await calls(world)
    assert (call.kind, call.status, call.input_tokens, call.cost) == (
        "trial",
        "ok",
        1000,
        result["cost"],
    )
    usage = (await client.get(f"{SETTINGS}/batas-biaya")).json()["data"]["usage"]
    assert usage["used"] == usage["trial_cost"] == result["cost"] > 0


async def test_trial_uses_fallback_when_model_is_unavailable(world, library, use_llm):
    client, rani = library
    llm = use_llm(FakeLlm(ModelUnavailable("sibuk"), answer(status="not_in_documents")))

    result = (await client.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan"})).json()["data"]

    assert llm.models == [settings.LLM_MODEL_BALANCED, settings.LLM_FALLBACK_MODEL]
    assert len(set(llm.models)) == 2
    assert (result["status"], result["model"]) == ("not_in_documents", llm.models[1])
    assert [c.status for c in await calls(world)] == ["error", "ok"]


async def test_trial_reports_model_failures(world, library, use_llm):
    client, rani = library
    use_llm(FakeLlm(ModelUnavailable("a"), ModelUnavailable("b")))
    unavailable = await client.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan"})
    use_llm(FakeLlm(ModelFailed("Jawaban model tidak bisa dibaca.", 100, 10)))
    unreadable = await client.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan"})

    assert (unavailable.status_code, unreadable.status_code) == (503, 502)
    assert unreadable.json()["message"] == "Jawaban model tidak bisa dibaca."
    # Token yang sudah terpakai tetap dihitung
    assert (await calls(world))[-1].cost > 0


async def test_trial_without_model_call(world, library, use_llm):
    client, rani = library
    llm = use_llm(FakeLlm())
    await client.put(
        f"{ROLE}/update/{rani}",
        json={"input_spec": [{"label": "Tujuan", "required": True}]},
    )

    missing = (await client.post(f"{ROLE}/{rani}/trial", json={})).json()["data"]
    (empty_role,) = await add_agents(world, "b", "Kosong")
    outsider = await client.post(f"{ROLE}/{empty_role}/trial", json={})

    assert (missing["status"], missing["missing_inputs"], missing["cost"]) == (
        "need_info",
        ["Tujuan"],
        0,
    )
    assert outsider.status_code == 404
    assert llm.models == [] and await calls(world) == []


async def test_role_without_documents_does_not_call_model(world, sign_in, use_llm):
    client = await sign_in("a_member")
    (rani,) = await add_agents(world, "a", "Rani")
    llm = use_llm(FakeLlm())

    result = (await client.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan"})).json()["data"]

    assert (result["status"], result["model"], llm.models) == ("not_in_documents", "", [])


async def test_trial_blocked_for_viewer_and_empty_budget(world, library, use_llm, sign_in):
    client, rani = library
    use_llm(FakeLlm(answer()))
    viewer = await sign_in("a_viewer")
    refused = await viewer.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan"})
    assert (refused.status_code, refused.json()["message"]) == (
        403,
        "Pemantau tidak dapat menjalankan uji coba.",
    )

    await client.put(
        f"{SETTINGS}/batas-biaya/update",
        json={**BUDGET, "monthly_budget": 1_000, "default_task_budget": 500},
    )
    first = await client.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan"})
    assert first.status_code == 200
    async with world.sessions() as session:
        session.add(
            LlmCall(
                organization_id=world.organizations["a"].id,
                kind="trial",
                provider="fake",
                model="x",
                cost=1_000,
                status="ok",
            )
        )
        await session.commit()
    blocked = await client.post(f"{ROLE}/{rani}/trial", json={"brief": "undangan"})
    assert blocked.status_code == 409 and "Anggaran" in blocked.json()["message"]
