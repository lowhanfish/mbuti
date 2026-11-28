"""/api/v1/auth/dua-langkah: mengatur verifikasi dua langkah (kontrak API bagian 21.2)."""

import uuid

import segno
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.api.v1.common import ApiResponse
from app.api.v1.endpoints.auth.schema import (
    CodeRequest,
    DisableTwoFactorRequest,
    PasswordCheck,
    RecoveryCodes,
    TwoFactorSetup,
    TwoFactorStatus,
)
from app.api.v1.endpoints.auth.service import membership_of
from app.core import encryption, rate_limit, totp
from app.core.config import settings
from app.core.cookies import ACCESS_COOKIE
from app.core.csrf import verify_csrf
from app.core.exceptions import AppException, ConflictException
from app.core.security import read_access_token, verify_password
from app.models import Agent, Membership, RefreshSession, User, UserTwoFactor, VaultAccount
from app.models.base import utcnow
from app.services import audit, two_factor

router = APIRouter(prefix="/dua-langkah", tags=["Verifikasi dua langkah"])

ALREADY_ENABLED = "Verifikasi dua langkah sudah aktif."
WRONG_PASSWORD = "Kata sandi salah."


async def changing_user(request: Request, user: User = Depends(get_current_user)) -> User:
    """Perubahan memerlukan token CSRF, sama seperti rute admin."""
    verify_csrf(request)
    return user


async def check_password(user: User, password: str) -> None:
    # Sesi yang dicuri tidak boleh dipakai menebak kata sandi tanpa batas. Hitungannya per akun
    source = f"sandi:{user.id}"
    await rate_limit.check_login_allowed(user.email, source)
    if not await verify_password(password, user.password_hash):
        await rate_limit.record_login_failure(user.email, source)
        raise AppException(WRONG_PASSWORD, 422)
    await rate_limit.clear_login_failures(user.email, source)


async def record(session: AsyncSession, user: User, action: str, request: Request) -> None:
    membership = await membership_of(session, user.id)
    audit.add_entry(
        session,
        action=action,
        organization_id=membership.organization_id if membership else None,
        user=user,
        ip=request.client.host if request.client else "",
    )


async def vault_account_count(session: AsyncSession, user_id: uuid.UUID) -> int:
    return await session.scalar(
        select(func.count())
        .select_from(VaultAccount)
        .join(Membership, Membership.id == VaultAccount.responsible_member_id)
        .join(Agent, Agent.id == VaultAccount.agent_id)
        .where(Membership.user_id == user_id, Agent.deleted_at.is_(None))
    )


async def enabled_row(session: AsyncSession, user_id: uuid.UUID) -> UserTwoFactor:
    row = await two_factor.find(session, user_id, lock=True)
    if row is None or row.enabled_at is None:
        raise ConflictException(two_factor.NOT_ENABLED)
    return row


@router.get("", response_model=ApiResponse[TwoFactorStatus])
async def status(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)
) -> ApiResponse[TwoFactorStatus]:
    row = await two_factor.find(session, user.id)
    enabled = row is not None and row.enabled_at is not None
    return ApiResponse(
        data=TwoFactorStatus(
            enabled=enabled,
            enabled_at=row.enabled_at if enabled else None,
            recovery_codes_left=len(row.recovery_hashes) if enabled else 0,
            vault_accounts=await vault_account_count(session, user.id),
        )
    )


@router.post("/mulai", response_model=ApiResponse[TwoFactorSetup])
async def start(
    body: PasswordCheck,
    user: User = Depends(changing_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TwoFactorSetup]:
    await check_password(user, body.password)
    row = await two_factor.find(session, user.id, lock=True)
    if row is not None and row.enabled_at is not None:
        raise ConflictException(ALREADY_ENABLED)
    key = totp.generate_key()
    sealed = encryption.encrypt(key.secret, two_factor.secret_context(user.id))
    if row is None:
        session.add(UserTwoFactor(user_id=user.id, secret_encrypted=sealed, recovery_hashes=[]))
    else:
        row.secret_encrypted = sealed
        row.last_step = None
    await session.commit()
    url = totp.otpauth_url(key, user.email, settings.APP_NAME)
    return ApiResponse(
        data=TwoFactorSetup(
            secret=key.secret,
            otpauth_url=url,
            qr_svg=segno.make(url, error="m").svg_data_uri(scale=5, border=2, light="white"),
        )
    )


@router.post("/aktifkan", response_model=ApiResponse[RecoveryCodes])
async def enable(
    body: CodeRequest,
    request: Request,
    user: User = Depends(changing_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RecoveryCodes]:
    row = await two_factor.find(session, user.id, lock=True)
    if row is None:
        raise ConflictException("Mulai pemasangan terlebih dahulu.")
    if row.enabled_at is not None:
        raise ConflictException(ALREADY_ENABLED)
    await two_factor.verify(session, row, body.code, allow_recovery=False)
    codes, row.recovery_hashes = two_factor.new_recovery_codes()
    row.enabled_at = utcnow()
    # Sesi lain mungkin dibuka orang yang hanya tahu kata sandinya
    claims = read_access_token(request.cookies.get(ACCESS_COOKIE, ""))
    others = [RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)]
    if claims is not None:
        others.append(RefreshSession.family_id != claims[1])
    for other in await session.scalars(select(RefreshSession).where(*others)):
        other.revoked_at = utcnow()
        other.revoked_reason = "two_factor"
    await record(session, user, "auth.dua_langkah_aktif", request)
    await session.commit()
    return ApiResponse(
        message="Verifikasi dua langkah aktif.", data=RecoveryCodes(recovery_codes=codes)
    )


@router.post("/kode-cadangan", response_model=ApiResponse[RecoveryCodes])
async def recovery_codes(
    body: CodeRequest,
    request: Request,
    user: User = Depends(changing_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RecoveryCodes]:
    row = await enabled_row(session, user.id)
    await two_factor.verify(session, row, body.code)
    codes, row.recovery_hashes = two_factor.new_recovery_codes()
    await record(session, user, "auth.kode_cadangan", request)
    await session.commit()
    return ApiResponse(
        message="Kode cadangan baru dibuat.", data=RecoveryCodes(recovery_codes=codes)
    )


@router.post("/matikan", response_model=ApiResponse[None])
async def disable(
    body: DisableTwoFactorRequest,
    request: Request,
    user: User = Depends(changing_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    row = await enabled_row(session, user.id)
    await check_password(user, body.password)
    await two_factor.verify(session, row, body.code)
    await session.delete(row)
    await record(session, user, "auth.dua_langkah_mati", request)
    await session.commit()
    return ApiResponse(message="Verifikasi dua langkah dimatikan.", data=None)
