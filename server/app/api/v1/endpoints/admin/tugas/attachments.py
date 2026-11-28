"""Lampiran tugas dan uji coba: gambar, PDF, atau data XLSX/CSV (kontrak 16.6 dan 19.1)."""

import asyncio
import datetime
import hashlib
import uuid
from pathlib import PurePosixPath

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import aliased

from app.api.deps import CurrentMember
from app.api.v1.common import parse_id
from app.api.v1.endpoints.admin.tugas.schema import AttachmentItem
from app.core.config import settings
from app.core.exceptions import NotFoundException, UnprocessableEntityException
from app.models import Membership, TaskAttachment, User
from app.models.base import utcnow
from app.services.knowledge import storage, visual
from app.services.knowledge.extract import ExtractionError, detect_type
from app.services.knowledge.image_files import read_image
from app.services.sheets.read import DataError, read_tables, summary

NOT_FOUND = "Lampiran tidak ditemukan."
UNUSABLE = "Lampiran tidak ditemukan atau sudah dipakai tugas lain. Unggah ulang."
KEEP_UNUSED = datetime.timedelta(hours=24)
ALLOWED = ("png", "jpg", "webp", "pdf")
UNSUPPORTED = "Lampiran berupa gambar PNG, JPG, WEBP, PDF, Excel (.xlsx), atau CSV."
DATA_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv",
}


def page_url(attachment_id: uuid.UUID, page_no: int) -> str:
    return f"/api/v1/admin/tugas/lampiran/{attachment_id}/pages/{page_no}"


def to_item(attachment: TaskAttachment, uploader: str | None) -> AttachmentItem:
    return AttachmentItem(
        id=str(attachment.id),
        file_name=attachment.file_name,
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        width=attachment.width,
        height=attachment.height,
        page_count=len(attachment.page_paths),
        pages=[page_url(attachment.id, n) for n in range(1, len(attachment.page_paths) + 1)],
        table=[
            {
                "name": t["name"],
                "columns": [c["name"] for c in t["columns"]],
                "row_count": t["row_count"],
            }
            for t in attachment.tables
        ]
        if attachment.tables
        else None,
        exif=attachment.exif,
        uploaded_by_name=uploader,
        created_at=attachment.created_at,
    )


def _prepare(extension: str, data: bytes) -> tuple[list[bytes], int, int, dict | None]:
    """Gambar tiap halaman (sinkron, dijalankan di thread)."""
    if extension == "pdf":
        pages = visual.render_pdf(data, settings.MAX_ATTACHMENT_PAGES)
        if not pages:
            raise ExtractionError("PDF tidak punya halaman.")
        return [page for page, _, _ in pages], 0, 0, None
    image, width, height, exif = visual.prepare_image(data)
    return [image], width, height, exif


def _summaries(extension: str, data: bytes) -> list[dict]:
    return [summary(table) for table in read_tables(extension, data)]


async def upload(
    session: AsyncSession, actor: CurrentMember, file_name: str, data: bytes
) -> AttachmentItem:
    if not data:
        raise UnprocessableEntityException("Berkas kosong.")
    if len(data) > settings.MAX_IMAGE_BYTES:
        raise UnprocessableEntityException(
            f"Ukuran lampiran melebihi {settings.MAX_IMAGE_BYTES // (1024 * 1024)} MB."
        )
    name = PurePosixPath(file_name.replace("\\", "/")).name
    name = "".join(c for c in name if c.isprintable()).strip()[-200:] or "lampiran"
    extension = PurePosixPath(name.lower()).suffix.lstrip(".")
    pages, width, height, exif, tables = [], 0, 0, None, None
    try:
        if extension in DATA_TYPES:
            tables = await asyncio.to_thread(_summaries, extension, data)
        else:
            extension = detect_type(name, data)
            if extension not in ALLOWED:
                raise ExtractionError(UNSUPPORTED)
            pages, width, height, exif = await asyncio.to_thread(_prepare, extension, data)
    except DataError as exc:
        raise UnprocessableEntityException(str(exc)) from exc
    except ExtractionError as exc:
        message = str(exc)
        if "Jenis berkas" in message:
            message = UNSUPPORTED
        raise UnprocessableEntityException(message) from exc

    organization_id = actor.organization_id
    original = await asyncio.to_thread(storage.save, organization_id, extension, data)
    page_paths = [
        await asyncio.to_thread(storage.save, organization_id, "webp", page) for page in pages
    ]
    attachment = TaskAttachment(
        organization_id=organization_id,
        file_name=name,
        storage_path=original,
        mime_type=DATA_TYPES.get(extension)
        or ("application/pdf" if extension == "pdf" else visual.IMAGE_TYPES[extension]),
        tables=tables,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        width=width,
        height=height,
        page_paths=page_paths,
        exif=exif,
        uploaded_by_member_id=actor.membership.id,
        expires_at=utcnow() + KEEP_UNUSED,
    )
    session.add(attachment)
    await session.commit()
    return to_item(attachment, actor.user.full_name)


async def claim(
    session: AsyncSession, organization_id: uuid.UUID, ids: list[str], task_id: uuid.UUID | None
) -> list[uuid.UUID]:
    """
    Lampiran milik organisasi ini yang belum dipakai tugas dan belum kedaluwarsa. Bila `task_id`
    diisi, lampiran diikat ke tugas itu (tidak commit); uji coba memakainya tanpa mengikat.
    """
    if len(ids) > settings.MAX_ATTACHMENTS:
        raise UnprocessableEntityException(f"Lampiran maksimal {settings.MAX_ATTACHMENTS} berkas.")
    wanted = list(dict.fromkeys(parse_id(i, UNUSABLE) for i in ids))
    if not wanted:
        return []
    rows = {
        a.id: a
        for a in await session.scalars(
            select(TaskAttachment).where(
                TaskAttachment.id.in_(wanted),
                TaskAttachment.organization_id == organization_id,
                TaskAttachment.task_id.is_(None),
            )
        )
    }
    if len(rows) != len(wanted) or any(
        a.expires_at is not None and a.expires_at < utcnow() for a in rows.values()
    ):
        raise UnprocessableEntityException(UNUSABLE)
    if task_id is not None:
        for attachment in rows.values():
            attachment.task_id = task_id
            attachment.expires_at = None
    return wanted


async def task_attachments(session: AsyncSession, task_id: uuid.UUID) -> list[AttachmentItem]:
    uploader = aliased(Membership)
    rows = await session.execute(
        select(TaskAttachment, User.full_name)
        .outerjoin(uploader, uploader.id == TaskAttachment.uploaded_by_member_id)
        .outerjoin(User, User.id == uploader.user_id)
        .where(TaskAttachment.task_id == task_id)
        .order_by(TaskAttachment.created_at)
    )
    return [to_item(attachment, name) for attachment, name in rows]


async def page_image(
    session: AsyncSession, organization_id: uuid.UUID, attachment_id: str, page_no: int, box: str
) -> bytes:
    attachment = await session.scalar(
        select(TaskAttachment).where(
            TaskAttachment.id == parse_id(attachment_id, NOT_FOUND),
            TaskAttachment.organization_id == organization_id,
        )
    )
    if attachment is None or not 1 <= page_no <= len(attachment.page_paths):
        raise NotFoundException(NOT_FOUND)
    return await read_image(attachment.page_paths[page_no - 1], box)


async def purge_expired(sessions: async_sessionmaker[AsyncSession]) -> int:
    """Buang lampiran yang tidak jadi dipakai beserta berkasnya."""
    async with sessions() as session:
        expired = list(
            await session.scalars(
                select(TaskAttachment).where(
                    TaskAttachment.task_id.is_(None), TaskAttachment.expires_at < utcnow()
                )
            )
        )
        if not expired:
            return 0
        await session.execute(
            delete(TaskAttachment).where(TaskAttachment.id.in_([a.id for a in expired]))
        )
        await session.commit()
    for attachment in expired:
        for path in [attachment.storage_path, *attachment.page_paths]:
            storage.delete(path)
    return len(expired)
