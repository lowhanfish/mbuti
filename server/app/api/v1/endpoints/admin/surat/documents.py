"""Berkas hasil tugas: baca, koreksi format, beri nomor, dan unduh (kontrak 18.1–18.3)."""

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MANAGERS, CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.surat.schema import (
    Composed,
    ReportResultItem,
    ResultDocumentItem,
    SheetResultItem,
)
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnprocessableEntityException,
)
from app.models import Agent, LetterFormat, ResultDocument, Task, TaskStep
from app.services import budget
from app.services.knowledge import storage
from app.services.letters import documents, formats
from app.services.llm.embedding import get_embedding_provider
from app.services.llm.generation import get_llm_provider
from app.services.organisation import lock_organization

TASK_NOT_FOUND = "Tugas tidak ditemukan."
NOT_FOUND = "Berkas tidak ditemukan."
NUMBERED = "Surat sudah bernomor dan tidak bisa diubah."
NOT_LETTER = "Berkas ini bukan surat."
PROCESSING = "Berkas masih diproses. Coba lagi sebentar."
BASE = "/api/v1/admin/tugas"
MEDIA = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


async def _task(session: AsyncSession, actor: CurrentMember, task_id: str) -> Task:
    task = await session.scalar(
        select(Task).where(
            Task.id == parse_id(task_id, TASK_NOT_FOUND),
            Task.organization_id == actor.organization_id,
        )
    )
    if task is None:
        raise NotFoundException(TASK_NOT_FOUND)
    return task


async def _document(
    session: AsyncSession, actor: CurrentMember, task_id: str, result_id: str
) -> tuple[Task, ResultDocument]:
    task = await _task(session, actor, task_id)
    document = await session.scalar(
        select(ResultDocument).where(
            ResultDocument.id == parse_id(result_id, NOT_FOUND), ResultDocument.task_id == task.id
        )
    )
    if document is None:
        raise NotFoundException(NOT_FOUND)
    return task, document


async def _may_number(
    session: AsyncSession, actor: CurrentMember, document: ResultDocument
) -> bool:
    """Pemilik, admin, atau penanggung jawab role pembuat berkas."""
    if actor.access_role in MANAGERS:
        return True
    agent = await session.get(Agent, document.agent_id) if document.agent_id else None
    return bool(
        actor.access_role == "member" and agent and agent.owner_member_id == actor.membership.id
    )


async def _composed(session: AsyncSession, document: ResultDocument) -> list[dict]:
    """Bagian buatan pada hasil kerja terakhir role pembuat berkas (kontrak 20.1)."""
    if document.agent_id is None:
        return []
    found = await session.scalar(
        select(TaskStep.composed)
        .where(
            TaskStep.task_id == document.task_id,
            TaskStep.agent_id == document.agent_id,
            TaskStep.kind == "work",
            TaskStep.status.in_(("done", "revise_requested")),
        )
        .order_by(TaskStep.seq.desc())
        .limit(1)
    )
    return found or []


def _report_item(task: Task, document: ResultDocument) -> ReportResultItem:
    url = f"{BASE}/{task.id}/berkas/{document.id}"
    stamp = f"?v={document.version}"
    return ReportResultItem(
        id=str(document.id),
        title=document.title,
        version=document.version,
        processing=document.needs_render,
        checks=document.checks,
        created_at=document.created_at,
        updated_at=document.updated_at,
        report_type=document.letter_type,
        pages=[f"{url}/halaman/{n}{stamp}" for n in range(1, len(document.page_paths) + 1)],
        docx_url=f"{url}/unduh/docx{stamp}" if document.docx_path else None,
        pdf_url=f"{url}/unduh/pdf{stamp}" if document.pdf_path else None,
    )


def _sheet_item(task: Task, document: ResultDocument) -> SheetResultItem:
    url = f"{BASE}/{task.id}/berkas/{document.id}/unduh/xlsx?v={document.version}"
    return SheetResultItem(
        id=str(document.id),
        title=document.title,
        version=document.version,
        processing=document.needs_render,
        checks=document.checks,
        created_at=document.created_at,
        updated_at=document.updated_at,
        xlsx_url=url if document.xlsx_path else None,
        origin=document.content["origin"],
        source_files=list(dict.fromkeys(s["file_name"] for s in document.content["sources"])),
        sheets=document.preview,
    )


async def _item(
    session: AsyncSession, actor: CurrentMember, task: Task, document: ResultDocument
) -> ResultDocumentItem | SheetResultItem | ReportResultItem:
    composed = await _composed(session, document)
    if document.kind in ("sheet", "report"):
        build = _sheet_item if document.kind == "sheet" else _report_item
        return build(task, document).model_copy(
            update={"composed": [Composed(**item) for item in composed]}
        )
    note = await session.get(LetterFormat, document.format_id) if document.format_id else None
    waiting = document.number is None and task.status == "completed"
    approved = waiting and await documents.approved_by_human(session, task.id)
    url = f"{BASE}/{task.id}/berkas/{document.id}"
    # Alamat memuat versi dan nomor agar peramban tidak menampilkan gambar lama
    stamp = f"?v={document.version}{'n' if document.number else ''}"
    return ResultDocumentItem(
        composed=composed,
        id=str(document.id),
        title=document.title,
        letter_type=document.letter_type,
        format_id=str(document.format_id) if document.format_id else None,
        version=document.version,
        number=document.number,
        can_number=waiting and not approved and await _may_number(session, actor, document),
        processing=document.needs_render or approved,
        pages=[f"{url}/halaman/{n}{stamp}" for n in range(1, len(document.page_paths) + 1)],
        docx_url=f"{url}/unduh/docx{stamp}" if document.docx_path else None,
        pdf_url=f"{url}/unduh/pdf{stamp}" if document.pdf_path else None,
        sources=document.sources,
        format_checked=bool(note and note.checked),
        official=any(s["kind"] in ("rule", "sample") for s in document.sources),
        checks=document.checks,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


async def read_documents(
    session: AsyncSession, actor: CurrentMember, task_id: str
) -> list[ResultDocumentItem | SheetResultItem | ReportResultItem]:
    task = await _task(session, actor, task_id)
    rows = await session.scalars(
        select(ResultDocument)
        .where(ResultDocument.task_id == task.id)
        .order_by(ResultDocument.created_at, ResultDocument.id)
    )
    return [await _item(session, actor, task, row) for row in rows.all()]


async def _refreshed(
    session: AsyncSession, actor: CurrentMember, task_id: str, result_id: uuid.UUID
) -> ResultDocumentItem:
    await documents.finalize_one(session, result_id, get_llm_provider(), get_embedding_provider())
    task, document = await _document(session, actor, task_id, str(result_id))
    await session.refresh(document)
    return await _item(session, actor, task, document)


async def correct(
    session: AsyncSession, actor: CurrentMember, task_id: str, result_id: str, text: str
) -> ResultDocumentItem:
    _, document = await _document(session, actor, task_id, result_id)
    if document.kind != "letter":
        raise ConflictException(NOT_LETTER)
    if document.number:
        raise ConflictException(NUMBERED)
    if not 5 <= len(text) <= 300:
        raise UnprocessableEntityException("Koreksi harus 5–300 karakter.")
    if document.format_id is None or document.needs_render:
        raise ConflictException(PROCESSING)
    await budget.require_budget(session, actor.organization_id)
    document_id, format_id = document.id, document.format_id
    await formats.correct_format(
        session,
        actor.organization_id,
        actor.user.id,
        format_id,
        text,
        actor.user.full_name,
        get_llm_provider(),
    )
    await lock_organization(session, actor.organization_id)
    document = await session.get(
        ResultDocument, document_id, populate_existing=True, with_for_update=True
    )
    if document.number:
        await session.rollback()
        raise ConflictException(NUMBERED)
    document.version += 1
    document.needs_render = True
    await session.commit()
    return await _refreshed(session, actor, task_id, document_id)


async def give_number(
    session: AsyncSession, actor: CurrentMember, task_id: str, result_id: str
) -> ResultDocumentItem:
    _, found = await _document(session, actor, task_id, result_id)
    if found.kind != "letter":
        raise ConflictException(NOT_LETTER)
    if not await _may_number(session, actor, found):
        raise ForbiddenException("Anda tidak dapat memberi nomor surat ini.")
    document_id = found.id
    await lock_organization(session, actor.organization_id)
    document = await session.get(
        ResultDocument, document_id, populate_existing=True, with_for_update=True
    )
    task = await session.get(Task, document.task_id, populate_existing=True)
    if task.status != "completed" or document.number:
        raise ConflictException("Surat belum selesai atau sudah bernomor.")
    await documents.assign_number(session, document)
    await session.commit()
    return await _refreshed(session, actor, task_id, document_id)


async def page_image(
    session: AsyncSession, actor: CurrentMember, task_id: str, result_id: str, number: int
) -> bytes:
    _, document = await _document(session, actor, task_id, result_id)
    if not 1 <= number <= len(document.page_paths):
        raise NotFoundException("Halaman tidak ditemukan.")
    return await _read(document.page_paths[number - 1])


async def download(
    session: AsyncSession, actor: CurrentMember, task_id: str, result_id: str, kind: str
) -> tuple[bytes, str, str]:
    """(isi, jenis media, nama berkas)."""
    _, document = await _document(session, actor, task_id, result_id)
    paths = {"docx": document.docx_path, "pdf": document.pdf_path, "xlsx": document.xlsx_path}
    path = paths.get(kind)
    if not path:
        raise NotFoundException(NOT_FOUND)
    name = " ".join(
        "".join(c if c.isalnum() or c in " -_" else " " for c in document.title).split()
    )
    return await _read(path), MEDIA[kind], f"{name or 'berkas'}.{kind}"


async def _read(path: str) -> bytes:
    try:
        return await asyncio.to_thread(storage.path_of(path).read_bytes)
    except FileNotFoundError:
        raise NotFoundException(NOT_FOUND) from None
