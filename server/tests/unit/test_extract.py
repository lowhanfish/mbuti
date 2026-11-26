"""Pengenalan jenis berkas, pembacaan teks, dan pemotongan."""

import io

import pytest
from docx import Document

from app.services.knowledge import storage
from app.services.knowledge.extract import (
    ExtractionError,
    detect_type,
    extract_sections,
    split_text,
)
from app.services.knowledge.search import snippet_around, tokenize


def pdf_with_pages(*pages: str) -> bytes:
    """PDF minimal berteks, satu string per halaman."""
    count = len(pages)
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [{}] /Count {} >>".format(
            " ".join(f"{4 + 2 * i} 0 R" for i in range(count)), count
        ),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for index, text in enumerate(pages):
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET" if text else ""
        objects.append(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {5 + 2 * index} 0 R >>"
        )
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
    body, offsets = b"%PDF-1.4\n", []
    for number, item in enumerate(objects, start=1):
        offsets.append(len(body))
        body += f"{number} 0 obj\n{item}\nendobj\n".encode()
    xref = len(body)
    body += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    body += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    trailer = f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
    return body + f"{trailer}startxref\n{xref}\n%%EOF".encode()


def docx_file() -> bytes:
    document = Document()
    document.add_heading("Kop surat", level=1)
    document.add_paragraph("Kop memuat nama instansi.")
    document.add_heading("Penutup", level=1)
    table = document.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Jabatan"
    table.rows[0].cells[1].text = "Nama"
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_pdf_keeps_page_numbers():
    data = pdf_with_pages("Halaman pertama", "", "Halaman ketiga")

    sections = extract_sections(detect_type("a.PDF", data), data)

    assert [(s.page_no, s.heading) for s in sections] == [
        (1, "Halaman pertama"),
        (3, "Halaman ketiga"),
    ]


def test_scanned_or_broken_pdf_is_refused():
    with pytest.raises(ExtractionError, match="tidak berisi teks"):
        extract_sections("pdf", pdf_with_pages(""))
    with pytest.raises(ExtractionError):
        extract_sections("pdf", b"%PDF-1.4 rusak")


def test_docx_is_split_by_heading():
    data = docx_file()

    sections = extract_sections(detect_type("a.docx", data), data)

    assert [s.heading for s in sections] == ["Kop surat", "Penutup"]
    assert sections[1].text == "Jabatan | Nama"


def test_text_without_headings_is_split_by_length():
    sections = extract_sections("txt", ("kalimat pendek. " * 400).encode())

    assert len(sections) > 2
    assert sections[0].heading == "Bagian 1"


@pytest.mark.parametrize(
    ("name", "data"),
    [
        ("gambar.png", b"\x89PNG"),
        ("palsu.pdf", b"teks biasa"),
        ("palsu.docx", b"PK bukan zip"),
        ("biner.txt", b"a\x00b"),
        ("latin.txt", "é".encode("latin-1")),
    ],
)
def test_content_must_match_extension(name, data):
    with pytest.raises(ExtractionError):
        detect_type(name, data)


def test_split_text_covers_everything_with_overlap():
    words = " ".join(f"kata{i}" for i in range(500))

    pieces = split_text(words, 300, 60)

    assert all(len(piece) <= 300 for piece in pieces)
    assert {w for piece in pieces for w in piece.split()} == set(words.split())
    assert sum(len(p) for p in pieces) > len(words)


def test_tokens_and_snippet():
    assert tokenize("Apa syarat untuk surat, dan SURAT apa?") == ["syarat", "surat"]
    snippet = snippet_around("x" * 200 + " syarat surat " + "y" * 300, ["syarat"])
    assert snippet.startswith("…") and snippet.endswith("…") and "syarat surat" in snippet


def test_storage_stays_inside_upload_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(storage.settings, "UPLOAD_DIR", tmp_path / "unggah")

    with pytest.raises(ValueError):
        storage.path_of("../rahasia")
