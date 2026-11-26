"""
Dependency FastAPI terpusat.

`organization_id` selalu berasal dari keanggotaan pengguna yang masuk, tidak pernah dari
permintaan (kontrak API bagian 1.1).
"""

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cookies import ACCESS_COOKIE
from app.core.csrf import verify_csrf
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import read_access_token
from app.db.session import get_db
from app.models import Membership, RefreshSession, User

__all__ = [
    "CurrentMember",
    "get_current_member",
    "get_current_user",
    "get_db",
    "require_manager",
]

MANAGERS = ("owner", "admin")


@dataclass(frozen=True)
class CurrentMember:
    user: User
    membership: Membership

    @property
    def organization_id(self):
        return self.membership.organization_id

    @property
    def access_role(self) -> str:
        return self.membership.access_role


async def get_current_user(request: Request, session: AsyncSession = Depends(get_db)) -> User:
    """Pengguna dari cookie akses, selama sesinya belum dicabut."""
    claims = read_access_token(request.cookies.get(ACCESS_COOKIE, ""))
    if claims is None:
        raise UnauthorizedException("Silakan masuk terlebih dahulu.")
    user_id, family_id = claims
    session_alive = exists().where(
        RefreshSession.family_id == family_id,
        RefreshSession.user_id == user_id,
        RefreshSession.revoked_at.is_(None),
        RefreshSession.expires_at > func.now(),
    )
    user = await session.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True), session_alive)
    )
    if user is None:
        raise UnauthorizedException("Sesi login telah berakhir.")
    return user


async def get_current_member(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CurrentMember:
    """Keanggotaan aktif pengguna. Permintaan yang mengubah data juga harus lolos CSRF."""
    membership = await session.scalar(
        select(Membership)
        .where(Membership.user_id == user.id, Membership.status == "active")
        .order_by(Membership.joined_at)
        .limit(1)
    )
    if membership is None:
        raise ForbiddenException("Akun Anda belum menjadi anggota aktif organisasi mana pun.")
    # Setelah autentikasi, agar sesi yang berakhir dijawab 401 (memicu refresh), bukan 403.
    verify_csrf(request)
    return CurrentMember(user=user, membership=membership)


def require_access(*roles: str) -> Callable:
    async def dependency(member: CurrentMember = Depends(get_current_member)) -> CurrentMember:
        if member.access_role not in roles:
            raise ForbiddenException("Hanya pemilik atau admin yang dapat melakukan perubahan ini.")
        return member

    return dependency


require_manager = require_access(*MANAGERS)
