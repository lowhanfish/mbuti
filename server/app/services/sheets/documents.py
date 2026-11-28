"""
Spreadsheet sebagai berkas hasil tugas: lembar data lampiran, pencatatan rancangan, dan
pembuatan berkasnya di worker (kontrak 19.2–19.4).
"""

import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ResultDocument, Task, TaskAttachment, TaskStep
from app.services.knowledge import storage
from app.services.organisation import lock_organization
from app.services.sheets import build
from app.services.sheets.design import DataTable
from app.services.sheets.read import DataError, Table, read_tables

logger = logging.getLogger("mbuti.sheets")

KIND = "sheet"
MAX_TABLES = 10
FAILED = "Berkas Excel gagal dibuat. Minta revisi atau buat tugas ulang."
MISSING = "Berkas data tidak ditemukan; Excel tidak bisa dibuat."


async def data_tables(
    session: AsyncSession, organization_id: uuid.UUID, attachment_ids: list[uuid.UUID]
) -> list[DataTable]:
    """Lembar data lampiran, diberi nama D1, D2, ... urut lampiran lalu lembarnya."""
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
    tables: list[DataTable] = []
    for attachment_id in attachment_ids:
        attachment = rows.get(attachment_id)
        for index, item in enumerate((attachment.tables if attachment else None) or []):
            if len(tables) >= MAX_TABLES:
                return tables
            tables.append(
                DataTable(
                    label=f"D{len(tables) + 1}",
                    attachment_id=str(attachment.id),
                    file_name=attachment.file_name,
                    index=index,
                    name=item["name"],
                    columns=item["columns"],
                    row_count=item["row_count"],
                    sample=item["sample"],
                )
            )
    return tables


async def record(session: AsyncSession, task: Task, step: TaskStep, design: dict) -> None:
    """Rancangan dari satu langkah: berkas baru, atau versi berikutnya milik role yang sama."""
    document = await session.scalar(
        select(ResultDocument).where(
            ResultDocument.task_id == task.id,
            ResultDocument.agent_id == step.agent_id,
            ResultDocument.kind == KIND,
        )
    )
    if document is None:
        document = ResultDocument(
            id=uuid.uuid4(),
            organization_id=task.organization_id,
            task_id=task.id,
            agent_id=step.agent_id,
            kind=KIND,
            letter_type="",
            version=1,
        )
        session.add(document)
    else:
        document.version += 1
    document.title = task.title
    document.content = design
    document.needs_render = True


async def _sources(session: AsyncSession, document: ResultDocument) -> dict[str, tuple[str, str]]:
    """Label sumber -> (nama berkas, alamat berkas asli), hanya milik organisasi dan tugas ini."""
    found = {}
    for source in document.content["sources"]:
        path = await session.scalar(
            select(TaskAttachment.storage_path).where(
                TaskAttachment.id == uuid.UUID(source["attachment_id"]),
                TaskAttachment.organization_id == document.organization_id,
                TaskAttachment.task_id == document.task_id,
            )
        )
        if path is not None:
            found[source["label"]] = (source["file_name"], path)
    return found


def _make(design: dict, sources: dict[str, tuple[str, str]]) -> build.Built:
    """Baca berkas asli lalu bangun spreadsheet (sinkron, dijalankan di thread)."""
    read: dict[str, list[Table]] = {}
    tables: dict[str, Table] = {}
    for source in design["sources"]:
        _, path = sources[source["label"]]
        if path not in read:
            extension = path.rsplit(".", 1)[-1]
            read[path] = read_tables(extension, storage.path_of(path).read_bytes())
        tables[source["label"]] = read[path][source["index"]]
    return build.build(design, tables)


async def render(session: AsyncSession, document: ResultDocument) -> None:
    """Buat ulang berkas dari rancangan sekarang. Menyimpan transaksi."""
    design, version = document.content, document.version
    organization_id, document_id = document.organization_id, document.id
    sources = await _sources(session, document)
    await session.commit()

    built, problem = None, ""
    if len(sources) != len(design["sources"]):
        problem = MISSING
    else:
        try:
            built = await asyncio.to_thread(_make, design, sources)
        except (DataError, OSError, IndexError):
            logger.exception("Berkas data spreadsheet %s tidak terbaca", document_id)
            problem = MISSING
        except Exception:
            # Rancangan yang membuat program gagal tidak dicoba terus-menerus
            logger.exception("Spreadsheet %s gagal dibuat", document_id)
            problem = FAILED

    path = (
        await asyncio.to_thread(storage.save, organization_id, "xlsx", built.xlsx)
        if built
        else None
    )
    await lock_organization(session, organization_id)
    current = await session.get(
        ResultDocument, document_id, populate_existing=True, with_for_update=True
    )
    if current is None or current.version != version:
        await session.rollback()
        if path:
            storage.delete(path)
        return
    old = current.xlsx_path
    current.xlsx_path = path
    current.preview = built.preview if built else []
    current.checks = built.checks if built else [{"text": problem, "passed": False, "ref": ""}]
    current.needs_render = False
    await session.commit()
    if old:
        storage.delete(old)


def review_summary(document: ResultDocument) -> str:
    """Ringkasan untuk pemeriksa: kolom, jumlah baris, penanda, dan baris total."""
    lines = []
    for sheet in document.preview:
        columns = "; ".join(
            f"{c['header']} ({c['formula']})" if c["formula"] else c["header"]
            for c in sheet["columns"]
        )
        lines.append(f"Lembar {sheet['name']}: {sheet['row_count']} baris. Kolom: {columns}")
        if sheet["flag_rule"]:
            lines.append(f"Ditandai {sheet['flagged']} baris: {sheet['flag_rule']}")
        for row in sheet["rows"]:
            if row["style"] == "total":
                lines.append("Total: " + " | ".join(row["cells"]))
    lines += [f"Perlu diperiksa: {c['text']}" for c in document.checks if not c["passed"]]
    return "\n".join(lines)
