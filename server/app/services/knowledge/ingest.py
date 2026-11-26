"""
Olah satu versi dokumen: baca teks, potong, hitung vektor, lalu aktifkan.

Aman diulang: potongan yang vektornya sudah ada tidak dihitung lagi, sehingga percobaan ulang
setelah batas kuota tidak mengulang dari awal.
"""

import asyncio
import datetime
import logging
import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Document, DocumentChunk, DocumentSection, DocumentVersion
from app.models.base import utcnow
from app.services.knowledge import storage
from app.services.knowledge.extract import ExtractionError, extract_sections, split_text
from app.services.llm.embedding import EmbeddingProvider
from app.services.llm.gemini_keys import GeminiUnavailable
from app.services.organisation import lock_organization

logger = logging.getLogger("mbuti.ingestion")

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150
# Menjaga kuota embedding; dokumen sebesar ini sekitar 400 halaman padat
MAX_CHUNKS = 1500
PROGRESS_EVERY = 5
# Olah yang berhenti tanpa kabar selama ini boleh diambil ulang
STALE_AFTER = datetime.timedelta(minutes=15)
GENERIC_FAILURE = "Dokumen gagal diolah. Coba unggah ulang."


class RetryLater(Exception):
    def __init__(self, seconds: int):
        super().__init__(seconds)
        self.seconds = seconds


async def _claim(session: AsyncSession, version_id: uuid.UUID) -> DocumentVersion | None:
    version = await session.scalar(
        select(DocumentVersion).where(DocumentVersion.id == version_id).with_for_update()
    )
    if version is None:
        return None
    stale = (
        version.status == "processing"
        and version.started_at is not None
        and utcnow() - version.started_at > STALE_AFTER
    )
    if version.status != "queued" and not stale:
        return None
    version.status = "processing"
    version.started_at = utcnow()
    version.attempts += 1
    version.error_message = None
    await session.commit()
    return version


async def _prepare_chunks(session: AsyncSession, version: DocumentVersion) -> None:
    """Baca berkas menjadi seksi dan potongan, sekali untuk tiap versi."""
    if await session.scalar(
        select(DocumentSection.id).where(DocumentSection.version_id == version.id).limit(1)
    ):
        return
    extension = version.storage_path.rsplit(".", 1)[-1]
    data = await asyncio.to_thread(storage.path_of(version.storage_path).read_bytes)
    sections = await asyncio.to_thread(extract_sections, extension, data)

    chunks: list[DocumentChunk] = []
    for section in sections:
        row = DocumentSection(
            id=uuid.uuid4(),
            version_id=version.id,
            page_no=section.page_no,
            heading=section.heading[:200],
            text=section.text,
        )
        session.add(row)
        for piece in split_text(section.text, CHUNK_SIZE, CHUNK_OVERLAP):
            chunks.append(
                DocumentChunk(
                    section_id=row.id,
                    version_id=version.id,
                    chunk_no=len(chunks) + 1,
                    heading=row.heading,
                    text=piece,
                )
            )
    if len(chunks) > MAX_CHUNKS:
        raise ExtractionError("Dokumen terlalu panjang. Pecah menjadi beberapa berkas.")
    await session.flush()
    session.add_all(chunks)
    version.page_count = len(sections)
    version.progress = 5
    await session.commit()


async def _embed_chunks(
    session: AsyncSession, version: DocumentVersion, title: str, provider: EmbeddingProvider
) -> None:
    total = await session.scalar(
        select(func.count())
        .select_from(DocumentChunk)
        .where(DocumentChunk.version_id == version.id)
    )
    pending = (
        await session.execute(
            select(DocumentChunk.id, DocumentChunk.heading, DocumentChunk.text)
            .where(DocumentChunk.version_id == version.id, DocumentChunk.embedding.is_(None))
            .order_by(DocumentChunk.chunk_no)
        )
    ).all()
    done = total - len(pending)
    for number, chunk in enumerate(pending, start=1):
        vector = await provider.embed_document(f"{title} — {chunk.heading}", chunk.text)
        await session.execute(
            update(DocumentChunk).where(DocumentChunk.id == chunk.id).values(embedding=vector)
        )
        if number % PROGRESS_EVERY == 0 or number == len(pending):
            version.progress = 5 + int(90 * (done + number) / total)
            version.started_at = utcnow()
            await session.commit()


async def _finish(session: AsyncSession, version: DocumentVersion, document: Document) -> None:
    # Dikunci agar tidak bertabrakan dengan pergantian versi aktif secara manual
    await lock_organization(session, document.organization_id)
    await session.refresh(version)
    version.status = "ready"
    version.progress = 100
    version.finished_at = utcnow()
    if version.activate_when_ready:
        version.activate_when_ready = False
        newer = await session.scalar(
            select(DocumentVersion.id).where(
                DocumentVersion.document_id == document.id,
                DocumentVersion.is_active.is_(True),
                DocumentVersion.version_no > version.version_no,
            )
        )
        if newer is None:
            await session.execute(
                update(DocumentVersion)
                .where(DocumentVersion.document_id == document.id, DocumentVersion.id != version.id)
                .values(is_active=False)
            )
            version.is_active = True
    document.updated_at = utcnow()
    await session.commit()


async def mark_failed(
    sessions: async_sessionmaker[AsyncSession], version_id: uuid.UUID, message: str
) -> None:
    async with sessions() as session:
        await session.execute(
            delete(DocumentSection).where(DocumentSection.version_id == version_id)
        )
        await session.execute(
            update(DocumentVersion)
            .where(DocumentVersion.id == version_id, DocumentVersion.status != "ready")
            .values(
                status="failed",
                progress=0,
                activate_when_ready=False,
                error_message=message[:300],
                finished_at=utcnow(),
            )
        )
        await session.commit()


async def ingest_version(
    sessions: async_sessionmaker[AsyncSession],
    version_id: uuid.UUID,
    provider: EmbeddingProvider,
) -> None:
    async with sessions() as session:
        version = await _claim(session, version_id)
        if version is None:
            return
        document = await session.get(Document, version.document_id)
        try:
            await _prepare_chunks(session, version)
            await _embed_chunks(session, version, document.title, provider)
            await _finish(session, version, document)
            return
        except GeminiUnavailable as exc:
            await session.rollback()
            await session.execute(
                update(DocumentVersion)
                .where(DocumentVersion.id == version_id)
                .values(status="queued", error_message="Menunggu kuota model, dicoba lagi.")
            )
            await session.commit()
            raise RetryLater(exc.retry_after) from exc
        except ExtractionError as exc:
            await session.rollback()
            message = str(exc)
        except Exception:
            await session.rollback()
            logger.exception("Gagal mengolah versi %s", version_id)
            message = GENERIC_FAILURE
    await mark_failed(sessions, version_id, message)
