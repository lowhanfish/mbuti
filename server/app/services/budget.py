"""Pengaturan organisasi dan pemakaian anggaran bulanan."""

import datetime
import uuid
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictException
from app.models import LlmCall, Organization, OrganizationSettings
from app.models.base import utcnow
from app.services.llm.catalog import CATALOG

SLOTS = ("fast", "balanced", "thorough", "fallback")
DEFAULT_BUDGET = {
    "monthly_budget": 100_000,
    "default_task_budget": 15_000,
    "max_steps_per_task": 20,
    "max_revisions": 3,
}
EXHAUSTED = "Anggaran bulan ini sudah habis. Naikkan batas bulanan di Pengaturan > Batas Biaya."


@dataclass
class Effective:
    models: dict[str, str]
    monthly_budget: int
    default_task_budget: int
    max_steps_per_task: int
    max_revisions: int
    updated_at: datetime.datetime


@dataclass
class MonthUsage:
    month: str
    used: int
    trial_cost: int
    remaining: int
    task_count: int


def server_models() -> dict[str, str]:
    return {
        "fast": settings.LLM_MODEL_FAST,
        "balanced": settings.LLM_MODEL_BALANCED,
        "thorough": settings.LLM_MODEL_THOROUGH,
        "fallback": settings.LLM_FALLBACK_MODEL,
    }


async def read_settings(session: AsyncSession, organization_id: uuid.UUID) -> Effective:
    row = await session.get(OrganizationSettings, organization_id)
    models = server_models()
    if row is None:
        organization = await session.get(Organization, organization_id)
        return Effective(models=models, updated_at=organization.created_at, **DEFAULT_BUDGET)
    # Model tersimpan yang sudah dikeluarkan dari katalog kembali ke nilai server
    for slot, model in (row.models or {}).items():
        if model in CATALOG:
            models[slot] = model
    return Effective(
        models=models,
        updated_at=row.updated_at,
        **{field: getattr(row, field) for field in DEFAULT_BUDGET},
    )


async def save_settings(session: AsyncSession, organization_id: uuid.UUID, **changes) -> None:
    """Ubah sebagian pengaturan; baris dibuat dari nilai bawaan bila belum ada."""
    row = await session.get(OrganizationSettings, organization_id)
    if row is None:
        row = OrganizationSettings(organization_id=organization_id, **DEFAULT_BUDGET)
        session.add(row)
    for field, value in changes.items():
        setattr(row, field, value)
    row.updated_at = utcnow()
    await session.commit()


async def month_usage(
    session: AsyncSession, organization_id: uuid.UUID, at: datetime.datetime | None = None
) -> MonthUsage:
    """Biaya bulan kalender berjalan menurut zona waktu organisasi."""
    organization = await session.get(Organization, organization_id)
    local = (at or utcnow()).astimezone(ZoneInfo(organization.timezone))
    start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    following = (start + datetime.timedelta(days=32)).replace(day=1)
    trial = func.coalesce(func.sum(LlmCall.cost).filter(LlmCall.kind == "trial"), 0)
    total, trial_cost = (
        await session.execute(
            select(func.coalesce(func.sum(LlmCall.cost), 0), trial).where(
                LlmCall.organization_id == organization_id,
                LlmCall.created_at >= start,
                LlmCall.created_at < following,
            )
        )
    ).one()
    budget = (await read_settings(session, organization_id)).monthly_budget
    return MonthUsage(
        month=f"{start:%Y-%m}",
        used=total,
        trial_cost=trial_cost,
        remaining=max(0, budget - total),
        # Tugas dibuat pada tahap B5
        task_count=0,
    )


async def require_budget(session: AsyncSession, organization_id: uuid.UUID) -> None:
    if (await month_usage(session, organization_id)).remaining <= 0:
        raise ConflictException(EXHAUSTED)
