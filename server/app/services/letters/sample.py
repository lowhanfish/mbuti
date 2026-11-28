"""Membaca contoh surat Word milik tenant: berkas tidak tepercaya, jadi diperiksa dulu."""

import io
import zipfile

from docx import Document

from app.core.exceptions import UnprocessableEntityException
from app.services.letters.content import clean_text
from app.services.letters.render import Head
from app.services.letters.spec import PAPERS, valid_changes

MAX_SAMPLE_BYTES = 10_000_000
MAX_UNPACKED_BYTES = 50_000_000
NOT_WORD = "Berkas tidak bisa dibaca sebagai dokumen Word (.docx)."


def check_docx(data: bytes) -> None:
    if len(data) > MAX_SAMPLE_BYTES:
        raise UnprocessableEntityException("Contoh surat paling besar 10 MB.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()
            if sum(item.file_size for item in archive.infolist()) > MAX_UNPACKED_BYTES:
                raise UnprocessableEntityException("Isi berkas Word terlalu besar.")
        if any("vbaproject" in name.lower() for name in names):
            raise UnprocessableEntityException("Berkas bermakro tidak diterima.")
        if "word/document.xml" not in names:
            raise UnprocessableEntityException(NOT_WORD)
        Document(io.BytesIO(data))
    except UnprocessableEntityException:
        raise
    except Exception:
        raise UnprocessableEntityException(NOT_WORD) from None


def _cm(length) -> float | None:
    return round(length.cm, 2) if length is not None else None


def read_sample(data: bytes) -> tuple[dict, Head]:
    """Format yang terbaca dari contoh (kertas, margin, huruf) beserta kopnya."""
    document = Document(io.BytesIO(data))
    section = document.sections[0]
    width, height = _cm(section.page_width), _cm(section.page_height)
    paper = next(
        (
            name
            for name, (w, h) in PAPERS.items()
            if width and height and abs(w - width) < 0.2 and abs(h - height) < 0.4
        ),
        None,
    )
    margins = {s: _cm(getattr(section, f"{s}_margin")) for s in ("top", "right", "bottom", "left")}
    normal = document.styles["Normal"].font
    # Huruf yang paling banyak dipakai di isi mengalahkan gaya bawaan
    runs = [r for p in document.paragraphs for r in p.runs if r.text.strip()]
    names = [r.font.name for r in runs if r.font.name]
    sizes = [r.font.size.pt for r in runs if r.font.size]
    changes = valid_changes(
        {
            "paper": paper,
            "margins": margins,
            "font_name": max(set(names), key=names.count) if names else normal.name,
            "font_size": max(set(sizes), key=sizes.count)
            if sizes
            else (normal.size.pt if normal.size else None),
        }
    )
    return changes, _head(section)


def _head(section) -> Head:
    header = section.header
    if header.is_linked_to_previous:
        return Head()
    for relation in header.part.rels.values():
        if relation.reltype.endswith("/image") and not relation.is_external:
            blob = relation.target_part.blob
            if blob[:8] == b"\x89PNG\r\n\x1a\n" or blob[:3] == b"\xff\xd8\xff":
                return Head(image=blob)
    lines = [clean_text(p.text, 200) for p in header.paragraphs]
    return Head(lines=tuple(line for line in lines if line)[:6])
