/**
 * Dokumen contoh. Isinya fiktif dan ditulis khusus untuk peragaan, bukan salinan peraturan resmi.
 */
import type { DocumentCategory, DocumentScope, DocumentSection, DocumentType, MediaKind, PolicyFields } from "@/app/(admin)/admin/pengetahuan/types";

export interface MockDocument {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  doc_type: DocumentType;
  scope: DocumentScope;
  scope_id: string | null;
  /** Bawaan `knowledge`; `qa` = hasil tanya jawab pembentukan role (dokumen sistem, hanya-baca) */
  category?: DocumentCategory;
  /** Untuk dokumen Kebijakan & Aturan */
  policy?: PolicyFields;
  /** Untuk temuan internet yang disetujui */
  source_url?: string;
  created_at: string;
  updated_at: string;
  /** Terisi bila dihapus setelah pernah dirujuk (soft delete) */
  deleted_at?: string;
}

export interface MockDocVersion {
  id: string;
  document_id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  is_active: boolean;
  /** Waktu mulai olah; status antre/diolah/siap dihitung dari selisihnya dengan waktu sekarang */
  processing_started_at: string;
  fail_reason: string | null;
  uploaded_by_member_id: string | null;
  /** Menggantikan versi aktif begitu selesai diolah */
  activate_when_ready?: boolean;
  /** Bawaan `text` untuk TXT/MD/DOCX dan `pdf` untuk PDF */
  media_kind?: MediaKind;
  sections: DocumentSection[];
  created_at: string;
}

const ORG = "org-nusantara";
const T0 = "2026-11-24T09:00:00Z";

const doc = (
  id: string,
  title: string,
  description: string,
  doc_type: DocumentType,
  scope: DocumentScope,
  scope_id: string | null
): MockDocument => ({ id, organization_id: ORG, title, description, doc_type, scope, scope_id, created_at: T0, updated_at: T0 });

const version = (
  document_id: string,
  file_name: string,
  size_bytes: number,
  sections: DocumentSection[],
  version_no = 1,
  is_active = true
): MockDocVersion => ({
  id: `${document_id}-v${version_no}`,
  document_id,
  version_no,
  file_name,
  mime_type: file_name.endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf",
  size_bytes,
  sha256: `contoh-${document_id}-${version_no}`,
  is_active,
  processing_started_at: T0,
  fail_reason: null,
  uploaded_by_member_id: "member-rina",
  sections,
  created_at: T0,
});

export const SEED_DOCUMENTS: MockDocument[] = [
  doc(
    "doc-tnd",
    "Pedoman Tata Naskah Dinas",
    "Aturan format, penomoran, dan susunan naskah dinas di lingkungan organisasi.",
    "pedoman",
    "unit",
    "unit-persuratan"
  ),
  doc("doc-templat-undangan", "Templat Surat Undangan", "Contoh susunan surat undangan rapat.", "templat", "agent", "agent-rani"),
  doc(
    "doc-sop-layanan",
    "SOP Pelayanan Informasi",
    "Alur menjawab permintaan informasi dari masyarakat, termasuk batas waktu dan pengecualian.",
    "sop",
    "organization",
    null
  ),
  doc("doc-sop-bayar", "SOP Pengajuan Pembayaran", "Kelengkapan berkas dan alur verifikasi pembayaran.", "sop", "agent", "agent-dana"),
  doc(
    "doc-laporan",
    "Petunjuk Penyusunan Laporan Realisasi",
    "Format laporan realisasi anggaran bulanan dan cara menghitung penyerapan.",
    "manual",
    "unit",
    "unit-keuangan"
  ),
];

export const SEED_DOC_VERSIONS: MockDocVersion[] = [
  version("doc-tnd", "pedoman-tata-naskah-dinas-2025.pdf", 1_240_000, [], 1, false),
  version("doc-tnd", "pedoman-tata-naskah-dinas-2026.pdf", 1_380_000, [
    {
      page_no: 1,
      heading: "Bab I — Ketentuan Umum",
      text:
        "Naskah dinas adalah komunikasi tertulis resmi yang dibuat dan dikeluarkan oleh unit kerja. Setiap naskah dinas memakai bahasa Indonesia yang baku, singkat, jelas, dan santun. Pedoman ini berlaku untuk surat undangan, surat edaran, surat pemberitahuan, dan surat balasan.",
    },
    {
      page_no: 2,
      heading: "Bab II — Kop dan Penomoran",
      text:
        "Kop naskah dinas memuat lambang, nama organisasi, alamat, telepon, dan laman resmi. Nomor surat disusun dengan urutan: kode klasifikasi / nomor urut / kode unit / tahun, contoh 005/123/SRT/2026. Nomor urut dimulai dari 1 setiap awal tahun dan dicatat di buku agenda keluar.",
    },
    {
      page_no: 3,
      heading: "Bab III — Susunan Surat Undangan",
      text:
        "Surat undangan terdiri atas kepala surat (nomor, sifat, lampiran, perihal), alamat tujuan, isi, dan penutup. Isi surat undangan wajib menyebut hari, tanggal, waktu, tempat, dan acara. Undangan dikirim paling lambat tiga hari kerja sebelum kegiatan. Perihal ditulis singkat tanpa singkatan yang tidak umum.",
    },
    {
      page_no: 4,
      heading: "Bab IV — Penandatanganan",
      text:
        "Naskah dinas ditandatangani oleh pejabat yang berwenang sesuai jenjang. Di bawah tanda tangan dicantumkan nama jabatan dan nama lengkap tanpa gelar akademik, kecuali naskah ditujukan ke luar organisasi. Tembusan ditulis di kiri bawah bila diperlukan.",
    },
  ], 2, true),
  version("doc-templat-undangan", "templat-undangan.docx", 48_000, [
    {
      page_no: 1,
      heading: "Templat",
      text:
        "Nomor: …/…/SRT/2026. Sifat: Biasa. Lampiran: -. Perihal: Undangan … Yth. … di tempat. Dengan hormat, kami mengundang Bapak/Ibu untuk hadir pada: hari/tanggal …, waktu …, tempat …, acara … Atas perhatian dan kehadirannya kami ucapkan terima kasih.",
    },
  ]),
  version("doc-sop-layanan", "sop-pelayanan-informasi.pdf", 860_000, [
    {
      page_no: 1,
      heading: "Tujuan dan Ruang Lingkup",
      text:
        "SOP ini mengatur cara petugas menjawab permintaan informasi dari masyarakat melalui loket, telepon, dan pesan daring. Informasi yang dikecualikan tidak boleh diberikan dan harus dijelaskan alasannya secara sopan.",
    },
    {
      page_no: 2,
      heading: "Alur Layanan",
      text:
        "Petugas mencatat nama pemohon, kontak, dan rincian informasi yang diminta. Permintaan dijawab paling lambat 10 hari kerja, dan dapat diperpanjang 7 hari kerja dengan pemberitahuan tertulis. Jawaban harus menyebut sumber dokumen yang dipakai.",
    },
    {
      page_no: 3,
      heading: "Syarat Layanan Surat Keterangan",
      text:
        "Syarat permohonan surat keterangan: fotokopi kartu identitas, formulir permohonan yang sudah diisi, dan surat pengantar dari kelurahan. Layanan tidak dipungut biaya. Waktu penyelesaian 2 hari kerja sejak berkas lengkap.",
    },
  ]),
  version("doc-sop-bayar", "sop-pengajuan-pembayaran.pdf", 410_000, [
    {
      page_no: 1,
      heading: "Kelengkapan Berkas",
      text:
        "Pengajuan pembayaran wajib dilampiri: kuitansi bermeterai, faktur atau nota, berita acara serah terima, dan dokumen kontrak atau surat pesanan. Berkas yang tidak lengkap dikembalikan dalam 1 hari kerja dengan catatan kekurangan.",
    },
    {
      page_no: 2,
      heading: "Verifikasi",
      text:
        "Verifikator memeriksa kesesuaian nilai, nama penerima, nomor rekening, dan masa berlaku kontrak. Hasil verifikasi dicatat sebagai DITERIMA atau DIKEMBALIKAN beserta alasannya.",
    },
  ]),
  version("doc-laporan", "petunjuk-laporan-realisasi.pdf", 620_000, [
    {
      page_no: 1,
      heading: "Format Laporan",
      text:
        "Laporan realisasi bulanan memuat tabel per kegiatan dengan kolom: kode kegiatan, nama kegiatan, pagu, realisasi bulan ini, realisasi kumulatif, dan persentase penyerapan.",
    },
    {
      page_no: 2,
      heading: "Perhitungan Penyerapan",
      text:
        "Persentase penyerapan dihitung dari realisasi kumulatif dibagi pagu dikali 100. Kegiatan dengan penyerapan di bawah 50% pada triwulan III wajib diberi catatan penyebab dan rencana tindak lanjut.",
    },
  ]),
];
