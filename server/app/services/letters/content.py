"""
Isi surat yang ditulis role (kontrak 18.1). Model menyusun isinya; nomor, tata letak, dan
berkasnya diurus program.
"""

import re

_STRING = {"type": "STRING"}
_STRINGS = {"type": "ARRAY", "items": _STRING}
BLOCK_TYPES = ("paragraph", "list", "table", "fields")

LETTER_PROPERTY = {
    "type": "OBJECT",
    "properties": {
        "letter_type": _STRING,
        "nature": _STRING,
        "attachments": _STRING,
        "subject": _STRING,
        "recipients": _STRINGS,
        "blocks": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "type": {"type": "STRING", "enum": list(BLOCK_TYPES)},
                    "text": _STRING,
                    "items": _STRINGS,
                    "rows": {"type": "ARRAY", "items": _STRINGS},
                },
                "required": ["type"],
            },
        },
        "closing": _STRING,
        "signer_position": _STRING,
        "signer_name": _STRING,
        "copies": _STRINGS,
    },
    "required": ["letter_type", "subject", "blocks"],
}

LETTER_RULES = [
    "",
    "Bila hasil yang diminta berupa surat atau naskah dinas, isi juga `letter` selain `output`:",
    "- `letter_type` jenis naskahnya, mis. Surat Undangan atau Nota Dinas, memakai sebutan "
    "di aturan bila ada.",
    "- `blocks` isi surat berurutan: `paragraph` (text), `list` (items), `table` (rows, baris "
    "pertama judul kolom), atau `fields` (rows berisi pasangan label dan nilai, mis. Hari, "
    "Tempat). Susunannya bebas sesuai kebutuhan dan aturan.",
    "- Jangan menulis nomor surat dan jangan membubuhkan tanda tangan. `signer_name` diisi hanya "
    "bila namanya ada di dokumen atau arahan.",
]

NO_RULES_LETTER = (
    "Pengecualian untuk tugas ini: yang diminta surat dan tidak ada aturannya di dokumen. Tetap "
    "susun suratnya dengan bentuk yang lazim, jawab `done`, dan sebut di `notes` bahwa belum ada "
    "aturan persuratan. Data yang tidak diberikan tetap tidak boleh dikarang."
)

# Permintaan membuat surat: kata kerja lalu jenis naskahnya, dalam satu kalimat. Pertanyaan
# tentang surat ("syarat mengurus surat keterangan") tidak termasuk.
_REQUEST = re.compile(
    r"\b(?:buat|buatkan|membuat|susun|susunkan|menyusun|rancang|siapkan|menyiapkan|draf|konsep)\b"
    r"[^.?!\n]{0,60}?\b(?:surat|undangan|nota dinas|naskah dinas|edaran|memorandum)\b",
    re.IGNORECASE,
)


def asks_for_letter(text: str) -> bool:
    """Permintaan membuat surat tetap dikerjakan walau belum ada aturan (kontrak 18.1)."""
    return bool(_REQUEST.search(text))


# Karakter yang tidak sah di dalam berkas Word (XML)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")


def clean_text(value: object, limit: int) -> str:
    return _CONTROL.sub("", value).strip()[:limit] if isinstance(value, str) else ""


def _line(value: object, limit: int) -> str:
    return " ".join(clean_text(value, limit * 2).split())[:limit]


def _lines(value: object, count: int, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [line for item in value[:count] if (line := _line(item, limit))]


def _name(value: object) -> str:
    """Isian kosong bertanda, mis. "[nama kepala dinas]", bukan nama."""
    name = _line(value, 150)
    return "" if "[" in name or name.lower().startswith("(nama") else name


# Isian yang belum dilengkapi, mis. [alamat kantor]; rujukan bernomor seperti [2] bukan
_BLANK = re.compile(r"\[(?!\d+\])[^\[\]]{2,80}\]")


def blanks(letter: dict) -> list[str]:
    """Isian bertanda yang masih ada di dalam surat."""
    texts = [letter["subject"], letter["closing"], *letter["recipients"], *letter["copies"]]
    for block in letter["blocks"]:
        texts.append(block.get("text", ""))
        texts += block.get("items", [])
        texts += [cell for row in block.get("rows", []) for cell in row]
    return list(dict.fromkeys(found for text in texts for found in _BLANK.findall(text)))


def _block(raw: object) -> dict | None:
    if not isinstance(raw, dict) or raw.get("type") not in BLOCK_TYPES:
        return None
    kind = raw["type"]
    if kind == "paragraph":
        text = clean_text(raw.get("text"), 3000)
        return {"type": kind, "text": text} if text else None
    if kind == "list":
        items = _lines(raw.get("items"), 40, 600)
        return (
            {"type": kind, "text": _line(raw.get("text"), 600), "items": items} if items else None
        )
    rows = raw.get("rows") if isinstance(raw.get("rows"), list) else []
    width = 2 if kind == "fields" else 8
    cleaned = [
        [_line(cell, 400) for cell in row[:width]]
        for row in rows[:60]
        if isinstance(row, list) and row
    ]
    return {"type": kind, "rows": cleaned} if cleaned else None


def clean_letter(data: object) -> dict | None:
    """Isi surat yang sah, atau None bila model tidak menghasilkan surat yang bisa dipakai."""
    if not isinstance(data, dict):
        return None
    letter_type = _line(data.get("letter_type"), 60)
    blocks = data.get("blocks") if isinstance(data.get("blocks"), list) else []
    blocks = [cleaned for raw in blocks[:60] if (cleaned := _block(raw))]
    if not letter_type or not blocks:
        return None
    return {
        "letter_type": letter_type[:1].upper() + letter_type[1:],
        "nature": _line(data.get("nature"), 60),
        "attachments": _line(data.get("attachments"), 120),
        "subject": _line(data.get("subject"), 300),
        "recipients": _lines(data.get("recipients"), 30, 200),
        "blocks": blocks,
        "closing": clean_text(data.get("closing"), 1000),
        "signer_position": _line(data.get("signer_position"), 150),
        "signer_name": _name(data.get("signer_name")),
        "copies": _lines(data.get("copies"), 20, 200),
    }
