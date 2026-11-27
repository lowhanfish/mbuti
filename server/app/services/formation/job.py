"""
Analisis role dan putaran tanya jawab (antrean `execution`, kontrak 16.1).

Model menyusun kartu, pertanyaan, dan isian kerja; server merapikan hasilnya: memangkas panjang,
memetakan alat ke katalog, menjaga kunci keterampilan antar-putaran, dan mencatat permintaan alat.
"""

import logging
import re
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.exceptions import AppException
from app.models import (
    Agent,
    AgentFormationMessage,
    AgentRevision,
    AgentSkill,
    Document,
    DocumentSection,
    DocumentVersion,
    Organization,
    ToolRequest,
)
from app.models.base import utcnow
from app.services import budget
from app.services.engine.execution import RetryLater
from app.services.engine.runner import Caller, generate_with_fallback
from app.services.formation.prompts import (
    FORMATION_SCHEMA,
    MAX_QUESTIONS,
    MAX_SKILLS,
    SYSTEM,
    analysis_prompt,
    round_prompt,
)
from app.services.formation.versions import skills_of
from app.services.llm.generation import LlmProvider
from app.services.tools.catalog import map_tool, weakest_support

logger = logging.getLogger("mbuti.formation")

SATISFIED_NOTE = (
    "Terima kasih, rancangan saya sudah jelas. Silakan periksa isian kerja lalu tekan Final."
)
FAILED = "Analisis gagal: jawaban model tidak bisa dipakai. Coba lagi."
RETRY_SECONDS = 60


def _text(value: object, limit: int) -> str:
    """Teks satu baris: spasi dirapikan lalu dipangkas."""
    return " ".join(str(value or "").split())[:limit]


def _list(value: object, limit: int, each: int) -> list[str]:
    items = value if isinstance(value, list) else []
    cleaned = [_text(item, each) for item in items]
    return [item for item in cleaned if item][:limit]


def skill_view(skill: AgentSkill) -> dict:
    return {
        "key": skill.key,
        "name": skill.name,
        "description": skill.description,
        "steps": skill.steps,
        "inputs": skill.inputs,
        "outputs": skill.outputs,
        "tools": skill.tools,
        "support": skill.support,
        "substitute_note": skill.substitute_note,
    }


async def material_pages(session: AsyncSession, agent_id: uuid.UUID) -> list[tuple[str, int, str]]:
    """Halaman uraian jabatan role yang sudah siap, urut dokumen lalu halaman."""
    rows = await session.execute(
        select(
            Document.title, DocumentSection.page_no, DocumentSection.heading, DocumentSection.text
        )
        .join(DocumentVersion, DocumentVersion.document_id == Document.id)
        .join(DocumentSection, DocumentSection.version_id == DocumentVersion.id)
        .where(
            Document.agent_id == agent_id,
            Document.category == "formation",
            Document.deleted_at.is_(None),
            DocumentVersion.is_active.is_(True),
            DocumentVersion.status == "ready",
        )
        .order_by(Document.created_at, DocumentSection.page_no, DocumentSection.id)
    )
    return [(title, page, f"{heading}\n{text}") for title, page, heading, text in rows]


def clean_skills(raw: object, previous: list[dict]) -> list[dict]:
    """Keterampilan dari model atau pembuat: dipangkas, alat dipetakan, kunci tetap per nama."""
    keys = {item["name"].lower(): item["key"] for item in previous}
    used: set[str] = set()
    skills: list[dict] = []
    for item in (raw if isinstance(raw, list) else [])[:MAX_SKILLS]:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"), 120)
        if not name:
            continue
        key = keys.get(name.lower()) or item.get("key") or ""
        key = re.sub(r"[^a-z0-9-]", "", str(key).lower())[:40]
        number = len(skills) + 1
        while not key or key in used:
            key = f"skill-{number}"
            number += 1
        used.add(key)
        steps = []
        for step in (item.get("steps") if isinstance(item.get("steps"), list) else [])[:15]:
            if isinstance(step, dict) and _text(step.get("text"), 200):
                steps.append(
                    {"text": _text(step.get("text"), 200), "approval": bool(step.get("approval"))}
                )
        names = []
        for tool in item.get("tools") if isinstance(item.get("tools"), list) else []:
            label = tool.get("requested") if isinstance(tool, dict) else tool
            label = _text(label, 80)
            if label and label.lower() not in (n.lower() for n in names):
                names.append(label)
        tools = [map_tool(label) for label in names[:12]]
        skills.append(
            {
                "key": key,
                "name": name,
                "description": _text(item.get("description"), 600),
                "steps": steps,
                "inputs": _list(item.get("inputs"), 8, 200),
                "outputs": _list(item.get("outputs"), 8, 200),
                "tools": tools,
                "support": weakest_support(tools),
                "substitute_note": _text(item.get("substitute_note"), 400)
                or " ".join(t["note"] for t in tools if t["support"] == "substitute")[:400],
            }
        )
    return skills


async def replace_skills(
    session: AsyncSession, revision: AgentRevision, skills: list[dict]
) -> None:
    await session.execute(delete(AgentSkill).where(AgentSkill.revision_id == revision.id))
    for order, skill in enumerate(skills):
        session.add(AgentSkill(revision_id=revision.id, sort_order=order, **skill))
    await session.flush()


async def record_tool_requests(
    session: AsyncSession, revision: AgentRevision, skills: list[dict]
) -> None:
    """Alat `unsupported` dicatat sekali per role per nama alat."""
    for skill in skills:
        for tool in skill["tools"]:
            if tool["support"] != "unsupported":
                continue
            exists = await session.scalar(
                select(ToolRequest.id).where(
                    ToolRequest.agent_id == revision.agent_id,
                    func.lower(ToolRequest.requested) == tool["requested"].lower(),
                )
            )
            if exists is None:
                session.add(
                    ToolRequest(
                        organization_id=revision.organization_id,
                        agent_id=revision.agent_id,
                        revision_id=revision.id,
                        skill_name=skill["name"],
                        requested=tool["requested"],
                        status="open",
                    )
                )


def _input_spec(raw: object, fallback: list) -> list[dict]:
    fields: list[dict] = []
    seen: set[str] = set()
    for item in (raw if isinstance(raw, list) else [])[:6]:
        if not isinstance(item, dict):
            continue
        label = _text(item.get("label"), 80)
        if not label:
            continue
        key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:40] or "isian"
        while key in seen:
            key = f"{key}_2"
        seen.add(key)
        kind = (
            item.get("type")
            if item.get("type") in ("short_text", "long_text", "number", "date")
            else "short_text"
        )
        fields.append(
            {"key": key, "label": label, "type": kind, "required": bool(item.get("required"))}
        )
    return fields or fallback


def compose_snapshot(base: dict, goal: str, work: object) -> dict:
    work = work if isinstance(work, dict) else {}
    snapshot = dict(base)
    snapshot["goal"] = goal or base.get("goal", "")
    if _text(work.get("instructions"), 8000):
        snapshot["instructions"] = str(work.get("instructions")).strip()[:8000]
    snapshot["input_spec"] = _input_spec(work.get("inputs"), base.get("input_spec", []))
    if work.get("output_format") in ("text", "template", "table", "json"):
        snapshot["output_format"] = work["output_format"]
    if isinstance(work.get("output_template"), str):
        snapshot["output_template"] = work["output_template"].strip()[:4000]
    criteria = _list(work.get("acceptance_criteria"), 10, 200)
    if criteria:
        snapshot["acceptance_criteria"] = criteria
    return snapshot


def _changed(
    old_card: dict | None, old_skills: list[dict], card: dict, skills: list[dict]
) -> list[str]:
    if not old_card:
        return ["summary", "goal", "findings", *(s["key"] for s in skills)]
    previous = {s["key"]: s for s in old_skills}
    changed = [part for part in ("summary", "goal") if old_card.get(part) != card[part]]
    old_findings = [(f.get("kind"), f.get("text")) for f in old_card.get("findings", [])]
    if old_findings != [(f["kind"], f["text"]) for f in card["findings"]]:
        changed.append("findings")
    changed += [s["key"] for s in skills if previous.get(s["key"]) != s]
    return changed


async def apply_result(
    session: AsyncSession, agent: Agent, revision: AgentRevision, data: dict, at_round: int
) -> None:
    old_skills = [skill_view(s) for s in await skills_of(session, revision.id)]
    skills = clean_skills(data.get("skills"), old_skills) or old_skills
    if not skills:
        raise ValueError("Tidak ada keterampilan.")
    card = {
        "summary": _text(data.get("summary"), 1500),
        "goal": _text(data.get("goal"), 500) or agent.goal,
        "findings": [
            {
                "id": str(uuid.uuid4()),
                "kind": f.get("kind")
                if f.get("kind") in ("unclear", "conflict", "missing_tool", "missing_material")
                else "unclear",
                "text": _text(f.get("text"), 400),
                "ref": _text(f.get("ref"), 200),
            }
            for f in (data.get("findings") if isinstance(data.get("findings"), list) else [])[:20]
            if isinstance(f, dict) and _text(f.get("text"), 400)
        ],
    }
    revision.changed = _changed(revision.card, old_skills, card, skills)
    revision.card = card
    await replace_skills(session, revision, skills)
    await record_tool_requests(session, revision, skills)
    revision.snapshot = compose_snapshot(revision.snapshot, card["goal"], data.get("work"))

    finish = revision.job_finish
    for text in _list(data.get("objections"), 3, 1000):
        session.add(_agent_message(revision, at_round, "objection", text, agent.name))
    questions = (
        []
        if finish
        else [
            q
            for q in (data.get("questions") if isinstance(data.get("questions"), list) else [])
            if isinstance(q, dict) and _text(q.get("text"), 1000)
        ][:MAX_QUESTIONS]
    )
    for q in questions:
        session.add(
            _agent_message(
                revision,
                at_round,
                "question",
                _text(q.get("text"), 1000),
                agent.name,
                bool(q.get("required")),
            )
        )
    satisfied = (
        finish
        or bool(data.get("satisfied"))
        or not questions
        or at_round >= settings.FORMATION_ROUNDS_MAX
    )
    if satisfied:
        session.add(
            _agent_message(
                revision,
                at_round,
                "note",
                _text(data.get("note"), 1000) or SATISFIED_NOTE,
                agent.name,
            )
        )
    revision.agent_satisfied = satisfied
    revision.status = "ready" if satisfied else "questioning"
    revision.round_no = at_round


def _agent_message(
    revision: AgentRevision, round_no: int, kind: str, text: str, _name: str, required: bool = False
) -> AgentFormationMessage:
    return AgentFormationMessage(
        id=uuid.uuid4(),
        revision_id=revision.id,
        round_no=round_no,
        author="agent",
        kind=kind,
        required=required and kind == "question",
        text=text,
        skipped=False,
        refs=[],
    )


async def _round_user_prompt(session: AsyncSession, revision: AgentRevision, base: str) -> str:
    messages = list(
        await session.scalars(
            select(AgentFormationMessage)
            .where(AgentFormationMessage.revision_id == revision.id)
            .order_by(AgentFormationMessage.created_at, AgentFormationMessage.id)
        )
    )
    questions = {m.id: m.text for m in messages if m.kind == "question"}
    history, answers, notes = [], [], []
    for m in messages:
        if m.author != "member":
            continue
        if m.kind == "answer" and m.question_id in questions:
            pair = (questions[m.question_id], m.text)
            (answers if m.round_no == revision.round_no else history).append(pair)
        elif m.kind == "note" and m.round_no == revision.round_no:
            notes.append(m.text)
    skills = [skill_view(s) for s in await skills_of(session, revision.id)]
    return round_prompt(
        base, revision.card or {}, skills, history, answers, notes, revision.job_finish
    )


def _restore_after_failure(revision: AgentRevision, message: str) -> None:
    revision.error_message = message[:300]
    if revision.job == "analysis":
        revision.status = "draft"
    revision.job = None
    revision.job_finish = False


async def run_job(
    sessions: async_sessionmaker[AsyncSession], revision_id: uuid.UUID, llm: LlmProvider
) -> None:
    """Kerjakan analisis atau putaran yang tertunda. `RetryLater` bila kuota habis."""
    async with sessions() as session:
        revision = await session.get(AgentRevision, revision_id)
        if revision is None or revision.job is None:
            return
        agent = await session.get(Agent, revision.agent_id)
        if agent is None or agent.deleted_at is not None:
            revision.job = None
            await session.commit()
            return
        organization = await session.get(Organization, revision.organization_id)
        base = analysis_prompt(
            agent.name,
            agent.title,
            organization.name,
            revision.materials or {},
            await material_pages(session, agent.id),
        )
        analysis = revision.job == "analysis"
        user = base if analysis else await _round_user_prompt(session, revision, base)
        models = (await budget.read_settings(session, revision.organization_id)).models
        caller = Caller(revision.organization_id, None, "formation")
        try:
            generation, _, _ = await generate_with_fallback(
                session,
                caller,
                agent.id,
                llm,
                [models["thorough"], models["balanced"], models["fallback"]],
                SYSTEM,
                user,
                FORMATION_SCHEMA,
            )
        except AppException as exc:
            if exc.status_code == 503:
                raise RetryLater(RETRY_SECONDS) from exc
            revision = await session.get(AgentRevision, revision_id)
            _restore_after_failure(revision, str(exc))
            await session.commit()
            return
        revision = await session.get(AgentRevision, revision_id)
        if revision.job is None:
            return
        try:
            await apply_result(
                session, agent, revision, generation.data, 1 if analysis else revision.round_no + 1
            )
        except (ValueError, TypeError, KeyError, AttributeError):
            logger.warning("Hasil pembentukan role tidak bisa dipakai", exc_info=True)
            await session.rollback()
            revision = await session.get(AgentRevision, revision_id)
            _restore_after_failure(revision, FAILED)
            await session.commit()
            return
        revision.job = None
        revision.job_finish = False
        revision.job_started_at = None
        revision.error_message = None
        revision.updated_at = utcnow()
        await session.commit()


async def give_up(sessions: async_sessionmaker[AsyncSession], revision_id: uuid.UUID) -> None:
    async with sessions() as session:
        revision = await session.get(AgentRevision, revision_id)
        if revision is not None and revision.job is not None:
            _restore_after_failure(revision, "Model tidak kunjung tersedia. Coba lagi nanti.")
            await session.commit()
