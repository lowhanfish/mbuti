/**
 * Gambar untuk mode data contoh (E1c): lampiran tugas, halaman PDF bergambar, dan temuan bertanda kotak.
 * Backend membaca gambar lewat Gemini multimodal; di sini temuannya dibuat dengan aturan sederhana.
 */
import type { SearchHit } from "@/app/(admin)/admin/pengetahuan/types";
import type { Finding, TaskAttachment } from "@/app/(admin)/admin/tugas/types";
import type { MockAgent, MockDatabase } from "./seed";
import type { MockTable } from "./sheets";

export interface MockAttachment {
  id: string;
  organization_id: string;
  /** Kosong sampai dipakai tugas; lampiran yang tak terpakai dibuang backend setelah `expires_at` */
  task_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  pages: string[];
  /** Isi lembar data (E3b); kosong untuk gambar dan PDF */
  tables?: MockTable[];
  exif: TaskAttachment["exif"];
  uploaded_by_member_id: string;
  created_at: string;
}

export const MAX_ATTACHMENTS = 10;
export const MAX_PDF_PAGES = 20;
export const MAX_IMAGES_PER_STEP = 6;

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s{2,}/g, " "))}`;

const escapeXml = (value: string) => value.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Pengganti gambar halaman PDF di mode data contoh (peramban tidak merender PDF di sini). */
export const placeholderPage = (title: string, pageNo: number) =>
  svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="877" viewBox="0 0 620 877">
    <rect width="620" height="877" fill="#ffffff"/>
    <rect x="48" y="56" width="524" height="18" rx="4" fill="#e7e3f5"/>
    <rect x="48" y="96" width="380" height="12" rx="4" fill="#efeef3"/>
    <rect x="48" y="150" width="524" height="250" rx="12" fill="#f4f1ff" stroke="#c9b8ff"/>
    <polyline points="80,360 170,300 250,330 340,240 430,270 530,190" fill="none" stroke="#7c4dff" stroke-width="6"/>
    <rect x="48" y="430" width="250" height="150" rx="10" fill="#fff4dc" stroke="#f5c76b"/>
    <rect x="322" y="430" width="250" height="150" rx="10" fill="#e9fbf3" stroke="#8fdcb8"/>
    <rect x="48" y="612" width="524" height="10" rx="4" fill="#efeef3"/>
    <rect x="48" y="636" width="470" height="10" rx="4" fill="#efeef3"/>
    <text x="310" y="830" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#8a84a3">${escapeXml(title)} · halaman ${pageNo} (pratinjau contoh)</text>
  </svg>`);

/** Halaman panduan merek: contoh warna dan logo. */
export const palettePage = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="877" viewBox="0 0 620 877">
  <rect width="620" height="877" fill="#ffffff"/>
  <text x="48" y="80" font-family="sans-serif" font-size="30" font-weight="700" fill="#1f1a2e">Warna dan huruf</text>
  <rect x="48" y="120" width="160" height="160" rx="18" fill="#5B2DBF"/><text x="128" y="310" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#1f1a2e">Ungu #5B2DBF</text>
  <rect x="230" y="120" width="160" height="160" rx="18" fill="#F5A623"/><text x="310" y="310" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#1f1a2e">Madu #F5A623</text>
  <rect x="412" y="120" width="160" height="160" rx="18" fill="#1f1a2e"/><text x="492" y="310" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#1f1a2e">Teks #1F1A2E</text>
  <text x="48" y="400" font-family="sans-serif" font-size="44" font-weight="700" fill="#1f1a2e">Aa Judul 44 pt</text>
  <text x="48" y="460" font-family="sans-serif" font-size="24" fill="#1f1a2e">Teks isi poster minimal 24 pt</text>
  <rect x="48" y="520" width="524" height="200" rx="16" fill="#f4f1ff" stroke="#c9b8ff"/>
  <text x="310" y="600" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#5B2DBF">Kontras teks terhadap latar minimal 4,5:1</text>
  <text x="310" y="640" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#6b6585">Contoh: teks putih di atas ungu lolos; teks kuning di atas putih tidak lolos</text>
</svg>`);

/** Poster contoh kiriman vendor yang sengaja punya kekurangan (logo hilang, teks kecil, sumber data tidak ada). */
export const vendorPoster = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#fffaf0"/>
  <rect x="0" y="0" width="1080" height="380" fill="#F5A623"/>
  <text x="540" y="200" text-anchor="middle" font-family="sans-serif" font-size="84" font-weight="800" fill="#ffffff">HARI PELAYANAN</text>
  <text x="540" y="290" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#fff7e6">Sabtu, 6 Desember 2026</text>
  <rect x="90" y="460" width="900" height="420" rx="28" fill="#ffffff" stroke="#f1d9a8" stroke-width="4"/>
  <rect x="170" y="700" width="120" height="140" fill="#5B2DBF"/><rect x="340" y="620" width="120" height="220" fill="#5B2DBF"/>
  <rect x="510" y="560" width="120" height="280" fill="#5B2DBF"/><rect x="680" y="520" width="120" height="320" fill="#F5A623"/>
  <text x="540" y="530" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="#1f1a2e">Layanan selesai tepat waktu naik 38%</text>
  <text x="540" y="1000" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#f5c76b">Datang langsung ke kantor pelayanan pukul 08.00–14.00. Bawa KTP dan berkas permohonan.</text>
  <rect x="0" y="1180" width="1080" height="170" fill="#1f1a2e"/>
  <text x="540" y="1280" text-anchor="middle" font-family="sans-serif" font-size="38" fill="#ffffff">Gratis untuk semua warga</text>
</svg>`);

/** Poster yang sudah disetujui, sebagai contoh di pengetahuan Amir. */
export const approvedPoster = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#ffffff"/>
  <rect x="0" y="0" width="1080" height="360" fill="#5B2DBF"/>
  <circle cx="120" cy="110" r="52" fill="#F5A623"/><text x="120" y="122" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="800" fill="#1f1a2e">N</text>
  <text x="200" y="124" font-family="sans-serif" font-size="30" font-weight="700" fill="#ffffff">Dinas Contoh Nusantara</text>
  <text x="540" y="270" text-anchor="middle" font-family="sans-serif" font-size="72" font-weight="800" fill="#ffffff">LAYANAN DATA TERBUKA</text>
  <text x="540" y="560" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#1f1a2e">Unduh data statistik resmi</text>
  <text x="540" y="620" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#1f1a2e">kapan saja, gratis.</text>
  <text x="540" y="1150" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#6b6585">Sumber: Bidang Data &amp; Informasi, Oktober 2026</text>
  <text x="540" y="1250" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="700" fill="#5B2DBF">contoh-nusantara.test</text>
</svg>`);

/** Baca berkas gambar, perkecil (maks 1280 px) agar muat di penyimpanan peramban. */
export const readImage = async (file: File): Promise<{ url: string; width: number; height: number }> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { url: canvas.toDataURL("image/jpeg", 0.72), ...size };
};

export const toAttachment = (db: MockDatabase, a: MockAttachment): TaskAttachment => {
  const member = db.memberships.find((m) => m.id === a.uploaded_by_member_id);
  return {
    id: a.id,
    file_name: a.file_name,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    width: a.width,
    height: a.height,
    page_count: a.pages.length,
    pages: a.pages,
    table: a.tables?.map((t) => ({ name: t.name, columns: t.columns, row_count: t.rows.length })) ?? null,
    exif: a.exif,
    uploaded_by_name: member ? db.users.find((u) => u.id === member.user_id)?.full_name ?? null : null,
    created_at: a.created_at,
  };
};

const hash = (value: string) => [...value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Temuan bawaan per gambar: posisi kotak dan isinya dipilih dari daftar, tetap sama untuk gambar yang sama. */
const PATTERNS: Array<Omit<Finding, "no" | "target" | "source_index" | "criterion"> & { rule: RegExp }> = [
  {
    title: "Logo organisasi tidak ada",
    description: "Bagian atas tidak memuat logo dan nama organisasi.",
    severity: "penting",
    box: [20, 20, 280, 980],
    recommendation: "Tambahkan logo di pojok kiri atas dengan ruang kosong minimal setinggi huruf N pada logo.",
    rule: /logo/i,
  },
  {
    title: "Teks terlalu kecil dan kontrasnya rendah",
    description: "Keterangan waktu layanan memakai huruf sekitar 16 pt berwarna kuning muda di atas latar terang.",
    severity: "perlu_perbaikan",
    box: [715, 60, 765, 940],
    recommendation: "Naikkan ke minimal 24 pt dan pakai warna teks #1F1A2E agar kontras minimal 4,5:1.",
    rule: /kontras|pt/i,
  },
  {
    title: "Angka tanpa sumber data",
    description: "Grafik menyebut kenaikan 38% tetapi tidak mencantumkan sumber dan periode data.",
    severity: "perlu_perbaikan",
    box: [340, 85, 655, 915],
    recommendation: "Tulis sumber dan periode di bawah grafik, mis. \"Sumber: Bidang Data & Informasi, Oktober 2026\".",
    rule: /sumber/i,
  },
  {
    title: "Alamat situs resmi tidak dicantumkan",
    description: "Bagian bawah hanya memuat ajakan; alamat situs resmi tidak ada.",
    severity: "info",
    box: [875, 0, 1000, 1000],
    recommendation: "Tambahkan alamat situs resmi di bagian bawah.",
    rule: /situs/i,
  },
];

/**
 * Temuan simulasi atas lampiran gambar sebuah langkah. Rujukan ke pedoman dipilih dari potongan yang cocok
 * dengan aturan temuan itu; bila tidak ada, temuan tetap ditulis tanpa rujukan.
 */
export const simulateFindings = (agent: MockAgent, attachments: MockAttachment[], hits: SearchHit[]): Finding[] => {
  const findings: Finding[] = [];
  for (const a of attachments.slice(0, MAX_IMAGES_PER_STEP)) {
    const seed = hash(a.file_name + a.size_bytes);
    const count = a.mime_type === "application/pdf" ? 1 : 2 + (seed % 3);
    const start = seed % PATTERNS.length;
    for (let i = 0; i < count && findings.length < 12; i++) {
      const p = PATTERNS[(start + i) % PATTERNS.length];
      const hitIndex = hits.findIndex((h) => p.rule.test(h.snippet) || p.rule.test(h.heading));
      const criterion = agent.acceptance_criteria.find((c) => p.rule.test(c)) ?? null;
      findings.push({
        no: findings.length + 1,
        title: p.title,
        description: p.description,
        severity: p.severity,
        target: { kind: "attachment", attachment_id: a.id, page_no: 1 },
        box: p.box,
        source_index: hitIndex >= 0 ? hitIndex + 1 : null,
        recommendation: p.recommendation,
        criterion,
      });
    }
  }
  return findings;
};

export const findingsSummary = (findings: Finding[]) =>
  findings.length
    ? [
        "",
        `Temuan pada gambar (${findings.length}):`,
        ...findings.map((f) => `${f.no}. ${f.title}${f.source_index ? ` [${f.source_index}]` : ""} — ${f.recommendation}`),
      ]
    : [];
