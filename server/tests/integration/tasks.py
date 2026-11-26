"""Alat bersama untuk tes tugas: model yang jawabannya diatur, dokumen, relasi, dan mesin."""

import uuid

from app.models import AgentRelation
from app.services.engine.execution import Providers, advance
from app.services.knowledge.ingest import ingest_version
from app.services.llm.embedding import MockEmbedding
from app.services.llm.generation import Generation
from tests.integration.world import World

TASKS = "/api/v1/admin/tugas"
APPROVALS = "/api/v1/admin/persetujuan"
HANDBOOK = (
    b"# Undangan\nSurat undangan rapat dikirim tiga hari sebelumnya.\n"
    b"# Nomor\nNomor surat undangan memuat kode unit."
)


class ScriptedLlm:
    """Menjawab menurut daftar perilaku; tiap panggilan dicatat."""

    name = "fake"

    def __init__(self, *behaviours):
        self.behaviours = list(behaviours)
        self.calls: list[tuple[str, str, str, dict]] = []

    async def generate(self, model, system, user, schema):
        self.calls.append((model, system, user, schema))
        behaviour = self.behaviours.pop(0)
        if callable(behaviour):
            behaviour = await behaviour()
        if isinstance(behaviour, Exception):
            raise behaviour
        return Generation(behaviour, 1000, 500)

    def prompt(self, number: int) -> str:
        return self.calls[number][2]


def work(output="Draf sesuai [1].", **changes):
    return {"status": "done", "output": output, "sources": [1], "notes": "", **changes}


def review(verdict, output="Catatan pemeriksaan [1]."):
    return {**work(output), "verdict": verdict}


async def add_document(client, database, queued_versions) -> str:
    response = await client.post(
        "/api/v1/admin/pengetahuan/create",
        data={"scope": "organization"},
        files={"file": ("pedoman.md", HANDBOOK, "text/markdown")},
    )
    assert response.status_code == 201, response.text
    await ingest_version(database, uuid.UUID(queued_versions.pop()), MockEmbedding())
    return response.json()["data"]["id"]


async def relate(world: World, source: str, relation_type: str, target: str, **fields) -> str:
    """Relasi langsung ke database. `target` berupa ID role, atau ID anggota untuk eskalasi."""
    column = "target_member_id" if relation_type == "escalate" else "target_agent_id"
    relation = AgentRelation(
        id=uuid.uuid4(),
        organization_id=world.organizations["a"].id,
        source_agent_id=uuid.UUID(source),
        relation_type=relation_type,
        requires_approval=fields.pop("requires_approval", relation_type == "escalate"),
        **{column: uuid.UUID(target)},
        **fields,
    )
    async with world.sessions() as session:
        session.add(relation)
        await session.commit()
    return str(relation.id)


async def create_task(client, agent_id: str, **changes) -> str:
    body = {
        "title": "Undangan rapat koordinasi",
        "brief": "Susun surat undangan rapat.",
        "entry_agent_id": agent_id,
        "budget_limit": 50_000,
        **changes,
    }
    response = await client.post(f"{TASKS}/create", json=body)
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


async def run(database, task_id: str, llm: ScriptedLlm, limit: int = 30) -> None:
    """Jalankan mesin sampai tugas tidak punya pekerjaan lagi."""
    providers = Providers(llm, MockEmbedding())
    for _ in range(limit):
        if not await advance(database, uuid.UUID(task_id), providers):
            return
    raise AssertionError("Tugas tidak berhenti.")


async def detail(client, task_id: str) -> dict:
    response = await client.get(f"{TASKS}/{task_id}")
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def decide(client, approval_id: str, decision: str, comment: str = ""):
    return await client.post(
        f"{APPROVALS}/{approval_id}/decide", json={"decision": decision, "comment": comment}
    )


def pending(task: dict) -> list[dict]:
    return [a for a in task["approvals"] if a["status"] == "pending"]


def shape(task: dict) -> list[tuple[str, str, str]]:
    return [(s["agent"]["name"], s["kind"], s["status"]) for s in task["steps"]]


def events(task: dict, kind: str) -> list[str]:
    return [e["message"] for e in task["events"] if e["type"] == kind]
