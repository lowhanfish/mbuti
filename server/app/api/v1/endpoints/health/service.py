"""Pemeriksaan database dan Redis. Rincian galat hanya ditulis ke log."""

import asyncio
import logging

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.api.v1.endpoints.health.schema import HealthData
from app.core.config import settings

logger = logging.getLogger("mbuti.health")

# Database bisa berada di server jauh yang butuh beberapa detik untuk koneksi pertama.
DATABASE_TIMEOUT_SECONDS = 15
REDIS_TIMEOUT_SECONDS = 3


async def check_database(session: AsyncSession) -> tuple[bool, bool]:
    """Kembalikan (database terjangkau, ekstensi vector aktif)."""
    try:
        async with asyncio.timeout(DATABASE_TIMEOUT_SECONDS):
            has_vector = await session.scalar(
                text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')")
            )
    except Exception as exc:
        logger.warning("Database tidak terjangkau: %s", type(exc).__name__)
        return False, False
    return True, bool(has_vector)


async def check_redis() -> bool:
    try:
        async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
            async with Redis.from_url(settings.REDIS_URL) as client:
                return bool(await client.ping())
    except Exception as exc:
        logger.warning("Redis tidak terjangkau: %s", type(exc).__name__)
        return False


async def get_health(session: AsyncSession) -> HealthData:
    (database_up, vector_up), redis_up = await asyncio.gather(
        check_database(session), check_redis()
    )
    healthy = database_up and vector_up and redis_up
    return HealthData(
        status="ok" if healthy else "degraded",
        version=__version__,
        database="up" if database_up else "down",
        pgvector="up" if vector_up else "down",
        redis="up" if redis_up else "down",
    )
