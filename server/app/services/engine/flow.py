"""
Perubahan keadaan tugas: langkah, peristiwa, persetujuan, penghentian, dan penyelesaian.

Semua fungsi di sini dipanggil saat baris tugas sudah dikunci (`lock_task`), sehingga worker
dan keputusan manusia tidak saling menimpa.
"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Agent,
    Approval,
    BrowserRun,
    Membership,
    Task,
    TaskEvent,
    TaskStep,
    User,
)
from app.models.base import utcnow
from app.models.browser.flow import ACTIVE_RUN_STATUSES
from app.models.tugas.task import OPEN_STATUSES
from app.services.engine import compose

RUNNABLE = ("queued", "running")


async def lock_task(session: AsyncSession, task_id: uuid.UUID) -> Task | None:
    return await session.scalar(
        select(Task)
        .where(Task.id == task_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def agent_name(session: AsyncSession, agent_id: uuid.UUID) -> str:
    return await session.scalar(select(Agent.name).where(Agent.id == agent_id)) or "(role)"


async def member_name(session: AsyncSession, member_id: uuid.UUID | None) -> str:
    name = await session.scalar(
        select(User.full_name)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.id == member_id)
    )
    return name or "manusia"


def log(
    session: AsyncSession,
    task: Task,
    kind: str,
    message: str,
    step_id: uuid.UUID | None = None,
) -> None:
    session.add(TaskEvent(task_id=task.id, step_id=step_id, type=kind, message=message[:1000]))
    task.updated_at = utcnow()


async def add_step(
    session: AsyncSession,
    task: Task,
    agent_id: uuid.UUID,
    kind: str,
    *,
    via_relation_id: uuid.UUID | None = None,
    parent_step_id: uuid.UUID | None = None,
    attempt_no: int = 1,
    input_notes: str = "",
    queue_no: float | None = None,
) -> TaskStep:
    """Tambah langkah di akhir antrean, kecuali `queue_no` ditentukan."""
    if queue_no is None:
        last = await session.scalar(
            select(func.max(TaskStep.queue_no)).where(TaskStep.task_id == task.id)
        )
        queue_no = float(int(last or 0) + 1)
    step = TaskStep(
        id=uuid.uuid4(),
        task_id=task.id,
        agent_id=agent_id,
        kind=kind,
        via_relation_id=via_relation_id,
        parent_step_id=parent_step_id,
        attempt_no=attempt_no,
        input_notes=input_notes,
        queue_no=queue_no,
        # Konsultasi tidak berkonsultasi lagi, dan ulangan memakai masukan yang sudah ada
        consults_expanded=kind == "consult" or attempt_no > 1,
    )
    session.add(step)
    await session.flush()
    return step


async def owner_of(session: AsyncSession, agent_id: uuid.UUID, task: Task) -> uuid.UUID | None:
    """Penanggung jawab role; pembuat tugas bila kosong, tidak aktif, atau pemantau."""
    owner = await session.scalar(
        select(Membership.id)
        .join(Agent, Agent.owner_member_id == Membership.id)
        .where(
            Agent.id == agent_id,
            Membership.status == "active",
            Membership.access_role != "viewer",
        )
    )
    return owner or task.created_by_member_id


async def request_approval(
    session: AsyncSession,
    task: Task,
    *,
    step_id: uuid.UUID | None,
    reason: str,
    question: str,
    requested_from: uuid.UUID | None,
    follow_up: dict,
) -> None:
    session.add(
        Approval(
            task_id=task.id,
            step_id=step_id,
            reason=reason,
            question=question[:1000],
            requested_from_member_id=requested_from,
            follow_up=follow_up,
        )
    )
    name = await member_name(session, requested_from)
    log(session, task, "approval_requested", f"Menunggu keputusan {name}: {question}", step_id)
    await session.flush()


async def pending_approvals(session: AsyncSession, task: Task) -> list[Approval]:
    return list(
        await session.scalars(
            select(Approval)
            .where(Approval.task_id == task.id, Approval.status == "pending")
            .order_by(Approval.seq)
        )
    )


async def skip_unfinished_steps(session: AsyncSession, task: Task) -> None:
    """Termasuk langkah yang ditahan menunggu izin."""
    await session.execute(
        update(TaskStep)
        .where(TaskStep.task_id == task.id, TaskStep.status.in_(RUNNABLE))
        .values(status="skipped", queue_no=None, finished_at=utcnow())
        .execution_options(synchronize_session="fetch")
    )


async def close_approvals(session: AsyncSession, task: Task, comment: str) -> None:
    for approval in await pending_approvals(session, task):
        approval.status = "rejected"
        approval.comment = comment
        approval.decided_at = utcnow()


async def halt(
    session: AsyncSession,
    task: Task,
    status: str,
    message: str,
    step_id: uuid.UUID | None = None,
    comment: str = "Tugas dihentikan otomatis.",
) -> None:
    """Hentikan tugas: langkah yang belum selesai dilewati dan persetujuan tertunda ditutup."""
    await skip_unfinished_steps(session, task)
    await stop_browser_runs(session, task)
    await close_approvals(session, task, comment)
    task.pending_routes = []
    task.status = status
    log(session, task, status, message, step_id)


async def stop_browser_runs(session: AsyncSession, task: Task) -> None:
    """Putaran aplikasi milik tugas ini tidak boleh berjalan terus sesudah tugasnya berhenti."""
    await session.execute(
        update(BrowserRun)
        .where(BrowserRun.task_id == task.id, BrowserRun.status.in_(ACTIVE_RUN_STATUSES))
        .values(
            status="stopped",
            message="Tugas dihentikan.",
            pending=None,
            otp_encrypted=None,
            finished_at=utcnow(),
        )
        .execution_options(synchronize_session="fetch")
    )


async def has_work(session: AsyncSession, task: Task) -> bool:
    """Ada yang bisa dikerjakan worker sekarang."""
    if task.pending_routes or task.flow_stage == "prepare":
        return True
    queued = await session.scalar(
        select(TaskStep.id)
        .where(
            TaskStep.task_id == task.id,
            TaskStep.status.in_(RUNNABLE),
            TaskStep.queue_no.is_not(None),
        )
        .limit(1)
    )
    return queued is not None


async def _ask_about_composed(session: AsyncSession, task: Task) -> bool:
    """
    Hasil kerja terakhir tiap role yang bermode Susun bebas dan berisi buatan sendiri wajib
    diputuskan manusia sebelum tugas selesai (kontrak 20.3). True bila ada yang diminta.
    """
    steps = await session.scalars(
        select(TaskStep)
        .where(
            TaskStep.task_id == task.id,
            TaskStep.kind == "work",
            TaskStep.status.in_(("done", "revise_requested")),
        )
        .order_by(TaskStep.seq)
    )
    latest = {step.agent_id: step for step in steps.all()}
    asked = False
    for step in latest.values():
        if step.compose_mode != compose.FREE or not step.composed:
            continue
        if await session.scalar(
            select(Approval.id).where(Approval.step_id == step.id, Approval.reason == "composed")
        ):
            continue
        name = await agent_name(session, step.agent_id)
        parts = ", ".join(item["part"] for item in step.composed[:5])
        await request_approval(
            session,
            task,
            step_id=step.id,
            reason="composed",
            question=f"Hasil {name} berisi bagian buatan sendiri ({parts}). Setujui?",
            requested_from=await owner_of(session, step.agent_id, task),
            follow_up={"type": "none"},
        )
        asked = True
    return asked


async def settle(session: AsyncSession, task: Task) -> None:
    """Tentukan keadaan tugas yang masih terbuka: berjalan, menunggu manusia, atau selesai."""
    if task.status not in OPEN_STATUSES:
        return
    await session.flush()
    if await has_work(session, task):
        if task.status != "queued":
            task.status = "running"
        elif await session.scalar(
            select(TaskStep.id)
            .where(TaskStep.task_id == task.id, TaskStep.started_at.is_not(None))
            .limit(1)
        ):
            task.status = "running"
    elif await pending_approvals(session, task) or await _ask_about_composed(session, task):
        task.status = "waiting_approval"
    elif task.flow and task.flow_stage != "done":
        # Alur aplikasi dijalankan paling akhir (E4c)
        if task.flow_stage is None:
            task.flow_stage = "prepare"
        task.status = "running"
    else:
        # Langkah yang masih ditahan tanpa izin tertunda tidak akan pernah jalan
        await skip_unfinished_steps(session, task)
        task.status = "completed"
        task.completed_at = utcnow()
        log(session, task, "completed", "Tugas selesai.")
    task.updated_at = utcnow()
