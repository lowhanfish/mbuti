export type DocumentScope = "organization" | "unit" | "agent";
export type DocumentType = "sop" | "manual" | "pedoman" | "templat" | "regulasi" | "lainnya";
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
  created_at: string;
}

export interface DocumentSection {
  page_no: number;
  heading: string;
  text: string;
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
  created_at: string;
  updated_at: string;
}

export interface DetailInterface extends ResponseInterface {
  versions: DocumentVersion[];
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
}

/** Satu potongan hasil pencarian beserta rujukannya. */
export interface SearchHit {
  document_id: string;
  document_title: string;
  version_no: number;
  page_no: number;
  heading: string;
  snippet: string;
  score: number;
}

export const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  sop: "SOP",
  manual: "Manual book",
  pedoman: "Pedoman",
  templat: "Templat",
  regulasi: "Regulasi",
  lainnya: "Lainnya",
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
};

export const ACCEPT_ATTR = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Rujukan siap salin, mis. "Pedoman Tata Naskah Dinas (v1), hlm. 3". */
export const citationText = (title: string, versionNo: number, pageNo: number) => `${title} (v${versionNo}), hlm. ${pageNo}`;
