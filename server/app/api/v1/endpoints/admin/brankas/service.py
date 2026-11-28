"""Aturan brankas: siapa yang boleh mengubah, dan kapan sebuah akun terkunci."""

import json
import time
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.brankas.schema import (
    MAX_ACCOUNTS,
    VaultAccess,
    VaultAccountItem,
    VaultCode,
    VaultData,
    VaultInput,
)
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.core.totp import TotpKey, parse_key
from app.db.transaction import commit_or_raise_unique_conflict
from app.models import Agent, Membership, User, VaultAccount
from app.models.base import utcnow
from app.services import two_factor
from app.services.vault import secrets
from app.services.vault.addresses import origin_of

ROLE_NOT_FOUND = "Role tidak ditemukan."
NOT_FOUND = "Akun brankas tidak ditemukan."
NAME_TAKEN = "Nama aplikasi sudah dipakai di brankas role ini."
LOCKED = "Konfirmasi akun ini terlebih dahulu."
BLOCKED = {
    "viewer": "Pemantau tidak dapat mengubah brankas.",
    "no_responsible": "Role ini belum punya penanggung jawab.",
    "not_responsible": "Hanya penanggung jawab role yang dapat mengubah brankas.",
    "two_factor_off": "Aktifkan verifikasi dua langkah di Akun Saya untuk mengubah brankas.",
}


@dataclass
class Scope:
    member: CurrentMember
    agent: Agent
    responsible: Membership | None
    access: VaultAccess


async def _scope(
    session: AsyncSession, member: CurrentMember, role_id: str, *, lock: bool = False
) -> Scope:
    query = select(Agent).where(
        Agent.id == parse_id(role_id, ROLE_NOT_FOUND),
        Agent.organization_id == member.organization_id,
        Agent.deleted_at.is_(None),
    )
    if lock:
        # Penanggung jawab dan jumlah akun tidak berubah selama perubahan berjalan
        query = query.with_for_update()
    agent = await session.scalar(query)
    if agent is None:
        raise NotFoundException(ROLE_NOT_FOUND)
    responsible, name = None, None
    if agent.owner_member_id:
        row = (
            await session.execute(
                select(Membership, User.full_name)
                .join(User, User.id == Membership.user_id)
                .where(Membership.id == agent.owner_member_id)
            )
        ).first()
        if row is not None:
            responsible, name = row
    if member.access_role == "viewer":
        blocker = "viewer"
    elif responsible is None:
        blocker = "no_responsible"
    elif responsible.id != member.membership.id:
        blocker = "not_responsible"
    elif not await two_factor.is_enabled(session, member.user.id):
        blocker = "two_factor_off"
    else:
        blocker = ""
    access = VaultAccess(can_manage=not blocker, blocker=blocker, responsible_name=name)
    return Scope(member, agent, responsible, access)


async def _manage(session: AsyncSession, member: CurrentMember, role_id: str) -> Scope:
    scope = await _scope(session, member, role_id, lock=True)
    if scope.access.blocker:
        raise ForbiddenException(BLOCKED[scope.access.blocker])
    return scope


async def _account(session: AsyncSession, scope: Scope, account_id: str) -> VaultAccount:
    account = await session.scalar(
        select(VaultAccount).where(
            VaultAccount.id == parse_id(account_id, NOT_FOUND),
            VaultAccount.agent_id == scope.agent.id,
            VaultAccount.organization_id == scope.member.organization_id,
        )
    )
    if account is None:
        raise NotFoundException(NOT_FOUND)
    return account


def is_locked(account: VaultAccount, responsible: Membership | None) -> bool:
    """Tidak dipakai sampai penanggung jawab yang sekarang menyimpan atau mengonfirmasinya."""
    return (
        responsible is None
        or responsible.status != "active"
        or account.responsible_member_id != responsible.id
    )


def _item(scope: Scope, account: VaultAccount) -> VaultAccountItem:
    sees_username = scope.member.access_role in ("owner", "admin") or (
        scope.responsible is not None and scope.responsible.id == scope.member.membership.id
    )
    return VaultAccountItem(
        id=str(account.id),
        name=account.name,
        url=secrets.open_text(account, "url"),
        other_urls=secrets.other_urls(account),
        username=secrets.open_text(account, "username") if sees_username else "",
        has_password=True,
        has_totp=account.totp_encrypted is not None,
        locked=is_locked(account, scope.responsible),
        password_changed_at=account.password_changed_at,
        last_used_at=account.last_used_at,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


async def read_vault(session: AsyncSession, member: CurrentMember, role_id: str) -> VaultData:
    scope = await _scope(session, member, role_id)
    accounts = await session.scalars(
        select(VaultAccount)
        .where(
            VaultAccount.agent_id == scope.agent.id,
            VaultAccount.organization_id == member.organization_id,
        )
        .order_by(func.lower(VaultAccount.name))
    )
    return VaultData(accounts=[_item(scope, a) for a in accounts], access=scope.access)


async def _check_name(
    session: AsyncSession, scope: Scope, name: str, current: VaultAccount | None
) -> None:
    query = select(VaultAccount.id).where(
        VaultAccount.agent_id == scope.agent.id, func.lower(VaultAccount.name) == name.lower()
    )
    if current is not None:
        query = query.where(VaultAccount.id != current.id)
    if await session.scalar(query.limit(1)):
        raise ConflictException(NAME_TAKEN)


def _parsed(body: VaultInput) -> tuple[set[str], TotpKey | None]:
    """Asal yang diizinkan dan kunci authenticator baru (None bila tidak diisi)."""
    try:
        origins = {origin_of(body.url)}
        origins |= {origin_of(url, "Alamat lain") for url in body.other_urls}
        raw_key = body.totp_key.get_secret_value()
        return origins, parse_key(raw_key) if raw_key else None
    except ValueError as exc:
        raise UnprocessableEntityException(str(exc)) from None


def _write(account: VaultAccount, body: VaultInput) -> None:
    secrets.seal(account, "url", body.url)
    secrets.seal(account, "other_urls", json.dumps(body.other_urls))
    secrets.seal(account, "username", body.username)
    account.name = body.name


async def create_account(
    session: AsyncSession, member: CurrentMember, role_id: str, body: VaultInput
) -> VaultAccountItem:
    scope = await _manage(session, member, role_id)
    count = await session.scalar(
        select(func.count())
        .select_from(VaultAccount)
        .where(VaultAccount.agent_id == scope.agent.id)
    )
    if count >= MAX_ACCOUNTS:
        raise ConflictException(f"Brankas satu role maksimal {MAX_ACCOUNTS} akun.")
    await _check_name(session, scope, body.name, None)
    _, key = _parsed(body)
    password = body.password.get_secret_value()
    if not password:
        raise UnprocessableEntityException("Password wajib diisi.")
    await two_factor.require_code(session, member.user.id, body.code)
    account = VaultAccount(
        id=uuid.uuid4(),
        organization_id=member.organization_id,
        agent_id=scope.agent.id,
        responsible_member_id=member.membership.id,
        password_changed_at=utcnow(),
        created_by=member.user.id,
    )
    _write(account, body)
    secrets.seal(account, "password", password)
    secrets.seal_totp(account, key)
    session.add(account)
    await commit_or_raise_unique_conflict(session, NAME_TAKEN)
    return _item(scope, account)


async def update_account(
    session: AsyncSession, member: CurrentMember, role_id: str, account_id: str, body: VaultInput
) -> VaultAccountItem:
    scope = await _manage(session, member, role_id)
    account = await _account(session, scope, account_id)
    if is_locked(account, scope.responsible):
        raise ConflictException(LOCKED)
    await _check_name(session, scope, body.name, account)
    origins, key = _parsed(body)
    password = body.password.get_secret_value()
    known = {
        origin_of(u) for u in [secrets.open_text(account, "url"), *secrets.other_urls(account)]
    }
    # Rahasia lama tidak boleh dialihkan ke situs baru tanpa diketik ulang
    if origins - known:
        if not password:
            raise UnprocessableEntityException("Alamat berubah ke situs lain: isi ulang password.")
        if account.totp_encrypted and key is None and not body.remove_totp:
            raise UnprocessableEntityException(
                "Alamat berubah ke situs lain: isi ulang kunci authenticator atau hapus."
            )
    await two_factor.require_code(session, member.user.id, body.code)
    _write(account, body)
    if password:
        secrets.seal(account, "password", password)
        account.password_changed_at = utcnow()
    if key is not None:
        secrets.seal_totp(account, key)
    elif body.remove_totp:
        secrets.seal_totp(account, None)
    account.updated_at = utcnow()
    await commit_or_raise_unique_conflict(session, NAME_TAKEN)
    return _item(scope, account)


async def delete_account(
    session: AsyncSession, member: CurrentMember, role_id: str, account_id: str, code: str
) -> None:
    scope = await _manage(session, member, role_id)
    account = await _account(session, scope, account_id)
    await two_factor.require_code(session, member.user.id, code)
    await session.delete(account)
    await session.commit()


async def confirm_account(
    session: AsyncSession, member: CurrentMember, role_id: str, account_id: str, code: str
) -> VaultAccountItem:
    scope = await _manage(session, member, role_id)
    account = await _account(session, scope, account_id)
    await two_factor.require_code(session, member.user.id, code)
    account.responsible_member_id = member.membership.id
    account.updated_at = utcnow()
    await session.commit()
    return _item(scope, account)


async def show_code(
    session: AsyncSession, member: CurrentMember, role_id: str, account_id: str, code: str
) -> VaultCode:
    scope = await _manage(session, member, role_id)
    account = await _account(session, scope, account_id)
    if is_locked(account, scope.responsible):
        raise ConflictException(LOCKED)
    key = secrets.totp_key(account)
    if key is None:
        raise ConflictException("Akun ini belum punya kunci authenticator.")
    await two_factor.require_code(session, member.user.id, code)
    await session.commit()
    now = time.time()
    return VaultCode(code=key.code_at(now), expires_in=key.seconds_left(now), period=key.period)
