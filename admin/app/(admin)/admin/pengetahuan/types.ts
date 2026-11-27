export type DocumentScope = "organization" | "unit" | "agent";
export type DocumentType = "sop" | "manual" | "pedoman" | "templat" | "regulasi" | "uraian_jabatan" | "lainnya";
/**
 * `knowledge` dokumen biasa, `policy` kebijakan dan aturan (E1b), `formation` uraian jabatan,
 * `qa` hasil tanya jawab pembentukan role, `web` temuan internet yang disetujui (E1d).
 */
export type DocumentCategory = "knowledge" | "policy" | "formation" | "qa" | "web";
export type PolicyKind = "peraturan" | "kebijakan" | "standar_mutu" | "panduan_merek" | "lainnya";
export type PolicyStatus = "berlaku" | "dicabut";

/** Sumber sebuah rujukan; menentukan urutan rujukan: kebijakan → tanya jawab → dokumen → internet. */
export type SourceKind = "policy" | "qa" | "document" | "web" | "image" | "attachment";

/** Keterangan tambahan untuk dokumen di pustaka Kebijakan & Aturan. */
export interface PolicyFields {
  kind: PolicyKind;
  /** Nomor peraturan atau kode kebijakan, mis. "KEP-07/2026" */
  reference_no: string;
  issuer: string;
  /** Tanggal (YYYY-MM-DD); null = tidak dibatasi */
  effective_from: string | null;
  effective_until: string | null;
  status: PolicyStatus;
}

export interface PolicyInfo extends PolicyFields {
  /** Dihitung server: berstatus berlaku dan hari ini di dalam masa berlaku */
  in_force: boolean;
}

/** `text` dibaca lokal; `scan` dan `visual` (tabel bergaris, grafik, diagram, foto) dibaca Gemini multimodal (E1c). */
export type PageRender = "text" | "scan" | "visual";
export type MediaKind = "text" | "pdf" | "image";

export type IngestionStatus = "queued" | "processing" | "ready" | "failed";

export interface DocumentVersion {
  id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  page_count: number;
  is_active: boolean;
  status: IngestionStatus;
  /** 0–100, hanya bermakna saat status processing */
  progress: number;
  error_message: string | null;
  uploaded_by_name: string | null;
  /** `image` untuk berkas gambar (PNG, JPG, WEBP) */
  media_kind: MediaKind;
  /** Halaman berat (scan/visual) yang dibuat embedding gambarnya */
  visual_pages: number;
  /** Halaman berat di atas batas per berkas: gambarnya disimpan tanpa embedding */
  visual_pages_over_limit: number;
  created_at: string;
}

export interface DocumentSection {
  page_no: number;
  heading: string;
  text: string;
  /** Bawaan `text` */
  render?: PageRender;
  /**
   * Gambar halaman untuk `scan`/`visual` dan berkas gambar. Backend mengirim path API
   * (`/api/v1/admin/pengetahuan/{id}/versions/{vid}/pages/{page}/image`); data contoh memakai data URL.
   */
  image_url?: string | null;
  /** Bacaan Gemini atas halaman bergambar, disimpan saat pertama kali dipakai tugas */
  visual_text?: string;
}

export interface ResponseInterface {
  id: string;
  title: string;
  description: string;
  doc_type: DocumentType;
  scope: DocumentScope;
  scope_id: string | null;
  /** Nama unit atau role pemilik dokumen; null untuk lingkup organisasi */
  scope_name: string | null;
  scope_color: string | null;
  active_version: DocumentVersion | null;
  version_count: number;
  category: DocumentCategory;
  /** Terisi untuk `category: "policy"` */
  policy: PolicyInfo | null;
  /** Alamat asal untuk temuan internet (`category: "web"`) */
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DetailInterface extends ResponseInterface {
  versions: DocumentVersion[];
  sections: DocumentSection[];
  /** Terisi bila dokumen sudah dihapus tetapi disimpan karena pernah dirujuk tugas */
  archived_at: string | null;
}

/** Satu versi beserta isinya; dipakai saat membuka rujukan ke versi yang bukan versi aktif. */
export interface VersionDetailInterface extends DocumentVersion {
  /** Kosong selama versi belum selesai diolah */
  sections: DocumentSection[];
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<IngestionStatus, number>;
}

export interface UpdateInterface {
  title: string;
  description: string;
  doc_type: DocumentType;
  scope: DocumentScope;
  scope_id: string | null;
  /** Hanya untuk dokumen kebijakan */
  policy?: PolicyFields;
}

/** Satu potongan hasil pencarian beserta rujukannya. */
export interface SearchHit {
  document_id: string;
  document_title: string;
  /** Versi yang dirujuk; rujukan tetap menunjuk versi ini walau versi aktif sudah diganti */
  version_id: string;
  version_no: number;
  page_no: number;
  heading: string;
  snippet: string;
  score: number;
  /** `policy` untuk dokumen Kebijakan & Aturan, `qa` untuk hasil tanya jawab, `image` untuk halaman bergambar, selain itu `document` */
  source_kind: SourceKind;
  /** Gambar halaman bila halaman yang cocok bergambar */
  image_url?: string | null;
}

export const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  sop: "SOP",
  manual: "Manual book",
  pedoman: "Pedoman",
  templat: "Templat",
  regulasi: "Regulasi",
  uraian_jabatan: "Uraian jabatan",
  lainnya: "Lainnya",
};

/** Sumber internet yang dipakai role (E1d). Tautan dibuat server dari grounding metadata Gemini, bukan dari teks model. */
export interface WebSource {
  /** Nomor rujukan W1, W2, … */
  no: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  retrieved_at: string;
}

export type ProposalStatus = "pending" | "approved" | "rejected";

/** Usulan menyimpan temuan internet sebagai pengetahuan organisasi; admin yang memutuskan. */
export interface KnowledgeProposal {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  status: ProposalStatus;
  task_id: string | null;
  task_title: string | null;
  agent_name: string | null;
  proposed_by_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  /** Dokumen yang dibuat saat disetujui */
  document_id: string | null;
  created_at: string;
}

export interface ProposalRequest {
  url: string;
  title: string;
  excerpt: string;
  task_id?: string | null;
  agent_id?: string | null;
}

export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  knowledge: "Dokumen",
  policy: "Kebijakan & aturan",
  formation: "Uraian jabatan",
  qa: "Hasil tanya jawab",
  web: "Temuan internet",
};

export const POLICY_KIND_LABEL: Record<PolicyKind, string> = {
  peraturan: "Peraturan",
  kebijakan: "Kebijakan",
  standar_mutu: "Standar mutu",
  panduan_merek: "Panduan merek",
  lainnya: "Lainnya",
};

export const SOURCE_KIND_LABEL: Record<SourceKind, { label: string; variant: "danger" | "accent" | "info" | "neutral" | "success" | "warning" }> = {
  policy: { label: "Aturan", variant: "danger" },
  qa: { label: "Tanya jawab", variant: "accent" },
  document: { label: "Dokumen", variant: "info" },
  web: { label: "Internet", variant: "neutral" },
  image: { label: "Gambar", variant: "success" },
  attachment: { label: "Lampiran", variant: "warning" },
};

export const SCOPE_LABEL: Record<DocumentScope, string> = {
  organization: "Seluruh organisasi",
  unit: "Unit",
  agent: "Role",
};

export const STATUS_LABEL: Record<IngestionStatus, string> = {
  queued: "Antre",
  processing: "Diolah",
  ready: "Siap",
  failed: "Gagal",
};

export const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain": "TXT",
  "text/markdown": "MD",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
};

export const ACCEPT_ATTR =
  ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg,image/webp";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Batas berkas gambar (pengetahuan dan lampiran tugas). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Alamat gambar dari API dilengkapi URL backend; data URL (mode data contoh) dipakai apa adanya. */
export const mediaSrc = (url: string | null | undefined, apiBase: string) => (!url ? "" : url.startsWith("/api/") ? `${apiBase}${url}` : url);

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Tautan ke halaman yang dirujuk, pada versi yang dirujuk. */
export const citationHref = (hit: Pick<SearchHit, "document_id" | "version_id" | "page_no">, query = "") =>
  `/admin/pengetahuan/${hit.document_id}?versi=${hit.version_id}&hlm=${hit.page_no}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

/** Rujukan siap salin, mis. "Pedoman Tata Naskah Dinas (v1), hlm. 3". */
export const citationText = (title: string, versionNo: number, pageNo: number) => `${title} (v${versionNo}), hlm. ${pageNo}`;
