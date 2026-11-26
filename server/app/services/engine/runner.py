"""Satu kali kerja sebuah role: cari dasar di dokumen, minta model, periksa rujukan, catat biaya."""

import logging
import time
import uuid
from dataclasses import dataclass, field

from sqlalchemy import literal
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException
from app.models import Agent, LlmCall, Organization, Unit
from app.models.base import utcnow
from app.services import budget
from app.services.engine.citations import apply_citations
from app.services.engine.prompts import (
    RESPONSE_SCHEMA,
    RoleBrief,
    local_date_and_zone,
    system_prompt,
    user_prompt,
)
from app.services.knowledge.scope import visible_to
from app.services.knowledge.search import Hit, rank_chunks, to_hit, tokenize
from app.services.llm.catalog import cost_in_rupiah
from app.services.llm.embedding import EmbeddingProvider
from app.services.llm.generation import (
    Generation,
    LlmProvider,
    ModelFailed,
    ModelUnavailable,
)

logger = logging.getLogger("mbuti.runner")

MAX_EXCERPTS = 6
STATUSES = ("done", "need_info", "not_in_documents")
UNAVAILABLE = "Model AI sedang tidak tersedia. Coba lagi beberapa saat lagi."
NO_EXCERPTS = (
    "Saya tidak menemukan aturan yang relevan di dokumen dalam lingkup saya, jadi saya tidak "
    "akan menyusun hasil yang bisa keliru. Tambahkan dokumen atau perluas lingkup pengetahuan, "
    "lalu coba lagi."
)


@dataclass
class RunResult:
    status: str
    output: str
    notes: str
    prompt_preview: str
    missing_inputs: list[str] = field(default_factory=list)
    citations: list[Hit] = field(default_factory=list)
    cost: int = 0
    model: str = ""


@dataclass
class Caller:
    organization_id: uuid.UUID
    user_id: uuid.UUID
    kind: str


async def _record(
    session: AsyncSession,
    caller: Caller,
    agent_id: uuid.UUID,
    provider: str,
    model: str,
    tokens: tuple[int, int],
    started: float,
    status: str,
) -> int:
    cost = cost_in_rupiah(model, *tokens)
    session.add(
        LlmCall(
            organization_id=caller.organization_id,
            agent_id=agent_id,
            kind=caller.kind,
            provider=provider,
            model=model,
            input_tokens=tokens[0],
            output_tokens=tokens[1],
            cost=cost,
            latency_ms=int((time.monotonic() - started) * 1000),
            status=status,
            created_by=caller.user_id,
        )
    )
    await session.commit()
    return cost


async def _generate(
    session: AsyncSession,
    caller: Caller,
    agent_id: uuid.UUID,
    llm: LlmProvider,
    models: list[str],
    system: str,
    user: str,
) -> tuple[Generation, str, int]:
    """Coba model profil, lalu cadangan bila tidak tersedia. Setiap panggilan dicatat."""
    for model in dict.fromkeys(models):
        started = time.monotonic()
        try:
            generation = await llm.generate(model, system, user, RESPONSE_SCHEMA)
        except ModelUnavailable as exc:
            logger.warning("Model %s tidak tersedia: %s", model, exc)
            await _record(session, caller, agent_id, llm.name, model, (0, 0), started, "error")
            continue
        except ModelFailed as exc:
            await _record(
                session,
                caller,
                agent_id,
                llm.name,
                model,
                (exc.input_tokens, exc.output_tokens),
                started,
                "error",
            )
            raise AppException(str(exc), 502) from exc
        cost = await _record(
            session,
            caller,
            agent_id,
            llm.name,
            model,
            (generation.input_tokens, generation.output_tokens),
            started,
            "ok",
        )
        return generation, model, cost
    raise AppException(UNAVAILABLE, 503)


async def run_agent(
    session: AsyncSession,
    caller: Caller,
    agent: Agent,
    brief: str,
    inputs: dict[str, str],
    llm: LlmProvider,
    embedder: EmbeddingProvider,
) -> RunResult:
    organization = await session.get(Organization, caller.organization_id)
    unit = await session.get(Unit, agent.unit_id) if agent.unit_id else None
    today, timezone = local_date_and_zone(utcnow(), organization.timezone)
    role = RoleBrief(
        today=today,
        timezone=timezone,
        name=agent.name,
        title=agent.title,
        unit_name=unit.name if unit else "organisasi",
        organization_name=organization.name,
        organization_description=organization.description,
        goal=agent.goal,
        instructions=agent.instructions,
        output_format=agent.output_format,
        output_template=agent.output_template,
        acceptance_criteria=agent.acceptance_criteria,
    )
    labelled = [
        (spec["label"], inputs[spec["key"]]) for spec in agent.input_spec if inputs.get(spec["key"])
    ]
    missing = [
        spec["label"]
        for spec in agent.input_spec
        if spec.get("required") and not inputs.get(spec["key"])
    ]
    system = system_prompt(role)
    if missing:
        return RunResult(
            status="need_info",
            output=f"Saya belum bisa mulai. Mohon lengkapi: {', '.join(missing)}.",
            notes="Isian wajib belum lengkap, jadi model tidak dipanggil.",
            prompt_preview=f"{system}\n\n{user_prompt(brief, labelled, [])}",
            missing_inputs=missing,
        )

    query = " ".join([brief, agent.title, *(value for _, value in labelled)])[:2000]
    excerpts = (
        await rank_chunks(
            session,
            caller.organization_id,
            query,
            embedder,
            visible_to(
                literal(agent.knowledge_scope),
                literal(agent.id, UUID(as_uuid=True)),
                literal(agent.unit_id, UUID(as_uuid=True)),
            ),
            settings.RETRIEVAL_MAX_DISTANCE,
        )
    )[:MAX_EXCERPTS]
    user = user_prompt(brief, labelled, excerpts)
    preview = f"{system}\n\n{user}"
    if not excerpts:
        return RunResult(
            status="not_in_documents",
            output=NO_EXCERPTS,
            notes="Tidak ada potongan dokumen yang cocok, jadi model tidak dipanggil.",
            prompt_preview=preview,
        )

    await budget.require_budget(session, caller.organization_id)
    models = (await budget.read_settings(session, caller.organization_id)).models
    agent_id, profile = agent.id, agent.model_profile
    # Transaksi ditutup agar koneksi database tidak menggantung selama model menulis
    await session.commit()
    generation, model, cost = await _generate(
        session,
        caller,
        agent_id,
        llm,
        [models[profile], models["fallback"]],
        system,
        user,
    )

    data = generation.data
    status = data.get("status") if data.get("status") in STATUSES else "done"
    sources = data.get("sources") if isinstance(data.get("sources"), list) else []
    output, cited = apply_citations(str(data.get("output") or ""), sources, excerpts)
    notes = str(data.get("notes") or "")
    if status == "done" and not cited:
        notes = (
            f"{notes} Hasil ini tidak merujuk dokumen mana pun; periksa sebelum dipakai.".strip()
        )
    terms = tokenize(query)
    return RunResult(
        status=status,
        output=output,
        notes=notes,
        prompt_preview=preview,
        citations=[to_hit(chunk, terms) for chunk in cited],
        cost=cost,
        model=model,
    )
