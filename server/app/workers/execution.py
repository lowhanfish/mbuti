"""
Pekerjaan eksekusi tugas (antrean `execution`).

Satu pesan mengerjakan satu langkah, lalu mengirim pesan berikutnya. Pada tier gratis jalankan
worker antrean ini dengan `--concurrency=1`.
"""

import asyncio
import datetime
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.db.engine import build_async_engine
from app.models import Task
from app.models.base import utcnow
from app.services.engine import flow
from app.services.engine.execution import Providers, RetryLater, advance
from app.services.llm.embedding import get_embedding_provider
from app.services.llm.generation import get_llm_provider
from app.workers.celery_app import celery_app

logger = logging.getLogger("mbuti.worker.execution")

MAX_RETRIES = 12
# Tugas tanpa kabar selama ini dikirim ulang oleh penjadwal
IDLE_AFTER = datetime.timedelta(minutes=5)
GAVE_UP = "Model tidak kunjung tersedia. Buat ulang tugas ini nanti."


def _run(job):
    """Engine baru per pekerjaan: tiap pekerjaan punya event loop sendiri."""

    async def wrapper():
        engine = build_async_engine(poolclass=NullPool)
        try:
            return await job(async_sessionmaker(bind=engine, expire_on_commit=False))
        finally:
            await engine.dispose()

    return asyncio.run(wrapper())


async def _advance(sessions, task_id: uuid.UUID) -> bool:
    return await advance(sessions, task_id, Providers(get_llm_provider(), get_embedding_provider()))


async def _give_up(sessions, task_id: uuid.UUID) -> None:
    async with sessions() as session:
        task = await flow.lock_task(session, task_id)
        if task is not None and task.status in ("queued", "running"):
            await flow.halt(session, task, "failed", GAVE_UP)
        await session.commit()


async def _stalled(sessions) -> list[str]:
    async with sessions() as session:
        ids = await session.scalars(
            select(Task.id).where(
                Task.status.in_(("queued", "running")), Task.updated_at < utcnow() - IDLE_AFTER
            )
        )
        return [str(task_id) for task_id in ids]


@celery_app.task(name="app.workers.execution.execute_task", bind=True, max_retries=MAX_RETRIES)
def execute_task(self, task_id: str) -> None:
    try:
        more = _run(lambda sessions: _advance(sessions, uuid.UUID(task_id)))
    except RetryLater as exc:
        if self.request.retries >= MAX_RETRIES:
            _run(lambda sessions: _give_up(sessions, uuid.UUID(task_id)))
            return
        raise self.retry(countdown=exc.seconds) from exc
    if more:
        # Pesan baru, agar hitungan percobaan ulang mulai dari nol untuk langkah berikutnya
        execute_task.apply_async(args=[task_id])


@celery_app.task(name="app.workers.execution.recover_stalled")
def recover_stalled() -> int:
    """Kirim ulang tugas yang pesannya hilang, mis. karena worker atau Redis mati."""
    stalled = _run(_stalled)
    for task_id in stalled:
        execute_task.apply_async(args=[task_id])
    if stalled:
        logger.info("%s tugas dikirim ulang ke antrean", len(stalled))
    return len(stalled)
