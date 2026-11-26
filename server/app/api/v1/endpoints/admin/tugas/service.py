import datetime
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember
from app.api.v1.common import Paging, like_pattern, parse_id
from app.api.v1.endpoints.admin.pengaturan.schema import rupiah
from app.api.v1.endpoints.admin.pengetahuan.schema import SearchHit
from app.api.v1.endpoints.admin.role.service import live_agents
from app.api.v1.endpoints.admin.tugas.schema import (
    Event,
    InputValue,
    Step,
    TaskCreate,
    TaskDetail,
    TaskItem,
    TaskSummary,
)
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.models import (
    Agent,
    AgentRelation,
    Approval,
    Citation,
    Membership,
    Organization,
    Task,
    TaskEvent,
    TaskStep,
    User,
)
from app.models.tugas.task import OPEN_STATUSES
from app.services import budget
from app.services.engine import flow
from app.services.engine.dispatch import enqueue_task
from app.services.engine.views import MANAGERS, agent_refs, approval_items
from app.services.organisation import lock_organization

NOT_FOUND = "Tugas tidak ditemukan."
TASK_BUDGET = (500, 1_000_000)
STATUS_GROUPS = {
    "active": ("queued", "running"),
    "waiting": ("waiting_approval",),
    "done": ("completed",),
    "stopped": ("failed", "cancelled", "stopped_budget"),
}


async def task_items(session: AsyncSession, tasks: list[Task]) -> list[TaskItem]:
    """Bentuk daftar untuk beberapa tugas sekaligus, dengan sedikit query."""
    if not tasks:
        return []
    ids = [t.id for t in tasks]
    steps = (
        await session.execute(
            select(TaskStep.task_id, TaskStep.agent_id, TaskStep.status)
            .where(TaskStep.task_id.in_(ids))
            .order_by(TaskStep.seq)
        )
    ).all()
    pending = dict(
        (
            await session.execute(
                select(Approval.task_id, func.count())
                .where(Approval.task_id.in_(ids), Approval.status == "pending")
                .group_by(Approval.task_id)
            )
        ).all()
    )
    creators = dict(
        (
            await session.execute(
                select(Membership.id, User.full_name)
                .join(User, User.id == Membership.user_id)
                .where(Membership.id.in_([t.created_by_member_id for t in tasks]))
            )
        ).all()
    )
    refs = await agent_refs(
        session, [t.entry_agent_id for t in tasks] + [s.agent_id for s in steps]
    )
    items = []
    for task in tasks:
        own = [s for s in steps if s.task_id == task.id]
        participants = dict.fromkeys([task.entry_agent_id, *(s.agent_id for s in own)])
        items.append(
            TaskItem(
                id=str(task.id),
                title=task.title,
                brief=task.brief,
                entry_agent=refs[task.entry_agent_id],
                participants=[refs[a] for a in participants],
                status=task.status,
                priority=task.priority,
                due_at=task.due_at,
                budget_limit=task.budget_limit,
                cost_used=task.cost_used,
                step_count=len(own),
                steps_done=sum(s.status == "done" for s in own),
                pending_approval_count=pending.get(task.id, 0),
                created_by_name=creators.get(task.created_by_member_id),
                created_at=task.created_at,
                updated_at=task.updated_at,
                completed_at=task.completed_at,
            )
        )
    return items


async def read_tasks(
    session: AsyncSession,
    organization_id: uuid.UUID,
    search: str,
    status: str,
    agent_id: str,
    page: Paging,
) -> tuple[int, list[TaskItem], TaskSummary]:
    counts = await session.execute(
        select(Task.status, func.count())
        .where(Task.organization_id == organization_id)
        .group_by(Task.status)
    )
    summary = TaskSummary(**dict(counts.all()))

    filters = [Task.organization_id == organization_id]
    if search.strip():
        pattern = like_pattern(search.strip())
        filters.append(
            or_(Task.title.ilike(pattern, escape="\\"), Task.brief.ilike(pattern, escape="\\"))
        )
    if status:
        filters.append(Task.status.in_(STATUS_GROUPS.get(status, (status,))))
    if agent_id:
        try:
            wanted = uuid.UUID(agent_id)
        except ValueError:
            return 0, [], summary
        involved = exists().where(TaskStep.task_id == Task.id, TaskStep.agent_id == wanted)
        filters.append(or_(Task.entry_agent_id == wanted, involved))

    total = await session.scalar(select(func.count()).select_from(Task).where(*filters))
    tasks = list(
        await session.scalars(
            select(Task)
            .where(*filters)
            .order_by(Task.updated_at.desc(), Task.id)
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    return total, await task_items(session, tasks), summary


async def _get(session: AsyncSession, organization_id: uuid.UUID, task_id: str) -> Task:
    task = await session.scalar(
        select(Task).where(
            Task.id == parse_id(task_id, NOT_FOUND), Task.organization_id == organization_id
        )
    )
    if task is None:
        raise NotFoundException(NOT_FOUND)
    return task


async def read_task(session: AsyncSession, organization_id: uuid.UUID, task_id: str) -> TaskDetail:
    task = await _get(session, organization_id, task_id)
    item = (await task_items(session, [task]))[0]
    steps = (
        await session.execute(
            select(TaskStep, AgentRelation.relation_type)
            .outerjoin(AgentRelation, AgentRelation.id == TaskStep.via_relation_id)
            .where(TaskStep.task_id == task.id)
            .order_by(TaskStep.seq)
        )
    ).all()
    citations = list(
        await session.scalars(
            select(Citation)
            .where(Citation.step_id.in_([s.TaskStep.id for s in steps]))
            .order_by(Citation.order_no)
        )
    )
    refs = await agent_refs(session, [s.TaskStep.agent_id for s in steps])
    events = await session.scalars(
        select(TaskEvent).where(TaskEvent.task_id == task.id).order_by(TaskEvent.seq)
    )
    approvals = await approval_items(session, Approval.task_id == task.id)
    entry = await session.get(Agent, task.entry_agent_id)
    labels = {spec["key"]: spec["label"] for spec in entry.input_spec}
    return TaskDetail(
        **item.model_dump(),
        inputs=[
            InputValue(label=labels.get(key, key), value=value)
            for key, value in task.inputs.items()
            if value
        ],
        steps=[
            Step(
                id=str(step.id),
                agent=refs[step.agent_id],
                kind=step.kind,
                via_relation_type=relation_type,
                attempt_no=step.attempt_no,
                status=step.status,
                input_notes=step.input_notes,
                output=step.output,
                citations=[
                    SearchHit(
                        document_id=str(c.document_id),
                        document_title=c.document_title,
                        version_id=str(c.version_id),
                        version_no=c.version_no,
                        page_no=c.page_no,
                        heading=c.heading,
                        snippet=c.snippet,
                        score=c.score,
                    )
                    for c in citations
                    if c.step_id == step.id
                ],
                verdict=step.verdict,
                model=step.model,
                cost=step.cost,
                tokens=step.tokens,
                started_at=step.started_at,
                finished_at=step.finished_at,
            )
            for step, relation_type in steps
        ],
        approvals=[pair[1] for pair in approvals],
        events=[
            Event(
                id=str(e.id),
                type=e.type,
                message=e.message,
                step_id=str(e.step_id) if e.step_id else None,
                created_at=e.created_at,
            )
            for e in events
        ],
    )


async def create_task(session: AsyncSession, actor: CurrentMember, body: TaskCreate) -> TaskItem:
    organization_id = actor.organization_id
    # Antre dengan penghapusan role agar tugas tidak dibuat untuk role yang sedang dihapus
    await lock_organization(session, organization_id)
    try:
        agent_id = uuid.UUID(body.entry_agent_id)
    except ValueError:
        agent_id = None
    agent = await session.scalar(
        select(Agent).where(Agent.id == agent_id, *live_agents(organization_id))
    )
    if agent is None:
        raise UnprocessableEntityException("Pilih role yang akan mengerjakan.")
    if agent.status != "active":
        state = "berstatus draf" if agent.status == "draft" else "dijeda"
        raise UnprocessableEntityException(
            f"{agent.name} sedang {state}. Aktifkan role terlebih dahulu."
        )
    # Hanya isian yang diminta role yang disimpan
    inputs = {spec["key"]: body.inputs.get(spec["key"], "").strip() for spec in agent.input_spec}
    missing = [s["label"] for s in agent.input_spec if s.get("required") and not inputs[s["key"]]]
    if missing:
        raise UnprocessableEntityException(f"Lengkapi isian wajib: {', '.join(missing)}.")

    low, high = TASK_BUDGET
    if not low <= body.budget_limit <= high:
        raise UnprocessableEntityException(f"Batas biaya antara {rupiah(low)} dan {rupiah(high)}.")
    current = await budget.read_settings(session, organization_id)
    if body.budget_limit > current.monthly_budget:
        raise UnprocessableEntityException("Batas biaya tugas melebihi batas bulanan organisasi.")
    await budget.require_budget(session, organization_id)

    due_at = None
    if body.due_at:
        organization = await session.get(Organization, organization_id)
        due_at = datetime.datetime.combine(
            body.due_at, datetime.time(23, 59, 59), ZoneInfo(organization.timezone)
        )
    task = Task(
        id=uuid.uuid4(),
        organization_id=organization_id,
        title=body.title,
        brief=body.brief,
        inputs=inputs,
        entry_agent_id=agent.id,
        status="queued",
        priority=body.priority,
        due_at=due_at,
        budget_limit=body.budget_limit,
        created_by_member_id=actor.membership.id,
        created_by=actor.user.id,
    )
    session.add(task)
    await session.flush()
    creator = await flow.member_name(session, actor.membership.id)
    flow.log(session, task, "created", f"Tugas dibuat oleh {creator} untuk {agent.name}.")
    await session.flush()
    await flow.add_step(session, task, agent.id, "work")
    await session.commit()
    await enqueue_task(task.id)
    return (await task_items(session, [task]))[0]


async def cancel_task(session: AsyncSession, actor: CurrentMember, task_id: str) -> TaskItem:
    task = await _get(session, actor.organization_id, task_id)
    task = await flow.lock_task(session, task.id)
    if actor.access_role not in MANAGERS and task.created_by_member_id != actor.membership.id:
        raise ForbiddenException("Hanya pembuat tugas atau admin yang dapat menghentikannya.")
    if actor.access_role == "viewer":
        raise ForbiddenException("Pemantau tidak dapat menghentikan tugas.")
    if task.status not in OPEN_STATUSES:
        raise ConflictException("Tugas ini sudah berakhir.")
    who = await flow.member_name(session, actor.membership.id)
    await flow.halt(
        session,
        task,
        "cancelled",
        f"Tugas dihentikan oleh {who}.",
        comment="Tugas dihentikan.",
    )
    await session.commit()
    return (await task_items(session, [task]))[0]
