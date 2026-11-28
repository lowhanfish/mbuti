"""Cuti anggota: pemilik dan admin untuk siapa pun, anggota untuk dirinya (kontrak 17.2)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MANAGERS, CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.cuti.schema import LeaveItem, LeaveRequest
from app.api.v1.endpoints.admin.kalender.schema import parse_date
from app.core.exceptions import ConflictException, ForbiddenException, NotFoundException
from app.models import MemberLeave, Membership
from app.services.organisation import lock_organization

MEMBER_NOT_FOUND = "Anggota tidak ditemukan."
LEAVE_NOT_FOUND = "Cuti tidak ditemukan."
OWN_ONLY = "Anda hanya dapat mengatur cuti Anda sendiri."
OVERLAP = "Tanggalnya bertumpuk dengan cuti lain."


async def _target(session: AsyncSession, actor: CurrentMember, member_id: str) -> uuid.UUID:
    """Anggota yang cutinya boleh diatur pengguna ini."""
    target = await session.scalar(
        select(Membership.id).where(
            Membership.id == parse_id(member_id, MEMBER_NOT_FOUND),
            Membership.organization_id == actor.organization_id,
        )
    )
    if target is None:
        raise NotFoundException(MEMBER_NOT_FOUND)
    own = actor.access_role == "member" and target == actor.membership.id
    if actor.access_role not in MANAGERS and not own:
        raise ForbiddenException(OWN_ONLY)
    return target


async def read_leaves(
    session: AsyncSession, actor: CurrentMember, member_id: str
) -> list[LeaveItem]:
    target = await _target(session, actor, member_id)
    rows = await session.scalars(
        select(MemberLeave)
        .where(MemberLeave.member_id == target)
        .order_by(MemberLeave.start_date.desc())
    )
    return [
        LeaveItem(id=str(r.id), start_date=r.start_date, end_date=r.end_date, note=r.note)
        for r in rows
    ]


async def create_leave(
    session: AsyncSession, actor: CurrentMember, member_id: str, body: LeaveRequest
) -> None:
    target = await _target(session, actor, member_id)
    start, end = parse_date(body.start_date), parse_date(body.end_date)
    # Dikunci agar dua isian yang bersamaan tidak sama-sama lolos pemeriksaan tumpang tindih
    await lock_organization(session, actor.organization_id)
    overlapping = await session.scalar(
        select(MemberLeave.id)
        .where(
            MemberLeave.member_id == target,
            MemberLeave.start_date <= end,
            MemberLeave.end_date >= start,
        )
        .limit(1)
    )
    if overlapping is not None:
        raise ConflictException(OVERLAP)
    session.add(
        MemberLeave(
            organization_id=actor.organization_id,
            member_id=target,
            start_date=start,
            end_date=end,
            note=body.note,
            created_by=actor.user.id,
        )
    )
    await session.commit()


async def delete_leave(
    session: AsyncSession, actor: CurrentMember, member_id: str, leave_id: str
) -> None:
    target = await _target(session, actor, member_id)
    leave = await session.scalar(
        select(MemberLeave).where(
            MemberLeave.id == parse_id(leave_id, LEAVE_NOT_FOUND), MemberLeave.member_id == target
        )
    )
    if leave is None:
        raise NotFoundException(LEAVE_NOT_FOUND)
    await session.delete(leave)
    await session.commit()
