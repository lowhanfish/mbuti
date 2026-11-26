import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.admin.organisasi.schema import Profile, ProfileStats, ProfileUpdate
from app.api.v1.endpoints.admin.role.service import live_agents
from app.core.exceptions import NotFoundException
from app.models import Agent, Membership, Organization, Unit


async def _get(session: AsyncSession, organization_id: uuid.UUID) -> Organization:
    organization = await session.get(Organization, organization_id)
    if organization is None:
        raise NotFoundException("Organisasi tidak ditemukan.")
    return organization


async def _to_profile(session: AsyncSession, organization: Organization) -> Profile:
    unit_count = await session.scalar(
        select(func.count()).select_from(Unit).where(Unit.organization_id == organization.id)
    )
    member_count = await session.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.organization_id == organization.id, Membership.status != "disabled")
    )
    agent_count = await session.scalar(
        select(func.count()).select_from(Agent).where(*live_agents(organization.id))
    )
    return Profile(
        id=str(organization.id),
        slug=organization.slug,
        name=organization.name,
        description=organization.description,
        sector=organization.sector,
        timezone=organization.timezone,
        email=organization.email,
        phone=organization.phone,
        address=organization.address,
        website=organization.website,
        created_at=organization.created_at,
        updated_at=organization.updated_at,
        stats=ProfileStats(
            unit_count=unit_count, member_count=member_count, agent_count=agent_count
        ),
    )


async def read_profile(session: AsyncSession, organization_id: uuid.UUID) -> Profile:
    return await _to_profile(session, await _get(session, organization_id))


async def update_profile(
    session: AsyncSession, organization_id: uuid.UUID, body: ProfileUpdate
) -> Profile:
    organization = await _get(session, organization_id)
    for field, value in body.model_dump().items():
        setattr(organization, field, value)
    await session.commit()
    return await _to_profile(session, organization)
