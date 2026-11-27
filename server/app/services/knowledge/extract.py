"""Mengenali jenis berkas dari isinya dan membaca teksnya menjadi seksi."""

import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from docx import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader
from pypdf.errors import PyPdfError

MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "png": "image/png",
    "jpg": "image/jpeg",
    "webp": "image/webp",
}
IMAGE_EXTENSIONS = ("png", "jpg", "webp")
UNSUPPORTED = "Jenis berkas belum didukung. Gunakan PDF, DOCX, TXT, MD, atau gambar PNG, JPG, WEBP."
NO_TEXT = "Berkas tidak berisi teks. Hasil pindai belum didukung."
BROKEN = "Berkas rusak atau tidak bisa dibaca."
MAX_PAGES = 500
MAX_CHARACTERS = 2_000_000
# Isi DOCX setelah dibuka; mencegah berkas kecil yang mengembang sangat besar
MAX_UNPACKED_BYTES = 100 * 1024 * 1024
PLAIN_SECTION_SIZE = 1800


class ExtractionError(Exception):
    """Pesannya ditampilkan kepada pengguna."""


@dataclass
class Section:
    page_no: int
    heading: str
    text: str


def detect_type(file_name: str, data: bytes) -> str:
    """Ekstensi yang didukung, setelah dicocokkan dengan isi berkas."""
    extension = PurePosixPath(file_name.lower()).suffix.lstrip(".")
    if extension == "jpeg":
        extension = "jpg"
    if extension == "pdf" and data.startswith(b"%PDF-"):
        return extension
    # Gambar dikenali dari tanda tangan isinya, bukan hanya nama berkas
    if extension == "png" and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return extension
    if extension == "jpg" and data.startswith(b"\xff\xd8\xff"):
        return extension
    if extension == "webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return extension
    if extension == "docx" and data.startswith(b"PK"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if "word/document.xml" in archive.namelist():
                    return extension
        except zipfile.BadZipFile:
            pass
    if extension in ("txt", "md") and b"\x00" not in data:
        try:
            data.decode("utf-8-sig")
            return extension
        except UnicodeDecodeError:
            raise ExtractionError("Berkas teks harus memakai pengodean UTF-8.") from None
    raise ExtractionError(UNSUPPORTED)


def _clean(text: str) -> str:
    # PostgreSQL menolak karakter NUL
    return re.sub(r"[ \t]+\n", "\n", text.replace("\x00", "").replace("\r\n", "\n")).strip()


def _heading(text: str, fallback: str) -> str:
    first = next((line.strip() for line in text.split("\n") if line.strip()), "")
    return (first or fallback)[:120]


def _from_pdf(data: bytes) -> list[Section]:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ExtractionError("PDF terkunci kata sandi.")
        if len(reader.pages) > MAX_PAGES:
            raise ExtractionError(f"PDF melebihi {MAX_PAGES} halaman.")
        pages = [_clean(page.extract_text() or "") for page in reader.pages]
    except ExtractionError:
        raise
    except (PyPdfError, ValueError, KeyError, TypeError, RecursionError) as exc:
        raise ExtractionError(BROKEN) from exc
    return [
        Section(number, _heading(text, f"Halaman {number}"), text)
        for number, text in enumerate(pages, start=1)
        if text
    ]


def _from_docx(data: bytes) -> list[Section]:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(item.file_size for item in archive.infolist()) > MAX_UNPACKED_BYTES:
                raise ExtractionError("Isi dokumen terlalu besar.")
        document = DocxDocument(io.BytesIO(data))
        blocks: list[tuple[bool, str]] = []
        for block in document.iter_inner_content():
            if isinstance(block, Paragraph):
                style = (block.style.name or "") if block.style else ""
                blocks.append((style.startswith(("Heading", "Judul", "Title")), block.text))
            elif isinstance(block, Table):
                rows = (" | ".join(cell.text.strip() for cell in row.cells) for row in block.rows)
                blocks.append((False, "\n".join(rows)))
    except ExtractionError:
        raise
    except Exception as exc:
        # python-docx melempar beragam galat untuk berkas rusak
        raise ExtractionError(BROKEN) from exc

    sections: list[tuple[str, list[str]]] = []
    for is_heading, text in blocks:
        if is_heading and text.strip():
            sections.append((text.strip(), []))
        elif text.strip():
            if not sections:
                sections.append(("", []))
            sections[-1][1].append(text)
    result = []
    for heading, lines in sections:
        body = _clean("\n".join(lines))
        if body or heading:
            number = len(result) + 1
            title = heading[:120] or _heading(body, f"Bagian {number}")
            result.append(Section(number, title, body or heading))
    return result


def _from_text(data: bytes) -> list[Section]:
    text = _clean(data.decode("utf-8-sig"))
    if not text:
        return []
    parts = [p.strip() for p in re.split(r"\n(?=#{1,3}\s)", text) if p.strip()]
    if len(parts) == 1 and not re.match(r"#{1,3}\s", parts[0]):
        parts = split_text(text, PLAIN_SECTION_SIZE, 0)
    result = []
    for number, part in enumerate(parts, start=1):
        match = re.match(r"#{1,3}\s+(.*)", part)
        if match:
            heading = match[1].strip()[:120]
            body = part[match.end() :].strip() or heading
        else:
            heading, body = f"Bagian {number}", part
        result.append(Section(number, heading, body))
    return result


def split_text(text: str, size: int, overlap: int) -> list[str]:
    """Potong di batas paragraf, kalimat, atau kata, dengan sedikit tumpang tindih."""
    pieces: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            for separator in ("\n\n", "\n", ". ", " "):
                cut = text.rfind(separator, start + size // 2, end)
                if cut > 0:
                    end = cut + len(separator)
                    break
        piece = text[start:end].strip()
        if piece:
            pieces.append(piece)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
        # Mulai di awal kata
        space = text.find(" ", start, end)
        if overlap and space > 0:
            start = space + 1
    return pieces


def extract_sections(extension: str, data: bytes) -> list[Section]:
    reader = {"pdf": _from_pdf, "docx": _from_docx}.get(extension, _from_text)
    sections = reader(data)
    if not sections:
        raise ExtractionError(NO_TEXT)
    if sum(len(s.text) for s in sections) > MAX_CHARACTERS:
        raise ExtractionError("Dokumen terlalu panjang. Pecah menjadi beberapa berkas.")
    return sections
