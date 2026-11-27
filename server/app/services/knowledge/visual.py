"""
Halaman bergambar dan berkas gambar (E1c, kontrak 16.5).

Cara memilah halaman diadaptasi dari Toto-L, tetapi memakai pypdfium2 (Apache/BSD) dan Pillow,
bukan PyMuPDF (AGPL). Semua fungsi di sini sinkron; pemanggil menjalankannya di thread.
"""

import datetime
import io
from dataclasses import dataclass

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw
from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

from app.services.knowledge.extract import BROKEN, MAX_PAGES, ExtractionError, _clean, _heading

# Halaman dengan teks sependek ini dianggap hasil pindai
MIN_TEXT_CHARS = 200
MIN_PRINTABLE_RATIO = 0.85
# Halaman dengan gambar seluas ini atau garis sebanyak ini dianggap bergambar (tabel, grafik)
VISUAL_IMAGE_COVERAGE = 0.35
VISUAL_PATHS = 80
MIN_SCAN_COVERAGE = 0.1
PAGE_LONG_SIDE = 1600
IMAGE_LONG_SIDE = 2048
WEBP_QUALITY = 82
# Batas piksel agar gambar kecil yang mengembang sangat besar ditolak
Image.MAX_IMAGE_PIXELS = 60_000_000

IMAGE_TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}
NOT_AN_IMAGE = "Gambar tidak bisa dibaca."


@dataclass
class PlannedPage:
    page_no: int
    heading: str
    text: str
    # text, scan, atau visual
    render: str


def _printable_ratio(text: str) -> float:
    return sum(c.isprintable() or c in "\n\t" for c in text) / max(1, len(text))


def _visual_signals(page: pdfium.PdfPage) -> tuple[float, int]:
    """(luas gambar dibanding halaman, jumlah garis/bentuk)."""
    width, height = page.get_size()
    area = max(1.0, width * height)
    covered, paths = 0.0, 0
    for item in page.get_objects(max_depth=2):
        if item.type == pdfium_raw.FPDF_PAGEOBJ_IMAGE:
            left, bottom, right, top = item.get_bounds()
            covered += max(0.0, (right - left) * (top - bottom)) / area
        elif item.type == pdfium_raw.FPDF_PAGEOBJ_PATH:
            paths += 1
    return min(1.0, covered), paths


def classify(text: str, coverage: float, paths: int) -> str:
    if coverage >= VISUAL_IMAGE_COVERAGE or paths >= VISUAL_PATHS:
        # Gambar besar tanpa teks berarti hasil pindai, dengan teks berarti halaman visual
        return (
            "scan" if len(text) < MIN_TEXT_CHARS and coverage >= VISUAL_IMAGE_COVERAGE else "visual"
        )
    # Teks pendek atau rusak di atas gambar = hasil pindai; tanpa gambar = halaman teks biasa
    if len(text) < MIN_TEXT_CHARS or _printable_ratio(text) < MIN_PRINTABLE_RATIO:
        return "scan" if coverage >= MIN_SCAN_COVERAGE else "text"
    return "text"


def plan_pdf(data: bytes) -> list[PlannedPage]:
    """Semua halaman PDF beserta teks lapisan dan jenisnya; halaman kosong ikut bila bergambar."""
    try:
        document = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        raise ExtractionError(BROKEN) from exc
    try:
        if len(document) > MAX_PAGES:
            raise ExtractionError(f"PDF melebihi {MAX_PAGES} halaman.")
        pages: list[PlannedPage] = []
        for index in range(len(document)):
            page = document[index]
            textpage = page.get_textpage()
            text = _clean(textpage.get_text_range())
            textpage.close()
            coverage, paths = _visual_signals(page)
            page.close()
            render = classify(text, coverage, paths)
            if render == "text" and not text:
                continue
            number = index + 1
            pages.append(PlannedPage(number, _heading(text, f"Halaman {number}"), text, render))
        return pages
    finally:
        document.close()


def _webp(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=WEBP_QUALITY, method=4)
    return buffer.getvalue()


def _fit(image: Image.Image, long_side: int) -> Image.Image:
    image = image.convert("RGB")
    if max(image.size) > long_side:
        image.thumbnail((long_side, long_side))
    return image


def render_page(
    data: bytes, page_no: int, long_side: int = PAGE_LONG_SIDE
) -> tuple[bytes, int, int]:
    """Gambar satu halaman PDF sebagai WebP; (isi, lebar, tinggi)."""
    document = pdfium.PdfDocument(data)
    try:
        page = document[page_no - 1]
        width, height = page.get_size()
        scale = long_side / max(width, height, 1)
        image = _fit(page.render(scale=scale).to_pil(), long_side)
        page.close()
    finally:
        document.close()
    return _webp(image), image.width, image.height


def render_pdf(data: bytes, limit: int) -> list[tuple[bytes, int, int]]:
    """Halaman pertama sampai `limit`, untuk lampiran PDF."""
    try:
        document = pdfium.PdfDocument(data)
        count = min(len(document), limit)
        document.close()
    except pdfium.PdfiumError as exc:
        raise ExtractionError(BROKEN) from exc
    return [render_page(data, number) for number in range(1, count + 1)]


def _exif(image: Image.Image) -> dict | None:
    """Tanggal dan lokasi pengambilan foto, bila ada."""
    try:
        exif = image.getexif()
    except (AttributeError, ValueError, OSError):
        return None
    taken = exif.get(ExifTags.Base.DateTimeOriginal) or exif.get(ExifTags.Base.DateTime)
    if not taken:
        taken = exif.get_ifd(ExifTags.IFD.Exif).get(ExifTags.Base.DateTimeOriginal)
    taken_at = None
    if isinstance(taken, str):
        try:
            taken_at = datetime.datetime.strptime(taken.strip(), "%Y:%m:%d %H:%M:%S").isoformat()
        except ValueError:
            taken_at = None
    location = None
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    try:

        def degrees(values, ref) -> float:
            d, m, s = (float(v) for v in values)
            value = d + m / 60 + s / 3600
            return -value if ref in ("S", "W") else value

        if gps.get(2) and gps.get(4):
            latitude = degrees(gps[2], gps.get(1))
            longitude = degrees(gps[4], gps.get(3))
            location = f"{latitude:.5f}, {longitude:.5f}"
    except (TypeError, ValueError, ZeroDivisionError):
        location = None
    if not taken_at and not location:
        return None
    return {"taken_at": taken_at, "location": location}


def prepare_image(
    data: bytes, long_side: int = IMAGE_LONG_SIDE
) -> tuple[bytes, int, int, dict | None]:
    """Gambar unggahan menjadi WebP yang diperkecil; (isi, lebar asli, tinggi asli, exif)."""
    try:
        with Image.open(io.BytesIO(data)) as original:
            original.load()
            exif = _exif(original)
            width, height = original.size
            image = _fit(ImageOps.exif_transpose(original), long_side)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as exc:
        raise ExtractionError(NOT_AN_IMAGE) from exc
    return _webp(image), width, height, exif


def crop(data: bytes, box: tuple[int, int, int, int]) -> bytes:
    """Potong gambar menurut kotak [y0, x0, y1, x1] berskala 0–1000."""
    y0, x0, y1, x1 = box
    with Image.open(io.BytesIO(data)) as image:
        width, height = image.size
        part = image.crop(
            (
                x0 * width // 1000,
                y0 * height // 1000,
                max(1, x1 * width // 1000),
                max(1, y1 * height // 1000),
            )
        )
        return _webp(part.convert("RGB"))


def parse_box(value: str) -> tuple[int, int, int, int] | None:
    """`y0,x0,y1,x1` dalam 0–1000; None bila tidak sah."""
    try:
        numbers = tuple(int(part) for part in value.split(","))
    except ValueError:
        return None
    if len(numbers) != 4 or not all(0 <= n <= 1000 for n in numbers):
        return None
    y0, x0, y1, x1 = numbers
    return numbers if y0 < y1 and x0 < x1 else None  # type: ignore[return-value]
