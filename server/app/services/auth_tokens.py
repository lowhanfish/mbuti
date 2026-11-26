"""Token sekali pakai untuk tautan email (verifikasi, atur ulang kata sandi, undangan)."""

import datetime
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException
from app.core.security import hash_token, random_token
from app.models import AuthToken
from app.models.base import utcnow

TOKEN_TTL = {
    "verify": datetime.timedelta(hours=24),
    "reset": datetime.timedelta(hours=1),
    "invite": datetime.timedelta(days=7),
}
INVALID_LINK = "Tautan tidak berlaku, sudah dipakai, atau kedaluwarsa. Minta tautan baru."
# Token dikirim lewat alamat; teks lebih panjang dari ini pasti bukan token kita
MAX_TOKEN_LENGTH = 200


def invalid_link() -> BadRequestException:
    return BadRequestException(INVALID_LINK, code="invalid_token")


async def issue(
    session: AsyncSession,
    purpose: str,
    user_id: uuid.UUID,
    *,
    membership_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
) -> str:
    """
    Buat token baru dan kembalikan token aslinya (hanya untuk email). Token belum terpakai
    dengan tujuan yang sama untuk pengguna itu, atau keanggotaan itu, tidak berlaku lagi.
    """
    now = utcnow()
    same = (
        AuthToken.membership_id == membership_id if membership_id else AuthToken.user_id == user_id
    )
    await session.execute(
        update(AuthToken)
        .where(AuthToken.purpose == purpose, same, AuthToken.used_at.is_(None))
        .values(used_at=now)
    )
    token = random_token(32)
    session.add(
        AuthToken(
            user_id=user_id,
            purpose=purpose,
            membership_id=membership_id,
            token_hash=hash_token(token),
            expires_at=now + TOKEN_TTL[purpose],
            created_by=created_by,
        )
    )
    return token


async def find_valid(
    session: AsyncSession, token: str, purpose: str, *, lock: bool = True
) -> AuthToken | None:
    """Token yang belum dipakai dan belum kedaluwarsa. Dikunci agar tidak dipakai dua kali."""
    if not token or len(token) > MAX_TOKEN_LENGTH:
        return None
    query = select(AuthToken).where(
        AuthToken.token_hash == hash_token(token),
        AuthToken.purpose == purpose,
        AuthToken.used_at.is_(None),
        AuthToken.expires_at > utcnow(),
    )
    if lock:
        query = query.with_for_update()
    return await session.scalar(query)


async def require_valid(session: AsyncSession, token: str, purpose: str) -> AuthToken:
    found = await find_valid(session, token, purpose)
    if found is None:
        raise invalid_link()
    return found
