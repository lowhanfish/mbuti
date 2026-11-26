"""Pembantu yang dipakai beberapa fitur organisasi."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnprocessableEntityException
from app.models import Membership, Organization, Unit


async def lock_organization(session: AsyncSession, organization_id: uuid.UUID) -> None:
    """
    Antrekan perubahan struktur satu organisasi sampai transaksi selesai, agar pemeriksaan
    seperti "masih ada pemilik lain" atau "tidak membentuk lingkaran" tidak saling mendahului.
    """
    await session.execute(
        select(Organization.id).where(Organization.id == organization_id).with_for_update()
    )


async def require_unit(
    session: AsyncSession, organization_id: uuid.UUID, value: str | None, message: str
) -> uuid.UUID | None:
    """ID unit milik organisasi ini, None bila kosong, 422 bila tidak ditemukan."""
    return await _require_owned(session, Unit, organization_id, value, message)


async def require_membership(
    session: AsyncSession, organization_id: uuid.UUID, value: str | None, message: str
) -> uuid.UUID | None:
    return await _require_owned(session, Membership, organization_id, value, message)


async def _require_owned(session, model, organization_id, value, message) -> uuid.UUID | None:
    if not value:
        return None
    try:
        wanted = uuid.UUID(value)
    except ValueError:
        raise UnprocessableEntityException(message) from None
    found = await session.scalar(
        select(model.id).where(model.id == wanted, model.organization_id == organization_id)
    )
    if found is None:
        raise UnprocessableEntityException(message)
    return found
