"""Tugas rutin: jadwal, pratinjau, dan pemahaman kalimat (kontrak 17.3–17.5)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MANAGERS, CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.pengaturan.schema import rupiah
from app.api.v1.endpoints.admin.role.service import live_agents
from app.api.v1.endpoints.admin.tugas.service import TASK_BUDGET
from app.api.v1.endpoints.admin.tugas_rutin.schema import (
    OccurrenceItem,
    ParseResult,
    Preview,
    PreviewRequest,
    RunItem,
    ScheduleDetail,
    ScheduleItem,
    ScheduleRequest,
)
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.models import (
    Agent,
    Membership,
    Schedule,
    ScheduleRun,
    Task,
    TaskAttachment,
    User,
)
from app.models.base import utcnow
from app.services import budget
from app.services.engine import compose
from app.services.engine.views import agent_refs
from app.services.organisation import lock_organization
from app.services.schedule import parsing, runner
from app.services.schedule.planning import OrganizationCalendar, organization_calendar, plan_next
from app.services.schedule.rules import ScheduleRule, occurrences, rule_text

NOT_FOUND = "Tugas rutin tidak ditemukan."
NOT_ALLOWED = "Anda tidak dapat mengubah tugas rutin ini."
OWN_ROLES_ONLY = "Anggota hanya dapat menjadwalkan role yang ia tanggung jawabi."
WRONG_STATE = "Tindakan ini tidak berlaku untuk keadaan sekarang."
RUN_NOT_FOUND = "Putaran tidak ditemukan."
CAN_BACKFILL = ("missed", "failed", "stopped_budget")
MAX_RUNS = 100
MAX_UPCOMING = 20


def _can_manage(actor: CurrentMember, agent: Agent) -> bool:
    return actor.access_role in MANAGERS or (
        actor.access_role == "member" and agent.owner_member_id == actor.membership.id
    )


def _occurrence_items(
    calendar: OrganizationCalendar,
    rule: ScheduleRule,
    agent_id: uuid.UUID | None,
    seed: str = "",
) -> list[OccurrenceItem]:
    return [
        OccurrenceItem(
            date=o.at.date(),
            time=f"{o.at:%H:%M}",
            status=o.status,
            moved_from=o.moved_from,
            reason=o.reason,
        )
        for o in occurrences(
            calendar.for_rule(rule, agent_id), rule, utcnow(), 5, seed, limit=MAX_UPCOMING
        )
    ]


def _text(calendar: OrganizationCalendar, rule: ScheduleRule) -> str:
    shift = calendar.shift_of(rule)
    return rule_text(rule, shift.name if shift else None)


async def _run_items(session: AsyncSession, query) -> list[tuple[uuid.UUID, RunItem]]:
    """Baris putaran beserta keadaan tugasnya, berpasangan dengan ID jadwalnya."""
    attachments = (
        select(func.count())
        .where(TaskAttachment.task_id == ScheduleRun.task_id)
        .correlate(ScheduleRun)
        .scalar_subquery()
    )
    rows = await session.execute(
        query.add_columns(Task.status, attachments).outerjoin(Task, Task.id == ScheduleRun.task_id)
    )
    return [
        (
            run.schedule_id,
            RunItem(
                id=str(run.id),
                planned_for=run.planned_for,
                status=run.status,
                attempt=run.attempt,
                reason=run.reason,
                task_id=str(run.task_id) if run.task_id else None,
                task_status=task_status,
                attachment_count=count,
            ),
        )
        for run, task_status, count in rows
    ]


async def _items(
    session: AsyncSession,
    actor: CurrentMember,
    schedules: list[Schedule],
    calendar: OrganizationCalendar,
) -> list[ScheduleItem]:
    agent_ids = {s.entry_agent_id for s in schedules}
    refs = await agent_refs(session, agent_ids)
    agents = {a.id: a for a in await session.scalars(select(Agent).where(Agent.id.in_(agent_ids)))}
    names = dict(
        (
            await session.execute(
                select(Membership.id, User.full_name)
                .join(User, User.id == Membership.user_id)
                .where(Membership.id.in_({s.created_by_member_id for s in schedules}))
            )
        ).all()
    )
    # Hasil terakhir: putaran terbaru, tanpa susulan yang masih menunggu
    last_runs = dict(
        await _run_items(
            session,
            select(ScheduleRun)
            .where(
                ScheduleRun.schedule_id.in_([s.id for s in schedules]),
                ScheduleRun.status != "scheduled",
            )
            .ext(distinct_on(ScheduleRun.schedule_id))
            .order_by(
                ScheduleRun.schedule_id,
                ScheduleRun.planned_for.desc(),
                ScheduleRun.created_at.desc(),
            ),
        )
    )
    items = []
    for s in schedules:
        rule = ScheduleRule.model_validate(s.rule)
        items.append(
            ScheduleItem(
                id=str(s.id),
                title=s.title,
                brief=s.brief,
                entry_agent=refs[s.entry_agent_id],
                inputs=s.inputs,
                priority=s.priority,
                budget_limit=s.budget_limit,
                web_search=s.web_search,
                compose_mode=s.compose_mode,
                rule=rule,
                rule_text=_text(calendar, rule),
                source_text=s.source_text,
                status=s.status,
                next_run_at=s.next_run_at,
                last_run=last_runs.get(s.id),
                created_by_name=names.get(s.created_by_member_id),
                can_manage=_can_manage(actor, agents[s.entry_agent_id]),
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
        )
    return items


async def _item(session: AsyncSession, actor: CurrentMember, schedule: Schedule) -> ScheduleItem:
    calendar = await organization_calendar(session, actor.organization_id)
    return (await _items(session, actor, [schedule], calendar))[0]


async def _detail(
    session: AsyncSession, actor: CurrentMember, schedule: Schedule
) -> ScheduleDetail:
    calendar = await organization_calendar(session, actor.organization_id)
    item = (await _items(session, actor, [schedule], calendar))[0]
    upcoming = _occurrence_items(calendar, item.rule, schedule.entry_agent_id, str(schedule.id))
    runs = await _run_items(
        session,
        select(ScheduleRun)
        .where(ScheduleRun.schedule_id == schedule.id)
        .order_by(ScheduleRun.planned_for.desc(), ScheduleRun.created_at.desc())
        .limit(MAX_RUNS),
    )
    return ScheduleDetail(**dict(item), upcoming=upcoming, runs=[run for _, run in runs])


async def _get(session: AsyncSession, organization_id: uuid.UUID, value: str) -> Schedule:
    schedule = await session.scalar(
        select(Schedule).where(
            Schedule.id == parse_id(value, NOT_FOUND),
            Schedule.organization_id == organization_id,
        )
    )
    if schedule is None:
        raise NotFoundException(NOT_FOUND)
    return schedule


async def _managed(session: AsyncSession, actor: CurrentMember, value: str) -> Schedule:
    """Jadwal yang boleh diubah pengguna ini; organisasi dikunci sampai transaksi selesai."""
    await lock_organization(session, actor.organization_id)
    schedule = await _get(session, actor.organization_id, value)
    if not _can_manage(actor, await session.get(Agent, schedule.entry_agent_id)):
        raise ForbiddenException(NOT_ALLOWED)
    return schedule


async def read_schedules(session: AsyncSession, actor: CurrentMember) -> list[ScheduleItem]:
    schedules = (
        await session.scalars(
            select(Schedule)
            .where(Schedule.organization_id == actor.organization_id)
            .order_by(Schedule.next_run_at.asc().nulls_last(), func.lower(Schedule.title))
        )
    ).all()
    calendar = await organization_calendar(session, actor.organization_id)
    return await _items(session, actor, schedules, calendar)


async def read_schedule(
    session: AsyncSession, actor: CurrentMember, schedule_id: str
) -> ScheduleDetail:
    return await _detail(session, actor, await _get(session, actor.organization_id, schedule_id))


async def _apply(
    session: AsyncSession, actor: CurrentMember, schedule: Schedule, body: ScheduleRequest
) -> None:
    """Periksa isian lalu pasang pada jadwal beserta putaran berikutnya."""
    organization_id = actor.organization_id
    try:
        agent_id = uuid.UUID(body.entry_agent_id)
    except ValueError:
        agent_id = None
    agent = await session.scalar(
        select(Agent).where(Agent.id == agent_id, *live_agents(organization_id))
    )
    if agent is None:
        raise UnprocessableEntityException("Pilih role yang akan mengerjakan.")
    if not _can_manage(actor, agent):
        raise ForbiddenException(OWN_ROLES_ONLY)
    if agent.status != "active":
        raise UnprocessableEntityException(f"{agent.name} belum aktif.")
    inputs = {spec["key"]: body.inputs.get(spec["key"], "").strip() for spec in agent.input_spec}
    required = compose.effective(body.compose_mode, agent.compose_mode) != compose.FREE
    missing = [s["label"] for s in agent.input_spec if s.get("required") and not inputs[s["key"]]]
    if required and missing:
        raise UnprocessableEntityException(f"Lengkapi isian wajib: {', '.join(missing)}.")
    low, high = TASK_BUDGET
    if not low <= body.budget_limit <= high:
        raise UnprocessableEntityException(f"Batas biaya antara {rupiah(low)} dan {rupiah(high)}.")
    current = await budget.read_settings(session, organization_id)
    if body.budget_limit > current.monthly_budget:
        raise UnprocessableEntityException("Batas biaya tugas melebihi batas bulanan organisasi.")
    calendar = await organization_calendar(session, organization_id)
    shift_id = _require_shift(calendar, body.rule)

    schedule.entry_agent_id = agent.id
    schedule.title = body.title
    schedule.brief = body.brief
    schedule.inputs = inputs
    schedule.priority = body.priority
    schedule.budget_limit = body.budget_limit
    schedule.web_search = body.web_search
    schedule.compose_mode = body.compose_mode
    schedule.rule = body.rule.model_dump()
    schedule.shift_id = shift_id
    schedule.source_text = body.source_text
    schedule.status = body.status
    plan_next(schedule, calendar)


def _require_shift(calendar: OrganizationCalendar, rule: ScheduleRule) -> uuid.UUID | None:
    """ID shift milik organisasi untuk jadwal terkait shift; 422 bila tidak ditemukan."""
    if rule.time_mode == "fixed":
        return None
    if calendar.shift_of(rule) is None:
        raise UnprocessableEntityException("Pilih shift.")
    return uuid.UUID(rule.shift_id)


async def create_schedule(
    session: AsyncSession, actor: CurrentMember, body: ScheduleRequest
) -> ScheduleItem:
    await lock_organization(session, actor.organization_id)
    schedule = Schedule(
        id=uuid.uuid4(),
        organization_id=actor.organization_id,
        created_by_member_id=actor.membership.id,
        created_by=actor.user.id,
    )
    await _apply(session, actor, schedule, body)
    session.add(schedule)
    await session.commit()
    return await _item(session, actor, schedule)


async def update_schedule(
    session: AsyncSession, actor: CurrentMember, schedule_id: str, body: ScheduleRequest
) -> ScheduleItem:
    schedule = await _managed(session, actor, schedule_id)
    await _apply(session, actor, schedule, body)
    await session.commit()
    return await _item(session, actor, schedule)


async def delete_schedule(session: AsyncSession, actor: CurrentMember, schedule_id: str) -> None:
    schedule = await _managed(session, actor, schedule_id)
    await session.delete(schedule)
    await session.commit()


async def pause(session: AsyncSession, actor: CurrentMember, schedule_id: str) -> ScheduleDetail:
    schedule = await _managed(session, actor, schedule_id)
    if schedule.status != "active":
        raise ConflictException(WRONG_STATE)
    schedule.status = "paused"
    schedule.next_run_at = schedule.check_at = schedule.cursor_at = None
    await session.commit()
    return await _detail(session, actor, schedule)


async def resume(session: AsyncSession, actor: CurrentMember, schedule_id: str) -> ScheduleDetail:
    schedule = await _managed(session, actor, schedule_id)
    if schedule.status not in ("paused", "draft"):
        raise ConflictException(WRONG_STATE)
    schedule.status = "active"
    plan_next(schedule, await organization_calendar(session, actor.organization_id))
    await session.commit()
    return await _detail(session, actor, schedule)


async def run_now(
    session: AsyncSession, actor: CurrentMember, schedule_id: str
) -> tuple[ScheduleDetail, str]:
    schedule = await _managed(session, actor, schedule_id)
    run, outbox = await runner.run_now(session, schedule, actor.membership.id)
    return await _after_run(session, actor, schedule, run, outbox, "Tugas dibuat.")


async def backfill(
    session: AsyncSession, actor: CurrentMember, schedule_id: str, run_id: str
) -> tuple[ScheduleDetail, str]:
    schedule = await _managed(session, actor, schedule_id)
    old = await session.scalar(
        select(ScheduleRun).where(
            ScheduleRun.id == parse_id(run_id, RUN_NOT_FOUND),
            ScheduleRun.schedule_id == schedule.id,
        )
    )
    if old is None:
        raise NotFoundException(RUN_NOT_FOUND)
    if old.status not in CAN_BACKFILL:
        raise ConflictException(WRONG_STATE)
    run, outbox = await runner.backfill_now(session, schedule, old, actor.membership.id)
    return await _after_run(session, actor, schedule, run, outbox, "Susulan dibuat.")


async def _after_run(
    session: AsyncSession,
    actor: CurrentMember,
    schedule: Schedule,
    run: ScheduleRun,
    outbox: runner.Outbox,
    created: str,
) -> tuple[ScheduleDetail, str]:
    """Simpan, antrekan tugasnya, lalu jawab; yang gagal dibuat dijelaskan lewat pesan."""
    message = created if run.task_id else run.reason
    session.add(run)
    await session.commit()
    await outbox.send()
    return await _detail(session, actor, schedule), message


async def preview(session: AsyncSession, actor: CurrentMember, body: PreviewRequest) -> Preview:
    calendar = await organization_calendar(session, actor.organization_id)
    _require_shift(calendar, body.rule)
    try:
        agent_id = uuid.UUID(body.entry_agent_id or "")
    except ValueError:
        agent_id = None
    return Preview(
        rule_text=_text(calendar, body.rule),
        # Cuti hanya dibaca dari kalender organisasi ini, jadi ID asing tidak berpengaruh
        occurrences=_occurrence_items(calendar, body.rule, agent_id),
    )


async def understand(session: AsyncSession, actor: CurrentMember, sentence: str) -> ParseResult:
    await budget.require_budget(session, actor.organization_id)
    calendar = await organization_calendar(session, actor.organization_id)
    parsed = await parsing.parse(session, actor, calendar, sentence)
    return ParseResult(
        rule=parsed.rule,
        title=parsed.title,
        notes=parsed.notes,
        rule_text=_text(calendar, parsed.rule),
        occurrences=_occurrence_items(calendar, parsed.rule, None),
    )
