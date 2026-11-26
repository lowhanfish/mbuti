"""
Ujung ke ujung: data contoh "Penyusun Surat → Pemeriksa Surat → Persetujuan Kepala", dari
masuk sampai tugas selesai, beserta jejak auditnya.
"""

import uuid

import pytest

from app.api.deps import CurrentMember
from app.services.knowledge.ingest import ingest_version
from app.services.llm.embedding import MockEmbedding
from app.services.sample import SampleExists, seed
from tests.integration.tasks import (
    TASKS,
    ScriptedLlm,
    decide,
    detail,
    pending,
    review,
    run,
    shape,
    work,
)

AUDIT = "/api/v1/admin/audit/read"


async def test_letter_flow_from_sample_data(world, sign_in, database, queued_versions):
    actor = CurrentMember(user=world.users["a_owner"], membership=world.members["a_owner"])
    made = await seed(database, actor)
    await ingest_version(database, uuid.UUID(queued_versions.pop()), MockEmbedding())
    with pytest.raises(SampleExists):
        await seed(database, actor)
    client = await sign_in("a_owner")

    created = await client.post(
        f"{TASKS}/create",
        json={
            "title": "Undangan rapat koordinasi",
            "brief": "Rapat Senin pukul 09.00 di ruang rapat utama.",
            "entry_agent_id": made["writer"],
            "inputs": {"perihal": "Rapat koordinasi"},
            "budget_limit": 50_000,
        },
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["data"]["id"]
    llm = ScriptedLlm(
        work("Draf pertama [1]."),
        review("revise", "Nomor surat belum ada [1]."),
        work("Draf bernomor [1]."),
        review("approved"),
    )
    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "waiting_approval", task["events"]
    assert shape(task) == [
        ("Rani", "work", "revise_requested"),
        ("Tegar", "review", "done"),
        ("Rani", "work", "done"),
        ("Tegar", "review", "done"),
    ]
    assert task["steps"][0]["citations"][0]["document_id"] == made["document"]
    (approval,) = pending(task)
    assert approval["question"] == "Setujui surat sebelum ditandatangani dan dikirim."
    assert (await decide(client, approval["id"], "approved")).status_code == 200
    await run(database, task_id, llm)
    assert (await detail(client, task_id))["status"] == "completed"

    log = (await client.get(AUDIT)).json()
    entries = [(e["action"], e["target"], e["actor_email"]) for e in reversed(log["data"])]
    assert entries == [
        ("auth.masuk", "", "a_owner@uji.test"),
        ("tugas.buat", "Undangan rapat koordinasi", "a_owner@uji.test"),
        (
            "persetujuan.putuskan",
            "Undangan rapat koordinasi (disetujui)",
            "a_owner@uji.test",
        ),
    ]
    assert log["data"][0]["label"] == "Memutuskan persetujuan"
    assert log["data"][0]["request_id"]
