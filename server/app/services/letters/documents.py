"""
Berkas hasil tugas: dicatat dari jawaban role, diberi format, nomor, lalu dibuat DOCX dan
PDF-nya (kontrak 18.1–18.2). Pembuatan berkas berjalan di worker, di luar transaksi tugas.
"""

import asyncio
import logging
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import (
    Agent,
    Approval,
    LetterFormat,
    Letterhead,
    LetterNumber,
    LetterRegister,
    Organization,
    ResultDocument,
    Task,
    TaskStep,
)
from app.models.base import utcnow
from app.services.knowledge import storage, visual
from app.services.letters import formats, render
from app.services.letters import spec as letter_spec
from app.services.letters.numbering import format_number
from app.services.llm.embedding import EmbeddingProvider
from app.services.llm.generation import LlmProvider
from app.services.organisation import lock_organization

logger = logging.getLogger("mbuti.letters")

MAX_PAGES = 10


async def record(session: AsyncSession, task: Task, step: TaskStep, letter: dict) -> None:
    """Isi surat dari satu langkah: berkas baru, atau versi berikutnya milik role yang sama."""
    document = await session.scalar(
        select(ResultDocument).where(
            ResultDocument.task_id == task.id, ResultDocument.agent_id == step.agent_id
        )
    )
    if document is None:
        document = ResultDocument(
            id=uuid.uuid4(),
            organization_id=task.organization_id,
            task_id=task.id,
            agent_id=step.agent_id,
            version=1,
        )
        session.add(document)
    elif document.number:
        return
    else:
        document.version += 1
        if document.letter_type.lower() != letter["letter_type"].lower():
            document.format_id = None
    document.letter_type = letter["letter_type"]
    document.title = task.title
    document.content = letter
    document.needs_render = True


async def approved_by_human(session: AsyncSession, task_id: uuid.UUID) -> bool:
    return bool(
        await session.scalar(
            select(Approval.id)
            .where(
                Approval.task_id == task_id,
                Approval.status == "approved",
                Approval.decided_by_member_id.is_not(None),
            )
            .limit(1)
        )
    )


async def assign_number(session: AsyncSession, document: ResultDocument) -> None:
    """Ambil nomor dari register. Pemanggil sudah mengunci organisasi dan akan menyimpan."""
    organization = await session.get(Organization, document.organization_id)
    today = utcnow().astimezone(ZoneInfo(organization.timezone)).date()
    register = await session.scalar(
        select(LetterRegister)
        .where(
            LetterRegister.organization_id == document.organization_id,
            func.lower(LetterRegister.name) == document.letter_type.lower(),
        )
        .with_for_update()
    )
    if register is None:
        note = await session.get(LetterFormat, document.format_id) if document.format_id else None
        register = LetterRegister(
            id=uuid.uuid4(),
            organization_id=document.organization_id,
            name=document.letter_type,
            pattern=(note and note.number_pattern) or letter_spec.DEFAULT_PATTERN,
            next_number=1,
            year=today.year,
        )
        session.add(register)
        await session.flush()
    if register.year != today.year:
        register.year, register.next_number = today.year, 1
    used = set(
        await session.scalars(
            select(LetterNumber.number).where(LetterNumber.register_id == register.id)
        )
    )
    sequence = register.next_number
    # Pola tanpa [tahun] bisa mengulang nomor lama; urutan dilewati sampai nomornya baru
    while (number := format_number(register.pattern, sequence, today)) in used:
        sequence += 1
    register.next_number = sequence + 1
    session.add(
        LetterNumber(
            register_id=register.id,
            number=number,
            task_id=document.task_id,
            title=document.title,
            issued_at=utcnow(),
        )
    )
    document.number = number
    document.needs_render = True


async def _head(session: AsyncSession, document: ResultDocument, note: LetterFormat) -> render.Head:
    """Kop unit role, lalu kop organisasi, lalu kop contoh Word, lalu nama organisasi."""
    agent = await session.get(Agent, document.agent_id) if document.agent_id else None
    heads = (
        await session.scalars(
            select(Letterhead).where(Letterhead.organization_id == document.organization_id)
        )
    ).all()
    by_unit = {h.unit_id: h for h in heads}
    chosen = (by_unit.get(agent.unit_id) if agent and agent.unit_id else None) or by_unit.get(None)
    if chosen:
        data = await asyncio.to_thread(storage.path_of(chosen.path).read_bytes)
        return render.Head(image=data)
    if any(s["kind"] == "sample" for s in note.sources):
        sample = await formats.find_sample(session, document.organization_id, note.name)
        if sample:
            _, head = await formats.read_sample_file(sample.path)
            if head.image or head.lines:
                return head
    organization = await session.get(Organization, document.organization_id)
    lines = (organization.name.upper(), organization.address, organization.website)
    return render.Head(lines=tuple(line for line in lines if line))


def _checks(document: ResultDocument, note: LetterFormat, has_pdf: bool) -> list[dict]:
    letter = document.content
    rule = next((s for s in note.sources if s["kind"] in ("rule", "sample")), None)
    ref = ", ".join(x for x in (rule["title"], rule["detail"]) if x) if rule else ""
    needed = {
        "Hal": letter["subject"],
        "tujuan": letter["recipients"],
        "jabatan penanda tangan": letter["signer_position"],
    }
    missing = [name for name, value in needed.items() if not value]
    checks = [
        {
            "text": f"Belum terisi: {', '.join(missing)}"
            if missing
            else "Hal, tujuan, isi, dan jabatan penanda tangan terisi",
            "passed": not missing,
            "ref": ref,
        },
        {
            "text": "Nama pejabat penanda tangan terisi"
            if letter["signer_name"]
            else "Nama pejabat penanda tangan perlu diisi",
            "passed": bool(letter["signer_name"]),
            "ref": ref,
        },
        {
            "text": "Nomor dari buku register"
            if document.number
            else "Nomor diambil dari buku register saat disetujui",
            "passed": True,
            "ref": "Buku register",
        },
    ]
    checks += [{"text": text, "passed": False, "ref": ref} for text in note.notes]
    if not has_pdf:
        checks.append({"text": "PDF gagal dibuat; gunakan DOCX", "passed": False, "ref": ""})
    return checks


async def render_files(session: AsyncSession, document: ResultDocument) -> None:
    """Buat ulang DOCX, PDF, dan gambar halaman dari isi dan format sekarang. Menyimpan."""
    note = await session.get(LetterFormat, document.format_id)
    head = await _head(session, document, note)
    organization = await session.get(Organization, document.organization_id)
    day = document.created_at.astimezone(ZoneInfo(organization.timezone)).date()
    content, spec, number = document.content, note.spec, document.number
    version, organization_id = document.version, document.organization_id
    await session.commit()

    docx = await asyncio.to_thread(render.build_docx, content, spec, head, number, day)
    pdf = await asyncio.to_thread(render.to_pdf, docx)
    pages = await asyncio.to_thread(visual.render_pdf, pdf, MAX_PAGES) if pdf else []

    def save(extension: str, data: bytes) -> str:
        return storage.save(organization_id, extension, data)

    docx_path = await asyncio.to_thread(save, "docx", docx)
    pdf_path = await asyncio.to_thread(save, "pdf", pdf) if pdf else None
    page_paths = [await asyncio.to_thread(save, "webp", page) for page, _, _ in pages]
    created = [p for p in (docx_path, pdf_path, *page_paths) if p]

    await lock_organization(session, organization_id)
    current = await session.get(
        ResultDocument, document.id, populate_existing=True, with_for_update=True
    )
    if current is None or current.version != version or current.number != number:
        # Isi atau nomor berubah selagi berkas dibuat: hasil ini sudah usang
        await session.rollback()
        for path in created:
            storage.delete(path)
        return
    old = [p for p in (current.docx_path, current.pdf_path, *current.page_paths) if p]
    note = await session.get(LetterFormat, current.format_id)
    current.docx_path, current.pdf_path, current.page_paths = docx_path, pdf_path, page_paths
    current.spec, current.sources = spec, note.sources
    current.checks = _checks(current, note, pdf is not None)
    current.needs_render = False
    await session.commit()
    for path in old:
        storage.delete(path)


def pending_condition():
    """Berkas yang masih perlu dikerjakan: belum dibuat, atau sudah berhak bernomor."""
    approved = exists().where(
        Approval.task_id == ResultDocument.task_id,
        Approval.status == "approved",
        Approval.decided_by_member_id.is_not(None),
    )
    completed = exists().where(Task.id == ResultDocument.task_id, Task.status == "completed")
    return or_(
        ResultDocument.needs_render.is_(True),
        and_(ResultDocument.number.is_(None), completed, approved),
    )


async def finalize(
    sessions: async_sessionmaker[AsyncSession],
    task_id: uuid.UUID,
    llm: LlmProvider,
    embedder: EmbeddingProvider,
) -> None:
    """Selesaikan berkas satu tugas. Kegagalan dicatat dan tidak mengubah tugasnya."""
    async with sessions() as session:
        ids = list(
            await session.scalars(
                select(ResultDocument.id).where(
                    ResultDocument.task_id == task_id, pending_condition()
                )
            )
        )
    for document_id in ids:
        try:
            async with sessions() as session:
                await finalize_one(session, document_id, llm, embedder)
        except Exception:
            logger.exception("Berkas %s gagal diselesaikan", document_id)


async def finalize_one(
    session: AsyncSession, document_id: uuid.UUID, llm: LlmProvider, embedder: EmbeddingProvider
) -> None:
    """Format, nomor otomatis, lalu berkasnya. Menyimpan transaksi."""
    document = await session.get(ResultDocument, document_id)
    task = await session.get(Task, document.task_id)
    if document.format_id is None:
        agent = await session.get(Agent, document.agent_id or task.entry_agent_id)
        note = await formats.ensure_format(
            session, task, agent, document.letter_type, llm, embedder
        )
        document = await session.get(ResultDocument, document_id, populate_existing=True)
        document.format_id = note.id
        await session.commit()
    await lock_organization(session, document.organization_id)
    document = await session.get(
        ResultDocument, document_id, populate_existing=True, with_for_update=True
    )
    task = await session.get(Task, document.task_id, populate_existing=True)
    if (
        document.number is None
        and task.status == "completed"
        and await approved_by_human(session, task.id)
    ):
        await assign_number(session, document)
    await session.commit()
    if document.needs_render:
        await render_files(session, document)
