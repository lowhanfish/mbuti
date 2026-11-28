"""
Menyusun catatan format saat satu jenis naskah pertama kali dibuat, dan menerapkan koreksi
(kontrak 18.3). Urutan sumber: aturan, contoh Word, internet, bentuk umum.
"""

import asyncio
import json
import logging
import uuid

from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException, UnprocessableEntityException
from app.models import Agent, Document, LetterFormat, LetterSample, Task
from app.models.base import utcnow
from app.services import budget
from app.services.engine.runner import Caller, generate_with_fallback, search_web
from app.services.engine.web import searches_today
from app.services.knowledge import storage
from app.services.knowledge.scope import visible_to
from app.services.knowledge.search import Chunk, rank_chunks
from app.services.letters import spec as formats
from app.services.letters.sample import read_sample
from app.services.llm.embedding import EmbeddingProvider
from app.services.llm.generation import LlmProvider
from app.services.organisation import lock_organization

logger = logging.getLogger("mbuti.letters")

MAX_RULE_CHUNKS = 8
ABOUT_LETTERS = ("naskah", "surat")
NOT_APPLIED = (
    "Koreksi belum bisa diterapkan. Sebut yang ingin diubah, mis. margin, huruf, urutan bagian, "
    "atau letak tembusan."
)


async def find_format(
    session: AsyncSession, organization_id: uuid.UUID, name: str
) -> LetterFormat | None:
    return await session.scalar(
        select(LetterFormat).where(
            LetterFormat.organization_id == organization_id,
            func.lower(LetterFormat.name) == name.lower(),
        )
    )


async def _rules(
    session: AsyncSession, agent: Agent, letter_type: str, embedder: EmbeddingProvider
) -> tuple[list[Chunk], str]:
    """Potongan aturan persuratan yang terbaca role ini; pustaka kebijakan didahulukan."""
    chunks = await rank_chunks(
        session,
        agent.organization_id,
        f"tata naskah format {letter_type} susunan kertas margin huruf penomoran surat",
        embedder,
        visible_to(
            literal(agent.knowledge_scope),
            literal(agent.id, UUID(as_uuid=True)),
            literal(agent.unit_id, UUID(as_uuid=True)),
        ),
        settings.RETRIEVAL_MAX_DISTANCE,
    )
    categories = dict(
        (
            await session.execute(
                select(Document.id, Document.category).where(
                    Document.id.in_({c.document_id for c in chunks})
                )
            )
        ).all()
    )
    relevant = [
        c
        for c in chunks
        if categories.get(c.document_id) in ("policy", "knowledge")
        and any(w in f"{c.document_title} {c.heading} {c.text}".lower() for w in ABOUT_LETTERS)
    ]
    relevant.sort(key=lambda c: categories.get(c.document_id) != "policy")
    chosen = relevant[:MAX_RULE_CHUNKS]
    return chosen, chosen[0].document_title if chosen else ""


async def find_sample(
    session: AsyncSession, organization_id: uuid.UUID, letter_type: str
) -> LetterSample | None:
    """Contoh yang nama berkasnya memuat jenis naskahnya, selain itu yang terbaru."""
    samples = (
        await session.scalars(
            select(LetterSample)
            .where(LetterSample.organization_id == organization_id)
            .order_by(LetterSample.created_at.desc())
        )
    ).all()
    words = [w for w in letter_type.lower().split() if w != "surat"]
    for sample in samples:
        if words and all(w in sample.file_name.lower() for w in words):
            return sample
    return samples[0] if samples else None


async def read_sample_file(path: str):
    data = await asyncio.to_thread(storage.path_of(path).read_bytes)
    return await asyncio.to_thread(read_sample, data)


def _source(kind: str, title: str, detail: str = "", url=None, document_id=None) -> dict:
    return {
        "kind": kind,
        "title": title[:200],
        "detail": detail[:200],
        "url": url,
        "document_id": document_id,
    }


async def _ask(
    session: AsyncSession,
    caller: Caller,
    agent_id: uuid.UUID | None,
    llm: LlmProvider,
    system: str,
    user: str,
) -> dict:
    models = (await budget.read_settings(session, caller.organization_id)).models
    generation, _, _ = await generate_with_fallback(
        session,
        caller,
        agent_id,
        llm,
        [models["balanced"], models["fallback"]],
        system,
        user,
        formats.FORMAT_SCHEMA,
    )
    return generation.data


def _data(text: str) -> str:
    return text.replace("<", "‹").replace(">", "›")


async def ensure_format(
    session: AsyncSession,
    task: Task,
    agent: Agent,
    letter_type: str,
    llm: LlmProvider,
    embedder: EmbeddingProvider,
) -> LetterFormat:
    """Catatan format jenis naskah ini; disusun bila belum ada. Menyimpan transaksi."""
    found = await find_format(session, task.organization_id, letter_type)
    if found:
        return found
    organization_id = task.organization_id
    sources: list[dict] = []
    notes: list[str] = []
    excerpts, rule_title = await _rules(session, agent, letter_type, embedder)
    if excerpts:
        sources.append(
            _source(
                "rule",
                rule_title,
                f"hlm. {excerpts[0].page_no}" if excerpts[0].page_no else "",
                document_id=str(excerpts[0].document_id),
            )
        )
    from_sample: dict = {}
    sample = await find_sample(session, organization_id, letter_type)
    if sample:
        try:
            from_sample, _ = await read_sample_file(sample.path)
            sources.append(_source("sample", sample.file_name))
        except Exception:
            logger.exception("Contoh surat %s tidak terbaca", sample.id)

    material = [(f"{c.document_title}, hlm. {c.page_no}", c.text) for c in excerpts]
    if not sources and agent.web_search and task.web_search != "off":
        if await searches_today(session, organization_id) < settings.WEB_SEARCH_PER_DAY:
            query = f"format {letter_type} tata naskah dinas margin kertas huruf"
            web, _ = await search_web(
                session,
                Caller(organization_id, task.created_by, "letter_format", task.id),
                agent,
                llm,
                query,
                query,
            )
            material = [(s["title"], s["snippet"]) for s in web]
            sources += [_source("internet", s["title"], s["domain"], s["url"]) for s in web[:3]]

    from_rule: dict = {}
    pattern = None
    if material:
        user = "\n".join(
            [
                f"Jenis naskah: {_data(letter_type)}",
                *(
                    f'<potongan sumber="{_data(title)}">{_data(text[:2000])}</potongan>'
                    for title, text in material
                ),
            ]
        )
        await session.commit()
        try:
            data = await _ask(
                session,
                Caller(organization_id, task.created_by, "letter_format", task.id),
                agent.id,
                llm,
                formats.EXTRACT_SYSTEM,
                user,
            )
            from_rule = formats.valid_changes(data)
            pattern = formats.valid_pattern(data.get("number_pattern"))
            if sources and sources[0]["kind"] == "rule" and data.get("detail"):
                sources[0]["detail"] = str(data["detail"])[:200]
        except AppException as exc:
            # Format bukan alasan menggagalkan tugas: dipakai bentuk yang tersedia
            logger.warning("Format tidak bisa disusun model: %s", exc.message)
            sources = [s for s in sources if s["kind"] == "sample"]
    if not sources:
        sources = [_source("general", "Susunan surat dinas yang lazim")]

    # Contoh menentukan tampilan, aturan menentukan ketentuan: aturan ditimpakan terakhir
    spec = formats.merged(formats.merged(formats.DEFAULT_SPEC, from_sample), from_rule)
    if from_rule and from_sample and sources[0]["kind"] == "rule":
        different = formats.differences(from_rule, from_sample)
        if different:
            notes.append(f"Contoh Word berbeda dari aturan pada {', '.join(different)}.")

    await lock_organization(session, organization_id)
    found = await find_format(session, organization_id, letter_type)
    if found is None:
        found = LetterFormat(
            id=uuid.uuid4(),
            organization_id=organization_id,
            name=letter_type,
            spec=spec,
            sources=sources,
            notes=notes,
            number_pattern=pattern,
        )
        session.add(found)
    await session.commit()
    return found


async def correct_format(
    session: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    format_id: uuid.UUID,
    correction: str,
    author_name: str,
    llm: LlmProvider,
) -> LetterFormat:
    """Terapkan satu koreksi bahasa biasa pada catatan format. Menyimpan transaksi."""
    current = await session.get(LetterFormat, format_id)
    before = current.spec
    user = "\n".join(
        [
            f"Format sekarang: {json.dumps(before, ensure_ascii=False)}",
            f"<koreksi>{_data(correction)}</koreksi>",
        ]
    )
    await session.commit()
    data = await _ask(
        session,
        Caller(organization_id, user_id, "letter_format"),
        None,
        llm,
        formats.CORRECT_SYSTEM,
        user,
    )
    await lock_organization(session, organization_id)
    current = await session.get(LetterFormat, format_id, populate_existing=True)
    spec = formats.merged(current.spec, formats.valid_changes(data))
    if spec == current.spec:
        await session.rollback()
        raise UnprocessableEntityException(NOT_APPLIED)
    current.spec = spec
    current.checked = False
    current.corrections = [
        *current.corrections,
        {
            "id": str(uuid.uuid4()),
            "text": correction,
            "author_name": author_name,
            "created_at": utcnow().isoformat(),
        },
    ]
    await session.commit()
    return current
