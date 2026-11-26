import uuid
from dataclasses import asdict

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import CurrentMember
from app.api.v1.common import Option, Paging, like_pattern, parse_id
from app.api.v1.endpoints.admin.pengetahuan.schema import hit_to_schema
from app.api.v1.endpoints.admin.role.schema import (
    RoleCreate,
    RoleItem,
    RoleSummary,
    RoleUpdate,
    TrialRequest,
    TrialResult,
)
from app.core.exceptions import ConflictException, NotFoundException, UnprocessableEntityException
from app.models import Agent, AgentRelation, Document, FlowPosition, Membership, Unit, User
from app.models.base import utcnow
from app.services.appearance import UNIT_COLOR_HEX, avatar_from_seed
from app.services.engine.runner import Caller, run_agent
from app.services.knowledge.scope import visible_to
from app.services.llm.embedding import get_embedding_provider
from app.services.llm.generation import get_llm_provider
from app.services.organisation import lock_organization, require_membership, require_unit

NOT_FOUND = "Role tidak ditemukan."


def live_agents(organization_id: uuid.UUID):
    """Syarat role milik organisasi yang belum dihapus."""
    return (Agent.organization_id == organization_id, Agent.deleted_at.is_(None))


def _items_query(organization_id: uuid.UUID):
    owner = aliased(Membership)
    relation_count = (
        select(func.count())
        .select_from(AgentRelation)
        .where(
            AgentRelation.deleted_at.is_(None),
            or_(
                AgentRelation.source_agent_id == Agent.id,
                AgentRelation.target_agent_id == Agent.id,
            ),
        )
        .correlate(Agent)
        .scalar_subquery()
    )
    document_count = (
        select(func.count())
        .select_from(Document)
        .where(
            Document.organization_id == Agent.organization_id,
            Document.deleted_at.is_(None),
            visible_to(Agent.knowledge_scope, Agent.id, Agent.unit_id),
        )
        .correlate(Agent)
        .scalar_subquery()
    )
    return (
        select(
            Agent,
            Unit.name.label("unit_name"),
            Unit.color.label("unit_color"),
            User.full_name.label("owner_name"),
            relation_count.label("relation_count"),
            document_count.label("document_count"),
        )
        .outerjoin(Unit, Unit.id == Agent.unit_id)
        .outerjoin(owner, owner.id == Agent.owner_member_id)
        .outerjoin(User, User.id == owner.user_id)
        .where(*live_agents(organization_id))
    )


def _to_item(row) -> RoleItem:
    agent: Agent = row.Agent
    return RoleItem(
        id=str(agent.id),
        name=agent.name,
        title=agent.title,
        unit_id=str(agent.unit_id) if agent.unit_id else None,
        goal=agent.goal,
        status=agent.status,
        instructions=agent.instructions,
        input_spec=agent.input_spec,
        output_format=agent.output_format,
        output_template=agent.output_template,
        acceptance_criteria=agent.acceptance_criteria,
        knowledge_scope=agent.knowledge_scope,
        model_profile=agent.model_profile,
        owner_member_id=str(agent.owner_member_id) if agent.owner_member_id else None,
        avatar=agent.avatar,
        unit_name=row.unit_name,
        unit_color=UNIT_COLOR_HEX.get(row.unit_color) if row.unit_color else None,
        owner_name=row.owner_name,
        document_count=row.document_count,
        relation_count=row.relation_count,
        # Tugas dibuat pada tahap B5
        task_count=0,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


async def read_role(session: AsyncSession, organization_id: uuid.UUID, role_id: str) -> RoleItem:
    query = _items_query(organization_id).where(Agent.id == parse_id(role_id, NOT_FOUND))
    row = (await session.execute(query)).one_or_none()
    if row is None:
        raise NotFoundException(NOT_FOUND)
    return _to_item(row)


async def read_roles(
    session: AsyncSession,
    organization_id: uuid.UUID,
    search: str,
    unit_id: str,
    status: str,
    page: Paging,
) -> tuple[int, list[RoleItem], RoleSummary]:
    # Ringkasan dihitung sebelum saringan
    counts = await session.execute(
        select(Agent.status, func.count())
        .where(*live_agents(organization_id))
        .group_by(Agent.status)
    )
    summary = RoleSummary(**dict(counts.all()))

    query = _items_query(organization_id)
    if search.strip():
        pattern = like_pattern(search.strip())
        columns = (Agent.name, Agent.title, Agent.goal, Unit.name)
        query = query.where(or_(*(c.ilike(pattern, escape="\\") for c in columns)))
    if unit_id == "none":
        query = query.where(Agent.unit_id.is_(None))
    elif unit_id:
        try:
            query = query.where(Agent.unit_id == uuid.UUID(unit_id))
        except ValueError:
            return 0, [], summary
    if status:
        query = query.where(Agent.status == status)

    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.execute(
        query.order_by(func.lower(Unit.name).asc().nulls_last(), func.lower(Agent.name))
        .offset(page.skip)
        .limit(page.limit)
    )
    return total, [_to_item(row) for row in rows], summary


async def role_options(session: AsyncSession, organization_id: uuid.UUID) -> list[Option]:
    agents = await session.scalars(
        select(Agent).where(*live_agents(organization_id)).order_by(func.lower(Agent.name))
    )
    return [Option(id=str(a.id), value=a.name, sub_value=a.title) for a in agents]


def _check_active(agent: Agent) -> None:
    if agent.status == "active" and len(agent.goal) < 10:
        raise UnprocessableEntityException(
            "Role aktif harus punya tujuan kerja minimal 10 karakter."
        )


async def create_role(session: AsyncSession, actor: CurrentMember, body: RoleCreate) -> RoleItem:
    organization_id = actor.organization_id
    # Antre dengan penghapusan unit agar role tidak masuk ke unit yang sedang dihapus
    await lock_organization(session, organization_id)
    unit_id = await require_unit(session, organization_id, body.unit_id, "Unit tidak ditemukan.")
    agent = Agent(
        organization_id=organization_id,
        name=body.name,
        title=body.title,
        unit_id=unit_id,
        goal=body.goal,
        status=body.status,
        owner_member_id=actor.membership.id,
        avatar=avatar_from_seed(body.name),
        created_by=actor.user.id,
    )
    _check_active(agent)
    session.add(agent)
    await session.commit()
    return await read_role(session, organization_id, str(agent.id))


async def _get(session: AsyncSession, organization_id: uuid.UUID, role_id: str) -> Agent:
    agent = await session.scalar(
        select(Agent).where(Agent.id == parse_id(role_id, NOT_FOUND), *live_agents(organization_id))
    )
    if agent is None:
        raise NotFoundException(NOT_FOUND)
    return agent


async def update_role(
    session: AsyncSession, organization_id: uuid.UUID, role_id: str, body: RoleUpdate
) -> RoleItem:
    await lock_organization(session, organization_id)
    agent = await _get(session, organization_id, role_id)
    changes = body.model_dump(exclude_unset=True)
    if "unit_id" in changes:
        changes["unit_id"] = await require_unit(
            session, organization_id, changes["unit_id"], "Unit tidak ditemukan."
        )
    if "owner_member_id" in changes:
        changes["owner_member_id"] = await require_membership(
            session,
            organization_id,
            changes["owner_member_id"],
            "Penanggung jawab tidak ditemukan.",
        )
    if "input_spec" in changes:
        changes["input_spec"] = [f.model_dump(exclude_none=True) for f in body.input_spec]
    for field, value in changes.items():
        setattr(agent, field, value)
    _check_active(agent)
    await session.commit()
    return await read_role(session, organization_id, str(agent.id))


async def delete_role(session: AsyncSession, organization_id: uuid.UUID, role_id: str) -> None:
    await lock_organization(session, organization_id)
    agent = await _get(session, organization_id, role_id)
    if await session.scalar(
        select(Document.id)
        .where(Document.agent_id == agent.id, Document.deleted_at.is_(None))
        .limit(1)
    ):
        raise ConflictException(
            "Role masih punya dokumen. Pindahkan lingkup atau hapus dokumennya terlebih dahulu."
        )
    # Penolakan karena tugas berjalan ditambahkan pada B5.
    now = utcnow()
    agent.deleted_at = now
    await session.execute(
        update(AgentRelation)
        .where(
            AgentRelation.deleted_at.is_(None),
            or_(
                AgentRelation.source_agent_id == agent.id,
                AgentRelation.target_agent_id == agent.id,
            ),
        )
        .values(deleted_at=now)
    )
    await session.execute(delete(FlowPosition).where(FlowPosition.node_id == agent.id))
    await session.commit()


async def run_trial(
    session: AsyncSession, actor: CurrentMember, role_id: str, body: TrialRequest
) -> TrialResult:
    """Uji coba: role bekerja sekali tanpa menjadi tugas dan tanpa menjalankan relasi."""
    agent = await _get(session, actor.organization_id, role_id)
    result = await run_agent(
        session,
        Caller(actor.organization_id, actor.user.id, "trial"),
        agent,
        body.brief,
        {key: value for key, value in body.inputs.items() if value},
        get_llm_provider(),
        get_embedding_provider(),
    )
    return TrialResult(
        **{**asdict(result), "citations": [hit_to_schema(hit) for hit in result.citations]}
    )
