"""
Analisis role dan putaran tanya jawab (antrean `execution`, kontrak 16.1).

Berbagi antrean dengan eksekusi tugas agar panggilan model tetap satu per satu pada tier gratis.
"""

import asyncio
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.db.engine import build_async_engine
from app.services.engine.execution import RetryLater
from app.services.formation.job import give_up, run_job
from app.services.llm.generation import get_llm_provider
from app.workers.celery_app import celery_app

MAX_RETRIES = 12


def _run(job):
    async def wrapper():
        engine = build_async_engine(poolclass=NullPool)
        try:
            return await job(async_sessionmaker(bind=engine, expire_on_commit=False))
        finally:
            await engine.dispose()

    return asyncio.run(wrapper())


@celery_app.task(name="app.workers.formation.run_formation", bind=True, max_retries=MAX_RETRIES)
def run_formation(self, revision_id: str) -> None:
    try:
        _run(lambda sessions: run_job(sessions, uuid.UUID(revision_id), get_llm_provider()))
    except RetryLater as exc:
        if self.request.retries >= MAX_RETRIES:
            _run(lambda sessions: give_up(sessions, uuid.UUID(revision_id)))
            return
        # Jeda bertambah agar kuota yang habis tidak dicoba terus-menerus
        raise self.retry(countdown=min(exc.seconds * (self.request.retries + 1), 1800)) from exc
