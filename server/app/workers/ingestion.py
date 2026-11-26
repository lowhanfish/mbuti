"""Pekerjaan olah dokumen (antrean `ingestion`)."""

import asyncio
import logging
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.db.engine import build_async_engine
from app.services.knowledge.ingest import RetryLater, ingest_version, mark_failed
from app.services.llm.embedding import get_embedding_provider
from app.workers.celery_app import celery_app

logger = logging.getLogger("mbuti.worker.ingestion")

MAX_RETRIES = 30
GAVE_UP = "Kuota model tidak kunjung tersedia. Unggah ulang nanti."


async def _run(version_id: uuid.UUID, give_up: bool = False) -> None:
    # Engine baru per pekerjaan: tiap pekerjaan punya event loop sendiri
    engine = build_async_engine(poolclass=NullPool)
    sessions = async_sessionmaker(bind=engine, expire_on_commit=False)
    try:
        if give_up:
            await mark_failed(sessions, version_id, GAVE_UP)
        else:
            await ingest_version(sessions, version_id, get_embedding_provider())
    finally:
        await engine.dispose()


@celery_app.task(name="app.workers.ingestion.process_version", bind=True, max_retries=MAX_RETRIES)
def process_version(self, version_id: str) -> None:
    try:
        asyncio.run(_run(uuid.UUID(version_id)))
    except RetryLater as exc:
        if self.request.retries >= MAX_RETRIES:
            asyncio.run(_run(uuid.UUID(version_id), give_up=True))
            return
        # Jeda bertambah agar kuota harian yang habis tidak dicoba terus-menerus
        delay = min(exc.seconds * (self.request.retries + 1), 1800)
        raise self.retry(countdown=delay) from exc
