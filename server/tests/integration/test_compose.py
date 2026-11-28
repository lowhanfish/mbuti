"""Mode penyusunan: isian wajib, bagian buatan, persetujuan, dan berkas laporan (kontrak 20)."""

import uuid

import pytest
from sqlalchemy import update

from app.models import Agent
from app.services.letters import documents, render
from app.services.llm.embedding import get_embedding_provider
from app.services.llm.generation import MockLlm, get_llm_provider
from tests.integration.tasks import (
    TASKS,
    ScriptedLlm,
    create_task,
    decide,
    detail,
    events,
    pending,
    relate,
    review,
    run,
    work,
)
from tests.integration.world import add_agents

REPORT = {
    "report_type": "Laporan",
    "title": "Laporan Jaringan Bulanan",
    "blocks": [{"type": "paragraph", "text": "Gangguan tercatat 3 kali (contoh)."}],
}
COMPOSED = [{"part": "Jumlah gangguan", "note": "angka contoh"}]
BRIEF = {"title": "Laporan jaringan", "brief": "Susun laporan jaringan bulanan."}
SPEC = [{"key": "periode", "label": "Periode", "type": "text", "required": True}]


@pytest.fixture(autouse=True)
def without_pdf(monkeypatch):
    """LibreOffice diuji di tes unit."""
    monkeypatch.setattr(render, "to_pdf", lambda _: None)


async def set_role(database, agent_id: str, **values) -> None:
    async with database() as session:
        await session.execute(update(Agent).where(Agent.id == uuid.UUID(agent_id)).values(**values))
        await session.commit()


async def finish(database, task_id: str) -> None:
    await documents.finalize(
        database, uuid.UUID(task_id), get_llm_provider(), get_embedding_provider()
    )


async def test_free_composition_waits_for_a_human(world, sign_in, database):
    client = await sign_in("a_owner")
    [maker, checker] = await add_agents(world, "a", "Rani", "Tegar")
    await set_role(database, maker, compose_mode="free", input_spec=SPEC)
    await relate(world, maker, "review", checker)
    llm = ScriptedLlm(
        work("Laporan disusun.", sources=[], report=REPORT, composed=COMPOSED),
        review("approved"),
    )

    # Isian wajib hanya diminta bila mode yang berlaku bukan Susun bebas
    strict = await client.post(
        f"{TASKS}/create",
        json={**BRIEF, "entry_agent_id": maker, "budget_limit": 50_000, "compose_mode": "data"},
    )
    assert strict.status_code == 422, strict.text
    task_id = await create_task(client, maker, **BRIEF)
    await run(database, task_id, llm)
    await finish(database, task_id)

    task = await detail(client, task_id)
    assert (task["status"], task["compose_mode"]) == ("waiting_approval", "role")
    assert (task["steps"][0]["compose_mode"], task["steps"][0]["composed"]) == ("free", COMPOSED)
    assert task["steps"][1]["compose_mode"] is None
    assert "mode Susun bebas, 1 bagian disusun sendiri" in events(task, "step_done")[0]
    # Model wajib selesai, tanpa surat; pemeriksa tahu mode dan daftar buatan pembuat
    properties = llm.calls[0][3]["properties"]
    assert properties["status"]["enum"] == ["done"] and "letter" not in properties
    assert "Jumlah gangguan: angka contoh" in llm.prompt(1)
    assert "Gangguan tercatat 3 kali" in llm.prompt(1)
    assert "report" in llm.calls[0][3]["required"]
    [approval] = pending(task)
    assert approval["reason"] == "composed" and "Jumlah gangguan" in approval["question"]

    url = f"{TASKS}/{task_id}/berkas"
    [document] = (await client.get(url)).json()["data"]
    assert (document["kind"], document["report_type"]) == ("report", "Laporan")
    assert (document["composed"], document["pdf_url"]) == (COMPOSED, None)
    assert (await client.get(document["docx_url"])).status_code == 200
    assert (await client.post(f"{url}/{document['id']}/nomor")).status_code == 409

    assert (await decide(client, approval["id"], "approved")).status_code == 200
    await run(database, task_id, llm)
    task = await detail(client, task_id)
    assert (task["status"], pending(task)) == ("completed", [])


async def test_task_choice_lets_a_strict_role_complete_gaps(world, sign_in, database):
    client = await sign_in("a_owner")
    [maker] = await add_agents(world, "a", "Rani")

    task_id = await create_task(client, maker, **BRIEF, compose_mode="complete")
    await run(database, task_id, MockLlm())
    await finish(database, task_id)

    # Tanpa dokumen pun model dipanggil, dan Lengkapi tidak memerlukan persetujuan
    task = await detail(client, task_id)
    assert (task["status"], task["compose_mode"]) == ("completed", "complete")
    assert task["steps"][0]["composed"][0]["part"] == "Analisis"
    [document] = (await client.get(f"{TASKS}/{task_id}/berkas")).json()["data"]
    assert document["kind"] == "report" and document["composed"]
    assert any("[periode]" in c["text"] for c in document["checks"])


async def test_role_and_schedule_keep_their_mode(world, sign_in):
    client = await sign_in("a_owner")
    [maker] = await add_agents(world, "a", "Rani")

    saved = await client.put(
        f"/api/v1/admin/role/update/{maker}", json={"compose_mode": "complete"}
    )
    wrong = await client.put(f"/api/v1/admin/role/update/{maker}", json={"compose_mode": "x"})
    assert (saved.status_code, wrong.status_code) == (200, 422), saved.text
    assert saved.json()["data"]["compose_mode"] == "complete"
