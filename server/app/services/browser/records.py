"""Baris putaran dan catatannya; dipakai worker, API, dan mesin tugas."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BrowserFlow, BrowserRun, BrowserRunEvent, Task
from app.models.base import utcnow
from app.models.browser.flow import ACTIVE_RUN_STATUSES
from app.services.browser import evidence
from app.services.engine.flow import lock_task

OUTDATED = "Alur sudah berubah atau belum disetujui."


def otp_context(run_id: uuid.UUID) -> str:
    return f"browser-otp:{run_id}"


async def next_event_no(session: AsyncSession, run_id: uuid.UUID) -> int:
    highest = await session.scalar(
        select(func.max(BrowserRunEvent.no)).where(BrowserRunEvent.run_id == run_id)
    )
    return (highest or 0) + 1


async def add_event(
    session: AsyncSession,
    run: BrowserRun,
    message: str,
    status: str = "done",
    step_no: int | None = None,
    shot: bytes | None = None,
) -> int:
    """Baris `run` harus sudah dikunci agar nomor catatan tidak bertabrakan."""
    number = await next_event_no(session, run.id)
    if shot:
        evidence.save(run.organization_id, run.flow_id, run.id, number, shot)
    session.add(
        BrowserRunEvent(
            run_id=run.id,
            no=number,
            step_no=step_no,
            message=message[:500],
            status=status,
            has_screenshot=bool(shot),
        )
    )
    return number


async def lock_run(session: AsyncSession, run_id: uuid.UUID) -> BrowserRun | None:
    return await session.scalar(
        select(BrowserRun)
        .where(BrowserRun.id == run_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def lock_run_and_task(
    session: AsyncSession, run_id: uuid.UUID
) -> tuple[Task | None, BrowserRun | None]:
    """Tugas selalu dikunci lebih dulu daripada putarannya, agar tidak saling menunggu."""
    task_id = await session.scalar(select(BrowserRun.task_id).where(BrowserRun.id == run_id))
    task = await lock_task(session, task_id) if task_id else None
    return task, await lock_run(session, run_id)


def close(run: BrowserRun, status: str, message: str) -> None:
    run.status = status
    run.message = message[:500]
    run.pending = None
    run.otp_encrypted = None
    run.finished_at = utcnow()


def reset_approval(flow: BrowserFlow) -> None:
    flow.trusted_submit = False
    flow.successful_runs = 0
    flow.approved_at = None
    flow.approved_by_member_id = None
    flow.updated_at = utcnow()


def new_run(flow: BrowserFlow, mode: str, inputs: dict, member_id: uuid.UUID | None) -> BrowserRun:
    return BrowserRun(
        id=uuid.uuid4(),
        organization_id=flow.organization_id,
        flow_id=flow.id,
        mode=mode,
        status="queued",
        flow_version=flow.version,
        inputs=inputs,
        outputs=[],
        created_by_member_id=member_id,
    )


async def active_run(session: AsyncSession, flow_id: uuid.UUID) -> uuid.UUID | None:
    return await session.scalar(
        select(BrowserRun.id)
        .where(BrowserRun.flow_id == flow_id, BrowserRun.status.in_(ACTIVE_RUN_STATUSES))
        .limit(1)
    )
