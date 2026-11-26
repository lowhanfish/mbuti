"""Apa yang sedang dilakukan tiap role, diturunkan dari tugas yang berjalan."""

import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.admin.kantor.schema import (
    OfficeAgent,
    OfficeState,
    OfficeTransfer,
    OfficeUnit,
)
from app.api.v1.endpoints.admin.role.service import live_agents
from app.models import (
    Agent,
    AgentRelation,
    Approval,
    Document,
    Membership,
    Task,
    TaskStep,
    Unit,
    User,
)
from app.models.base import utcnow
from app.models.tugas.task import OPEN_STATUSES
from app.services.appearance import UNIT_COLOR_HEX

ACTIVITY = {"work": "working", "review": "reviewing", "consult": "consulting"}


async def build_state(session: AsyncSession, organization_id) -> OfficeState:
    """Dipanggil tiap 1,5 detik, jadi jumlah query-nya tetap."""
    agents = list(
        await session.scalars(
            select(Agent).where(*live_agents(organization_id)).order_by(Agent.created_at, Agent.id)
        )
    )
    open_tasks = (Task.organization_id == organization_id, Task.status.in_(OPEN_STATUSES))
    titles = dict((await session.execute(select(Task.id, Task.title).where(*open_tasks))).all())
    steps = (
        await session.execute(
            select(TaskStep, AgentRelation.relation_type)
            .outerjoin(AgentRelation, AgentRelation.id == TaskStep.via_relation_id)
            .where(TaskStep.task_id.in_(titles))
            .order_by(TaskStep.queue_no, TaskStep.seq)
        )
    ).all()
    by_id = {row.TaskStep.id: row.TaskStep for row in steps}
    # Langkah terdepan tiap tugas
    heads: dict = {}
    for step, relation_type in steps:
        if step.status in ("queued", "running") and step.queue_no is not None:
            heads.setdefault(step.task_id, (step, relation_type))
    waiting = (
        await session.execute(
            select(Approval.task_id, Approval.step_id).where(
                Approval.task_id.in_(titles), Approval.status == "pending"
            )
        )
    ).all()
    since = utcnow() - datetime.timedelta(hours=24)
    today = dict(
        (
            await session.execute(
                select(TaskStep.agent_id, func.count(func.distinct(TaskStep.task_id)))
                .join(Task, Task.id == TaskStep.task_id)
                .where(Task.organization_id == organization_id, TaskStep.started_at > since)
                .group_by(TaskStep.agent_id)
            )
        ).all()
    )

    activity: dict = {}
    # Urutan dari yang paling lemah: menunggu, akan menerima, lalu sedang bekerja
    for task_id, step_id in waiting:
        step = by_id.get(step_id)
        if step:
            activity[step.agent_id] = ("waiting", task_id)
    for task_id, (step, _) in heads.items():
        if step.status == "queued":
            activity[step.agent_id] = ("incoming", task_id)
    for task_id, (step, _) in heads.items():
        if step.status == "running":
            activity[step.agent_id] = (ACTIVITY[step.kind], task_id)

    office_agents = []
    for agent in agents:
        default = {"paused": "paused", "draft": "draft"}.get(agent.status, "idle")
        current, task_id = activity.get(agent.id, (default, None))
        office_agents.append(
            OfficeAgent(
                id=str(agent.id),
                name=agent.name,
                title=agent.title,
                unit_id=str(agent.unit_id) if agent.unit_id else None,
                status=agent.status,
                avatar=agent.avatar,
                activity=current,
                task_id=str(task_id) if task_id else None,
                task_title=titles.get(task_id),
                tasks_today=today.get(agent.id, 0),
            )
        )

    units = (
        await session.execute(
            select(Unit, User.full_name)
            .outerjoin(Membership, Membership.id == Unit.lead_member_id)
            .outerjoin(User, User.id == Membership.user_id)
            .where(Unit.organization_id == organization_id)
            .order_by(Unit.sort_order, func.lower(Unit.name))
        )
    ).all()
    members = dict(
        (
            await session.execute(
                select(Membership.unit_id, func.count())
                .where(Membership.organization_id == organization_id, Membership.status == "active")
                .group_by(Membership.unit_id)
            )
        ).all()
    )
    documents = dict(
        (
            await session.execute(
                select(Document.unit_id, func.count())
                .where(Document.organization_id == organization_id, Document.deleted_at.is_(None))
                .group_by(Document.unit_id)
            )
        ).all()
    )
    unit_of = {agent.id: agent.unit_id for agent in agents}
    office_units = [
        OfficeUnit(
            id=str(unit.id),
            name=unit.name,
            code=unit.code,
            color=UNIT_COLOR_HEX[unit.color],
            parent_id=str(unit.parent_id) if unit.parent_id else None,
            lead_name=lead,
            member_count=members.get(unit.id, 0),
            document_count=documents.get(unit.id, 0),
            active_task_count=len(
                {s.TaskStep.task_id for s in steps if unit_of.get(s.TaskStep.agent_id) == unit.id}
            ),
        )
        for unit, lead in units
    ]

    transfers = []
    for task_id, (step, relation_type) in heads.items():
        parent = by_id.get(step.parent_step_id)
        if step.status == "queued" and parent and parent.agent_id != step.agent_id:
            transfers.append(
                OfficeTransfer(
                    task_id=str(task_id),
                    from_agent_id=str(parent.agent_id),
                    to_agent_id=str(step.agent_id),
                    relation_type=relation_type,
                )
            )
    return OfficeState(
        units=office_units, agents=office_agents, transfers=transfers, generated_at=utcnow()
    )
