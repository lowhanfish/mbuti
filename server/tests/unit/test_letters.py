"""Isi, format, nomor, dan berkas surat (kontrak bagian 18)."""

import datetime
import io
import zipfile

import pytest
from docx import Document
from docx.shared import Cm, Pt

from app.core.exceptions import UnprocessableEntityException
from app.services.letters import render
from app.services.letters.content import asks_for_letter, blanks, clean_letter
from app.services.letters.numbering import format_number
from app.services.letters.sample import check_docx, read_sample
from app.services.letters.spec import DEFAULT_SPEC, differences, merged, valid_changes

LETTER = {
    "letter_type": "surat undangan",
    "subject": "Rapat <evaluasi>",
    "recipients": ["Para Camat"],
    "blocks": [
        {"type": "paragraph", "text": "Dengan hormat.\x00"},
        {"type": "list", "items": ["Satu", ""]},
        {"type": "fields", "rows": [["Hari", "Senin", "lebih"]]},
        {"type": "table", "rows": [["No", "Nama"], ["1", "A"]]},
        {"type": "gambar"},
    ],
    "signer_position": "Kepala Dinas",
    "copies": ["Arsip"],
}


def text_of(data: bytes) -> str:
    document = Document(io.BytesIO(data))
    cells = [c.text for t in document.tables for row in t.rows for c in row.cells]
    return "\n".join([*(p.text for p in document.paragraphs), *cells])


def test_letter_content_is_cleaned():
    letter = clean_letter(LETTER)

    assert letter["letter_type"] == "Surat undangan"
    assert [b["type"] for b in letter["blocks"]] == ["paragraph", "list", "fields", "table"]
    assert letter["blocks"][0]["text"] == "Dengan hormat."
    assert letter["blocks"][2]["rows"] == [["Hari", "Senin"]]
    assert clean_letter({"letter_type": "Nota", "blocks": []}) is None
    assert clean_letter("surat") is None


def test_blank_placeholders_are_not_names_and_are_reported():
    letter = clean_letter(
        {
            **LETTER,
            "signer_name": "[nama kepala dinas]",
            "blocks": [{"type": "paragraph", "text": "Di [alamat kantor], lihat aturan [2]."}],
        }
    )

    assert letter["signer_name"] == ""
    assert blanks(letter) == ["[alamat kantor]"]


def test_letter_requests_are_recognised():
    assert asks_for_letter("Buatkan undangan rapat")
    assert asks_for_letter("Tolong susun sebuah nota dinas ke bagian umum.")
    assert not asks_for_letter("Rekap kehadiran harian")
    assert not asks_for_letter("Apa syarat mengurus surat keterangan?")
    assert not asks_for_letter("undangan")


def test_only_sensible_format_values_are_used():
    changes = valid_changes(
        {
            "paper": "A3",
            "margins": {"top": 2, "left": 99, "right": True},
            "font_name": "Times New Roman",
            "font_size": 40,
            "sections": ["isi", "tembusan", "lain"],
            "copies_side": "right",
        }
    )

    assert changes["margins"] == {"top": 2.0}
    assert "paper" not in changes and "font_size" not in changes
    assert changes["sections"][0] == "kop" and set(changes["sections"]) == set(
        DEFAULT_SPEC["sections"]
    )
    spec = merged(DEFAULT_SPEC, changes)
    assert spec["margins"]["left"] == 3.0 and spec["layout"]["copies"] == "right"
    assert DEFAULT_SPEC["layout"]["copies"] == "left"
    assert differences({"paper": "F4", "margins": {"top": 2}}, {"paper": "A4"}) == ["ukuran kertas"]


def test_number_uses_roman_month():
    day = datetime.date(2026, 11, 28)

    assert format_number("005/[urut]/DCN/[bulan]/[tahun]", 7, day) == "005/007/DCN/XI/2026"


def test_docx_follows_format_and_can_be_read_back():
    spec = merged(DEFAULT_SPEC, {"paper": "F4", "font_name": "Tahoma", "margins": {"top": 1.5}})
    head = render.Head(lines=("DINAS UJI",))

    data = render.build_docx(
        clean_letter(LETTER), spec, head, "005/001", datetime.date(2026, 11, 28)
    )

    text = text_of(data)
    expected = ("DINAS UJI", "28 November 2026", "005/001", "Yth. Para Camat", "Rapat <evaluasi>")
    assert all(part in text for part in expected)
    assert "Kepala Dinas," in text and "(nama pejabat berwenang)" in text
    # Kolom label sempit, kolom isi lebar
    columns = [c.width for c in Document(io.BytesIO(data)).tables[0].columns]
    assert abs(columns[0] - Cm(3)) < 1000 and columns[2] > columns[0] * 3
    check_docx(data)
    changes, _ = read_sample(data)
    assert changes["paper"] == "F4" and changes["margins"]["top"] == 1.5
    assert changes["font_name"] == "Tahoma"


def test_sample_header_and_fonts_are_read():
    document = Document()
    section = document.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.header.is_linked_to_previous = False
    section.header.paragraphs[0].text = "PEMERINTAH UJI"
    run = document.add_paragraph().add_run("Isi")
    run.font.name, run.font.size = "Arial", Pt(11)
    buffer = io.BytesIO()
    document.save(buffer)

    changes, head = read_sample(buffer.getvalue())

    assert (changes["paper"], changes["font_name"], changes["font_size"]) == ("A4", "Arial", 11)
    assert head.lines == ("PEMERINTAH UJI",)


@pytest.mark.parametrize("name", ["word/vbaProject.bin", "lain.txt"])
def test_unsafe_or_foreign_files_are_rejected(name):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(name, "x")

    with pytest.raises(UnprocessableEntityException):
        check_docx(buffer.getvalue())


@pytest.mark.skipif(render.soffice_path() is None, reason="LibreOffice tidak terpasang")
def test_libreoffice_makes_a_pdf():
    data = render.build_docx(
        clean_letter(LETTER), DEFAULT_SPEC, render.Head(), None, datetime.date(2026, 1, 2)
    )

    assert render.to_pdf(data).startswith(b"%PDF")
