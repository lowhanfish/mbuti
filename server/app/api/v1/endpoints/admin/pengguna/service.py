import uuid

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MANAGERS, CurrentMember
from app.api.v1.common import Paging, like_pattern, parse_id
from app.api.v1.endpoints.admin.pengguna.schema import (
    InviteRequest,
    MemberItem,
    MemberSummary,
    MemberUpdate,
)
from app.api.v1.endpoints.admin.relasi.service import (
    forget_member,
    hide_human,
    is_escalation_target,
)
from app.api.v1.endpoints.auth.service import revoke_user_sessions
from app.core.exceptions import ConflictException, ForbiddenException, NotFoundException
from app.db.transaction import commit_or_raise_unique_conflict
from app.models import Membership, Unit, User
from app.models.base import utcnow
from app.services.organisation import lock_organization, require_unit

NOT_FOUND = "Pengguna tidak ditemukan."
ALREADY_MEMBER = "Email ini sudah menjadi anggota organisasi."
LAST_OWNER = "Organisasi harus punya minimal satu pemilik aktif."
ROLE_ORDER = case({"owner": 0, "admin": 1, "member": 2, "viewer": 3}, value=Membership.access_role)


def _items_query(organization_id: uuid.UUID):
    return (
        select(Membership, User, Unit.name.label("unit_name"))
        .join(User, User.id == Membership.user_id)
        .outerjoin(Unit, Unit.id == Membership.unit_id)
        .where(Membership.organization_id == organization_id)
    )


def _to_item(row, self_id: uuid.UUID) -> MemberItem:
    membership: Membership = row.Membership
    return MemberItem(
        id=str(membership.id),
        user_id=str(row.User.id),
        full_name=row.User.full_name,
        email=row.User.email,
        access_role=membership.access_role,
        unit_id=str(membership.unit_id) if membership.unit_id else None,
        unit_name=row.unit_name,
        status=membership.status,
        joined_at=membership.joined_at,
        last_active_at=membership.last_active_at,
        is_self=membership.id == self_id,
    )


async def _item(session: AsyncSession, actor: CurrentMember, member_id: uuid.UUID) -> MemberItem:
    query = _items_query(actor.organization_id).where(Membership.id == member_id)
    return _to_item((await session.execute(query)).one(), actor.membership.id)


async def read_members(
    session: AsyncSession,
    actor: CurrentMember,
    search: str,
    access_role: str,
    status: str,
    page: Paging,
) -> tuple[int, list[MemberItem], MemberSummary]:
    # Ringkasan dihitung sebelum saringan
    counts = await session.execute(
        select(Membership.status, func.count())
        .where(Membership.organization_id == actor.organization_id)
        .group_by(Membership.status)
    )
    summary = MemberSummary(**dict(counts.all()))

    query = _items_query(actor.organization_id)
    if search.strip():
        pattern = like_pattern(search.strip())
        query = query.where(
            or_(
                *(
                    column.ilike(pattern, escape="\\")
                    for column in (User.full_name, User.email, Unit.name)
                )
            )
        )
    if access_role:
        query = query.where(Membership.access_role == access_role)
    if status:
        query = query.where(Membership.status == status)

    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.execute(
        query.order_by(ROLE_ORDER, func.lower(User.full_name)).offset(page.skip).limit(page.limit)
    )
    return total, [_to_item(row, actor.membership.id) for row in rows], summary


async def invite(session: AsyncSession, actor: CurrentMember, body: InviteRequest) -> MemberItem:
    if body.access_role == "owner" and actor.access_role != "owner":
        raise ForbiddenException("Hanya pemilik yang dapat mengundang pemilik lain.")
    await lock_organization(session, actor.organization_id)
    unit_id = await require_unit(
        session, actor.organization_id, body.unit_id, "Unit tidak ditemukan."
    )

    user = await session.scalar(select(User).where(User.email == body.email))
    if user is not None:
        organisations = (
            await session.scalars(
                select(Membership.organization_id).where(Membership.user_id == user.id)
            )
        ).all()
        if actor.organization_id in organisations:
            raise ConflictException(ALREADY_MEMBER)
        # Versi pertama: satu organisasi per pengguna
        if organisations:
            raise ConflictException("Email ini tidak bisa diundang.")
    else:
        user = User(email=body.email, full_name=body.full_name)
        session.add(user)
        await session.flush()

    membership = Membership(
        organization_id=actor.organization_id,
        user_id=user.id,
        access_role=body.access_role,
        unit_id=unit_id,
        status="invited",
        joined_at=utcnow(),
        created_by=actor.user.id,
    )
    session.add(membership)
    await commit_or_raise_unique_conflict(session, ALREADY_MEMBER)
    return await _item(session, actor, membership.id)


async def _target(session: AsyncSession, actor: CurrentMember, member_id: str) -> Membership:
    """Anggota yang akan diubah; organisasi sudah dikunci sehingga hitungan pemilik tetap benar."""
    await lock_organization(session, actor.organization_id)
    # Hak akses pelaku dibaca ulang setelah kunci: bisa saja baru saja diturunkan atau dikeluarkan
    current = await session.scalar(
        select(Membership)
        .where(Membership.id == actor.membership.id)
        .execution_options(populate_existing=True)
    )
    if current is None or current.status != "active" or current.access_role not in MANAGERS:
        raise ForbiddenException("Hanya pemilik atau admin yang dapat melakukan perubahan ini.")
    membership = await session.scalar(
        select(Membership)
        .where(
            Membership.id == parse_id(member_id, NOT_FOUND),
            Membership.organization_id == actor.organization_id,
        )
        .execution_options(populate_existing=True)
    )
    if membership is None:
        raise NotFoundException(NOT_FOUND)
    return membership


async def _active_owner_count(session: AsyncSession, organization_id: uuid.UUID) -> int:
    return await session.scalar(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.organization_id == organization_id,
            Membership.access_role == "owner",
            Membership.status == "active",
        )
    )


async def update_member(
    session: AsyncSession, actor: CurrentMember, member_id: str, body: MemberUpdate
) -> MemberItem:
    target = await _target(session, actor, member_id)
    touches_owner = "owner" in (body.access_role, target.access_role)
    if touches_owner and actor.access_role != "owner":
        raise ForbiddenException("Hanya pemilik yang dapat mengubah hak akses pemilik.")

    if body.status == "disabled":
        status = "disabled"
    else:
        # Undangan yang belum diterima tidak menjadi aktif hanya karena diubah
        status = "invited" if target.status == "invited" else "active"

    was_active_owner = target.access_role == "owner" and target.status == "active"
    stays_active_owner = body.access_role == "owner" and status == "active"
    if (
        was_active_owner
        and not stays_active_owner
        and await _active_owner_count(session, actor.organization_id) <= 1
    ):
        raise ConflictException(LAST_OWNER)
    if target.id == actor.membership.id and status == "disabled":
        raise ConflictException("Anda tidak dapat menonaktifkan akun sendiri.")
    if body.access_role == "viewer" and await is_escalation_target(session, target.id):
        raise ConflictException(
            "Orang ini masih menjadi tujuan eskalasi. "
            "Ubah relasinya di Peta Relasi terlebih dahulu."
        )

    unit_id = await require_unit(
        session, actor.organization_id, body.unit_id, "Unit tidak ditemukan."
    )
    target.access_role = body.access_role
    target.unit_id = unit_id
    target.status = status
    if body.access_role == "viewer":
        await hide_human(session, target.id)
    if status == "disabled":
        await revoke_user_sessions(session, target.user_id, "disabled")
    await session.commit()
    return await _item(session, actor, target.id)


async def remove_member(session: AsyncSession, actor: CurrentMember, member_id: str) -> None:
    target = await _target(session, actor, member_id)
    if target.id == actor.membership.id:
        raise ConflictException("Anda tidak dapat mengeluarkan diri sendiri.")
    if target.access_role == "owner":
        if actor.access_role != "owner":
            raise ForbiddenException("Hanya pemilik yang dapat mengeluarkan pemilik.")
        if (
            target.status == "active"
            and await _active_owner_count(session, actor.organization_id) <= 1
        ):
            raise ConflictException(LAST_OWNER)
    await revoke_user_sessions(session, target.user_id, "disabled")
    await forget_member(session, target.id)
    # Penanggung jawab unit dan role dikosongkan oleh kunci asing (ON DELETE SET NULL)
    await session.delete(target)
    await session.commit()
