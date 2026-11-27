"""Pekerjaan sistem."""

import asyncio

from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.db.engine import build_async_engine
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.system.ping")
def ping() -> str:
    """Memastikan worker mengambil dan menyelesaikan pekerjaan."""
    return "pong"


@celery_app.task(name="app.workers.system.purge_attachments")
def purge_attachments() -> int:
    """Buang lampiran tugas yang tidak jadi dipakai setelah 24 jam (kontrak 16.6)."""
    from app.api.v1.endpoints.admin.tugas.attachments import purge_expired  # noqa: PLC0415

    async def run() -> int:
        engine = build_async_engine(poolclass=NullPool)
        try:
            return await purge_expired(async_sessionmaker(bind=engine, expire_on_commit=False))
        finally:
            await engine.dispose()

    return asyncio.run(run())
