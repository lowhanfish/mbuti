"""Penjadwal tugas rutin (antrean `default`), dipicu `celery beat` setiap menit."""

import asyncio

from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.db.engine import build_async_engine
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.schedule.dispatch_schedules")
def dispatch_schedules() -> int:
    from app.services.schedule.runner import dispatch  # noqa: PLC0415

    async def run() -> int:
        engine = build_async_engine(poolclass=NullPool)
        try:
            return await dispatch(async_sessionmaker(bind=engine, expire_on_commit=False))
        finally:
            await engine.dispose()

    return asyncio.run(run())
