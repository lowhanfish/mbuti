"""
Akun mandiri (kontrak API bagian 15): daftar, verifikasi email, lupa kata sandi, dan undangan.

Jawaban untuk daftar, kirim ulang verifikasi, dan lupa kata sandi sengaja sama untuk email apa
pun, agar formulir ini tidak bisa dipakai menebak siapa yang punya akun. Email dimasukkan ke
antrean setelah commit, jadi tautan di dalamnya selalu sudah tersimpan.
"""

import asyncio
import logging
import re
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth.schema import (
    AcceptInviteRequest,
    InvitePreview,
    RegisterRequest,
    ResetPasswordRequest,
)
from app.api.v1.endpoints.auth.service import (
    ClientInfo,
    IssuedSession,
    membership_of,
    open_session,
    revoke_user_sessions,
)
from app.core import rate_limit
from app.core.config import settings
from app.core.exceptions import ConflictException, ForbiddenException
from app.core.security import hash_password
from app.models import AuthToken, Membership, Organization, User
from app.models.base import utcnow
from app.services import audit, auth_tokens, mailer

logger = logging.getLogger("mbuti.accounts")

REGISTERED = "Pendaftaran diterima. Periksa email Anda untuk tautan verifikasi."
EMAIL_SENT = (
    "Bila email itu terdaftar, tautannya sudah kami kirim. Periksa kotak masuk dan folder spam."
)
PASSWORD_CHANGED = "Kata sandi sudah diganti. Silakan masuk dengan kata sandi baru."
OTHER_ORGANIZATION = (
    "Email ini sudah dipakai di organisasi lain. Satu akun baru bisa bergabung ke satu organisasi."
)
HOUR = 3600


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:150] or "organisasi"


async def _unique_slug(session: AsyncSession, name: str) -> str:
    base = slugify(name)
    taken = set(
        (
            await session.scalars(
                select(Organization.slug).where(Organization.slug.like(f"{base}%"))
            )
        ).all()
    )
    if base not in taken:
        return base
    for number in range(2, 50):
        if f"{base}-{number}" not in taken:
            return f"{base}-{number}"
    return f"{base}-{secrets.token_hex(3)}"


async def _limit_email_requests(scope: str, email: str, ip: str) -> None:
    await rate_limit.check_rate(f"{scope}-email", email, settings.RATE_EMAIL_PER_HOUR, HOUR)
    await rate_limit.check_rate(f"{scope}-ip", ip, settings.RATE_EMAIL_PER_HOUR_PER_IP, HOUR)


async def limit_links(ip: str) -> None:
    """Membuka tautan (verifikasi, atur ulang, undangan): per alamat, agar token tidak ditebak."""
    await rate_limit.check_rate("tautan", ip, settings.RATE_LINK_PER_HOUR, HOUR)


async def register(session: AsyncSession, body: RegisterRequest, client: ClientInfo) -> None:
    if settings.REGISTRATION_MODE == "closed":
        raise ForbiddenException("Pendaftaran sedang ditutup.")
    await rate_limit.check_rate("daftar", client.ip, settings.RATE_REGISTER_PER_HOUR, HOUR)

    # Hash selalu dihitung agar lama jawaban tidak membedakan email baru dan lama
    password_hash = await asyncio.to_thread(hash_password, body.password)
    existing = await session.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        if existing.is_active and existing.password_hash:
            mailer.queue(mailer.already_registered(existing.email, existing.full_name))
        return

    now = utcnow()
    organization = Organization(
        name=body.organization_name,
        slug=await _unique_slug(session, body.organization_name),
        sector=body.sector,
        status="active" if settings.REGISTRATION_MODE == "open" else "pending",
    )
    user = User(
        email=body.email,
        full_name=body.full_name,
        password_hash=password_hash,
        is_verified=False,
        terms_accepted_at=now,
    )
    session.add_all([organization, user])
    try:
        await session.flush()
        session.add(
            Membership(
                organization_id=organization.id,
                user_id=user.id,
                access_role="owner",
                status="active",
                joined_at=now,
            )
        )
        token = await auth_tokens.issue(session, "verify", user.id)
        audit.add_entry(
            session,
            action="auth.daftar",
            organization_id=organization.id,
            user=user,
            target=organization.name,
            ip=client.ip,
        )
        await session.commit()
    except IntegrityError:
        # Pendaftaran bersamaan dengan email atau slug yang sama: jawab seperti biasa
        await session.rollback()
        logger.info("Pendaftaran bersamaan ditolak oleh batasan unik")
        return
    mailer.queue(mailer.verification(user.email, user.full_name, token))


async def verify_email(session: AsyncSession, token: str, client: ClientInfo) -> IssuedSession:
    await limit_links(client.ip)
    found = await auth_tokens.require_valid(session, token, "verify")
    user = await session.get(User, found.user_id)
    if user is None or not user.is_active:
        raise auth_tokens.invalid_link()
    found.used_at = utcnow()
    user.is_verified = True
    issued = await open_session(session, user, client, "auth.verifikasi")
    await session.commit()
    return issued


async def resend_verification(session: AsyncSession, email: str, client: ClientInfo) -> None:
    email = email.strip().lower()
    await _limit_email_requests("verifikasi", email, client.ip)
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active or not user.password_hash or user.is_verified:
        return
    token = await auth_tokens.issue(session, "verify", user.id)
    await session.commit()
    mailer.queue(mailer.verification(user.email, user.full_name, token))


async def forgot_password(session: AsyncSession, email: str, client: ClientInfo) -> None:
    email = email.strip().lower()
    await _limit_email_requests("lupa", email, client.ip)
    user = await session.scalar(select(User).where(User.email == email))
    # Undangan yang belum diterima tidak punya kata sandi untuk diatur ulang
    if user is None or not user.is_active or not user.password_hash:
        return
    token = await auth_tokens.issue(session, "reset", user.id)
    await session.commit()
    mailer.queue(mailer.password_reset(user.email, user.full_name, token))


async def reset_password(
    session: AsyncSession, body: ResetPasswordRequest, client: ClientInfo
) -> None:
    await limit_links(client.ip)
    password_hash = await asyncio.to_thread(hash_password, body.password)
    found = await auth_tokens.require_valid(session, body.token, "reset")
    user = await session.get(User, found.user_id)
    if user is None or not user.is_active:
        raise auth_tokens.invalid_link()
    found.used_at = utcnow()
    user.password_hash = password_hash
    # Tautan sampai ke kotak masuknya, jadi emailnya terbukti
    user.is_verified = True
    await revoke_user_sessions(session, user.id, "password")
    membership = await membership_of(session, user.id)
    audit.add_entry(
        session,
        action="auth.sandi",
        organization_id=membership.organization_id if membership else None,
        user=user,
        ip=client.ip,
    )
    await session.commit()
    mailer.queue(mailer.password_changed(user.email, user.full_name))


async def _invite(
    session: AsyncSession, token: str, *, lock: bool
) -> tuple[AuthToken, Membership, User, Organization]:
    found = await auth_tokens.find_valid(session, token, "invite", lock=lock)
    membership = (
        await session.get(Membership, found.membership_id)
        if found and found.membership_id
        else None
    )
    if found is None or membership is None or membership.status != "invited":
        raise auth_tokens.invalid_link()
    user = await session.get(User, membership.user_id)
    organization = await session.get(Organization, membership.organization_id)
    if user is None or not user.is_active or organization is None:
        raise auth_tokens.invalid_link()
    return found, membership, user, organization


async def invite_preview(session: AsyncSession, token: str, client: ClientInfo) -> InvitePreview:
    await limit_links(client.ip)
    found, membership, user, organization = await _invite(session, token, lock=False)
    inviter = await session.get(User, found.created_by) if found.created_by else None
    return InvitePreview(
        email=user.email,
        full_name=user.full_name,
        organization_name=organization.name,
        inviter_name=inviter.full_name if inviter else organization.name,
        access_role=membership.access_role,
        expires_at=found.expires_at,
    )


async def accept_invite(
    session: AsyncSession, body: AcceptInviteRequest, client: ClientInfo
) -> IssuedSession:
    await limit_links(client.ip)
    password_hash = await asyncio.to_thread(hash_password, body.password)
    found, membership, user, organization = await _invite(session, body.token, lock=True)
    elsewhere = await session.scalar(
        select(Membership.id).where(
            Membership.user_id == user.id,
            Membership.id != membership.id,
            Membership.status != "invited",
        )
    )
    if elsewhere is not None:
        raise ConflictException(OTHER_ORGANIZATION)

    now = utcnow()
    found.used_at = now
    user.full_name = body.full_name
    user.password_hash = password_hash
    user.is_verified = True
    membership.status = "active"
    membership.joined_at = now
    issued = await open_session(session, user, client, "anggota.terima", target=organization.name)
    await session.commit()
    return issued


async def send_invitation(session: AsyncSession, membership: Membership, inviter: User) -> None:
    """Buat tautan undangan baru, commit, lalu antrekan emailnya. Tautan lama tidak berlaku."""
    user = await session.get(User, membership.user_id)
    organization = await session.get(Organization, membership.organization_id)
    token = await auth_tokens.issue(
        session, "invite", user.id, membership_id=membership.id, created_by=inviter.id
    )
    await session.commit()
    mailer.queue(
        mailer.invitation(user.email, user.full_name, organization.name, inviter.full_name, token)
    )
