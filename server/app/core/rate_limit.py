"""Batas percobaan masuk dan batas laju, disimpan di Redis agar berlaku untuk semua proses."""

import hashlib
import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.exceptions import AppException, RateLimitException

logger = logging.getLogger("mbuti.rate_limit")

FAILURE_WINDOW_SECONDS = 300


def key_prefix() -> str:
    return f"mbuti:{settings.APP_ENV}:login:"


def _failure_key(email: str, ip: str) -> str:
    digest = hashlib.sha256(f"{email}|{ip}".encode()).hexdigest()
    return f"{key_prefix()}fail:{digest}"


async def _count(client: Redis, key: str, window: int) -> int:
    async with client.pipeline() as pipe:
        pipe.incr(key)
        # NX: jendela dihitung sejak percobaan pertama, tidak diperpanjang tiap percobaan
        pipe.expire(key, window, nx=True)
        total, _ = await pipe.execute()
    return total


def _unavailable(exc: RedisError) -> AppException:
    # Tanpa pembatas, masuk ditolak: lebih aman daripada membiarkan tebakan tanpa batas.
    logger.error("Pembatas percobaan masuk tidak tersedia: %s", type(exc).__name__)
    return AppException("Layanan sedang tidak tersedia. Coba lagi beberapa saat.", 503)


async def check_login_allowed(email: str, ip: str) -> None:
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            attempts = await _count(client, f"{key_prefix()}ip:{ip}", 60)
            failures = int(await client.get(_failure_key(email, ip)) or 0)
    except RedisError as exc:
        raise _unavailable(exc) from exc
    if attempts > settings.LOGIN_LIMIT_PER_MINUTE or failures >= settings.LOGIN_FAILURE_LIMIT:
        raise RateLimitException("Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.")


async def record_login_failure(email: str, ip: str) -> None:
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            await _count(client, _failure_key(email, ip), FAILURE_WINDOW_SECONDS)
    except RedisError as exc:
        raise _unavailable(exc) from exc


async def clear_login_failures(email: str, ip: str) -> None:
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            await client.delete(_failure_key(email, ip))
    except RedisError as exc:
        raise _unavailable(exc) from exc


async def count_code_attempt(user_id: str) -> None:
    """
    Dihitung sebelum kode diperiksa, sehingga percobaan bersamaan tidak lolos dari batas.
    Berlaku per akun dari alamat mana pun.
    """
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            total = await _count(client, f"{key_prefix()}kode:{user_id}", FAILURE_WINDOW_SECONDS)
    except RedisError as exc:
        raise _unavailable(exc) from exc
    if total > settings.TWO_FACTOR_FAILURE_LIMIT:
        raise RateLimitException("Terlalu banyak kode salah. Coba lagi beberapa menit lagi.")


async def clear_code_attempts(user_id: str) -> None:
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            await client.delete(f"{key_prefix()}kode:{user_id}")
    except RedisError as exc:
        raise _unavailable(exc) from exc


async def check_rate(scope: str, identity: str, limit: int, window: int = 60) -> None:
    """
    Batas pemakaian per jendela waktu (bawaan semenit) untuk tindakan yang mahal: memanggil
    model, menyimpan berkas, atau mengirim email.

    Bila Redis tidak tersedia, permintaan diteruskan: berbeda dari percobaan masuk, di sini
    layanan yang tetap jalan lebih penting, dan batas biaya model masih berlaku.
    """
    key = f"mbuti:{settings.APP_ENV}:laju:{scope}:{hashlib.sha256(identity.encode()).hexdigest()}"
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            total = await _count(client, key, window)
    except RedisError as exc:
        logger.error("Pembatas laju tidak tersedia: %s", type(exc).__name__)
        return
    if total > limit:
        raise RateLimitException("Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.")
