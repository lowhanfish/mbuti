from sqlalchemy import false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember
from app.api.v1.common import Paging, parse_id
from app.api.v1.endpoints.admin.persetujuan.schema import Decision
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.models import Approval, ResultDocument, Task
from app.services.engine import decisions, flow
from app.services.engine.dispatch import enqueue_task
from app.services.engine.views import MANAGERS, ApprovalItem, approval_items, can_decide

NOT_FOUND = "Permintaan persetujuan tidak ditemukan."


def visible_filters(member: CurrentMember) -> list:
    """Permintaan di organisasi ini yang boleh diputuskan pengguna."""
    in_organisation = Approval.task_id.in_(
        select(Task.id).where(Task.organization_id == member.organization_id)
    )
    if member.access_role in MANAGERS:
        return [in_organisation]
    if member.access_role == "viewer":
        return [false()]
    return [in_organisation, Approval.requested_from_member_id == member.membership.id]


async def count_pending(session: AsyncSession, member: CurrentMember) -> int:
    return await session.scalar(
        select(func.count())
        .select_from(Approval)
        .where(*visible_filters(member), Approval.status == "pending")
    )


async def read_approvals(
    session: AsyncSession, member: CurrentMember, status: str, page: Paging
) -> tuple[int, list[ApprovalItem]]:
    pending = Approval.status == "pending"
    filters = [*visible_filters(member), pending if status == "pending" else ~pending]
    total = await session.scalar(select(func.count()).select_from(Approval).where(*filters))
    ids = list(
        await session.scalars(
            select(Approval.id)
            .where(*filters)
            .order_by(
                func.coalesce(Approval.decided_at, Approval.created_at).desc(), Approval.seq.desc()
            )
            .offset(page.skip)
            .limit(page.limit)
        )
    )
    if not ids:
        return total, []
    found = {a.id: item for a, item in await approval_items(session, Approval.id.in_(ids))}
    return total, [found[i] for i in ids]


async def decide(
    session: AsyncSession, member: CurrentMember, approval_id: str, body: Decision
) -> ApprovalItem:
    wanted = parse_id(approval_id, NOT_FOUND)
    task_id = await session.scalar(
        select(Approval.task_id)
        .join(Task, Task.id == Approval.task_id)
        .where(Approval.id == wanted, Task.organization_id == member.organization_id)
    )
    if task_id is None:
        raise NotFoundException(NOT_FOUND)
    # Tugas dikunci lebih dulu agar dua keputusan, atau keputusan dan worker, tidak bertabrakan
    task = await flow.lock_task(session, task_id)
    approval = await session.scalar(
        select(Approval).where(Approval.id == wanted).execution_options(populate_existing=True)
    )
    if not can_decide(member.membership, approval):
        raise ForbiddenException("Permintaan ini ditujukan kepada orang lain.")
    if approval.status != "pending":
        raise ConflictException("Permintaan ini sudah diputuskan.")
    if body.decision != "approved" and len(body.comment) < 5:
        raise UnprocessableEntityException(
            "Tuliskan alasan atau catatan perbaikan (minimal 5 karakter)."
        )
    await decisions.decide(session, task, approval, body.decision, body.comment, member.membership)
    await session.commit()
    # Tugas yang selesai lewat persetujuan ini masih perlu nomor dan berkas suratnya
    has_letter = await session.scalar(
        select(ResultDocument.id)
        .where(ResultDocument.task_id == task.id, ResultDocument.kind == "letter")
        .limit(1)
    )
    if task.status in ("queued", "running") or has_letter:
        await enqueue_task(task.id)
    return (await approval_items(session, Approval.id == wanted))[0][1]
