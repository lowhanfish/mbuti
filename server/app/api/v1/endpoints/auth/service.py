"""Aturan masuk, penggantian token refresh, dan pencabutan sesi."""

import datetime
import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth.schema import OrganizationSummary, UserProfile
from app.core import rate_limit
from app.core.config import settings
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import create_access_token, hash_token, random_token, verify_password
from app.models import Membership, Organization, RefreshSession, User
from app.models.base import utcnow

logger = logging.getLogger("mbuti.auth")

WRONG_CREDENTIALS = "Email atau kata sandi salah."
SESSION_ENDED = "Sesi login telah berakhir."
# Dua tab bisa memakai token refresh yang sama hampir bersamaan; itu bukan pencurian token.
ROTATION_GRACE = datetime.timedelta(seconds=10)


@dataclass
class ClientInfo:
    ip: str
    user_agent: str


@dataclass
class IssuedSession:
    user: User
    access_token: str
    # None bila token refresh lama tetap berlaku (masa tenggang)
    refresh_token: str | None


async def _membership(session: AsyncSession, user_id: uuid.UUID) -> Membership | None:
    """Keanggotaan yang aktif bila ada; selain itu keanggotaan pertama apa pun statusnya."""
    rows = (
        await session.scalars(
            select(Membership).where(Membership.user_id == user_id).order_by(Membership.joined_at)
        )
    ).all()
    return next((m for m in rows if m.status == "active"), rows[0] if rows else None)


async def build_profile(session: AsyncSession, user: User) -> UserProfile:
    membership = await _membership(session, user.id)
    if membership is not None and membership.status != "active":
        membership = None
    organization = (
        await session.get(Organization, membership.organization_id) if membership else None
    )
    return UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_verified=user.is_verified,
        access_role=membership.access_role if membership else None,
        organization=OrganizationSummary(
            id=str(organization.id), name=organization.name, slug=organization.slug
        )
        if organization
        else None,
        created_at=user.created_at,
    )


def _new_refresh(
    session: AsyncSession, user_id: uuid.UUID, family_id: uuid.UUID, client: ClientInfo
) -> str:
    token = random_token()
    session.add(
        RefreshSession(
            user_id=user_id,
            family_id=family_id,
            token_hash=hash_token(token),
            expires_at=utcnow() + datetime.timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            ip=client.ip[:45],
            user_agent=client.user_agent[:255],
        )
    )
    return token


async def revoke_family(session: AsyncSession, family_id: uuid.UUID, reason: str) -> None:
    await session.execute(
        update(RefreshSession)
        .where(RefreshSession.family_id == family_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoked_reason=reason)
    )


async def revoke_user_sessions(session: AsyncSession, user_id: uuid.UUID, reason: str) -> None:
    await session.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoked_reason=reason)
    )


async def login(
    session: AsyncSession, email: str, password: str, client: ClientInfo
) -> IssuedSession:
    email = email.strip().lower()
    await rate_limit.check_login_allowed(email, client.ip)

    user = await session.scalar(select(User).where(User.email == email))
    if not await verify_password(password, user.password_hash if user else None):
        await rate_limit.record_login_failure(email, client.ip)
        raise UnauthorizedException(WRONG_CREDENTIALS)

    # Alasan penolakan hanya diberitahukan kepada yang tahu kata sandinya
    if not user.is_active:
        raise ForbiddenException("Akun dinonaktifkan. Hubungi admin organisasi.")
    membership = await _membership(session, user.id)
    if membership is not None and membership.status == "disabled":
        raise ForbiddenException("Keanggotaan Anda dinonaktifkan. Hubungi admin organisasi.")

    await rate_limit.clear_login_failures(email, client.ip)
    family_id = uuid.uuid4()
    refresh_token = _new_refresh(session, user.id, family_id, client)
    if membership is not None:
        membership.last_active_at = utcnow()
    await session.commit()
    return IssuedSession(user, create_access_token(user.id, family_id), refresh_token)


async def refresh(session: AsyncSession, token: str, client: ClientInfo) -> IssuedSession:
    if not token:
        raise UnauthorizedException(SESSION_ENDED)
    # Dikunci agar dua permintaan bersamaan tidak sama-sama mengganti token
    row = await session.scalar(
        select(RefreshSession)
        .where(RefreshSession.token_hash == hash_token(token))
        .with_for_update()
    )
    now = utcnow()
    if row is None or row.expires_at <= now:
        raise UnauthorizedException(SESSION_ENDED)

    user = await session.get(User, row.user_id)
    membership = await _membership(session, row.user_id)
    if not user.is_active or (membership is not None and membership.status == "disabled"):
        await revoke_family(session, row.family_id, "disabled")
        await session.commit()
        raise UnauthorizedException(SESSION_ENDED)

    new_token: str | None = None
    if row.revoked_at is None:
        row.revoked_at = now
        row.revoked_reason = "rotated"
        new_token = _new_refresh(session, user.id, row.family_id, client)
    else:
        alive = await session.scalar(
            select(RefreshSession.id).where(
                RefreshSession.family_id == row.family_id, RefreshSession.revoked_at.is_(None)
            )
        )
        recently_rotated = (
            row.revoked_reason == "rotated" and now - row.revoked_at <= ROTATION_GRACE
        )
        if not (recently_rotated and alive):
            if row.revoked_reason == "rotated":
                # Token yang sudah diganti dipakai lagi: anggap bocor, cabut seluruh sesi
                logger.warning(
                    "Token refresh lama dipakai ulang; sesi pengguna %s dicabut", user.id
                )
                await revoke_family(session, row.family_id, "reuse")
                await session.commit()
            raise UnauthorizedException(SESSION_ENDED)

    if membership is not None:
        membership.last_active_at = now
    await session.commit()
    return IssuedSession(user, create_access_token(user.id, row.family_id), new_token)


async def logout(session: AsyncSession, token: str, family_id: uuid.UUID | None) -> None:
    """Cabut sesi yang dikenali dari cookie refresh atau token akses."""
    if token:
        row = await session.scalar(
            select(RefreshSession).where(RefreshSession.token_hash == hash_token(token))
        )
        if row is not None:
            family_id = row.family_id
    if family_id is not None:
        await revoke_family(session, family_id, "logout")
        await session.commit()
