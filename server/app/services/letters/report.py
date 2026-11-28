"""
Isi laporan, notulen, atau proposal yang ditulis role (kontrak 20.4). Model menyusun isinya;
berkas Word dan PDF diurus program.
"""

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ResultDocument, Task, TaskStep
from app.services.letters.content import BLOCK_TYPES, asks_for_letter, clean_block, clean_text
from app.services.sheets.design import asks_for_sheet

KIND = "report"
HEADING = "heading"

_STRING = {"type": "STRING"}
_STRINGS = {"type": "ARRAY", "items": _STRING}
REPORT_PROPERTY = {
    "type": "OBJECT",
    "properties": {
        "report_type": _STRING,
        "title": _STRING,
        "blocks": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "type": {"type": "STRING", "enum": [HEADING, *BLOCK_TYPES]},
                    "text": _STRING,
                    "items": _STRINGS,
                    "rows": {"type": "ARRAY", "items": _STRINGS},
                },
                "required": ["type"],
            },
        },
    },
    "required": ["report_type", "title", "blocks"],
}
REPORT_RULES = [
    "",
    "Yang diminta laporan, notulen, atau proposal: isi juga `report` selain `output`.",
    "- `report_type` jenisnya (mis. Laporan, Notulen, Proposal) dan `title` judul dokumennya.",
    "- `blocks` isi berurutan: `heading` (judul bagian di `text`), `paragraph` (text), `list` "
    "(items), `table` (rows, baris pertama judul kolom), atau `fields` (rows berisi pasangan "
    "label dan nilai). Susunannya mengikuti aturan di dokumen bila ada.",
    "- Jangan menulis nomor dokumen, tanda tangan, atau nama yang tidak diberikan.",
    "- `report` wajib berisi seluruh isi dokumennya; `output` hanya penjelasan singkat.",
]
NO_RULES_REPORT = (
    "Pengecualian untuk tugas ini: yang diminta laporan dan tidak ada aturannya di dokumen. "
    "Tetap susun dari data di arahan, isian, bahan, dan lampiran, lalu jawab `done`; yang tidak "
    "diberikan ditulis sebagai isian kosong bertanda. Bila tidak ada data sama sekali, jawab "
    "`need_info`."
)

_REQUEST = re.compile(
    r"\b(?:buat|buatkan|membuat|susun|susunkan|menyusun|rancang|siapkan|menyiapkan|draf|konsep|"
    r"tulis|tuliskan|menulis)\b[^.?!\n]{0,60}?\b(?:laporan|notula|notulen|proposal)\b",
    re.IGNORECASE,
)


def asks_for_report(text: str) -> bool:
    """Surat dan spreadsheet punya jalurnya sendiri."""
    return bool(_REQUEST.search(text)) and not asks_for_letter(text) and not asks_for_sheet(text)


def clean_report(data: object) -> dict | None:
    """Isi laporan yang sah, atau None bila model tidak menghasilkan yang bisa dipakai."""
    if not isinstance(data, dict) or not isinstance(data.get("blocks"), list):
        return None
    blocks = []
    for raw in data["blocks"][:120]:
        if isinstance(raw, dict) and raw.get("type") == HEADING:
            text = " ".join(clean_text(raw.get("text"), 400).split())[:200]
            if text:
                blocks.append({"type": HEADING, "text": text})
        elif block := clean_block(raw):
            blocks.append(block)
    if not any(block["type"] != HEADING for block in blocks):
        return None
    return {
        "report_type": " ".join(clean_text(data.get("report_type"), 120).split())[:60] or "Laporan",
        "title": " ".join(clean_text(data.get("title"), 300).split())[:150],
        "blocks": blocks,
    }


async def record(session: AsyncSession, task: Task, step: TaskStep, report: dict) -> None:
    """Isi laporan dari satu langkah: berkas baru, atau versi berikutnya milik role yang sama."""
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
            version=1,
        )
        session.add(document)
    else:
        document.version += 1
    document.letter_type = report["report_type"]
    document.title = report["title"] or task.title
    document.content = report
    document.needs_render = True
