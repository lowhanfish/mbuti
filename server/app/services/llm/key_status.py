"""
Catatan pemakaian tiap kunci di Redis, agar halaman Pengaturan melihat keadaan dari API
maupun worker. Hanya nama variabel yang disimpan, tidak pernah isi kunci. Bila Redis tidak
tersedia, pencatatan dilewati tanpa mengganggu panggilan model.
"""

import datetime
import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger("mbuti.gemini")


def _key(name: str, field: str) -> str:
    return f"mbuti:{settings.APP_ENV}:gemini:{name}:{field}"


def _today() -> str:
    return datetime.datetime.now(datetime.UTC).date().isoformat()


async def _write(name: str | None, commands) -> None:
    if name is None:
        return
    try:
        async with Redis.from_url(settings.REDIS_URL) as client, client.pipeline() as pipe:
            commands(pipe)
            await pipe.execute()
    except RedisError as exc:
        logger.warning("Status kunci tidak tercatat: %s", type(exc).__name__)


async def record_use(name: str | None) -> None:
    now = datetime.datetime.now(datetime.UTC).isoformat()

    def commands(pipe):
        counter = _key(name, f"count:{_today()}")
        pipe.incr(counter)
        pipe.expire(counter, 2 * 86_400)
        pipe.set(_key(name, "last"), now, ex=30 * 86_400)

    await _write(name, commands)


async def record_cooldown(name: str | None, seconds: int) -> None:
    await _write(name, lambda pipe: pipe.set(_key(name, "cooling"), 1, ex=seconds))


async def record_rejected(name: str | None, seconds: int) -> None:
    await _write(name, lambda pipe: pipe.set(_key(name, "invalid"), 1, ex=seconds))


async def read_status(names: list[str]) -> list[dict]:
    """Keadaan tiap kunci sesuai `ApiKeyInfo` pada kontrak."""
    now = datetime.datetime.now(datetime.UTC)
    result = []
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            for name in names:
                async with client.pipeline() as pipe:
                    pipe.get(_key(name, f"count:{_today()}"))
                    pipe.get(_key(name, "last"))
                    pipe.ttl(_key(name, "cooling"))
                    pipe.exists(_key(name, "invalid"))
                    count, last, cooling, invalid = await pipe.execute()
                status = "invalid" if invalid else "cooling" if cooling > 0 else "active"
                result.append(
                    {
                        "env_name": name,
                        "status": status,
                        "requests_today": int(count or 0),
                        "last_used_at": last.decode() if last else None,
                        "cooldown_until": (now + datetime.timedelta(seconds=cooling)).isoformat()
                        if status == "cooling"
                        else None,
                    }
                )
    except RedisError as exc:
        logger.warning("Status kunci tidak terbaca: %s", type(exc).__name__)
        return [
            {
                "env_name": name,
                "status": "active",
                "requests_today": 0,
                "last_used_at": None,
                "cooldown_until": None,
            }
            for name in names
        ]
    return result
