"""Kantor, dashboard, serta akibat tugas pada role dan dokumen (kontrak 4, 5, 9, 10)."""

import uuid

from sqlalchemy import update

from app.models import Agent, TaskStep
from app.services.engine.execution import Providers, advance
from app.services.llm.embedding import MockEmbedding
from tests.integration.tasks import (
    TASKS,
    ScriptedLlm,
    add_document,
    create_task,
    detail,
    relate,
    review,
    run,
    work,
)
from tests.integration.world import add_agents

OFFICE = "/api/v1/admin/kantor/state"
DASHBOARD = "/api/v1/admin/dashboard/summary"
ROLE = "/api/v1/admin/role"


async def office_agents(client) -> dict:
    response = await client.get(OFFICE)
    assert response.status_code == 200, response.text
    return {a["name"]: a for a in response.json()["data"]["agents"]}


async def test_office_dashboard_and_history(world, sign_in, database, queued_versions):
    """Satu tugas diikuti dari antre sampai selesai, dilihat dari kantor dan dashboard."""
    client = await sign_in("a_owner")
    viewer = await sign_in("a_viewer")
    rani, tegar, dina = await add_agents(world, "a", "Rani", "Tegar", "Dina")
    async with world.sessions() as session:
        await session.execute(
            update(Agent).where(Agent.id == uuid.UUID(rani)).values(unit_id=world.units["a"].id)
        )
        await session.execute(
            update(Agent).where(Agent.id == uuid.UUID(dina)).values(status="paused")
        )
        await session.commit()
    document = await add_document(client, database, queued_versions)
    await relate(world, rani, "review", tegar)
    await relate(world, tegar, "escalate", world.member_id("a_owner"))
    task_id = await create_task(client, rani)

    agents = await office_agents(viewer)
    assert (agents["Rani"]["activity"], agents["Rani"]["task_title"]) == (
        "incoming",
        "Undangan rapat koordinasi",
    )
    assert (agents["Tegar"]["activity"], agents["Dina"]["activity"]) == ("idle", "paused")

    # Satu putaran mengerjakan langkah Rani, satu lagi menambah pemeriksaan
    llm = ScriptedLlm(work(), review("approved"))
    providers = Providers(llm, MockEmbedding())
    assert await advance(database, uuid.UUID(task_id), providers)
    assert await advance(database, uuid.UUID(task_id), providers)
    state = (await client.get(OFFICE)).json()["data"]
    agents = {a["name"]: a for a in state["agents"]}
    assert agents["Tegar"]["activity"] == "incoming"
    assert agents["Rani"]["tasks_today"] == 1
    assert state["transfers"] == [
        {
            "task_id": task_id,
            "from_agent_id": rani,
            "to_agent_id": tegar,
            "relation_type": "review",
        }
    ]
    (unit,) = state["units"]
    assert (unit["name"], unit["active_task_count"], unit["document_count"]) == (
        "Sekretariat",
        1,
        0,
    )

    async with world.sessions() as session:
        await session.execute(
            update(TaskStep)
            .where(TaskStep.agent_id == uuid.UUID(tegar))
            .values(status="running", claimed_at=None)
        )
        await session.commit()
    assert (await office_agents(client))["Tegar"]["activity"] == "reviewing"
    await run(database, task_id, llm)

    agents = await office_agents(client)
    assert (agents["Tegar"]["activity"], agents["Rani"]["activity"]) == ("waiting", "idle")

    summary = (await client.get(DASHBOARD)).json()["data"]
    assert summary["tasks"]["waiting_approval"] == 1
    assert (summary["agents"]["active"], summary["agents"]["paused"]) == (2, 1)
    assert summary["pending_approval_count"] == 1
    assert (summary["budget"]["task_count"], summary["budget"]["limit"]) == (1, 100_000)
    assert len(summary["daily_costs"]) == 7
    assert summary["daily_costs"][-1]["cost"] == summary["budget"]["used"] > 0
    assert [(b["agent"]["name"], b["step_count"]) for b in summary["busiest_agents"]] in (
        [("Rani", 1), ("Tegar", 1)],
        [("Tegar", 1), ("Rani", 1)],
    )
    assert (await viewer.get(DASHBOARD)).json()["data"]["pending_approval_count"] == 0

    stranger = await sign_in("b_owner")
    other = (await stranger.get(DASHBOARD)).json()["data"]
    assert other["budget"]["used"] == 0 and other["busiest_agents"] == []
    assert other["tasks"]["waiting_approval"] == 0
    assert (await stranger.get(OFFICE)).json()["data"]["agents"] == []

    # Role yang masih terlibat tidak bisa dihapus
    listed = {r["name"]: r for r in (await client.get(f"{ROLE}/read")).json()["data"]}
    assert (listed["Rani"]["task_count"], listed["Dina"]["task_count"]) == (1, 0)
    refused = await client.delete(f"{ROLE}/delete/{tegar}")
    assert refused.status_code == 409
    assert refused.json()["message"].startswith("Role masih terlibat dalam tugas")

    assert (await client.post(f"{TASKS}/{task_id}/cancel")).status_code == 200
    assert (await client.delete(f"{ROLE}/delete/{tegar}")).status_code == 200
    removed = await client.delete(f"/api/v1/admin/pengetahuan/delete/{document}")
    assert removed.json()["message"] == (
        "Dokumen dihapus. Isinya tetap bisa dibuka dari rujukan tugas."
    )

    # Riwayat tetap utuh
    task = await detail(client, task_id)
    assert [p["name"] for p in task["participants"]] == ["Rani", "Tegar"]
    assert task["steps"][0]["citations"][0]["document_id"] == document
    opened = await client.get(f"/api/v1/admin/pengetahuan/{document}")
    assert opened.status_code == 200 and opened.json()["data"]["archived_at"]
    busiest = (await client.get(DASHBOARD)).json()["data"]["busiest_agents"]
    assert [b["agent"]["name"] for b in busiest] == ["Rani"]
