"""
Mode penyusunan (kontrak 20): aturan untuk model dan daftar bagian yang disusun sendiri.

Daftar itu dilaporkan model, jadi bisa tidak lengkap; ia ditampilkan untuk diperiksa manusia.
"""

from app.services.letters.content import clean_text

DATA, COMPLETE, FREE = "data", "complete", "free"
MODES = (DATA, COMPLETE, FREE)
LABELS = {DATA: "Dari data", COMPLETE: "Lengkapi", FREE: "Susun bebas"}
MAX_ITEMS = 20
UNGROUNDED = {"part": "Isi dokumen", "note": "disusun tanpa data masukan"}

COMPOSED_PROPERTY = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {"part": {"type": "STRING"}, "note": {"type": "STRING"}},
        "required": ["part", "note"],
    },
}

_NEVER = (
    "Nama orang, NIP, tanda tangan, nomor surat, dan nomor peraturan tidak boleh dikarang; "
    "kosongkan dengan isian bertanda, mis. [nama kepala dinas]."
)
_MISSING = (
    "Bila aturan atau data yang dibutuhkan tidak ada, tetap susun hasilnya dalam bentuk yang "
    "lazim dan sebut di `notes` apa yang tidak ditemukan."
)
_LISTED = (
    "Jawab `done`. Setiap bagian yang Anda susun sendiri didaftar di `composed`: `part` nama "
    "bagian di dalam hasil seperti yang dikenal pembaca (mis. Analisis, Jumlah gangguan), bukan "
    "nama kolom jawaban; `note` apa yang Anda tambahkan, dan sebut nilainya bila berupa angka, "
    "tanggal, atau kejadian. Bagian buatan tidak diberi nomor rujukan, dan daftar itu tidak "
    "ditulis di dalam hasil. Tulis dalam bahasa Indonesia."
)
# Aturan 3 dan 6 pemeriksa bila pembuatnya boleh menyusun sendiri
REVIEW_RULES = (
    "Tidak adanya potongan dokumen bukan alasan berhenti: periksa terhadap tugas, bahan, dan "
    "kriteria.",
    "Jawab `done` beserta `verdict`. Tulis dalam bahasa Indonesia.",
)

# Pengganti aturan tetap nomor 3, 4, dan 6 pada susunan instruksi
RULES = {
    DATA: (
        "Bila aturan yang dibutuhkan tidak ada di potongan dokumen, jawab `status` "
        "`not_in_documents` dan jelaskan di `output` apa yang tidak ditemukan. Jangan menebak.",
        "Bila data wajib dari pemberi tugas kurang, jawab `need_info` dan sebutkan yang "
        "kurang. Jangan mengarang nama, jabatan, alamat, nomor, angka, atau tanggal. Data "
        "pelengkap yang tidak tersedia ditulis sebagai isian kosong bertanda, mis. "
        "[alamat kantor].",
        "Selain itu jawab `done`. Tulis dalam bahasa Indonesia.",
    ),
    COMPLETE: (
        _MISSING,
        "Mode Lengkapi: narasi, analisis, dan saran yang tidak ada datanya boleh Anda susun "
        "sendiri. Angka, tanggal, dan kejadian yang tidak ada di tugas, bahan, dokumen, atau "
        "data tidak boleh dibuat; tulis isian kosong bertanda, mis. [jumlah gangguan]. " + _NEVER,
        _LISTED,
    ),
    FREE: (
        _MISSING,
        "Mode Susun bebas: susun hasil yang utuh walau tanpa data masukan. Angka, tanggal, dan "
        "kejadian yang tidak tersedia boleh Anda buat sebagai contoh yang masuk akal, dan semua "
        "yang dibuat wajib didaftar di `composed`. Data yang tersedia tidak boleh diubah. "
        + _NEVER,
        _LISTED,
    ),
}
# Mengalahkan aturan tabel "hanya angka yang ada di arahan atau dokumen"
FREE_SHEET_RULE = (
    "- Pada mode Susun bebas ini, `rows` boleh berisi data contoh; daftarkan di `composed`."
)

_ALLOWED = {
    COMPLETE: "hanya narasi, analisis, dan saran yang boleh disusun sendiri; angka, tanggal, dan "
    "kejadian karangan tetap salah",
    FREE: "narasi serta contoh angka, tanggal, dan kejadian boleh dibuat",
}


def effective(choice: str | None, role_mode: str | None) -> str:
    """Pilihan tugas mengalahkan mode role."""
    if choice in MODES:
        return choice
    return role_mode if role_mode in MODES else DATA


def clean(items: object, mode: str, grounded: bool) -> list[dict]:
    """`grounded`: ada potongan dokumen, gambar, data, atau sumber internet sebagai dasar."""
    if mode == DATA:
        return []
    found: list[dict] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        part = " ".join(clean_text(item.get("part"), 200).split())[:100]
        note = " ".join(clean_text(item.get("note"), 400).split())[:200]
        if part and {"part": part, "note": note} not in found:
            found.append({"part": part, "note": note})
    if not found and mode == FREE and not grounded:
        return [dict(UNGROUNDED)]
    return found[:MAX_ITEMS]


def summary(mode: str, composed: list[dict]) -> str:
    extra = f", {len(composed)} bagian disusun sendiri" if composed else ""
    return f"mode {LABELS[mode]}{extra}"


def review_material(mode: str, composed: list[dict]) -> str:
    listed = "\n".join(f"- {item['part']}: {item['note']}" for item in composed)
    return (
        f"{LABELS[mode]}: {_ALLOWED[mode]}.\nTerdaftar disusun sendiri:\n{listed or '(tidak ada)'}"
    )
