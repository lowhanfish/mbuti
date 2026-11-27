"""Pembentukan role, versi, dan katalog alat (kontrak 16.1 dan 16.2)."""

import asyncio
import logging
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.deps import CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.pembentukan.schema import (
    AnswerRequest,
    CardUpdateRequest,
    FinalRequest,
    Formation,
    FormationMessage,
    MaterialDocument,
    MaterialsRequest,
    ToolCatalogItem,
    ToolRequestItem,
    VersionDetail,
    VersionItem,
)
from app.api.v1.endpoints.admin.pengetahuan import service as knowledge
from app.api.v1.endpoints.admin.role.service import NOT_FOUND, live_agents
from app.core.config import settings
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.models import (
    Agent,
    AgentFormationMessage,
    AgentRevision,
    AgentSkill,
    Document,
    DocumentVersion,
    Membership,
    ToolRequest,
    User,
)
from app.models.base import utcnow
from app.services import budget
from app.services.formation.job import clean_skills, replace_skills, skill_view
from app.services.formation.versions import finalize, new_revision, open_revision, skills_of
from app.services.organisation import lock_organization, require_membership
from app.services.tools.catalog import catalog_items
from app.workers.formation import run_formation

logger = logging.getLogger("mbuti.formation")

FORBIDDEN = "Hanya admin dan penanggung jawab role yang dapat membentuk role ini."
NO_OPEN = "Tidak ada revisi yang sedang disusun. Mulai revisi baru terlebih dahulu."
STILL_OPEN = "Masih ada revisi yang sedang disusun. Lanjutkan atau buang revisi itu."
BUSY = "Role masih memproses putaran sebelumnya. Tunggu sebentar."
NO_CARD = "Kartu keterampilan belum ada. Jalankan analisis terlebih dahulu."
MATERIALS_PROCESSING = "Uraian jabatan masih diolah. Tunggu sampai selesai."
QUEUE_DOWN = "Antrean kerja tidak tersedia. Coba lagi beberapa saat lagi."
VERSION_NOT_FOUND = "Versi tidak ditemukan."
MIN_DESCRIPTION = 80


def can_form(member: CurrentMember, agent: Agent) -> bool:
    if member.access_role in ("owner", "admin"):
        return True
    return member.access_role == "member" and agent.owner_member_id == member.membership.id


async def _agent(session: AsyncSession, member: CurrentMember, role_id: str) -> Agent:
    agent = await session.scalar(
        select(Agent).where(
            Agent.id == parse_id(role_id, NOT_FOUND), *live_agents(member.organization_id)
        )
    )
    if agent is None:
        raise NotFoundException(NOT_FOUND)
    return agent


async def _former(session: AsyncSession, member: CurrentMember, role_id: str) -> Agent:
    agent = await _agent(session, member, role_id)
    if not can_form(member, agent):
        raise ForbiddenException(FORBIDDEN)
    return agent


async def _open(session: AsyncSession, agent: Agent, idle: bool = True) -> AgentRevision:
    revision = await open_revision(session, agent.id)
    if revision is None:
        raise ConflictException(NO_OPEN)
    if idle and revision.job is not None:
        raise ConflictException(BUSY)
    return revision


async def material_documents(session: AsyncSession, agent_id: uuid.UUID) -> list[MaterialDocument]:
    """Uraian jabatan role beserta keadaan olah versi aktifnya."""
    rows = await session.execute(
        select(Document, DocumentVersion)
        .outerjoin(
            DocumentVersion,
            (DocumentVersion.document_id == Document.id) & DocumentVersion.is_active.is_(True),
        )
        .where(
            Document.agent_id == agent_id,
            Document.category == "formation",
            Document.deleted_at.is_(None),
        )
        .order_by(Document.created_at)
    )
    return [
        MaterialDocument(
            id=str(document.id),
            title=document.title,
            file_name=version.file_name if version else "",
            status=version.status if version else "failed",
            progress=version.progress if version else 0,
            page_count=version.page_count if version else 0,
        )
        for document, version in rows
    ]


async def _messages(
    session: AsyncSession, revision: AgentRevision, agent_name: str
) -> list[FormationMessage]:
    author = aliased(Membership)
    rows = await session.execute(
        select(AgentFormationMessage, User.full_name)
        .outerjoin(author, author.id == AgentFormationMessage.author_member_id)
        .outerjoin(User, User.id == author.user_id)
        .where(AgentFormationMessage.revision_id == revision.id)
        .order_by(AgentFormationMessage.created_at, AgentFormationMessage.id)
    )
    return [
        FormationMessage(
            id=str(message.id),
            round_no=message.round_no,
            author=message.author,
            kind=message.kind,
            # Untuk pertanyaan, question_id sama dengan id-nya sendiri
            question_id=str(message.id)
            if message.kind == "question"
            else (str(message.question_id) if message.question_id else None),
            required=message.required,
            text=message.text,
            skipped=message.skipped,
            author_name=agent_name if message.author == "agent" else (name or "Pembuat role"),
            created_at=message.created_at,
        )
        for message, name in rows
    ]


def _open_required(messages: list[FormationMessage]) -> int:
    answered = {m.question_id for m in messages if m.kind == "answer"}
    return sum(1 for m in messages if m.kind == "question" and m.required and m.id not in answered)


async def _card(session: AsyncSession, revision: AgentRevision) -> dict | None:
    if revision.card is None:
        return None
    skills = [skill_view(skill) for skill in await skills_of(session, revision.id)]
    return {**revision.card, "skills": skills}


async def view(
    session: AsyncSession, member: CurrentMember, agent: Agent, revision: AgentRevision
) -> Formation:
    messages = await _messages(session, revision, agent.name)
    card = await _card(session, revision)
    return Formation(
        id=str(revision.id),
        agent_id=str(agent.id),
        version_no=revision.version_no,
        status=revision.status,
        source=revision.source,
        processing=revision.job is not None,
        can_edit=can_form(member, agent),
        materials=revision.materials or {},
        material_documents=await material_documents(session, agent.id),
        card=card,
        # Revisi pulihan dari versi manual tidak punya kartu, tetapi isiannya sudah lengkap
        snapshot=revision.snapshot if card is not None or revision.source == "restore" else None,
        round_no=revision.round_no,
        messages=messages,
        open_required=_open_required(messages),
        changed=revision.changed or [],
        agent_satisfied=revision.agent_satisfied,
        error_message=revision.error_message,
        created_at=revision.created_at,
        updated_at=revision.updated_at,
    )


async def read_formation(session: AsyncSession, member: CurrentMember, role_id: str) -> Formation:
    agent = await _agent(session, member, role_id)
    revision = await open_revision(session, agent.id)
    if revision is None and agent.active_revision_id:
        revision = await session.get(AgentRevision, agent.active_revision_id)
    if revision is None:
        revision = await session.scalar(
            select(AgentRevision)
            .where(AgentRevision.agent_id == agent.id)
            .order_by(AgentRevision.version_no.desc())
            .limit(1)
        )
    if revision is None:
        raise NotFoundException("Role belum punya versi.")
    return await view(session, member, agent, revision)


async def _create_open(
    session: AsyncSession,
    member: CurrentMember,
    agent: Agent,
    source: str,
    base: AgentRevision | None,
    note: str = "",
) -> AgentRevision:
    status = "ready" if base is not None and base.card else "draft"
    revision = await new_revision(
        session, agent, source=source, status=status, base=base, user_id=member.user.id
    )
    revision.change_note = note
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ConflictException(STILL_OPEN) from None
    return revision


async def start(
    session: AsyncSession, member: CurrentMember, role_id: str, from_version_id: str | None
) -> Formation:
    await lock_organization(session, member.organization_id)
    agent = await _former(session, member, role_id)
    if await open_revision(session, agent.id):
        raise ConflictException(STILL_OPEN)
    if from_version_id:
        base = await session.scalar(
            select(AgentRevision).where(
                AgentRevision.id == parse_id(from_version_id, VERSION_NOT_FOUND),
                AgentRevision.agent_id == agent.id,
            )
        )
        if base is None:
            raise NotFoundException(VERSION_NOT_FOUND)
    else:
        base = (
            await session.get(AgentRevision, agent.active_revision_id)
            if agent.active_revision_id
            else None
        )
    revision = await _create_open(
        session, member, agent, "restore" if from_version_id else "formation", base
    )
    return await view(session, member, agent, revision)


async def start_first(session: AsyncSession, member: CurrentMember, agent: Agent) -> None:
    """Revisi 1 untuk role yang dibuat lewat jalan "Bentuk dengan analisis". Tidak commit."""
    await new_revision(
        session, agent, source="formation", status="draft", base=None, user_id=member.user.id
    )


async def save_materials(
    session: AsyncSession, member: CurrentMember, role_id: str, body: MaterialsRequest
) -> Formation:
    agent = await _former(session, member, role_id)
    revision = await _open(session, agent)
    owner = await require_membership(
        session, member.organization_id, body.owner_member_id, "Penanggung jawab tidak ditemukan."
    )
    tools: list[str] = []
    for tool in body.tools:
        tool = " ".join(tool.split())
        if tool and tool.lower() not in (t.lower() for t in tools):
            tools.append(tool)
    revision.materials = {
        "description": body.description.strip(),
        "tools": tools,
        "represented": " ".join(body.represented.split()),
        "owner_member_id": str(owner) if owner else None,
    }
    await session.commit()
    return await view(session, member, agent, revision)


async def _enqueue(session: AsyncSession, revision: AgentRevision) -> None:
    try:
        await asyncio.to_thread(
            run_formation.apply_async,
            args=[str(revision.id)],
            retry_policy={"max_retries": 1, "interval_start": 0.2},
        )
    except Exception as exc:
        logger.error("Antrean pembentukan tidak tersedia: %s", type(exc).__name__)
        if revision.job == "analysis":
            revision.status = "draft"
        revision.job = None
        revision.job_finish = False
        revision.error_message = QUEUE_DOWN
        await session.commit()


async def run_analysis(session: AsyncSession, member: CurrentMember, role_id: str) -> Formation:
    agent = await _former(session, member, role_id)
    revision = await _open(session, agent)
    documents = await material_documents(session, agent.id)
    if any(d.status in ("queued", "processing") for d in documents):
        raise ConflictException(MATERIALS_PROCESSING)
    description = (revision.materials or {}).get("description", "")
    if not any(d.status == "ready" for d in documents) and len(description) < MIN_DESCRIPTION:
        raise UnprocessableEntityException(
            "Unggah uraian jabatan, atau tulis deskripsi pekerjaan minimal 80 karakter."
        )
    await budget.require_budget(session, member.organization_id)
    # Analisis ulang memulai tanya jawab dari awal
    await session.execute(
        AgentFormationMessage.__table__.delete().where(
            AgentFormationMessage.revision_id == revision.id
        )
    )
    await replace_skills(session, revision, [])
    revision.card = None
    revision.changed = []
    revision.round_no = 0
    revision.agent_satisfied = False
    revision.status = "analyzing"
    revision.job = "analysis"
    revision.job_finish = False
    revision.job_started_at = utcnow()
    revision.error_message = None
    await session.commit()
    await _enqueue(session, revision)
    return await view(session, member, agent, revision)


async def save_card(
    session: AsyncSession, member: CurrentMember, role_id: str, body: CardUpdateRequest
) -> Formation:
    agent = await _former(session, member, role_id)
    revision = await _open(session, agent)
    if revision.card is None:
        raise ConflictException(NO_CARD)
    previous = [skill_view(s) for s in await skills_of(session, revision.id)]
    skills = clean_skills(body.skills, previous)
    if not skills:
        raise UnprocessableEntityException("Kartu harus punya minimal satu keterampilan.")
    summary = " ".join(body.summary.split()) or revision.card.get("summary", "")
    goal = " ".join(body.goal.split()) or revision.card.get("goal", "")
    revision.card = {**revision.card, "summary": summary, "goal": goal}
    revision.snapshot = {**revision.snapshot, "goal": goal}
    revision.changed = []
    await replace_skills(session, revision, skills)
    await session.commit()
    return await view(session, member, agent, revision)


async def answer(
    session: AsyncSession, member: CurrentMember, role_id: str, body: AnswerRequest
) -> Formation:
    agent = await _former(session, member, role_id)
    revision = await _open(session, agent)
    if revision.card is None:
        raise ConflictException("Jalankan analisis terlebih dahulu.")
    note = body.note.strip()
    if not body.answers and not note and not body.finish:
        raise UnprocessableEntityException("Isi minimal satu jawaban atau catatan.")
    limit = settings.FORMATION_ROUNDS_MAX
    if revision.round_no >= limit and not body.finish:
        raise ConflictException(f"Batas {limit} putaran tanya jawab tercapai. Lanjutkan ke Final.")
    await budget.require_budget(session, member.organization_id)
    messages = list(
        await session.scalars(
            select(AgentFormationMessage).where(AgentFormationMessage.revision_id == revision.id)
        )
    )
    questions = {m.id for m in messages if m.kind == "question"}
    answered = {m.question_id for m in messages if m.kind == "answer"}
    for item in body.answers:
        try:
            question_id = uuid.UUID(item.question_id)
        except ValueError:
            continue
        text = item.text.strip()
        if question_id not in questions or question_id in answered or not (text or item.skipped):
            continue
        answered.add(question_id)
        session.add(
            AgentFormationMessage(
                revision_id=revision.id,
                round_no=revision.round_no,
                author="member",
                kind="answer",
                question_id=question_id,
                required=False,
                text=(text or "Dilewati") if item.skipped else text,
                skipped=item.skipped,
                refs=[],
                author_member_id=member.membership.id,
            )
        )
    if note:
        session.add(
            AgentFormationMessage(
                revision_id=revision.id,
                round_no=revision.round_no,
                author="member",
                kind="note",
                required=False,
                text=note,
                skipped=False,
                refs=[],
                author_member_id=member.membership.id,
            )
        )
    revision.status = "questioning"
    revision.job = "round"
    revision.job_finish = body.finish
    revision.job_started_at = utcnow()
    revision.error_message = None
    await session.commit()
    await _enqueue(session, revision)
    return await view(session, member, agent, revision)


async def _qa_document(
    session: AsyncSession, member: CurrentMember, agent: Agent, revision: AgentRevision
) -> None:
    """Hasil tanya jawab menjadi dokumen sistem role; dokumen tanya jawab lama diarsipkan."""
    messages = list(
        await session.scalars(
            select(AgentFormationMessage)
            .where(AgentFormationMessage.revision_id == revision.id)
            .order_by(AgentFormationMessage.created_at, AgentFormationMessage.id)
        )
    )
    questions = {m.id: m.text for m in messages if m.kind == "question"}
    pairs = [
        (questions[m.question_id], m.text)
        for m in messages
        if m.kind == "answer" and not m.skipped and m.question_id in questions
    ]
    if not pairs:
        return
    await session.execute(
        update(Document)
        .where(
            Document.agent_id == agent.id,
            Document.category == "qa",
            Document.deleted_at.is_(None),
        )
        .values(deleted_at=utcnow())
    )
    document = Document(
        id=uuid.uuid4(),
        organization_id=agent.organization_id,
        title=f"Hasil tanya jawab – {agent.name} v{revision.version_no}"[:200],
        description=f"Disusun otomatis saat versi {revision.version_no} Final.",
        doc_type="lainnya",
        category="qa",
        scope="agent",
        agent_id=agent.id,
        created_by=member.user.id,
    )
    session.add(document)
    await session.flush()
    body = "\n\n".join(
        f"# Pertanyaan {number}\n{question}\n\nJawaban: {answer_text}"
        for number, (question, answer_text) in enumerate(pairs, start=1)
    )
    file_name = f"tanya-jawab-{agent.name.lower().replace(' ', '-')}-v{revision.version_no}.md"
    version_id = await knowledge.add_file_version(
        session, member, document, file_name, body.encode()
    )
    await knowledge.enqueue_version(session, version_id)


async def finalize_revision(
    session: AsyncSession, member: CurrentMember, role_id: str, body: FinalRequest
) -> Formation:
    await lock_organization(session, member.organization_id)
    agent = await _former(session, member, role_id)
    revision = await _open(session, agent)
    if revision.card is None and revision.source != "restore":
        raise ConflictException("Jalankan analisis terlebih dahulu.")
    documents = await material_documents(session, agent.id)
    if any(d.status in ("queued", "processing") for d in documents):
        raise ConflictException("Uraian jabatan masih diolah.")
    open_required = _open_required(await _messages(session, revision, agent.name))
    reason = body.override_reason.strip()
    if open_required and len(reason) < 5:
        raise ConflictException(
            f"Masih ada {open_required} pertanyaan wajib yang belum dijawab. Jawab dulu, atau "
            "tulis alasan untuk tetap Final."
        )
    if len((revision.snapshot or {}).get("goal", "")) < 10:
        raise UnprocessableEntityException("Tujuan kerja minimal 10 karakter.")
    parts = [body.change_note.strip()]
    if open_required:
        parts.append(f"Final dengan {open_required} pertanyaan wajib terbuka: {reason}")
    note = " · ".join(p for p in parts if p) or f"Versi {revision.version_no}"
    await finalize(session, agent, revision, member.membership.id, note)
    agent.status = body.status_after
    await session.flush()
    await _qa_document(session, member, agent, revision)
    await session.commit()
    return await view(session, member, agent, revision)


async def discard(session: AsyncSession, member: CurrentMember, role_id: str) -> None:
    agent = await _former(session, member, role_id)
    revision = await _open(session, agent, idle=False)
    if agent.active_revision_id is None:
        raise ConflictException(
            "Role belum pernah Final, jadi revisi pertamanya tidak bisa dibuang. Hapus role bila "
            "tidak jadi dipakai."
        )
    revision.status = "discarded"
    revision.job = None
    revision.job_finish = False
    await session.commit()


async def _version_items(
    session: AsyncSession, agent: Agent, revisions: list[AgentRevision]
) -> list[VersionItem]:
    ids = [r.id for r in revisions]
    finalizer = aliased(Membership)
    names = dict(
        (
            await session.execute(
                select(AgentRevision.id, User.full_name)
                .join(finalizer, finalizer.id == AgentRevision.finalized_by_member_id)
                .join(User, User.id == finalizer.user_id)
                .where(AgentRevision.id.in_(ids))
            )
        ).all()
    )
    skill_counts = dict(
        (
            await session.execute(
                select(AgentSkill.revision_id, func.count())
                .where(AgentSkill.revision_id.in_(ids))
                .group_by(AgentSkill.revision_id)
            )
        ).all()
    )
    question_counts = dict(
        (
            await session.execute(
                select(AgentFormationMessage.revision_id, func.count())
                .where(
                    AgentFormationMessage.revision_id.in_(ids),
                    AgentFormationMessage.kind == "question",
                )
                .group_by(AgentFormationMessage.revision_id)
            )
        ).all()
    )
    return [
        VersionItem(
            id=str(r.id),
            version_no=r.version_no,
            status=r.status,
            source=r.source,
            change_note=r.change_note,
            finalized_at=r.finalized_at,
            finalized_by_name=names.get(r.id),
            is_active=agent.active_revision_id == r.id,
            skill_count=skill_counts.get(r.id, 0),
            question_count=question_counts.get(r.id, 0),
        )
        for r in revisions
    ]


async def read_versions(
    session: AsyncSession, member: CurrentMember, role_id: str
) -> list[VersionItem]:
    agent = await _agent(session, member, role_id)
    revisions = list(
        await session.scalars(
            select(AgentRevision)
            .where(AgentRevision.agent_id == agent.id, AgentRevision.status != "discarded")
            .order_by(AgentRevision.version_no.desc())
        )
    )
    return await _version_items(session, agent, revisions)


async def _revision(session: AsyncSession, agent: Agent, version_id: str) -> AgentRevision:
    revision = await session.scalar(
        select(AgentRevision).where(
            AgentRevision.id == parse_id(version_id, VERSION_NOT_FOUND),
            AgentRevision.agent_id == agent.id,
        )
    )
    if revision is None:
        raise NotFoundException(VERSION_NOT_FOUND)
    return revision


async def read_version(
    session: AsyncSession, member: CurrentMember, role_id: str, version_id: str
) -> VersionDetail:
    agent = await _agent(session, member, role_id)
    revision = await _revision(session, agent, version_id)
    [item] = await _version_items(session, agent, [revision])
    return VersionDetail(
        **item.model_dump(), snapshot=revision.snapshot, card=await _card(session, revision)
    )


async def restore(
    session: AsyncSession, member: CurrentMember, role_id: str, version_id: str
) -> Formation:
    await lock_organization(session, member.organization_id)
    agent = await _former(session, member, role_id)
    if await open_revision(session, agent.id):
        raise ConflictException(STILL_OPEN)
    base = await _revision(session, agent, version_id)
    if base.status not in ("final", "superseded"):
        raise NotFoundException(VERSION_NOT_FOUND)
    revision = await _create_open(
        session, member, agent, "restore", base, f"Dipulihkan dari versi {base.version_no}"
    )
    revision.status = "ready"
    revision.agent_satisfied = True
    await session.commit()
    return await view(session, member, agent, revision)


def tool_catalog() -> list[ToolCatalogItem]:
    return [ToolCatalogItem(**item) for item in catalog_items()]


async def tool_requests(session: AsyncSession, organization_id: uuid.UUID) -> list[ToolRequestItem]:
    rows = await session.execute(
        select(ToolRequest, Agent.name)
        .join(Agent, Agent.id == ToolRequest.agent_id)
        .where(ToolRequest.organization_id == organization_id)
        .order_by(ToolRequest.created_at.desc())
    )
    return [
        ToolRequestItem(
            id=str(request.id),
            agent_id=str(request.agent_id),
            agent_name=name,
            skill_name=request.skill_name,
            requested=request.requested,
            status=request.status,
            created_at=request.created_at,
        )
        for request, name in rows
    ]
