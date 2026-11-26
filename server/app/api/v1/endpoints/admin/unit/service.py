import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.v1.common import Option, Paging, like_pattern, parse_id
from app.api.v1.endpoints.admin.unit.schema import UnitItem, UnitWrite
from app.core.exceptions import ConflictException, NotFoundException, UnprocessableEntityException
from app.db.transaction import commit_or_raise_unique_conflict
from app.models import Agent, Document, Membership, Unit, User
from app.services.organisation import lock_organization, require_membership, require_unit

NOT_FOUND = "Unit tidak ditemukan."
DUPLICATE = "Nama atau kode unit sudah dipakai."


def _items_query(organization_id: uuid.UUID):
    parent = aliased(Unit)
    child = aliased(Unit)
    member_count = (
        select(func.count())
        .select_from(Membership)
        .where(Membership.unit_id == Unit.id, Membership.status != "disabled")
        .correlate(Unit)
        .scalar_subquery()
    )
    child_count = (
        select(func.count())
        .select_from(child)
        .where(child.parent_id == Unit.id)
        .correlate(Unit)
        .scalar_subquery()
    )
    agent_count = (
        select(func.count())
        .select_from(Agent)
        .where(Agent.unit_id == Unit.id, Agent.deleted_at.is_(None))
        .correlate(Unit)
        .scalar_subquery()
    )
    return (
        select(
            Unit,
            parent.name.label("parent_name"),
            User.full_name.label("lead_name"),
            member_count.label("member_count"),
            child_count.label("child_count"),
            agent_count.label("agent_count"),
        )
        .outerjoin(parent, parent.id == Unit.parent_id)
        .outerjoin(Membership, Membership.id == Unit.lead_member_id)
        .outerjoin(User, User.id == Membership.user_id)
        .where(Unit.organization_id == organization_id)
    )


def _to_item(row) -> UnitItem:
    unit: Unit = row.Unit
    return UnitItem(
        id=str(unit.id),
        name=unit.name,
        code=unit.code,
        description=unit.description,
        parent_id=str(unit.parent_id) if unit.parent_id else None,
        parent_name=row.parent_name,
        color=unit.color,
        lead_member_id=str(unit.lead_member_id) if unit.lead_member_id else None,
        lead_name=row.lead_name,
        sort_order=unit.sort_order,
        member_count=row.member_count,
        agent_count=row.agent_count,
        child_count=row.child_count,
        created_at=unit.created_at,
        updated_at=unit.updated_at,
    )


async def _item(session: AsyncSession, organization_id: uuid.UUID, unit_id: uuid.UUID) -> UnitItem:
    row = (await session.execute(_items_query(organization_id).where(Unit.id == unit_id))).one()
    return _to_item(row)


async def _get(session: AsyncSession, organization_id: uuid.UUID, unit_id: str) -> Unit:
    unit = await session.scalar(
        select(Unit).where(
            Unit.id == parse_id(unit_id, NOT_FOUND), Unit.organization_id == organization_id
        )
    )
    if unit is None:
        raise NotFoundException(NOT_FOUND)
    return unit


async def read_units(
    session: AsyncSession, organization_id: uuid.UUID, search: str, page: Paging
) -> tuple[int, list[UnitItem]]:
    filters = []
    if search.strip():
        pattern = like_pattern(search.strip())
        filters.append(
            or_(
                *(
                    column.ilike(pattern, escape="\\")
                    for column in (Unit.name, Unit.code, Unit.description)
                )
            )
        )
    total = await session.scalar(
        select(func.count())
        .select_from(Unit)
        .where(Unit.organization_id == organization_id, *filters)
    )
    rows = await session.execute(
        _items_query(organization_id)
        .where(*filters)
        .order_by(Unit.sort_order, func.lower(Unit.name))
        .offset(page.skip)
        .limit(page.limit)
    )
    return total, [_to_item(row) for row in rows]


async def unit_options(session: AsyncSession, organization_id: uuid.UUID) -> list[Option]:
    units = await session.scalars(
        select(Unit).where(Unit.organization_id == organization_id).order_by(func.lower(Unit.name))
    )
    return [Option(id=str(u.id), value=u.name, sub_value=u.code or None) for u in units]


async def _clean(
    session: AsyncSession, organization_id: uuid.UUID, body: UnitWrite, own_id: uuid.UUID | None
) -> dict:
    """Periksa keunikan, induk, dan penanggung jawab; kembalikan kolom yang siap disimpan."""
    units = (
        await session.execute(
            select(Unit.id, Unit.parent_id, Unit.name, Unit.code).where(
                Unit.organization_id == organization_id
            )
        )
    ).all()
    others = [u for u in units if u.id != own_id]
    if any(u.name.lower() == body.name.lower() for u in others):
        raise UnprocessableEntityException("Nama unit sudah dipakai.")
    if body.code and any(u.code == body.code for u in others):
        raise UnprocessableEntityException("Kode unit sudah dipakai.")

    parent_id = await require_unit(
        session, organization_id, body.parent_id, "Unit induk tidak ditemukan."
    )
    if own_id and parent_id:
        # Telusuri leluhur calon induk; bertemu diri sendiri berarti membentuk lingkaran
        parents = {u.id: u.parent_id for u in units}
        current, seen = parent_id, set()
        while current and current not in seen:
            if current == own_id:
                raise UnprocessableEntityException(
                    "Unit induk tidak boleh unit itu sendiri atau sub-unitnya."
                )
            seen.add(current)
            current = parents.get(current)

    lead_id = await require_membership(
        session, organization_id, body.lead_member_id, "Penanggung jawab tidak ditemukan."
    )
    return {**body.model_dump(), "parent_id": parent_id, "lead_member_id": lead_id}


async def create_unit(
    session: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID, body: UnitWrite
) -> UnitItem:
    await lock_organization(session, organization_id)
    fields = await _clean(session, organization_id, body, None)
    unit = Unit(organization_id=organization_id, created_by=user_id, **fields)
    session.add(unit)
    await commit_or_raise_unique_conflict(session, DUPLICATE)
    return await _item(session, organization_id, unit.id)


async def update_unit(
    session: AsyncSession, organization_id: uuid.UUID, unit_id: str, body: UnitWrite
) -> UnitItem:
    await lock_organization(session, organization_id)
    unit = await _get(session, organization_id, unit_id)
    for field, value in (await _clean(session, organization_id, body, unit.id)).items():
        setattr(unit, field, value)
    await commit_or_raise_unique_conflict(session, DUPLICATE)
    return await _item(session, organization_id, unit.id)


async def delete_unit(session: AsyncSession, organization_id: uuid.UUID, unit_id: str) -> None:
    await lock_organization(session, organization_id)
    unit = await _get(session, organization_id, unit_id)
    if await session.scalar(
        select(Agent.id).where(Agent.unit_id == unit.id, Agent.deleted_at.is_(None)).limit(1)
    ):
        raise ConflictException(
            "Unit masih punya role AI. Pindahkan role ke unit lain terlebih dahulu."
        )
    if await session.scalar(select(Unit.id).where(Unit.parent_id == unit.id).limit(1)):
        raise ConflictException(
            "Unit masih punya sub-unit. Pindahkan atau hapus sub-unit terlebih dahulu."
        )
    if await session.scalar(
        select(Document.id)
        .where(Document.unit_id == unit.id, Document.deleted_at.is_(None))
        .limit(1)
    ):
        raise ConflictException(
            "Unit masih punya dokumen. Pindahkan lingkup atau hapus dokumennya terlebih dahulu."
        )
    # unit_id anggota dikosongkan oleh kunci asing (ON DELETE SET NULL).
    await session.delete(unit)
    await session.commit()
