"""Revisi role: membuat, mem-Final, dan mencatat versi manual (kontrak 16.1 dan 16.3)."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Agent, AgentRevision, AgentSkill
from app.models.agent.formation import OPEN_REVISION_STATUSES
from app.models.base import utcnow

# Kolom role yang disalin dari isian kerja revisi saat Final
WORK_FIELDS = (
    "goal",
    "instructions",
    "input_spec",
    "output_format",
    "output_template",
    "acceptance_criteria",
    "knowledge_scope",
    "model_profile",
    "web_search",
)


def snapshot_of(agent: Agent) -> dict:
    return {field: getattr(agent, field) for field in WORK_FIELDS}


def empty_materials(agent: Agent) -> dict:
    return {
        "description": "",
        "tools": [],
        "represented": "",
        "owner_member_id": str(agent.owner_member_id) if agent.owner_member_id else None,
    }


async def open_revision(session: AsyncSession, agent_id: uuid.UUID) -> AgentRevision | None:
    return await session.scalar(
        select(AgentRevision).where(
            AgentRevision.agent_id == agent_id, AgentRevision.status.in_(OPEN_REVISION_STATUSES)
        )
    )


async def skills_of(session: AsyncSession, revision_id: uuid.UUID) -> list[AgentSkill]:
    return list(
        await session.scalars(
            select(AgentSkill)
            .where(AgentSkill.revision_id == revision_id)
            .order_by(AgentSkill.sort_order)
        )
    )


async def new_revision(
    session: AsyncSession,
    agent: Agent,
    *,
    source: str,
    status: str,
    base: AgentRevision | None,
    user_id: uuid.UUID | None,
) -> AgentRevision:
    """Revisi bernomor berikutnya; bahan, kartu, keterampilan, dan isian disalin dari `base`."""
    last = await session.scalar(
        select(func.max(AgentRevision.version_no)).where(AgentRevision.agent_id == agent.id)
    )
    revision = AgentRevision(
        id=uuid.uuid4(),
        organization_id=agent.organization_id,
        agent_id=agent.id,
        version_no=(last or 0) + 1,
        status=status,
        source=source,
        materials=dict(base.materials) if base else empty_materials(agent),
        card=dict(base.card) if base and base.card else None,
        snapshot=dict(base.snapshot) if base else snapshot_of(agent),
        round_no=0,
        changed=[],
        agent_satisfied=bool(base and base.card),
        change_note="",
        job_finish=False,
        created_by=user_id,
    )
    session.add(revision)
    await session.flush()
    if base is not None:
        for skill in await skills_of(session, base.id):
            session.add(
                AgentSkill(
                    revision_id=revision.id,
                    **{
                        column: getattr(skill, column)
                        for column in (
                            "key",
                            "name",
                            "description",
                            "steps",
                            "inputs",
                            "outputs",
                            "tools",
                            "support",
                            "substitute_note",
                            "sort_order",
                        )
                    },
                )
            )
        await session.flush()
    return revision


async def finalize(
    session: AsyncSession,
    agent: Agent,
    revision: AgentRevision,
    member_id: uuid.UUID | None,
    note: str,
) -> None:
    """Salin isian kerja ke role; versi Final sebelumnya menjadi riwayat. Tidak commit."""
    now = utcnow()
    await session.execute(
        update(AgentRevision)
        .where(
            AgentRevision.agent_id == agent.id,
            AgentRevision.status == "final",
            AgentRevision.id != revision.id,
        )
        .values(status="superseded")
    )
    revision.status = "final"
    revision.job = None
    revision.change_note = note[:1000]
    revision.finalized_at = now
    revision.finalized_by_member_id = member_id
    for field in WORK_FIELDS:
        if field in revision.snapshot:
            setattr(agent, field, revision.snapshot[field])
    owner = (revision.materials or {}).get("owner_member_id")
    if owner:
        agent.owner_member_id = uuid.UUID(owner)
    agent.active_revision_id = revision.id
    agent.updated_at = now


async def record_manual_version(
    session: AsyncSession,
    agent: Agent,
    member_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    note: str,
) -> AgentRevision:
    """Versi `manual` yang langsung Final dari isian role sekarang. Tidak commit."""
    base = (
        await session.get(AgentRevision, agent.active_revision_id)
        if agent.active_revision_id
        else None
    )
    revision = await new_revision(
        session, agent, source="manual", status="final", base=base, user_id=user_id
    )
    revision.snapshot = snapshot_of(agent)
    await finalize(session, agent, revision, member_id, note)
    return revision
