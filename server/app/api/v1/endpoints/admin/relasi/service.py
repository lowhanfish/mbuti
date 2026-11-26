import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.relasi.schema import (
    Graph,
    PositionsRequest,
    RelationCreate,
    RelationFields,
    RelationItem,
    RelationUpdate,
)
from app.api.v1.endpoints.admin.role.service import live_agents
from app.core.exceptions import ConflictException, NotFoundException, UnprocessableEntityException
from app.db.transaction import commit_or_raise_unique_conflict
from app.models import Agent, AgentRelation, FlowHuman, FlowPosition, Membership, Unit, User
from app.models.base import utcnow
from app.services.appearance import UNIT_COLOR_HEX
from app.services.budget import read_settings
from app.services.organisation import lock_organization

NOT_FOUND = "Relasi tidak ditemukan."
DUPLICATE = "Relasi dengan jenis yang sama di antara keduanya sudah ada."
VIEWER_TARGET = "Pemantau tidak bisa menjadi tujuan eskalasi."
ACCESS_LABEL = {"owner": "Pemilik", "admin": "Admin", "member": "Anggota", "viewer": "Pemantau"}


def _live_relations(organization_id: uuid.UUID):
    return (
        AgentRelation.organization_id == organization_id,
        AgentRelation.deleted_at.is_(None),
    )


def _to_item(relation: AgentRelation) -> RelationItem:
    human = relation.target_member_id is not None
    return RelationItem(
        id=str(relation.id),
        source_id=str(relation.source_agent_id),
        target_id=str(relation.target_member_id if human else relation.target_agent_id),
        source_kind="agent",
        target_kind="human" if human else "agent",
        relation_type=relation.relation_type,
        trigger=relation.trigger,
        condition=relation.condition,
        payload_spec=relation.payload_spec,
        expected_output=relation.expected_output,
        max_revisions=relation.max_revisions,
        requires_approval=relation.requires_approval,
        label=relation.label,
        created_at=relation.created_at,
        updated_at=relation.updated_at,
    )


async def read_graph(session: AsyncSession, organization_id: uuid.UUID) -> Graph:
    agents = await session.execute(
        select(Agent, Unit.name.label("unit_name"), Unit.color.label("unit_color"))
        .outerjoin(Unit, Unit.id == Agent.unit_id)
        .where(*live_agents(organization_id))
        .order_by(Agent.created_at, Agent.id)
    )
    nodes = [
        {
            "id": str(row.Agent.id),
            "kind": "agent",
            "name": row.Agent.name,
            "title": row.Agent.title,
            "status": row.Agent.status,
            "unit_id": str(row.Agent.unit_id) if row.Agent.unit_id else None,
            "unit_name": row.unit_name,
            "unit_color": UNIT_COLOR_HEX.get(row.unit_color) if row.unit_color else None,
            "avatar": row.Agent.avatar,
        }
        for row in agents
    ]
    humans = await session.execute(
        select(Membership, User.full_name, Unit.name.label("unit_name"))
        .join(FlowHuman, FlowHuman.member_id == Membership.id)
        .join(User, User.id == Membership.user_id)
        .outerjoin(Unit, Unit.id == Membership.unit_id)
        .where(FlowHuman.organization_id == organization_id)
        .order_by(FlowHuman.created_at, Membership.id)
    )
    for row in humans:
        label = ACCESS_LABEL[row.Membership.access_role]
        nodes.append(
            {
                "id": str(row.Membership.id),
                "kind": "human",
                "name": row.full_name,
                "title": f"{label} · {row.unit_name}" if row.unit_name else label,
            }
        )
    relations = await session.scalars(
        select(AgentRelation)
        .where(*_live_relations(organization_id))
        .order_by(AgentRelation.created_at, AgentRelation.id)
    )
    positions = await session.scalars(
        select(FlowPosition).where(FlowPosition.organization_id == organization_id)
    )
    return Graph(
        nodes=nodes,
        relations=[_to_item(r) for r in relations],
        positions={str(p.node_id): {"x": p.x, "y": p.y} for p in positions},
        revision_limit=(await read_settings(session, organization_id)).max_revisions,
    )


def _uuid_or_none(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


async def _handoff_cycle(
    session: AsyncSession,
    organization_id: uuid.UUID,
    source: uuid.UUID,
    target: uuid.UUID,
    own_id: uuid.UUID | None,
) -> list[uuid.UUID] | None:
    """Jalur serah-terima dari tujuan kembali ke sumber, bila ada (hasilnya `A → … → A`)."""
    query = select(AgentRelation.source_agent_id, AgentRelation.target_agent_id).where(
        *_live_relations(organization_id), AgentRelation.relation_type == "handoff"
    )
    if own_id:
        query = query.where(AgentRelation.id != own_id)
    edges = await session.execute(query)
    following: dict[uuid.UUID, list[uuid.UUID]] = {}
    for start, end in edges:
        following.setdefault(start, []).append(end)

    previous: dict[uuid.UUID, uuid.UUID] = {}
    queue, seen = [target], {target}
    while queue:
        node = queue.pop(0)
        if node == source:
            path = [source]
            while path[0] != target:
                path.insert(0, previous[path[0]])
            return [source, *path]
        for next_node in following.get(node, []):
            if next_node not in seen:
                seen.add(next_node)
                previous[next_node] = node
                queue.append(next_node)
    return None


async def _clean(
    session: AsyncSession,
    organization_id: uuid.UUID,
    source_id: str,
    target_id: str,
    fields: RelationFields,
    own_id: uuid.UUID | None,
) -> dict:
    """Periksa aturan kontrak bagian 6; kembalikan kolom yang siap disimpan."""

    async def agent(value: str) -> Agent | None:
        wanted = _uuid_or_none(value)
        if wanted is None:
            return None
        return await session.scalar(
            select(Agent).where(Agent.id == wanted, *live_agents(organization_id))
        )

    source = await agent(source_id)
    if source is None:
        raise UnprocessableEntityException("Relasi harus dimulai dari sebuah role.")
    if _uuid_or_none(target_id) == source.id:
        raise UnprocessableEntityException("Role tidak bisa berelasi dengan dirinya sendiri.")

    target_agent = await agent(target_id)
    human = None
    if target_agent is None:
        wanted = _uuid_or_none(target_id)
        human = wanted and await session.scalar(
            select(Membership).where(
                Membership.id == wanted, Membership.organization_id == organization_id
            )
        )
        if human is None:
            raise UnprocessableEntityException("Tujuan relasi tidak ditemukan.")
        if fields.relation_type != "escalate":
            raise UnprocessableEntityException("Ke manusia hanya bisa memakai relasi Eskalasi.")
        if human.access_role == "viewer":
            raise UnprocessableEntityException(VIEWER_TARGET)
    elif fields.relation_type == "escalate":
        raise UnprocessableEntityException("Eskalasi ditujukan ke manusia, bukan ke role.")

    duplicate = select(AgentRelation.id).where(
        *_live_relations(organization_id),
        AgentRelation.source_agent_id == source.id,
        AgentRelation.relation_type == fields.relation_type,
        AgentRelation.target_member_id == human.id
        if human
        else AgentRelation.target_agent_id == target_agent.id,
    )
    if own_id:
        duplicate = duplicate.where(AgentRelation.id != own_id)
    if await session.scalar(duplicate):
        raise UnprocessableEntityException(DUPLICATE)

    if fields.relation_type == "handoff":
        cycle = await _handoff_cycle(session, organization_id, source.id, target_agent.id, own_id)
        if cycle:
            names = dict(
                (
                    await session.execute(select(Agent.id, Agent.name).where(Agent.id.in_(cycle)))
                ).all()
            )
            path = " → ".join(names[node] for node in cycle)
            raise UnprocessableEntityException(
                f"Serah-terima ini membentuk lingkaran: {path}. "
                "Gunakan relasi Periksa bila memang perlu bolak-balik."
            )
    if fields.trigger == "on_condition" and len(fields.condition) < 5:
        raise UnprocessableEntityException("Tuliskan kondisi kapan relasi ini dijalankan.")

    values = fields.model_dump(exclude={"source_id", "target_id"})
    if fields.relation_type == "escalate":
        values["requires_approval"] = True
    return {
        **values,
        "source_agent_id": source.id,
        "target_agent_id": target_agent.id if target_agent else None,
        "target_member_id": human.id if human else None,
    }


async def _show_human(
    session: AsyncSession, organization_id: uuid.UUID, member_id: uuid.UUID
) -> None:
    await session.execute(
        insert(FlowHuman)
        .values(member_id=member_id, organization_id=organization_id, created_at=utcnow())
        .on_conflict_do_nothing(index_elements=[FlowHuman.member_id])
    )


async def create_relation(
    session: AsyncSession, actor: CurrentMember, body: RelationCreate
) -> RelationItem:
    organization_id = actor.organization_id
    # Kunci organisasi: dua serah-terima bersamaan tidak boleh sama-sama lolos pemeriksaan
    await lock_organization(session, organization_id)
    values = await _clean(
        session, organization_id, body.source_id, body.target_id, body, own_id=None
    )
    relation = AgentRelation(organization_id=organization_id, created_by=actor.user.id, **values)
    session.add(relation)
    if relation.target_member_id:
        await _show_human(session, organization_id, relation.target_member_id)
    await commit_or_raise_unique_conflict(session, DUPLICATE)
    return _to_item(relation)


async def _get(session: AsyncSession, organization_id: uuid.UUID, relation_id: str):
    relation = await session.scalar(
        select(AgentRelation).where(
            AgentRelation.id == parse_id(relation_id, NOT_FOUND),
            *_live_relations(organization_id),
        )
    )
    if relation is None:
        raise NotFoundException(NOT_FOUND)
    return relation


async def update_relation(
    session: AsyncSession, organization_id: uuid.UUID, relation_id: str, body: RelationUpdate
) -> RelationItem:
    await lock_organization(session, organization_id)
    relation = await _get(session, organization_id, relation_id)
    current = _to_item(relation).model_dump()
    merged = {**current, **body.model_dump(exclude_unset=True)}
    fields = RelationFields.model_validate({k: merged[k] for k in RelationFields.model_fields})
    values = await _clean(
        session,
        organization_id,
        merged["source_id"],
        merged["target_id"],
        fields,
        own_id=relation.id,
    )
    for field, value in values.items():
        setattr(relation, field, value)
    if relation.target_member_id:
        await _show_human(session, organization_id, relation.target_member_id)
    await commit_or_raise_unique_conflict(session, DUPLICATE)
    return _to_item(relation)


async def delete_relation(
    session: AsyncSession, organization_id: uuid.UUID, relation_id: str
) -> None:
    await lock_organization(session, organization_id)
    relation = await _get(session, organization_id, relation_id)
    relation.deleted_at = utcnow()
    await session.commit()


async def save_positions(
    session: AsyncSession, organization_id: uuid.UUID, body: PositionsRequest
) -> None:
    """Gabungkan dengan posisi tersimpan. ID di luar organisasi diabaikan."""
    wanted = {
        node: position
        for key, position in body.positions.items()
        if (node := _uuid_or_none(key)) is not None
    }
    if not wanted:
        return
    known = set(
        await session.scalars(
            select(Agent.id)
            .where(Agent.id.in_(wanted), *live_agents(organization_id))
            .union(
                select(Membership.id).where(
                    Membership.id.in_(wanted), Membership.organization_id == organization_id
                )
            )
        )
    )
    rows = [
        {
            "organization_id": organization_id,
            "node_id": node,
            "x": round(position.x),
            "y": round(position.y),
        }
        for node, position in wanted.items()
        if node in known
    ]
    if rows:
        statement = insert(FlowPosition).values(rows)
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[FlowPosition.organization_id, FlowPosition.node_id],
                set_={"x": statement.excluded.x, "y": statement.excluded.y},
            )
        )
        await session.commit()


async def reset_positions(session: AsyncSession, organization_id: uuid.UUID) -> None:
    await session.execute(
        delete(FlowPosition).where(FlowPosition.organization_id == organization_id)
    )
    await session.commit()


async def add_human(session: AsyncSession, organization_id: uuid.UUID, member_id: str) -> None:
    await lock_organization(session, organization_id)
    wanted = _uuid_or_none(member_id)
    member = wanted and await session.scalar(
        select(Membership).where(
            Membership.id == wanted, Membership.organization_id == organization_id
        )
    )
    if member is None:
        raise UnprocessableEntityException("Pengguna tidak ditemukan.")
    if member.access_role == "viewer":
        raise UnprocessableEntityException(VIEWER_TARGET)
    await _show_human(session, organization_id, member.id)
    await session.commit()


async def remove_human(session: AsyncSession, organization_id: uuid.UUID, member_id: str) -> None:
    await lock_organization(session, organization_id)
    wanted = _uuid_or_none(member_id)
    if wanted is None:
        return
    targeted = await session.scalar(
        select(func.count())
        .select_from(AgentRelation)
        .where(*_live_relations(organization_id), AgentRelation.target_member_id == wanted)
    )
    if targeted:
        raise ConflictException("Masih ada eskalasi ke orang ini. Hapus relasinya terlebih dahulu.")
    await session.execute(
        delete(FlowHuman).where(
            FlowHuman.member_id == wanted, FlowHuman.organization_id == organization_id
        )
    )
    await session.commit()


async def is_escalation_target(session: AsyncSession, member_id: uuid.UUID) -> bool:
    return bool(
        await session.scalar(
            select(AgentRelation.id)
            .where(AgentRelation.deleted_at.is_(None), AgentRelation.target_member_id == member_id)
            .limit(1)
        )
    )


async def hide_human(session: AsyncSession, member_id: uuid.UUID) -> None:
    """Keluarkan manusia dari peta beserta posisinya."""
    await session.execute(delete(FlowHuman).where(FlowHuman.member_id == member_id))
    await session.execute(delete(FlowPosition).where(FlowPosition.node_id == member_id))


async def forget_member(session: AsyncSession, member_id: uuid.UUID) -> None:
    """Dipanggil sebelum keanggotaan dihapus: eskalasi ke orang itu ikut ditandai terhapus."""
    await session.execute(
        update(AgentRelation)
        .where(AgentRelation.deleted_at.is_(None), AgentRelation.target_member_id == member_id)
        .values(deleted_at=utcnow())
    )
    await hide_human(session, member_id)
