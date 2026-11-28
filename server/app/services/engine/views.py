"""Bentuk bersama untuk tugas: ringkasan role dan permintaan persetujuan."""

import datetime
import uuid
from collections.abc import Iterable

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import Agent, Approval, Membership, Task, TaskStep, Unit, User
from app.services.appearance import UNIT_COLOR_HEX

MANAGERS = ("owner", "admin")


class AgentRef(BaseModel):
    id: str
    name: str
    title: str
    avatar: dict[str, str]
    unit_color: str | None


class NamedValue(BaseModel):
    label: str
    value: str


class ApprovalFlow(BaseModel):
    """Persetujuan alur aplikasi (E4c): yang akan dikirim dan keadaan halamannya."""

    run_id: str
    values: list[NamedValue]
    screenshot_url: str | None


class ApprovalItem(BaseModel):
    id: str
    task_id: str
    task_title: str
    step_id: str | None
    reason: str
    question: str
    requested_from_id: str
    requested_from_name: str
    status: str
    comment: str
    decided_by_name: str | None
    decided_at: datetime.datetime | None
    created_at: datetime.datetime
    last_output: str
    last_agent: AgentRef | None
    flow: ApprovalFlow | None = None


async def agent_refs(
    session: AsyncSession, agent_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, AgentRef]:
    """Termasuk role yang sudah dihapus, agar riwayat tetap menampilkan namanya."""
    rows = await session.execute(
        select(Agent, Unit.color)
        .outerjoin(Unit, Unit.id == Agent.unit_id)
        .where(Agent.id.in_(set(agent_ids)))
    )
    return {
        agent.id: AgentRef(
            id=str(agent.id),
            name=agent.name,
            title=agent.title,
            avatar=agent.avatar,
            unit_color=UNIT_COLOR_HEX.get(color) if color else None,
        )
        for agent, color in rows
    }


def can_decide(membership: Membership, approval: Approval) -> bool:
    """Pemilik, admin, atau orang yang diminta (kecuali pemantau)."""
    if membership.access_role in MANAGERS:
        return True
    return membership.access_role != "viewer" and approval.requested_from_member_id == membership.id


def _approval_flow(approval: Approval) -> ApprovalFlow | None:
    follow = approval.follow_up or {}
    if follow.get("type") != "browser_run":
        return None
    shot = follow.get("shot")
    return ApprovalFlow(
        run_id=follow["run_id"],
        values=follow.get("values", []),
        screenshot_url=f"/api/v1/admin/alur-jalan/{follow['run_id']}/bukti/{shot}"
        if shot
        else None,
    )


async def approval_items(session: AsyncSession, *filters) -> list[tuple[Approval, ApprovalItem]]:
    requested, decider = aliased(Membership), aliased(Membership)
    requested_user, decider_user = aliased(User), aliased(User)
    rows = (
        await session.execute(
            select(
                Approval,
                Task.title.label("task_title"),
                TaskStep.output,
                TaskStep.agent_id,
                requested_user.full_name.label("requested_name"),
                decider_user.full_name.label("decider_name"),
            )
            .join(Task, Task.id == Approval.task_id)
            .outerjoin(TaskStep, TaskStep.id == Approval.step_id)
            .outerjoin(requested, requested.id == Approval.requested_from_member_id)
            .outerjoin(requested_user, requested_user.id == requested.user_id)
            .outerjoin(decider, decider.id == Approval.decided_by_member_id)
            .outerjoin(decider_user, decider_user.id == decider.user_id)
            .where(*filters)
            .order_by(Approval.seq)
        )
    ).all()
    refs = await agent_refs(session, [r.agent_id for r in rows if r.agent_id])
    result = []
    for row in rows:
        approval: Approval = row.Approval
        result.append(
            (
                approval,
                ApprovalItem(
                    id=str(approval.id),
                    task_id=str(approval.task_id),
                    task_title=row.task_title,
                    step_id=str(approval.step_id) if approval.step_id else None,
                    reason=approval.reason,
                    question=approval.question,
                    requested_from_id=str(approval.requested_from_member_id or ""),
                    requested_from_name=row.requested_name or "",
                    status=approval.status,
                    comment=approval.comment,
                    decided_by_name=row.decider_name,
                    decided_at=approval.decided_at,
                    created_at=approval.created_at,
                    last_output=row.output or "",
                    last_agent=refs.get(row.agent_id),
                    flow=_approval_flow(approval),
                ),
            )
        )
    return result
