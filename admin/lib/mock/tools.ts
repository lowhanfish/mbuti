/**
 * Katalog alat (PLANNING fase E bagian 2). Backend menulisnya di `app/services/tools/catalog.py`.
 * Di E1 yang tersedia baru baca dokumen, baca gambar, dan pencarian internet.
 */
import type { ToolCatalogItem, ToolRef, ToolSupport } from "@/app/(admin)/admin/role/formation-types";

interface CatalogEntry extends ToolCatalogItem {
  /** Kata pengenal untuk memetakan tulisan bebas pembuat role */
  aliases: string[];
  /** Untuk alat yang belum didukung: kunci alat pengganti dan catatannya */
  substitute?: { for: string[]; note: string };
}

export const TOOL_CATALOG: CatalogEntry[] = [
  {
    key: "read.document",
    name: "Baca dokumen",
    group: "pembacaan",
    support: "supported",
    stage: "B3",
    description: "Membaca PDF berteks, DOCX, TXT, dan MD dari pengetahuan role.",
    software: "pypdf (BSD), python-docx (MIT)",
    aliases: ["baca dokumen", "membaca dokumen", "pdf reader", "adobe reader", "acrobat reader", "membaca sop"],
  },
  {
    key: "read.image",
    name: "Baca gambar",
    group: "pembacaan",
    support: "supported",
    stage: "E1",
    description: "Membaca gambar dan halaman PDF kompleks (desain, foto, kuitansi, grafik) lewat Gemini multimodal.",
    software: "Gemini (API), pypdfium2 (Apache/BSD), Pillow (HPND)",
    aliases: ["foto", "gambar", "scan", "kuitansi", "nota", "grafik", "tangkapan layar", "ocr"],
  },
  {
    key: "search.web",
    name: "Pencarian internet",
    group: "pencarian",
    support: "supported",
    stage: "E1",
    description: "Pencarian Google bawaan Gemini, dengan tautan sumber. Diaktifkan per role.",
    software: "Gemini (API)",
    aliases: ["internet", "google", "browsing", "cari informasi", "riset", "berita"],
  },
  {
    key: "document.docx",
    name: "Dokumen: DOCX",
    group: "dokumen",
    support: "upcoming",
    stage: "E3",
    description: "Menyusun dan mengisi dokumen Word dari templat organisasi.",
    software: "python-docx (MIT), LibreOffice (MPL)",
    aliases: ["word", "ms word", "microsoft word", "docx", "surat", "naskah", "libreoffice writer", "google docs"],
  },
  {
    key: "document.pdf",
    name: "Dokumen: PDF",
    group: "dokumen",
    support: "upcoming",
    stage: "E3",
    description: "Konversi ke PDF, gabung, pisah, kompres, tanda air, isi formulir PDF.",
    software: "LibreOffice (MPL), pypdf (BSD), pikepdf (MPL)",
    aliases: ["pdf", "acrobat", "konversi pdf", "gabung pdf"],
  },
  {
    key: "data.xlsx",
    name: "Data: spreadsheet",
    group: "data",
    support: "upcoming",
    stage: "E3",
    description: "Membuat dan mengisi spreadsheet, rumus, dan grafik sederhana; angka dihitung program.",
    software: "openpyxl (MIT), LibreOffice (MPL)",
    aliases: ["excel", "ms excel", "spreadsheet", "xlsx", "google sheets", "tabel", "rekap"],
  },
  {
    key: "data.slides",
    name: "Dokumen: presentasi",
    group: "dokumen",
    support: "upcoming",
    stage: "E3",
    description: "Menyusun berkas presentasi dari templat.",
    software: "LibreOffice (MPL)",
    aliases: ["powerpoint", "ppt", "pptx", "presentasi", "slide", "google slides"],
  },
  {
    key: "browser.app",
    name: "Browser: aplikasi luar",
    group: "browser",
    support: "upcoming",
    stage: "E4",
    description: "Membuka dan mengisi aplikasi web milik tenant dengan sesi tersimpan per role.",
    software: "Playwright (Apache), Chromium (BSD)",
    aliases: ["aplikasi kinerja", "e-kinerja", "erp", "siasn", "sipd", "aplikasi web", "portal", "dashboard", "crm", "sistem informasi"],
  },
  {
    key: "media.video",
    name: "Media: video",
    group: "media",
    support: "upcoming",
    stage: "E5",
    description: "Video dari templat, potong, gabung, dan takarir.",
    software: "Revideo atau Motion Canvas (MIT), FFmpeg (LGPL), MoviePy (MIT)",
    aliases: ["video", "premiere", "capcut", "edit video", "reels", "youtube"],
  },
  {
    key: "media.image",
    name: "Media: gambar dan poster",
    group: "media",
    support: "upcoming",
    stage: "E5",
    description: "Membuat atau mendesain ulang gambar dan poster sebagai berkas yang bisa diedit.",
    software: "Pillow (HPND), Inkscape (GPL, program terpisah)",
    aliases: ["canva", "figma", "photoshop", "illustrator", "inkscape", "poster", "banner", "infografis", "desain grafis", "aplikasi desain"],
  },
  {
    key: "workspace.code",
    name: "Ruang kerja: skrip",
    group: "integrasi",
    support: "upcoming",
    stage: "E5",
    description: "Menulis dan menjalankan skrip di ruang kerja terisolasi.",
    software: "Python, alat open source di ruang kerja",
    aliases: ["python", "javascript", "visual studio code", "vs code", "vscode", "pemrograman", "coding", "skrip", "node"],
  },
];

/** Alat yang dikenal tetapi memang belum ada di katalog; diberi pengganti bila ada. */
const KNOWN_UNSUPPORTED: Array<{ aliases: string[]; name: string; substitute: string | null; note: string }> = [
  { aliases: ["whatsapp", "wa"], name: "WhatsApp", substitute: null, note: "Hanya direncanakan untuk konfirmasi kode (E6). Laporan dikirim lewat MBUTI." },
  { aliases: ["autocad", "sketchup"], name: "AutoCAD", substitute: "read.image", note: "Gambar teknik bisa dibaca sebagai gambar; menyunting berkas CAD belum didukung." },
  { aliases: ["telepon", "menelepon"], name: "Telepon", substitute: null, note: "Role tidak menelepon. Pertanyaan ke pihak luar diteruskan ke penanggung jawab." },
];

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Petakan satu nama alat yang ditulis pembuat role ke katalog. */
export const mapTool = (requested: string): ToolRef => {
  const q = normalize(requested);
  const hit = TOOL_CATALOG.find((t) => t.aliases.some((a) => q === a || q.includes(a) || (a.length > 3 && a.includes(q))));
  if (hit) {
    return {
      key: hit.key,
      requested,
      name: hit.name,
      support: hit.support,
      note: hit.support === "upcoming" ? `Hadir di tahap ${hit.stage}.` : "",
    };
  }
  const known = KNOWN_UNSUPPORTED.find((k) => k.aliases.some((a) => q === a || q.includes(a)));
  if (known?.substitute) {
    const sub = TOOL_CATALOG.find((t) => t.key === known.substitute)!;
    return { key: sub.key, requested, name: sub.name, support: "substitute", note: known.note };
  }
  return { key: null, requested, name: known?.name ?? requested, support: "unsupported", note: known?.note ?? "Belum ada di katalog; dicatat sebagai permintaan alat." };
};

const RANK: Record<ToolSupport, number> = { supported: 0, upcoming: 1, substitute: 2, unsupported: 3 };

/** Status terlemah di antara alat sebuah keterampilan. */
export const weakestSupport = (tools: ToolRef[]): ToolSupport =>
  tools.reduce<ToolSupport>((worst, t) => (RANK[t.support] > RANK[worst] ? t.support : worst), "supported");

export const catalogItems = (): ToolCatalogItem[] =>
  TOOL_CATALOG.map(({ aliases: _a, substitute: _s, ...item }) => {
    void _a;
    void _s;
    return item;
  });
