"""
Gambar yang dibaca role (E1c, kontrak 16.6): lampiran tugas dan halaman pengetahuan bergambar.

Temuan dari model diperiksa server: gambar harus yang dikirim, kotak harus sah, nomor potongan
harus ada, kriteria harus milik role. Nomor temuan diberi server.
"""

import asyncio
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import DocumentChunk, DocumentSection, TaskAttachment
from app.services.knowledge import storage
from app.services.knowledge.search import Chunk

MAX_FINDINGS = 12
SEVERITIES = ("info", "perlu_perbaikan", "penting")
MIME = "image/webp"


@dataclass
class ImageInput:
    label: str
    title: str
    data: bytes
    # Sasaran temuan: lampiran atau halaman dokumen
    target: dict = field(default_factory=dict)
    # Nomor potongan dokumen (1-based) bila gambar ini halaman pengetahuan
    excerpt: int | None = None


async def _read(relative: str) -> bytes | None:
    path = storage.path_of(relative)
    return await asyncio.to_thread(path.read_bytes) if path.is_file() else None


async def attachment_images(
    session: AsyncSession, organization_id: uuid.UUID, attachment_ids: list[uuid.UUID]
) -> list[ImageInput]:
    """Halaman lampiran, urut lampiran lalu halaman, paling banyak MAX_IMAGES_PER_STEP."""
    if not attachment_ids:
        return []
    rows = {
        a.id: a
        for a in await session.scalars(
            select(TaskAttachment).where(
                TaskAttachment.id.in_(attachment_ids),
                TaskAttachment.organization_id == organization_id,
            )
        )
    }
    images: list[ImageInput] = []
    for attachment_id in attachment_ids:
        attachment = rows.get(attachment_id)
        if attachment is None:
            continue
        for page_no, relative in enumerate(attachment.page_paths, start=1):
            if len(images) >= settings.MAX_IMAGES_PER_STEP:
                return images
            data = await _read(relative)
            if data is None:
                continue
            title = attachment.file_name
            if len(attachment.page_paths) > 1:
                title = f"{title}, halaman {page_no}"
            images.append(
                ImageInput(
                    label=f"G{len(images) + 1}",
                    title=f"Lampiran: {title}",
                    data=data,
                    target={
                        "kind": "attachment",
                        "attachment_id": str(attachment.id),
                        "page_no": page_no,
                    },
                )
            )
    return images


async def page_images(excerpts: list[Chunk], taken: int) -> list[ImageInput]:
    """Halaman bergambar di antara potongan, satu gambar per halaman, sisa kuota gambar."""
    images: list[ImageInput] = []
    seen: set[uuid.UUID] = set()
    for number, chunk in enumerate(excerpts, start=1):
        if not chunk.image_path or chunk.section_id in seen:
            continue
        if taken + len(images) >= settings.MAX_IMAGES_PER_STEP:
            break
        data = await _read(chunk.image_path)
        if data is None:
            continue
        seen.add(chunk.section_id)
        images.append(
            ImageInput(
                label=f"G{taken + len(images) + 1}",
                title=f"{chunk.document_title} (versi {chunk.version_no}, halaman {chunk.page_no})",
                data=data,
                target={
                    "kind": "document",
                    "document_id": str(chunk.document_id),
                    "version_id": str(chunk.version_id),
                    "page_no": chunk.page_no,
                },
                excerpt=number,
            )
        )
    return images


def finding_sources(data: dict, excerpt_count: int) -> list[int]:
    """Nomor potongan yang disebut temuan; ikut dijadikan rujukan."""
    found = []
    for item in data.get("findings") or []:
        if isinstance(item, dict) and isinstance(item.get("source"), int):
            if 1 <= item["source"] <= excerpt_count:
                found.append(item["source"])
    return found


def _box(value: object) -> list[int] | None:
    if not isinstance(value, list) or len(value) != 4:
        return None
    if not all(isinstance(n, int) and not isinstance(n, bool) and 0 <= n <= 1000 for n in value):
        return None
    y0, x0, y1, x1 = value
    return value if y0 < y1 and x0 < x1 else None


def _text(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def clean_findings(
    data: dict,
    images: list[ImageInput],
    excerpts: list[Chunk],
    cited: list[Chunk],
    criteria: list[str],
) -> list[dict]:
    """Temuan yang sah, dengan nomor potongan disesuaikan ke urutan rujukan."""
    by_label = {image.label: image for image in images}
    findings: list[dict] = []
    for item in data.get("findings") or []:
        if len(findings) >= MAX_FINDINGS or not isinstance(item, dict):
            continue
        image = by_label.get(str(item.get("image") or "").strip())
        title = _text(item.get("title"), 160)
        if image is None or not title:
            continue
        source = item.get("source")
        source_index = None
        if isinstance(source, int) and 1 <= source <= len(excerpts):
            chunk = excerpts[source - 1]
            source_index = next((i for i, c in enumerate(cited, start=1) if c is chunk), None)
        criterion = _text(item.get("criterion"), 200)
        findings.append(
            {
                "no": len(findings) + 1,
                "title": title,
                "description": _text(item.get("description"), 600),
                "severity": item.get("severity") if item.get("severity") in SEVERITIES else "info",
                "target": image.target,
                "box": _box(item.get("box")),
                "source_index": source_index,
                "recommendation": _text(item.get("recommendation"), 600),
                "criterion": criterion if criterion in criteria else None,
            }
        )
    return findings


async def save_readings(
    session: AsyncSession, data: dict, images: list[ImageInput], excerpts: list[Chunk]
) -> None:
    """Bacaan halaman bergambar disimpan sekali agar ikut pencarian kata kunci berikutnya."""
    by_label = {image.label: image for image in images if image.excerpt}
    for item in data.get("page_readings") or []:
        if not isinstance(item, dict):
            continue
        image = by_label.get(str(item.get("image") or "").strip())
        text = str(item.get("text") or "").strip()[:8000]
        if image is None or not text:
            continue
        chunk = excerpts[image.excerpt - 1]
        if chunk.visual_text:
            continue
        await session.execute(
            update(DocumentSection)
            .where(DocumentSection.id == chunk.section_id, DocumentSection.visual_text == "")
            .values(visual_text=text)
        )
        # Potongan gambar yang tanpa teks ikut terbaca pencarian kata kunci
        await session.execute(
            update(DocumentChunk)
            .where(
                DocumentChunk.section_id == chunk.section_id,
                DocumentChunk.kind == "page_image",
                DocumentChunk.text == "",
            )
            .values(text=text[:1200])
        )
