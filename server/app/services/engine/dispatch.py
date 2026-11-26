"""Kirim tugas ke antrean worker."""

import asyncio
import logging
import uuid

from app.workers.execution import execute_task

logger = logging.getLogger("mbuti.dispatch")


async def enqueue_task(task_id: uuid.UUID) -> None:
    """Bila antrean tidak tersedia, penjadwal akan mengambil tugas ini kemudian."""
    try:
        await asyncio.to_thread(
            execute_task.apply_async,
            args=[str(task_id)],
            retry_policy={"max_retries": 1, "interval_start": 0.2},
        )
    except Exception as exc:
        logger.error("Antrean eksekusi tidak tersedia: %s", type(exc).__name__)
