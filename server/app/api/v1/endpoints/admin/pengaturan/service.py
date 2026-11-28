from dataclasses import asdict
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentMember
from app.api.v1.endpoints.admin.pengaturan.schema import (
    ApiKeyInfo,
    BudgetSettings,
    BudgetUpdate,
    EmbeddingInfo,
    ModelOption,
    ModelProfile,
    ModelSettings,
    ModelUpdate,
    Usage,
    UsageToday,
)
from app.api.v1.endpoints.admin.role.service import live_agents
from app.core.config import settings
from app.core.exceptions import UnprocessableEntityException
from app.models import Agent, LlmCall, Organization
from app.models.base import utcnow
from app.services import budget
from app.services.llm import key_status
from app.services.llm.catalog import CATALOG, estimated_step_cost
from app.services.llm.gemini_keys import key_slots

ENV_NAMES = {
    "fast": "LLM_MODEL_FAST",
    "balanced": "LLM_MODEL_BALANCED",
    "thorough": "LLM_MODEL_THOROUGH",
    "fallback": "LLM_FALLBACK_MODEL",
}


async def _api_keys() -> list[ApiKeyInfo]:
    names = [name for name, _ in key_slots()]
    if not names:
        return [
            ApiKeyInfo(
                env_name="GEMINI_API_KEY",
                status="not_set",
                requests_today=0,
                last_used_at=None,
                cooldown_until=None,
            )
        ]
    return [ApiKeyInfo(**info) for info in await key_status.read_status(names)]


# Jenis pemakaian di layar menurut `llm_calls.kind` (kontrak 16.8)
PURPOSES = ("task", "trial", "formation", "vision_ingest", "web_search", "schedule_parse")
KIND_TO_PURPOSE = {"step": "task", "condition": "task"}


async def usage_today(session: AsyncSession, organization_id) -> list[UsageToday]:
    """Panggilan model hari ini (zona waktu organisasi) per jenis, termasuk yang gagal."""
    organization = await session.get(Organization, organization_id)
    local = utcnow().astimezone(ZoneInfo(organization.timezone))
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = await session.execute(
        select(LlmCall.kind, func.count(), func.coalesce(func.sum(LlmCall.cost), 0))
        .where(LlmCall.organization_id == organization_id, LlmCall.created_at >= start)
        .group_by(LlmCall.kind)
    )
    totals = {purpose: [0, 0] for purpose in PURPOSES}
    for kind, calls, cost in rows:
        purpose = KIND_TO_PURPOSE.get(kind, kind)
        if purpose in totals:
            totals[purpose][0] += calls
            totals[purpose][1] += cost
    return [UsageToday(purpose=p, calls=c, cost=v) for p, (c, v) in totals.items()]


async def read_models(session: AsyncSession, actor: CurrentMember) -> ModelSettings:
    current = await budget.read_settings(session, actor.organization_id)
    counts = dict(
        (
            await session.execute(
                select(Agent.model_profile, func.count())
                .where(*live_agents(actor.organization_id))
                .group_by(Agent.model_profile)
            )
        ).all()
    )
    return ModelSettings(
        profiles=[
            ModelProfile(
                slot=slot,
                model=current.models[slot],
                env_name=ENV_NAMES[slot],
                agent_count=counts.get(slot, 0),
            )
            for slot in budget.SLOTS
        ],
        available_models=[
            ModelOption(
                id=m.id, label=m.label, hint=m.hint, estimated_step_cost=estimated_step_cost(m.id)
            )
            for m in CATALOG.values()
        ],
        # Kunci milik server, jadi statusnya hanya untuk pemilik
        api_keys=await _api_keys() if actor.access_role == "owner" else [],
        embedding=EmbeddingInfo(
            model=settings.EMBEDDING_MODEL, dimension=settings.EMBEDDING_DIMENSION
        ),
        usage_today=await usage_today(session, actor.organization_id),
        updated_at=current.updated_at,
    )


async def update_models(
    session: AsyncSession, actor: CurrentMember, body: ModelUpdate
) -> ModelSettings:
    models = body.models.model_dump()
    if any(model not in CATALOG for model in models.values()):
        raise UnprocessableEntityException("Pilih model yang tersedia untuk setiap profil.")
    await budget.save_settings(session, actor.organization_id, models=models)
    return await read_models(session, actor)


async def read_budget(session: AsyncSession, actor: CurrentMember) -> BudgetSettings:
    current = await budget.read_settings(session, actor.organization_id)
    usage = await budget.month_usage(session, actor.organization_id)
    return BudgetSettings(
        **{field: getattr(current, field) for field in budget.DEFAULT_BUDGET},
        usage=Usage(**asdict(usage)),
        updated_at=current.updated_at,
    )


async def update_budget(
    session: AsyncSession, actor: CurrentMember, body: BudgetUpdate
) -> BudgetSettings:
    await budget.save_settings(session, actor.organization_id, **body.model_dump())
    return await read_budget(session, actor)
