"""
Penjadwal tugas rutin (kontrak 17.6): putaran, coba ulang, susulan, dan pemberitahuan.

Setiap jadwal atau putaran diproses dalam transaksinya sendiri. Urutan kunci selalu organisasi
dulu, sama dengan perubahan kalender, agar keduanya tidak saling mengunci.
"""

import datetime
import logging
import uuid
from dataclasses import dataclass, field

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import (
    Agent,
    Approval,
    BrowserRun,
    Membership,
    Organization,
    Schedule,
    ScheduleRun,
    Task,
    TaskEvent,
    User,
)
from app.models.base import utcnow
from app.models.tugas.task import OPEN_STATUSES
from app.services import budget, mailer
from app.services.engine import app_flow, compose, intake
from app.services.engine.dispatch import enqueue_task
from app.services.organisation import lock_organization
from app.services.schedule.planning import OrganizationCalendar, organization_calendar, plan_next
from app.services.schedule.rules import MOVE_LIMIT, ScheduleRule, occurrences

logger = logging.getLogger("mbuti.schedule")

# Putaran yang terlambat sejauh ini dicatat terlewat
LATE_LIMIT = datetime.timedelta(hours=6)
RETRY_DELAYS = (datetime.timedelta(minutes=15), datetime.timedelta(hours=1))
# Batas sekali jalan; sisanya diambil pada putaran penjadwal berikutnya
BATCH = 100
RUNS_PER_SCHEDULE = 20

MISSED = "Penjadwal tidak berjalan saat jadwalnya."
INACTIVE_ROLE = "Role tidak aktif."
NO_BUDGET = "Anggaran bulan ini habis."
TASK_FAILED = "Tugas berakhir gagal."
MAYBE_SENT = "Mungkin sudah terkirim ke aplikasi; periksa aplikasinya. Tidak diulang otomatis."
REJECTED = "Ditolak pada persetujuan."
BACKFILLED = "Sudah diisi susulan."


@dataclass
class Outbox:
    """Dikirim sesudah transaksi tersimpan."""

    tasks: list[uuid.UUID] = field(default_factory=list)
    emails: list[mailer.Email] = field(default_factory=list)

    async def send(self) -> None:
        for task_id in self.tasks:
            await enqueue_task(task_id)
        for email in self.emails:
            mailer.queue(email)


class _Blocked(Exception):
    """Tugas tidak bisa dibuat sekarang."""


async def _person(session: AsyncSession, *member_ids: uuid.UUID | None):
    """Anggota aktif pertama (bukan pemantau) dari daftar, lalu pemilik organisasi."""
    for member_id in member_ids:
        if member_id is None:
            continue
        row = (
            await session.execute(
                select(Membership.id, User.id, User.full_name, User.email)
                .join(User, User.id == Membership.user_id)
                .where(
                    Membership.id == member_id,
                    Membership.status == "active",
                    Membership.access_role != "viewer",
                )
            )
        ).first()
        if row:
            return row
    return None


async def _owner_of_organization(session: AsyncSession, organization_id: uuid.UUID):
    member_id = await session.scalar(
        select(Membership.id)
        .where(
            Membership.organization_id == organization_id,
            Membership.status == "active",
            Membership.access_role == "owner",
        )
        .order_by(Membership.joined_at)
        .limit(1)
    )
    return await _person(session, member_id)


async def _notify(session: AsyncSession, schedule: Schedule, reason: str, outbox: Outbox) -> None:
    """Penanggung jawab role; bila tidak ada atau tidak aktif, pembuat jadwal."""
    agent = await session.get(Agent, schedule.entry_agent_id)
    person = await _person(session, agent.owner_member_id, schedule.created_by_member_id)
    person = person or await _owner_of_organization(session, schedule.organization_id)
    if person:
        _, _, name, email = person
        outbox.emails.append(
            mailer.schedule_problem(email, name, schedule.title, reason, str(schedule.id))
        )


async def _create_task(
    session: AsyncSession, schedule: Schedule, actor_member_id: uuid.UUID | None
) -> Task | None:
    """Tugas untuk satu putaran; None bila anggaran habis."""
    agent = await session.get(Agent, schedule.entry_agent_id)
    if agent.deleted_at is not None or agent.status != "active":
        raise _Blocked(INACTIVE_ROLE)
    inputs = {s["key"]: schedule.inputs.get(s["key"], "") for s in agent.input_spec}
    required = compose.effective(schedule.compose_mode, agent.compose_mode) != compose.FREE
    missing = [s["label"] for s in agent.input_spec if s.get("required") and not inputs[s["key"]]]
    if required and missing:
        raise _Blocked(f"Isian wajib role belum lengkap: {', '.join(missing)}.")
    if schedule.flow:
        found = await app_flow.availability(
            session, schedule.organization_id, agent, schedule.flow["flow_id"]
        )
        if isinstance(found, str):
            raise _Blocked(found)
    usage = await budget.month_usage(session, schedule.organization_id)
    if usage.remaining <= 0:
        return None
    monthly = (await budget.read_settings(session, schedule.organization_id)).monthly_budget
    # Pembuat tugas harus orang yang masih bisa memutuskan persetujuan
    creator = await _person(
        session, actor_member_id or schedule.created_by_member_id, agent.owner_member_id
    )
    creator = creator or await _owner_of_organization(session, schedule.organization_id)
    if creator is None:
        raise _Blocked("Tidak ada anggota aktif yang bisa menerima tugas.")
    member_id, user_id, name, _ = creator
    who = name if actor_member_id else "penjadwal"
    return await intake.open_task(
        session,
        agent,
        f"Tugas rutin dibuat oleh {who} untuk {agent.name}.",
        organization_id=schedule.organization_id,
        title=schedule.title,
        brief=schedule.brief,
        inputs=inputs,
        priority=schedule.priority,
        due_at=None,
        budget_limit=min(schedule.budget_limit, monthly),
        web_search=schedule.web_search,
        compose_mode=schedule.compose_mode,
        flow=schedule.flow,
        created_by_member_id=member_id,
        created_by=user_id,
    )


async def start(
    session: AsyncSession,
    schedule: Schedule,
    run: ScheduleRun,
    now: datetime.datetime,
    outbox: Outbox,
    status: str = "created",
    actor_member_id: uuid.UUID | None = None,
) -> None:
    """Buat tugas untuk putaran ini, atau catat mengapa tidak bisa."""
    run.due_at, run.watching = None, False
    try:
        task = await _create_task(session, schedule, actor_member_id)
    except _Blocked as exc:
        await _fail(session, schedule, run, str(exc), now, outbox)
        return
    if task is None:
        await _stop_for_budget(session, schedule, run, outbox)
        return
    run.status, run.task_id, run.watching = status, task.id, True
    run.reason = "Dijalankan manual." if run.origin == "manual" else ""
    outbox.tasks.append(task.id)


async def _stop_for_budget(
    session: AsyncSession, schedule: Schedule, run: ScheduleRun, outbox: Outbox
) -> None:
    run.status, run.reason = "stopped_budget", NO_BUDGET
    run.due_at, run.watching = None, False
    if run.origin != "manual":
        await _notify(session, schedule, NO_BUDGET, outbox)


async def _fail(
    session: AsyncSession,
    schedule: Schedule,
    run: ScheduleRun,
    reason: str,
    now: datetime.datetime,
    outbox: Outbox,
    retry: bool = True,
) -> None:
    """Coba ulang bila masih boleh; sesudah itu gagal, beri tahu, dan jadwalkan susulan."""
    run.reason, run.watching, run.due_at = reason[:300], False, None
    # Putaran manual ditunggui penggunanya sendiri: tidak diulang dan tidak dikirimi email
    if run.origin == "manual":
        run.status = "failed"
        return
    if retry and run.attempt <= len(RETRY_DELAYS):
        run.status, run.due_at = "retrying", now + RETRY_DELAYS[run.attempt - 1]
        return
    run.status = "failed"
    await _notify(session, schedule, reason, outbox)
    await _plan_backfill(session, schedule, run, now)


async def _plan_backfill(
    session: AsyncSession, schedule: Schedule, run: ScheduleRun, now: datetime.datetime
) -> None:
    """Susulan pada hari kerja berikutnya di jam yang sama; susulan tidak disusulkan lagi."""
    rule = ScheduleRule.model_validate(schedule.rule)
    if rule.on_fail != "backfill" or run.origin != "scheduled":
        return
    calendar = await organization_calendar(session, schedule.organization_id)
    work = calendar.for_rule(rule, schedule.entry_agent_id)
    planned = run.planned_for.astimezone(work.zone)
    day = max(planned.date() + datetime.timedelta(days=1), now.astimezone(work.zone).date())
    for _ in range(MOVE_LIMIT):
        moment = datetime.datetime.combine(day, planned.time(), work.zone)
        if moment > now and not work.off_reason(day):
            break
        day += datetime.timedelta(days=1)
    else:
        return
    moment = moment.astimezone(datetime.UTC)
    # Beberapa putaran yang terlewat sekaligus cukup satu susulan
    if await session.scalar(
        select(ScheduleRun.id)
        .where(
            ScheduleRun.schedule_id == schedule.id,
            ScheduleRun.status == "scheduled",
            ScheduleRun.planned_for == moment,
        )
        .limit(1)
    ):
        return
    session.add(
        ScheduleRun(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            planned_for=moment,
            origin="backfill",
            status="scheduled",
            reason=f"Susulan putaran {planned:%Y-%m-%d %H:%M}.",
            due_at=moment,
            source_id=run.id,
        )
    )


async def process_schedule(
    session: AsyncSession,
    schedule: Schedule,
    calendar: OrganizationCalendar,
    now: datetime.datetime,
    outbox: Outbox,
) -> None:
    """Catat setiap kejadian sejak terakhir diproses, lalu tentukan yang berikutnya."""
    rule = ScheduleRule.model_validate(schedule.rule)
    items = occurrences(
        calendar.for_rule(rule, schedule.entry_agent_id),
        rule,
        schedule.cursor_at or now,
        RUNS_PER_SCHEDULE,
        str(schedule.id),
    )
    due = [item for item in items if item.at <= now]
    recorded = set(
        await session.scalars(
            select(ScheduleRun.planned_for).where(
                ScheduleRun.schedule_id == schedule.id,
                ScheduleRun.origin == "scheduled",
                ScheduleRun.planned_for.in_([item.at for item in due]),
            )
        )
    )
    for item in due:
        if item.at in recorded:
            continue
        run = ScheduleRun(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            planned_for=item.at.astimezone(datetime.UTC),
            origin="scheduled",
            status=item.status if item.status != "run" else "missed",
            attempt=1,
            reason=item.reason[:300] if item.status != "run" else MISSED,
        )
        session.add(run)
        await session.flush()
        if item.status != "run":
            continue
        if now - item.at < LATE_LIMIT:
            await start(session, schedule, run, now, outbox)
        else:
            await _plan_backfill(session, schedule, run, now)
    # Masih ada sisa bila semua butir sudah lewat dan jumlahnya mencapai batas
    remaining = len(due) == len(items) and sum(i.status == "run" for i in due) >= RUNS_PER_SCHEDULE
    plan_next(schedule, calendar, due[-1].at.astimezone(datetime.UTC) if remaining else now)


async def process_run(
    session: AsyncSession,
    schedule: Schedule,
    run: ScheduleRun,
    now: datetime.datetime,
    outbox: Outbox,
) -> None:
    """Susulan atau coba ulang yang sudah waktunya."""
    late = now - run.due_at >= LATE_LIMIT
    if run.status == "scheduled":
        if late:
            run.status, run.reason, run.due_at = "missed", MISSED, None
        else:
            await start(session, schedule, run, now, outbox, status="backfill")
        return
    if late:
        await _fail(session, schedule, run, run.reason, now, outbox, retry=False)
        return
    run.attempt += 1
    await start(
        session,
        schedule,
        run,
        now,
        outbox,
        status="backfill" if run.origin == "backfill" else "created",
    )


async def settle_run(
    session: AsyncSession,
    schedule: Schedule,
    run: ScheduleRun,
    now: datetime.datetime,
    outbox: Outbox,
) -> None:
    """Tindak lanjuti tugas putaran yang sudah berakhir."""
    task = await session.get(Task, run.task_id) if run.task_id else None
    if task is not None and task.status in OPEN_STATUSES:
        return
    run.watching = False
    if task is None or task.status in ("completed", "cancelled"):
        return
    if task.status == "stopped_budget":
        await _stop_for_budget(session, schedule, run, outbox)
        return
    rejected = await session.scalar(
        select(Approval.id)
        .where(
            Approval.task_id == task.id,
            Approval.status == "rejected",
            Approval.decided_by_member_id.is_not(None),
        )
        .limit(1)
    )
    if rejected:
        # Keputusan manusia tidak diulang
        run.status, run.reason = "failed", REJECTED
        return
    maybe_sent = await session.scalar(
        select(BrowserRun.id)
        .where(BrowserRun.task_id == task.id, BrowserRun.submitted_at.is_not(None))
        .limit(1)
    )
    message = await session.scalar(
        select(TaskEvent.message)
        .where(TaskEvent.task_id == task.id, TaskEvent.type == "failed")
        .order_by(TaskEvent.created_at.desc())
        .limit(1)
    )
    if maybe_sent:
        # Mengulang atau menyusulkan bisa mengirim dua kali
        run.status, run.reason = "failed", f"{MAYBE_SENT} {message or ''}".strip()[:300]
        if run.origin != "manual":
            await _notify(session, schedule, run.reason, outbox)
        return
    await _fail(session, schedule, run, message or TASK_FAILED, now, outbox)


async def run_now(
    session: AsyncSession, schedule: Schedule, member_id: uuid.UUID
) -> tuple[ScheduleRun, Outbox]:
    """Satu putaran manual sekarang; jadwal berikutnya tidak bergeser."""
    now = utcnow()
    run = _manual_run(schedule, now)
    session.add(run)
    outbox = Outbox()
    await start(session, schedule, run, now, outbox, actor_member_id=member_id)
    return run, outbox


async def backfill_now(
    session: AsyncSession, schedule: Schedule, old: ScheduleRun, member_id: uuid.UUID
) -> tuple[ScheduleRun, Outbox]:
    """Susulan atas permintaan pengguna untuk putaran yang terlewat atau gagal."""
    run = _manual_run(schedule, old.planned_for)
    session.add(run)
    outbox = Outbox()
    await start(session, schedule, run, utcnow(), outbox, "backfill", member_id)
    if run.task_id:
        run.reason = "Susulan."
        old.status, old.reason, old.watching, old.due_at = "skipped", BACKFILLED, False, None
        # Susulan otomatis yang masih menunggu tidak perlu lagi
        for pending in await session.scalars(
            select(ScheduleRun).where(
                ScheduleRun.source_id == old.id, ScheduleRun.status == "scheduled"
            )
        ):
            pending.status, pending.reason, pending.due_at = "skipped", BACKFILLED, None
    return run, outbox


def _manual_run(schedule: Schedule, planned_for: datetime.datetime) -> ScheduleRun:
    return ScheduleRun(
        id=uuid.uuid4(),
        schedule_id=schedule.id,
        planned_for=planned_for,
        origin="manual",
        status="created",
        attempt=1,
    )


def _candidates(now: datetime.datetime) -> dict:
    """Jenis pekerjaan -> daftar (id, organisasi) yang perlu diproses."""
    active = Organization.status == "active"

    def runs(*conditions):
        return (
            select(ScheduleRun.id, Schedule.organization_id)
            .join(Schedule, Schedule.id == ScheduleRun.schedule_id)
            .join(Organization, Organization.id == Schedule.organization_id)
            .where(active, *conditions)
            .limit(BATCH)
        )

    return {
        "settle": runs(
            ScheduleRun.watching.is_(True),
            ~select(Task.id)
            .where(Task.id == ScheduleRun.task_id, Task.status.in_(OPEN_STATUSES))
            .exists(),
        ),
        # Jadwal yang dijeda menahan susulan dan coba ulangnya
        "run": runs(ScheduleRun.due_at <= now, Schedule.status.in_(("active", "ended"))),
        "schedule": select(Schedule.id, Schedule.organization_id)
        .join(Organization, Organization.id == Schedule.organization_id)
        .where(
            active,
            Schedule.status == "active",
            or_(Schedule.check_at.is_(None), Schedule.check_at <= now),
        )
        .order_by(Schedule.check_at)
        .limit(BATCH),
    }


async def _handle(
    session: AsyncSession,
    kind: str,
    item_id: uuid.UUID,
    now: datetime.datetime,
    outbox: Outbox,
) -> bool:
    """Kunci satu butir dan periksa ulang syaratnya; dilewati bila sedang dipegang proses lain."""
    model = Schedule if kind == "schedule" else ScheduleRun
    row = await session.scalar(
        select(model)
        .where(model.id == item_id)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    if row is None:
        return False
    if kind == "schedule":
        if row.status != "active" or (row.check_at and row.check_at > now):
            return False
        calendar = await organization_calendar(session, row.organization_id)
        await process_schedule(session, row, calendar, now, outbox)
        return True
    schedule = await session.get(Schedule, row.schedule_id, populate_existing=True)
    if kind == "settle":
        if not row.watching:
            return False
        await settle_run(session, schedule, row, now, outbox)
    else:
        if row.due_at is None or row.due_at > now or schedule.status in ("paused", "draft"):
            return False
        await process_run(session, schedule, row, now, outbox)
    return True


async def dispatch(
    sessions: async_sessionmaker[AsyncSession], now: datetime.datetime | None = None
) -> int:
    """Satu putaran penjadwal. Kegagalan satu butir tidak menghentikan yang lain."""
    now = now or utcnow()
    done = 0
    # Hasil tugas dulu, agar coba ulang dan susulan dijadwalkan sebelum jadwal baru diproses
    for kind, query in _candidates(now).items():
        async with sessions() as session:
            items = (await session.execute(query)).all()
        for item_id, organization_id in items:
            outbox = Outbox()
            try:
                async with sessions() as session:
                    await lock_organization(session, organization_id)
                    handled = await _handle(session, kind, item_id, now, outbox)
                    await session.commit()
            except Exception:
                logger.exception("Penjadwal gagal memproses %s %s", kind, item_id)
                continue
            await outbox.send()
            done += handled
    return done
