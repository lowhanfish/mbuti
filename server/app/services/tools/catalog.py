"""
Katalog alat (PLANNING fase E bagian 2; kontrak 16.2).

Ditulis di kode, bukan di database. Nama alat yang ditulis pembuat role dipetakan ke sini oleh
server; model hanya mengusulkan nama alat. Lisensi perangkat lunak dicatat di `software`.
"""

from dataclasses import dataclass, field

SUPPORT_RANK = {"supported": 0, "upcoming": 1, "substitute": 2, "unsupported": 3}


@dataclass(frozen=True)
class Tool:
    key: str
    name: str
    group: str
    support: str  # supported atau upcoming
    stage: str
    description: str
    software: str
    aliases: tuple[str, ...] = field(default=())


CATALOG: tuple[Tool, ...] = (
    Tool(
        "read.document",
        "Baca dokumen",
        "pembacaan",
        "supported",
        "B3",
        "Membaca PDF berteks, DOCX, TXT, dan MD dari pengetahuan role.",
        "pypdf (BSD), python-docx (MIT)",
        (
            "baca dokumen",
            "membaca dokumen",
            "pdf reader",
            "adobe reader",
            "acrobat reader",
            "mbuti",
            "pengetahuan mbuti",
        ),
    ),
    Tool(
        "read.image",
        "Baca gambar",
        "pembacaan",
        "supported",
        "E1",
        "Membaca gambar dan halaman PDF kompleks (desain, foto, kuitansi, grafik) lewat Gemini "
        "multimodal.",
        "Gemini (API), pypdfium2 (Apache/BSD), Pillow (HPND)",
        ("foto", "gambar", "scan", "kuitansi", "nota", "grafik", "tangkapan layar", "ocr"),
    ),
    Tool(
        "search.web",
        "Pencarian internet",
        "pencarian",
        "supported",
        "E1",
        "Pencarian Google bawaan Gemini, dengan tautan sumber. Diaktifkan per role.",
        "Gemini (API)",
        ("internet", "google", "browsing", "cari informasi", "riset", "berita"),
    ),
    Tool(
        "document.docx",
        "Dokumen: DOCX",
        "dokumen",
        "upcoming",
        "E3",
        "Menyusun dan mengisi dokumen Word dari templat organisasi.",
        "python-docx (MIT), LibreOffice (MPL)",
        (
            "word",
            "ms word",
            "microsoft word",
            "docx",
            "surat",
            "naskah",
            "libreoffice writer",
            "google docs",
        ),
    ),
    Tool(
        "document.pdf",
        "Dokumen: PDF",
        "dokumen",
        "upcoming",
        "E3",
        "Konversi ke PDF, gabung, pisah, kompres, tanda air, isi formulir PDF.",
        "LibreOffice (MPL), pypdf (BSD), pikepdf (MPL)",
        ("pdf", "acrobat", "konversi pdf", "gabung pdf"),
    ),
    Tool(
        "data.xlsx",
        "Data: spreadsheet",
        "data",
        "upcoming",
        "E3",
        "Membuat dan mengisi spreadsheet, rumus, dan grafik sederhana; angka dihitung program.",
        "openpyxl (MIT), LibreOffice (MPL)",
        ("excel", "ms excel", "spreadsheet", "xlsx", "google sheets", "tabel", "rekap"),
    ),
    Tool(
        "data.slides",
        "Dokumen: presentasi",
        "dokumen",
        "upcoming",
        "E3",
        "Menyusun berkas presentasi dari templat.",
        "LibreOffice (MPL)",
        ("powerpoint", "ppt", "pptx", "presentasi", "slide", "google slides"),
    ),
    Tool(
        "browser.app",
        "Browser: aplikasi luar",
        "browser",
        "upcoming",
        "E4",
        "Membuka dan mengisi aplikasi web milik tenant dengan sesi tersimpan per role.",
        "Playwright (Apache), Chromium (BSD)",
        (
            "aplikasi kinerja",
            "e-kinerja",
            "erp",
            "siasn",
            "sipd",
            "aplikasi web",
            "portal",
            "dashboard",
            "crm",
            "sistem informasi",
            "meta business suite",
            "linkedin",
            "notion",
            "jira",
            "trello",
            "google analytics",
            "instagram",
            "facebook",
        ),
    ),
    Tool(
        "media.video",
        "Media: video",
        "media",
        "upcoming",
        "E5",
        "Video dari templat, potong, gabung, dan takarir.",
        "Revideo atau Motion Canvas (MIT), FFmpeg (LGPL), MoviePy (MIT)",
        ("video", "premiere", "capcut", "edit video", "reels", "youtube"),
    ),
    Tool(
        "media.image",
        "Media: gambar dan poster",
        "media",
        "upcoming",
        "E5",
        "Membuat atau mendesain ulang gambar dan poster sebagai berkas yang bisa diedit.",
        "Pillow (HPND), Inkscape (GPL, program terpisah)",
        (
            "canva",
            "figma",
            "photoshop",
            "illustrator",
            "inkscape",
            "poster",
            "banner",
            "infografis",
            "desain grafis",
            "aplikasi desain",
        ),
    ),
    Tool(
        "workspace.code",
        "Ruang kerja: skrip",
        "integrasi",
        "upcoming",
        "E5",
        "Menulis dan menjalankan skrip di ruang kerja terisolasi.",
        "Python dan alat open source di ruang kerja",
        (
            "python",
            "javascript",
            "visual studio code",
            "vs code",
            "vscode",
            "pemrograman",
            "coding",
            "skrip",
            "node",
        ),
    ),
)

# Alat yang dikenal tetapi tidak ada di katalog: (kata pengenal, nama, kunci pengganti, catatan)
KNOWN_UNSUPPORTED: tuple[tuple[tuple[str, ...], str, str | None, str], ...] = (
    (
        ("whatsapp", "wa"),
        "WhatsApp",
        None,
        "Hanya direncanakan untuk konfirmasi kode (E6). Laporan dikirim lewat MBUTI.",
    ),
    (
        ("autocad", "sketchup"),
        "AutoCAD",
        "read.image",
        "Gambar teknik bisa dibaca sebagai gambar; menyunting berkas CAD belum didukung.",
    ),
    (
        ("telepon", "menelepon"),
        "Telepon",
        None,
        "Role tidak menelepon. Pertanyaan ke pihak luar diteruskan ke penanggung jawab.",
    ),
)

BY_KEY = {tool.key: tool for tool in CATALOG}


def _normalize(value: str) -> str:
    return " ".join(value.lower().split())


def _matches(query: str, alias: str) -> bool:
    return (
        query == alias or alias in query or (len(alias) > 3 and len(query) > 2 and query in alias)
    )


def map_tool(requested: str) -> dict:
    """Petakan satu nama alat ke katalog; hasilnya bentuk `ToolRef` di kontrak."""
    requested = " ".join(requested.split())[:80]
    query = _normalize(requested)
    # Kecocokan persis didahulukan, mis. "pdf" ke Dokumen: PDF, bukan "pdf reader"
    exact = next((t for t in CATALOG if query in t.aliases), None)
    for tool in [exact] if exact else CATALOG:
        if any(_matches(query, alias) for alias in tool.aliases):
            return {
                "key": tool.key,
                "requested": requested,
                "name": tool.name,
                "support": tool.support,
                "note": f"Hadir di tahap {tool.stage}." if tool.support == "upcoming" else "",
            }
    for aliases, name, substitute, note in KNOWN_UNSUPPORTED:
        if any(query == alias or alias in query.split() for alias in aliases):
            if substitute:
                tool = BY_KEY[substitute]
                return {
                    "key": tool.key,
                    "requested": requested,
                    "name": tool.name,
                    "support": "substitute",
                    "note": note,
                }
            return {
                "key": None,
                "requested": requested,
                "name": name,
                "support": "unsupported",
                "note": note,
            }
    return {
        "key": None,
        "requested": requested,
        "name": requested,
        "support": "unsupported",
        "note": "Belum ada di katalog; dicatat sebagai permintaan alat.",
    }


def weakest_support(tools: list[dict]) -> str:
    return max((t["support"] for t in tools), key=SUPPORT_RANK.__getitem__, default="supported")


def catalog_items() -> list[dict]:
    return [
        {
            "key": t.key,
            "name": t.name,
            "group": t.group,
            "support": t.support,
            "stage": t.stage,
            "description": t.description,
            "software": t.software,
        }
        for t in CATALOG
    ]
