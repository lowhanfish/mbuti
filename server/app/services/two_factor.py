"""Verifikasi dua langkah akun MBUTI (E4a, kontrak API bagian 21)."""

import secrets
import time
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import encryption, rate_limit
from app.core.exceptions import AppException
from app.core.totp import TotpKey
from app.models import UserTwoFactor

REQUIRED = "Masukkan kode dari aplikasi authenticator."
WRONG = "Kode verifikasi salah."
USED = "Kode ini sudah dipakai. Tunggu kode berikutnya."
NOT_ENABLED = "Verifikasi dua langkah belum aktif."
RECOVERY_CODES = 8
# Tanpa huruf dan angka yang mirip (0/o, 1/l/i)
RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def invalid_code(message: str = WRONG) -> AppException:
    # 422, bukan 401: sesi tidak dianggap berakhir oleh frontend
    return AppException(message, 422, "two_factor_invalid")


def secret_context(user_id: uuid.UUID) -> str:
    return f"two-factor:{user_id}"


def key_of(row: UserTwoFactor) -> TotpKey:
    return TotpKey(encryption.decrypt(row.secret_encrypted, secret_context(row.user_id)))


async def find(
    session: AsyncSession, user_id: uuid.UUID, *, lock: bool = False
) -> UserTwoFactor | None:
    query = select(UserTwoFactor).where(UserTwoFactor.user_id == user_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await session.scalar(query)


async def is_enabled(session: AsyncSession, user_id: uuid.UUID) -> bool:
    found = await session.scalar(
        select(UserTwoFactor.user_id).where(
            UserTwoFactor.user_id == user_id, UserTwoFactor.enabled_at.is_not(None)
        )
    )
    return found is not None


def new_recovery_codes() -> tuple[list[str], list[str]]:
    """(kode untuk ditampilkan sekali, sidik jari untuk disimpan)."""

    def part() -> str:
        return "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(5))

    codes = [f"{part()}-{part()}" for _ in range(RECOVERY_CODES)]
    return codes, [encryption.fingerprint(code) for code in codes]


def consume(row: UserTwoFactor, code: str, *, allow_recovery: bool) -> str | None:
    """
    Pakai satu kode: "totp" atau "cadangan" bila sah, None bila salah. Perubahan pada `row`
    baru berlaku setelah pemanggil melakukan commit.
    """
    given = "".join(code.split()).lower()
    key = key_of(row)
    if len(given) == key.digits and given.isascii() and given.isdigit():
        step = key.matching_step(given, time.time())
        if step is None:
            return None
        if row.last_step is not None and step <= row.last_step:
            raise invalid_code(USED)
        row.last_step = step
        return "totp"
    if allow_recovery:
        mark = encryption.fingerprint(given)
        if mark in row.recovery_hashes:
            row.recovery_hashes = [h for h in row.recovery_hashes if h != mark]
            return "cadangan"
    return None


async def verify(
    session: AsyncSession, row: UserTwoFactor, code: str, *, allow_recovery: bool = True
) -> str:
    """Periksa kode dengan batas percobaan per akun. `row` harus sudah dikunci."""
    await rate_limit.count_code_attempt(str(row.user_id))
    method = consume(row, code, allow_recovery=allow_recovery)
    if method is None:
        raise invalid_code()
    await rate_limit.clear_code_attempts(str(row.user_id))
    return method


async def require_code(session: AsyncSession, user_id: uuid.UUID, code: str) -> str:
    """Untuk tindakan yang wajib memakai verifikasi dua langkah, mis. mengubah brankas."""
    row = await find(session, user_id, lock=True)
    if row is None or row.enabled_at is None:
        raise AppException(NOT_ENABLED, 409)
    return await verify(session, row, code)
