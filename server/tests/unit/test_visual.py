"""Pemilahan halaman, gambar, dan pemeriksaan temuan (kontrak 16.5 dan 16.6)."""

import io
import uuid

import pytest
from PIL import Image

from app.services.engine.images import ImageInput, clean_findings
from app.services.knowledge import visual
from app.services.knowledge.extract import ExtractionError
from app.services.knowledge.search import Chunk
from tests.unit.test_extract import pdf_with_pages

LONG = "Pasal satu mengatur penomoran surat dinas di seluruh unit kerja. " * 5


@pytest.mark.parametrize(
    ("text", "coverage", "paths", "expected"),
    [
        (LONG, 0.0, 0, "text"),
        ("Judul pendek", 0.0, 0, "text"),
        ("", 0.9, 0, "scan"),
        (LONG, 0.5, 0, "visual"),
        (LONG, 0.0, 120, "visual"),
        ("Grafik", 0.2, 0, "scan"),
    ],
)
def test_classify(text, coverage, paths, expected):
    assert visual.classify(text, coverage, paths) == expected


def test_plan_skips_blank_text_pages_and_keeps_scans():
    pages = visual.plan_pdf(pdf_with_pages(LONG, ""))
    assert [(p.page_no, p.render) for p in pages] == [(1, "text")]
    with pytest.raises(ExtractionError):
        visual.plan_pdf(b"%PDF-1.4 rusak")


def test_prepare_image_shrinks_and_refuses_non_images():
    buffer = io.BytesIO()
    Image.new("RGB", (4000, 1000), "white").save(buffer, "PNG")
    data, width, height, exif = visual.prepare_image(buffer.getvalue())
    with Image.open(io.BytesIO(data)) as image:
        assert image.format == "WEBP" and max(image.size) == visual.IMAGE_LONG_SIDE
    assert (width, height, exif) == (4000, 1000, None)
    with pytest.raises(ExtractionError):
        visual.prepare_image(b"bukan gambar")


@pytest.mark.parametrize(
    ("value", "expected"),
    [("0,0,1000,1000", (0, 0, 1000, 1000)), ("5,5,5,9", None), ("1,2,3", None), ("a,b,c,d", None)],
)
def test_parse_box(value, expected):
    assert visual.parse_box(value) == expected


def chunk(number: int) -> Chunk:
    return Chunk(uuid.uuid4(), f"Dok {number}", uuid.uuid4(), 1, number, "Bagian", "isi", 50)


def test_findings_are_checked_by_the_server():
    excerpts = [chunk(1), chunk(2)]
    images = [
        ImageInput(
            "G1", "Lampiran: a.png", b"", {"kind": "attachment", "attachment_id": "x", "page_no": 1}
        )
    ]
    data = {
        "findings": [
            {
                "image": "G1",
                "title": "Logo hilang",
                "severity": "penting",
                "box": [10, 10, 200, 900],
                "source": 2,
                "criterion": "Logo sesuai panduan",
                "recommendation": "Tambahkan logo",
            },
            {
                "image": "G1",
                "title": "Kotak terbalik",
                "box": [500, 0, 100, 10],
                "source": 9,
                "criterion": "Karangan",
                "severity": "parah",
            },
            {"image": "G9", "title": "Gambar yang tidak dikirim"},
            {"image": "G1", "title": ""},
        ]
    }

    findings = clean_findings(data, images, excerpts, [excerpts[1]], ["Logo sesuai panduan"])

    assert [(f["no"], f["title"]) for f in findings] == [(1, "Logo hilang"), (2, "Kotak terbalik")]
    assert findings[0]["source_index"] == 1 and findings[0]["criterion"] == "Logo sesuai panduan"
    assert findings[1]["box"] is None and findings[1]["source_index"] is None
    assert findings[1]["criterion"] is None and findings[1]["severity"] == "info"
