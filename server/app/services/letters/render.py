"""Membuat DOCX (python-docx) dari isi surat dan catatan format, lalu PDF lewat LibreOffice."""

import datetime
import io
import logging
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

from app.core.config import settings
from app.services.letters.spec import PAPERS

logger = logging.getLogger("mbuti.letters")

MONTHS = (
    "Januari Februari Maret April Mei Juni Juli Agustus September Oktober November Desember"
).split()
MAC_SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
MAX_LETTERHEAD_HEIGHT_CM = 5


@dataclass
class Head:
    """Kop: gambar bila ada, selain itu baris teks."""

    image: bytes | None = None
    lines: tuple[str, ...] = ()


def date_text(day: datetime.date) -> str:
    return f"{day.day} {MONTHS[day.month - 1]} {day.year}"


class _Writer:
    def __init__(self, spec: dict):
        self.spec = spec
        self.document = Document()
        width, height = PAPERS.get(spec["paper"], PAPERS["A4"])
        section = self.document.sections[0]
        section.page_width, section.page_height = Cm(width), Cm(height)
        for side, value in spec["margins"].items():
            setattr(section, f"{side}_margin", Cm(value))
        self.width = width - spec["margins"]["left"] - spec["margins"]["right"]
        normal = self.document.styles["Normal"]
        normal.font.name, normal.font.size = spec["font_name"], Pt(spec["font_size"])
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), spec["font_name"])
        normal.paragraph_format.space_after = Pt(0)

    def line(self, text: str = "", side: str = "left", bold: bool = False, indent: float = 0):
        paragraph = self.document.add_paragraph()
        run = paragraph.add_run(text)
        run.bold = bold
        paragraph.alignment = {
            "left": WD_ALIGN_PARAGRAPH.LEFT,
            "center": WD_ALIGN_PARAGRAPH.CENTER,
            "right": WD_ALIGN_PARAGRAPH.RIGHT,
            "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
        }[side]
        if indent:
            paragraph.paragraph_format.left_indent = Cm(indent)
        return paragraph

    def pairs(self, rows: list[list[str]], indent: float = 0) -> None:
        """Baris "label : nilai" tanpa garis tabel."""
        table = self.document.add_table(rows=0, cols=3)
        table.autofit = False
        widths = (Cm(3), Cm(0.5), Cm(max(self.width - 3.5 - indent, 4)))
        for row in rows:
            cells = table.add_row().cells
            values = (row[0], ":", row[1] if len(row) > 1 else "")
            for cell, value, width in zip(cells, values, widths, strict=True):
                cell.width = width
                cell.text = value

    def grid(self, rows: list[list[str]]) -> None:
        columns = max(len(r) for r in rows)
        table = self.document.add_table(rows=0, cols=columns)
        table.style = "Table Grid"
        for number, row in enumerate(rows):
            cells = table.add_row().cells
            for cell, value in zip(cells, [*row, *[""] * (columns - len(row))], strict=True):
                cell.text = value
                if number == 0:
                    for run in cell.paragraphs[0].runs:
                        run.bold = True

    def head(self, head: Head) -> None:
        if head.image:
            picture = self.document.add_picture(io.BytesIO(head.image), width=Cm(self.width))
            if picture.height > Cm(MAX_LETTERHEAD_HEIGHT_CM):
                ratio = Cm(MAX_LETTERHEAD_HEIGHT_CM) / picture.height
                picture.width, picture.height = (
                    int(picture.width * ratio),
                    Cm(MAX_LETTERHEAD_HEIGHT_CM),
                )
            self.document.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            for number, text in enumerate(head.lines):
                self.line(text, "center", bold=number == 0)
        if head.image or head.lines:
            _bottom_border(self.line("", "center"))


def _bottom_border(paragraph) -> None:
    properties = paragraph._p.get_or_add_pPr()
    border = properties.makeelement(qn("w:pBdr"), {})
    border.append(
        border.makeelement(
            qn("w:bottom"),
            {qn("w:val"): "thickThinSmallGap", qn("w:sz"): "18", qn("w:color"): "000000"},
        )
    )
    properties.insert(0, border)


def build_docx(
    letter: dict, spec: dict, head: Head, number: str | None, day: datetime.date
) -> bytes:
    writer = _Writer(spec)
    layout = spec["layout"]
    right_half = writer.width * 0.55

    for section in spec["sections"]:
        if section == "kop":
            writer.head(head)
        elif section == "tanggal":
            writer.line(date_text(day), layout["date"])
        elif section == "identitas":
            rows = [["Nomor", number or ""]]
            if letter["nature"]:
                rows.append(["Sifat", letter["nature"]])
            if letter["attachments"]:
                rows.append(["Lampiran", letter["attachments"]])
            if letter["subject"]:
                rows.append(["Hal", letter["subject"]])
            writer.pairs(rows)
            writer.line()
        elif section == "tujuan" and letter["recipients"]:
            for index, name in enumerate(letter["recipients"]):
                prefix = "Yth. " if index == 0 else "        "
                writer.line(f"{prefix}{name}")
            writer.line("di Tempat")
            writer.line()
        elif section == "isi":
            for block in letter["blocks"]:
                if block["type"] == "paragraph":
                    for part in block["text"].split("\n"):
                        writer.line(part, "justify")
                elif block["type"] == "list":
                    if block.get("text"):
                        writer.line(block["text"], "justify")
                    for index, item in enumerate(block["items"], 1):
                        paragraph = writer.line(f"{index}.\t{item}", "justify", indent=1.2)
                        paragraph.paragraph_format.first_line_indent = Cm(-0.6)
                elif block["type"] == "fields":
                    writer.pairs(block["rows"], indent=1)
                else:
                    writer.grid(block["rows"])
                writer.line()
            if letter["closing"]:
                writer.line(letter["closing"], "justify")
                writer.line()
        elif section == "tanda_tangan":
            side = layout["signature"]
            indent = right_half if side == "right" else 0
            align = "center" if side == "center" else "left"
            writer.line(
                f"{letter['signer_position']}," if letter["signer_position"] else "",
                align,
                indent=indent,
            )
            for _ in range(3):
                writer.line()
            writer.line(
                letter["signer_name"] or "(nama pejabat berwenang)", align, bold=True, indent=indent
            )
            writer.line()
        elif section == "tembusan" and letter["copies"]:
            indent = right_half if layout["copies"] == "right" else 0
            writer.line("Tembusan:", indent=indent)
            for index, name in enumerate(letter["copies"], 1):
                writer.line(f"{index}. {name}", indent=indent)

    buffer = io.BytesIO()
    writer.document.save(buffer)
    return buffer.getvalue()


def soffice_path() -> str | None:
    candidates = (settings.LIBREOFFICE_PATH, shutil.which("soffice"), MAC_SOFFICE)
    return next((c for c in candidates if c and Path(c).is_file()), None)


def to_pdf(docx: bytes) -> bytes | None:
    """
    PDF dari DOCX buatan MBUTI, di proses terpisah dengan profil sementara dan batas waktu.
    None bila LibreOffice tidak ada atau gagal; DOCX tetap bisa dipakai.
    """
    program = soffice_path()
    if program is None:
        logger.warning("LibreOffice tidak ditemukan; PDF tidak dibuat.")
        return None
    with tempfile.TemporaryDirectory(prefix="mbuti-surat-") as folder:
        source = Path(folder) / "surat.docx"
        source.write_bytes(docx)
        command = [
            program,
            f"-env:UserInstallation={(Path(folder) / 'profil').as_uri()}",
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--nodefault",
            "--convert-to",
            "pdf",
            "--outdir",
            folder,
            str(source),
        ]
        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                timeout=settings.DOCUMENT_CONVERT_TIMEOUT_SECONDS,
            )
            return (Path(folder) / "surat.pdf").read_bytes()
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("Membuat PDF gagal: %s", type(exc).__name__)
            return None
