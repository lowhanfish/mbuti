"""Tugas lintas role: antrean, relasi, persetujuan, pengaman, dan hak akses (kontrak 7, 8, 12)."""

import datetime
import uuid

import pytest
from sqlalchemy import select, update

from app.models import Agent, LlmCall, Task, TaskStep
from app.services.engine import flow
from app.services.engine.execution import Providers, RetryLater, advance
from app.services.llm.embedding import MockEmbedding
from app.services.llm.generation import ModelFailed, ModelUnavailable
from tests.integration.tasks import (
    APPROVALS,
    TASKS,
    ScriptedLlm,
    add_document,
    create_task,
    decide,
    detail,
    events,
    pending,
    relate,
    review,
    run,
    shape,
    work,
)
from tests.integration.world import add_agents

STALE = datetime.timedelta(minutes=11)
ITEM_KEYS = {
    "id",
    "title",
    "brief",
    "entry_agent",
    "participants",
    "status",
    "priority",
    "due_at",
    "budget_limit",
    "cost_used",
    "step_count",
    "steps_done",
    "pending_approval_count",
    "created_by_name",
    "created_at",
    "updated_at",
    "completed_at",
}
APPROVAL_KEYS = {
    "id",
    "task_id",
    "task_title",
    "step_id",
    "reason",
    "question",
    "requested_from_id",
    "requested_from_name",
    "status",
    "comment",
    "decided_by_name",
    "decided_at",
    "created_at",
    "last_output",
    "last_agent",
}


@pytest.fixture
async def office(world, sign_in, database, queued_versions):
    """Klien pemilik, role Rani dan Tegar, dan satu dokumen organisasi."""
    client = await sign_in("a_owner")
    rani, tegar = await add_agents(world, "a", "Rani", "Tegar")
    document = await add_document(client, database, queued_versions)
    return {"client": client, "rani": rani, "tegar": tegar, "document": document}


async def set_agent(world, agent_id: str, **values) -> None:
    async with world.sessions() as session:
        await session.execute(update(Agent).where(Agent.id == uuid.UUID(agent_id)).values(**values))
        await session.commit()


async def test_create_validation_and_list(world, sign_in, queued_tasks):
    owner = await sign_in("a_owner")
    viewer = await sign_in("a_viewer")
    rani, dina = await add_agents(world, "a", "Rani", "Dina")
    await set_agent(
        world,
        rani,
        input_spec=[
            {"key": "tujuan", "label": "Tujuan surat", "type": "text", "required": True},
            {"key": "catatan", "label": "Catatan", "type": "text", "required": False},
        ],
    )
    await set_agent(world, dina, status="paused")
    body = {
        "title": "Undangan rapat",
        "entry_agent_id": rani,
        "inputs": {"tujuan": "Para lurah", "asing": "diabaikan"},
        "budget_limit": 5000,
        "due_at": "2027-01-15",
    }

    assert (await viewer.post(f"{TASKS}/create", json=body)).status_code == 403
    cases = [
        ({"title": "Rapa"}, "Judul tugas minimal 5 karakter."),
        ({"entry_agent_id": str(uuid.uuid4())}, "Pilih role yang akan mengerjakan."),
        (
            {"entry_agent_id": dina},
            "Dina sedang dijeda. Aktifkan role terlebih dahulu.",
        ),
        ({"inputs": {}}, "Lengkapi isian wajib: Tujuan surat."),
        ({"budget_limit": 499}, "Batas biaya antara Rp500 dan Rp1.000.000."),
        ({"budget_limit": 600_000}, "Batas biaya tugas melebihi batas bulanan organisasi."),
    ]
    for change, message in cases:
        response = await owner.post(f"{TASKS}/create", json={**body, **change})
        assert (response.status_code, response.json()["message"]) == (422, message)
    assert queued_tasks == []

    response = await owner.post(f"{TASKS}/create", json=body)
    assert response.status_code == 201, response.text
    assert response.json()["message"] == "Tugas dibuat dan masuk antrean."
    item = response.json()["data"]
    assert set(item) == ITEM_KEYS
    assert (item["status"], item["priority"], item["step_count"]) == ("queued", "normal", 1)
    # Akhir hari menurut zona organisasi (Asia/Makassar)
    assert item["due_at"].startswith(("2027-01-15T23:59:59+08:00", "2027-01-15T15:59:59"))
    assert queued_tasks == [item["id"]]

    task = await detail(owner, item["id"])
    assert task["inputs"] == [{"label": "Tujuan surat", "value": "Para lurah"}]
    assert shape(task) == [("Rani", "work", "queued")]
    assert events(task, "created") == ["Tugas dibuat oleh A Owner untuk Rani."]

    listed = (await viewer.get(f"{TASKS}/read", params={"status": "active"})).json()
    assert (listed["total"], listed["summary"]["queued"], listed["limit"]) == (1, 1, 50)
    for params, total in (
        ({"search": "undangan"}, 1),
        ({"search": "anggaran"}, 0),
        ({"status": "done"}, 0),
        ({"agent_id": rani}, 1),
        ({"agent_id": dina}, 0),
        ({"agent_id": "bukan-id"}, 0),
    ):
        found = (await owner.get(f"{TASKS}/read", params=params)).json()
        assert found["total"] == total, params

    stranger = await sign_in("b_owner")
    assert (await stranger.get(f"{TASKS}/{item['id']}")).status_code == 404
    assert (await stranger.post(f"{TASKS}/{item['id']}/cancel")).status_code == 404
    assert (await stranger.get(f"{TASKS}/read")).json()["total"] == 0
    foreign = await stranger.post(f"{TASKS}/create", json=body)
    assert foreign.status_code == 422


async def test_review_asks_revision_then_accepts(world, database, office):
    client = office["client"]
    await relate(world, office["rani"], "review", office["tegar"])
    task_id = await create_task(client, office["rani"])
    llm = ScriptedLlm(
        work("Draf pertama [1]."),
        review("revise", "Nomor surat belum ada [1]."),
        work("Draf kedua [1]."),
        review("approved"),
    )

    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "completed", task["events"]
    assert shape(task) == [
        ("Rani", "work", "revise_requested"),
        ("Tegar", "review", "done"),
        ("Rani", "work", "done"),
        ("Tegar", "review", "done"),
    ]
    assert [s["verdict"] for s in task["steps"]] == [None, "revise", None, "approved"]
    assert [s["attempt_no"] for s in task["steps"]] == [1, 1, 2, 1]
    assert task["steps"][1]["via_relation_type"] == "review"
    assert "Draf pertama" in llm.prompt(1)
    # Ulangan melihat hasil sebelumnya dan temuan pemeriksa
    assert "Draf pertama" in llm.prompt(2) and "Nomor surat belum ada" in llm.prompt(2)
    citation = task["steps"][0]["citations"][0]
    assert citation["document_id"] == office["document"] and citation["version_no"] == 1
    assert events(task, "review_revise") == ["Tegar meminta revisi (putaran 1 dari maks 2)."]
    assert events(task, "review_approved") == ["Tegar menerima hasil Rani."]
    assert events(task, "completed") == ["Tugas selesai."]
    async with world.sessions() as session:
        calls = list(await session.scalars(select(LlmCall)))
    assert {c.kind for c in calls} == {"step"} and {str(c.task_id) for c in calls} == {task_id}
    assert task["cost_used"] == sum(c.cost for c in calls) == sum(s["cost"] for s in task["steps"])
    assert task["cost_used"] > 0 and task["completed_at"]


async def test_revision_limit_goes_to_a_human(world, sign_in, database, office):
    client = office["client"]
    member = await sign_in("a_member")
    viewer = await sign_in("a_viewer")
    await relate(world, office["rani"], "review", office["tegar"], max_revisions=1)
    task_id = await create_task(client, office["rani"])
    llm = ScriptedLlm(work(), review("revise"), work(), review("revise"))

    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "waiting_approval"
    (approval,) = pending(task)
    assert set(approval) == APPROVAL_KEYS
    assert approval["reason"] == "max_revisions"
    assert approval["question"].startswith("Batas 1× revisi antara Rani dan Tegar habis.")
    assert approval["last_agent"]["name"] == "Tegar"
    assert approval["requested_from_name"] == "A Owner"

    mine = (await client.get(f"{APPROVALS}/read")).json()
    assert (mine["total"], mine["pending_count"]) == (1, 1)
    for other in (member, viewer):
        listed = (await other.get(f"{APPROVALS}/read")).json()
        assert (listed["total"], listed["pending_count"]) == (0, 0)
        refused = await decide(other, approval["id"], "approved")
        assert refused.json()["message"] == "Permintaan ini ditujukan kepada orang lain."
    stranger = await sign_in("b_owner")
    assert (await decide(stranger, approval["id"], "approved")).status_code == 404
    short = await decide(client, approval["id"], "revise", "ya")
    assert short.status_code == 422

    saved = await decide(client, approval["id"], "approved")
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["decided_by_name"] == "A Owner"
    again = await decide(client, approval["id"], "approved")
    assert (again.status_code, again.json()["message"]) == (409, "Permintaan ini sudah diputuskan.")
    await run(database, task_id, ScriptedLlm())

    task = await detail(client, task_id)
    assert task["status"] == "completed"
    history = (await client.get(f"{APPROVALS}/read", params={"status": "decided"})).json()
    assert (history["total"], history["pending_count"]) == (1, 0)


async def test_gated_handoff_with_revision_request(world, sign_in, database, office, queued_tasks):
    client = office["client"]
    member = await sign_in("a_member")
    # Penanggung jawab role sumber yang diminta izin
    await set_agent(world, office["rani"], owner_member_id=world.members["a_member"].id)
    await relate(
        world,
        office["rani"],
        "handoff",
        office["tegar"],
        requires_approval=True,
        label="Teruskan",
    )
    task_id = await create_task(client, office["rani"])
    llm = ScriptedLlm(work("Draf awal [1]."), work("Draf rapi [1]."), work("Tanda tangan [1]."))
    await run(database, task_id, llm)

    (approval,) = pending(await detail(client, task_id))
    assert approval["question"] == 'Boleh lanjut "Teruskan" ke Tegar?'
    assert approval["requested_from_id"] == world.member_id("a_member")
    queued_tasks.clear()
    response = await decide(member, approval["id"], "revise", "Tambahkan tanggal rapat.")
    assert response.status_code == 200, response.text
    assert queued_tasks == [task_id]
    await run(database, task_id, llm)

    assert "Catatan A Member: Tambahkan tanggal rapat." in llm.prompt(1)
    (approval,) = pending(await detail(client, task_id))
    assert (await decide(member, approval["id"], "approved")).status_code == 200
    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "completed"
    assert shape(task) == [
        ("Rani", "work", "done"),
        ("Rani", "work", "done"),
        ("Tegar", "work", "done"),
    ]
    assert task["steps"][2]["via_relation_type"] == "handoff"
    assert "Draf rapi" in llm.prompt(2) and "Diserahkan oleh Rani" in llm.prompt(2)
    assert [p["name"] for p in task["participants"]] == ["Rani", "Tegar"]


async def test_rejection_follows_on_rejected_then_fails(world, database, office):
    client = office["client"]
    await relate(world, office["rani"], "escalate", world.member_id("a_owner"))
    await relate(
        world,
        office["rani"],
        "escalate",
        world.member_id("a_admin"),
        trigger="on_rejected",
        expected_output="Tentukan nasib surat yang ditolak.",
    )
    task_id = await create_task(client, office["rani"])
    llm = ScriptedLlm(work())
    await run(database, task_id, llm)
    (first,) = pending(await detail(client, task_id))
    assert first["requested_from_name"] == "A Owner"

    assert (await decide(client, first["id"], "rejected", "Belum layak.")).status_code == 200
    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "waiting_approval", task["events"]
    (second,) = pending(task)
    assert second["question"] == "Tentukan nasib surat yang ditolak."
    assert second["requested_from_name"] == "A Admin"

    # Penolakan kedua tidak memicu rute penolakan lagi
    assert (await decide(client, second["id"], "rejected", "Hentikan saja.")).status_code == 200
    task = await detail(client, task_id)
    assert task["status"] == "failed"
    assert events(task, "failed") == ["Tugas ditolak dan dihentikan."]
    assert pending(task) == []


async def test_consult_runs_first(world, database, office):
    client = office["client"]
    await relate(
        world, office["rani"], "consult", office["tegar"], expected_output="Cek aturan nomor."
    )
    task_id = await create_task(client, office["rani"])
    llm = ScriptedLlm(work("Saran: pakai kode unit [1]."), work("Draf [1]."))

    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "completed"
    assert [(s["agent"]["name"], s["kind"]) for s in task["steps"]] == [
        ("Rani", "work"),
        ("Tegar", "consult"),
    ]
    assert llm.calls[0][1].count("Tegar") and "Cek aturan nomor." in llm.prompt(0)
    assert "Masukan konsultasi dari Tegar" in llm.prompt(1)
    assert "pakai kode unit" in llm.prompt(1)


async def test_gated_consult_can_be_skipped_with_a_note(world, database, office):
    client = office["client"]
    await relate(world, office["rani"], "consult", office["tegar"], requires_approval=True)
    task_id = await create_task(client, office["rani"])
    llm = ScriptedLlm(work())
    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "waiting_approval" and llm.calls == []
    (approval,) = pending(task)
    assert approval["question"] == "Boleh Rani berkonsultasi dengan Tegar sebelum bekerja?"

    await decide(client, approval["id"], "revise", "Tidak perlu bertanya.")
    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "completed"
    assert shape(task) == [("Rani", "work", "done")]
    assert "Tidak perlu bertanya." in llm.prompt(0)


async def test_conditions_and_inactive_targets(world, database, office):
    client = office["client"]
    (sari,) = await add_agents(world, "a", "Sari")
    await relate(
        world,
        office["rani"],
        "handoff",
        office["tegar"],
        trigger="on_condition",
        condition="Nilai di atas Rp50 juta",
        label="Nilai besar",
    )
    await relate(world, office["rani"], "review", sari, label="Periksa")
    await set_agent(world, sari, status="paused")
    task_id = await create_task(client, office["rani"])
    llm = ScriptedLlm(work(), {"met": False, "reason": "Tidak ada nilai uang."})

    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "completed"
    assert shape(task) == [("Rani", "work", "done")]
    assert sorted(events(task, "relation_skipped")) == [
        'Kondisi tidak terpenuhi, relasi "Nilai besar" dilewati: Tidak ada nilai uang.',
        'Relasi "Periksa" dilewati: Sari tidak aktif.',
    ]
    async with world.sessions() as session:
        calls = list(await session.scalars(select(LlmCall).order_by(LlmCall.created_at)))
    assert [c.kind for c in calls] == ["step", "condition"]
    assert task["cost_used"] == sum(c.cost for c in calls)


async def test_missing_rules_go_to_a_human(world, sign_in, database):
    client = await sign_in("a_owner")
    (rani,) = await add_agents(world, "a", "Rani")
    # Bukan permintaan surat: surat tetap disusun walau belum ada aturannya (kontrak 18.1)
    task_id = await create_task(
        client, rani, title="Syarat cuti tahunan", brief="Jelaskan syarat cuti tahunan."
    )
    llm = ScriptedLlm()

    await run(database, task_id, llm)

    task = await detail(client, task_id)
    assert task["status"] == "waiting_approval" and llm.calls == []
    (approval,) = pending(task)
    assert approval["reason"] == "escalate"
    assert approval["question"].startswith("Rani tidak menemukan aturannya di dokumen.")
    await decide(client, approval["id"], "approved")
    await run(database, task_id, llm)
    assert (await detail(client, task_id))["status"] == "completed"


async def test_cancel(world, sign_in, database, office):
    owner = office["client"]
    member = await sign_in("a_member")
    await relate(world, office["rani"], "escalate", world.member_id("a_owner"))
    task_id = await create_task(owner, office["rani"])
    await run(database, task_id, ScriptedLlm(work()))

    refused = await member.post(f"{TASKS}/{task_id}/cancel")
    assert refused.status_code == 403
    response = await owner.post(f"{TASKS}/{task_id}/cancel")
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "cancelled"
    task = await detail(owner, task_id)
    assert [(a["status"], a["comment"]) for a in task["approvals"]] == [
        ("rejected", "Tugas dihentikan.")
    ]
    assert events(task, "cancelled") == ["Tugas dihentikan oleh A Owner."]
    assert (await owner.post(f"{TASKS}/{task_id}/cancel")).status_code == 409

    # Pembuat boleh menghentikan, juga saat model sedang menulis: hasil dibuang, biaya tercatat
    other = await create_task(member, office["rani"])

    async def stop_midway():
        stopped = await member.post(f"{TASKS}/{other}/cancel")
        assert stopped.status_code == 200, stopped.text
        return work("Tidak boleh tersimpan.")

    await run(database, other, ScriptedLlm(stop_midway))

    task = await detail(owner, other)
    assert task["status"] == "cancelled"
    assert shape(task) == [("Rani", "work", "skipped")]
    assert task["steps"][0]["output"] == "" and task["cost_used"] > 0


async def test_task_budget_and_step_limit(world, database, office):
    client = office["client"]
    await relate(world, office["rani"], "handoff", office["tegar"])
    cheap = await create_task(client, office["rani"], budget_limit=500)
    expensive = ScriptedLlm(work())
    # Biaya satu panggilan dibuat melebihi batas
    async with world.sessions() as session:
        await session.execute(update(Task).where(Task.id == uuid.UUID(cheap)).values(cost_used=500))
        await session.commit()
    await run(database, cheap, expensive)
    task = await detail(client, cheap)
    assert task["status"] == "stopped_budget"
    assert shape(task) == [("Rani", "work", "done")]

    limits = {
        "monthly_budget": 500_000,
        "default_task_budget": 15_000,
        "max_steps_per_task": 1,
        "max_revisions": 3,
    }
    saved = await client.put("/api/v1/admin/pengaturan/batas-biaya/update", json=limits)
    assert saved.status_code == 200, saved.text
    short = await create_task(client, office["rani"])
    await run(database, short, ScriptedLlm(work()))
    task = await detail(client, short)
    assert task["status"] == "failed"
    assert shape(task) == [("Rani", "work", "done"), ("Tegar", "work", "skipped")]
    assert events(task, "failed")[0].startswith("Batas 1 langkah tercapai.")


async def test_monthly_budget_stops_before_a_step(world, database, office):
    client = office["client"]
    task_id = await create_task(client, office["rani"], budget_limit=1000)
    async with world.sessions() as session:
        session.add(
            LlmCall(
                organization_id=world.organizations["a"].id,
                kind="trial",
                provider="fake",
                model="gemini-3.6-flash",
                cost=500_000,
                status="ok",
            )
        )
        await session.commit()

    await run(database, task_id, ScriptedLlm())

    task = await detail(client, task_id)
    assert task["status"] == "stopped_budget"
    assert shape(task) == [("Rani", "work", "skipped")]
    refused = await client.post(
        f"{TASKS}/create",
        json={"title": "Tugas lain", "entry_agent_id": office["rani"], "budget_limit": 1000},
    )
    assert refused.status_code == 409


async def test_model_trouble_retries_then_fails(world, database, office):
    client = office["client"]
    providers_down = ScriptedLlm(*[ModelUnavailable("habis")] * 4)
    task_id = await create_task(client, office["rani"])
    key = uuid.UUID(task_id)

    with pytest.raises(RetryLater) as waiting:
        await advance(database, key, Providers(providers_down, MockEmbedding()))
    assert waiting.value.seconds == 60
    task = await detail(client, task_id)
    assert shape(task) == [("Rani", "work", "queued")] and task["status"] == "running"

    # Percobaan keenam adalah yang terakhir
    async with world.sessions() as session:
        await session.execute(update(TaskStep).where(TaskStep.task_id == key).values(tries=5))
        await session.commit()
    await run(database, task_id, providers_down)
    task = await detail(client, task_id)
    assert task["status"] == "failed"
    assert shape(task) == [("Rani", "work", "failed")]
    assert events(task, "failed") == [
        "Rani gagal menyelesaikan langkah: Model AI sedang tidak tersedia. "
        "Coba lagi beberapa saat lagi."
    ]

    unreadable = ScriptedLlm(ModelFailed("Jawaban model tidak bisa dibaca."), work())
    second = await create_task(client, office["rani"])
    with pytest.raises(RetryLater):
        await advance(database, uuid.UUID(second), Providers(unreadable, MockEmbedding()))
    await run(database, second, unreadable)
    assert (await detail(client, second))["status"] == "completed"


async def test_abandoned_step_is_taken_again(world, database, office):
    client = office["client"]
    task_id = await create_task(client, office["rani"])
    key = uuid.UUID(task_id)
    async with world.sessions() as session:
        task = await flow.lock_task(session, key)
        task.status = "running"
        await session.execute(
            update(TaskStep)
            .where(TaskStep.task_id == key)
            .values(status="running", claimed_at=flow.utcnow())
        )
        await session.commit()

    # Masih dikerjakan worker lain
    await run(database, task_id, ScriptedLlm())
    assert shape(await detail(client, task_id)) == [("Rani", "work", "running")]

    async with world.sessions() as session:
        await session.execute(
            update(TaskStep).where(TaskStep.task_id == key).values(claimed_at=flow.utcnow() - STALE)
        )
        await session.commit()
    await run(database, task_id, ScriptedLlm(work()))
    assert (await detail(client, task_id))["status"] == "completed"
