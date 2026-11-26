"""Menjalankan relasi keluar sebuah role."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Agent, AgentRelation, Task, TaskStep
from app.services.engine import flow


async def outgoing(
    session: AsyncSession, agent_id: uuid.UUID, trigger: str, skip: uuid.UUID | None = None
) -> list[AgentRelation]:
    """
    Relasi keluar yang berlaku untuk pemicu `complete` atau `rejected`. Konsultasi tidak
    termasuk karena dijalankan sebelum role bekerja.
    """
    triggers = ("on_rejected",) if trigger == "rejected" else ("on_complete", "on_condition")
    query = (
        select(AgentRelation)
        .outerjoin(Agent, Agent.id == AgentRelation.target_agent_id)
        .where(
            AgentRelation.source_agent_id == agent_id,
            AgentRelation.deleted_at.is_(None),
            AgentRelation.relation_type != "consult",
            AgentRelation.trigger.in_(triggers),
        )
        .order_by(AgentRelation.created_at, AgentRelation.id)
    )
    if skip:
        query = query.where(AgentRelation.id != skip)
    return list(await session.scalars(query))


async def active_target(
    session: AsyncSession, task: Task, relation: AgentRelation, source: TaskStep
) -> Agent | None:
    """Role tujuan bila masih aktif; bila tidak, catat bahwa relasinya dilewati."""
    target = await session.get(Agent, relation.target_agent_id)
    if target is not None and target.deleted_at is None and target.status == "active":
        return target
    flow.log(
        session,
        task,
        "relation_skipped",
        f'Relasi "{relation.label or relation.relation_type}" dilewati: '
        f"{target.name if target else 'role tujuan'} tidak aktif.",
        source.id,
    )
    return None


async def run_relation(
    session: AsyncSession, task: Task, relation: AgentRelation, source: TaskStep
) -> None:
    """Tambah langkah untuk relasi Periksa atau Serahkan setelah langkah `source`."""
    name = await flow.agent_name(session, relation.source_agent_id)
    target = await active_target(session, task, relation, source)
    if target is None:
        return
    if relation.relation_type == "review":
        await flow.add_step(
            session,
            task,
            target.id,
            "review",
            via_relation_id=relation.id,
            parent_step_id=source.id,
            input_notes=relation.expected_output,
        )
    elif relation.relation_type == "handoff":
        await flow.add_step(
            session,
            task,
            target.id,
            "work",
            via_relation_id=relation.id,
            parent_step_id=source.id,
            input_notes=f"Diserahkan oleh {name}: {relation.expected_output}",
        )


async def route(
    session: AsyncSession,
    task: Task,
    source: TaskStep,
    trigger: str,
    conditions: dict[str, tuple[bool, str]],
    skip: uuid.UUID | None = None,
) -> None:
    """
    `conditions` berisi hasil penilaian relasi bersyarat (id relasi → terpenuhi, alasan),
    dinilai sebelum baris tugas dikunci.
    """
    # Persetujuan yang lahir dari penolakan tidak memicu rute penolakan lagi bila ditolak
    origin = {"from_rejection": True} if trigger == "rejected" else {}
    for relation in await outgoing(session, source.agent_id, trigger, skip):
        label = relation.label or relation.relation_type
        if relation.trigger == "on_condition":
            met, reason = conditions.get(str(relation.id), (False, "belum dinilai"))
            if not met:
                flow.log(
                    session,
                    task,
                    "relation_skipped",
                    f'Kondisi tidak terpenuhi, relasi "{label}" dilewati: {reason}',
                    source.id,
                )
                continue
        if relation.relation_type == "escalate":
            await flow.request_approval(
                session,
                task,
                step_id=source.id,
                reason="escalate",
                question=relation.expected_output
                or relation.label
                or "Mohon keputusan atas hasil ini.",
                requested_from=relation.target_member_id,
                follow_up={"type": "none", **origin},
            )
        elif relation.requires_approval:
            target = await flow.agent_name(session, relation.target_agent_id)
            await flow.request_approval(
                session,
                task,
                step_id=source.id,
                reason="requires_approval",
                question=f'Boleh lanjut "{label}" ke {target}?',
                requested_from=await flow.owner_of(session, source.agent_id, task),
                follow_up={
                    "type": "run_relation",
                    "relation_id": str(relation.id),
                    "step_id": str(source.id),
                    **origin,
                },
            )
        else:
            await run_relation(session, task, relation, source)
