/**
 * Contoh pustaka Kebijakan & Aturan (E1b). Isinya fiktif, ditulis untuk peragaan, bukan salinan aturan resmi.
 */
import type { DocumentSection, PolicyFields } from "@/app/(admin)/admin/pengetahuan/types";
import { palettePage } from "./media";
import type { MockDatabase } from "./seed";

const ORG = "org-nusantara";
const T0 = "2026-11-24T09:00:00Z";

const policy = (
  db: MockDatabase,
  id: string,
  title: string,
  description: string,
  fields: PolicyFields,
  fileName: string,
  sections: DocumentSection[]
) => {
  db.documents.push({
    id,
    organization_id: ORG,
    title,
    description,
    doc_type: fields.kind === "peraturan" ? "regulasi" : "pedoman",
    category: "policy",
    policy: fields,
    scope: "organization",
    scope_id: null,
    created_at: T0,
    updated_at: T0,
  });
  db.doc_versions.push({
    id: `${id}-v1`,
    document_id: id,
    version_no: 1,
    file_name: fileName,
    mime_type: "application/pdf",
    size_bytes: 180_000 + sections.length * 40_000,
    sha256: `contoh-${id}-1`,
    is_active: true,
    processing_started_at: T0,
    fail_reason: null,
    uploaded_by_member_id: "member-rina",
    sections,
    created_at: T0,
  });
};

export const seedPolicies = (db: MockDatabase) => {
  policy(
    db,
    "doc-kebijakan-merek",
    "Panduan Merek Organisasi",
    "Logo, warna, huruf, dan tata letak untuk semua materi publikasi.",
    { kind: "panduan_merek", reference_no: "PM-01/2026", issuer: "Sekretariat", effective_from: "2026-01-01", effective_until: null, status: "berlaku" },
    "panduan-merek-2026.pdf",
    [
      {
        page_no: 1,
        heading: "Logo",
        text: "Logo organisasi ditempatkan di pojok kiri atas atau tengah atas. Ruang kosong di sekitar logo minimal setinggi huruf N pada logo. Logo tidak boleh diregangkan, diputar, atau diberi bayangan.",
      },
      {
        page_no: 2,
        heading: "Warna dan huruf",
        render: "visual",
        image_url: palettePage,
        text: "Warna utama ungu #5B2DBF dan madu #F5A623. Teks isi memakai huruf tanpa kait dengan ukuran minimal 24 pt untuk poster dan 12 pt untuk dokumen cetak. Kontras teks terhadap latar minimal 4,5:1.",
      },
      {
        page_no: 3,
        heading: "Materi publikasi",
        text: "Setiap poster dan infografis wajib memuat logo, nama organisasi, sumber data bila menampilkan angka, dan alamat situs resmi. Materi dari pihak luar diperiksa terhadap panduan ini sebelum dipublikasikan.",
      },
    ]
  );
  policy(
    db,
    "doc-kebijakan-persetujuan",
    "Kebijakan Persetujuan Naskah Keluar",
    "Siapa yang menyetujui surat, laporan, dan materi publikasi sebelum keluar organisasi.",
    { kind: "kebijakan", reference_no: "KEP-07/2026", issuer: "Pimpinan", effective_from: "2026-02-01", effective_until: null, status: "berlaku" },
    "kebijakan-persetujuan-naskah.pdf",
    [
      {
        page_no: 1,
        heading: "Ketentuan umum",
        text: "Semua naskah keluar, termasuk surat dinas, laporan, dan materi publikasi, disetujui kepala unit sebelum dikirim. Persetujuan dicatat beserta tanggalnya.",
      },
      {
        page_no: 2,
        heading: "Pengecualian",
        text: "Balasan informasi umum yang isinya sudah diatur SOP pelayanan boleh dikirim petugas tanpa persetujuan kepala unit, selama tidak menyangkut data pribadi atau keluhan.",
      },
    ]
  );
  policy(
    db,
    "doc-standar-layanan-lama",
    "Standar Layanan 2024",
    "Diganti Kebijakan Persetujuan Naskah Keluar 2026; disimpan sebagai arsip.",
    { kind: "standar_mutu", reference_no: "SL-2024", issuer: "Sekretariat", effective_from: "2024-01-01", effective_until: "2025-12-31", status: "dicabut" },
    "standar-layanan-2024.pdf",
    [
      {
        page_no: 1,
        heading: "Waktu layanan",
        text: "Permintaan informasi dijawab paling lambat 10 hari kerja. Surat keluar cukup diparaf petugas persuratan.",
      },
    ]
  );
};
