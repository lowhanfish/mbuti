import type { NamedValue, RunStatus } from "../alur/types";
import type { LetterSource } from "../pengaturan/persuratan/types";
import type { AvatarConfig } from "../../_components/agent/avatar-config";
import type { SearchHit, WebSource } from "../pengetahuan/types";
import type { RelationType } from "../relasi/types";
import type { ComposedItem, ComposeMode } from "../role/types";

export type TaskStatus = "queued" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled" | "stopped_budget";
export type TaskPriority = "low" | "normal" | "high";
export type StepKind = "work" | "review" | "consult";
export type StepStatus = "queued" | "running" | "done" | "revise_requested" | "failed" | "skipped";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "revise";
export type ApprovalReason = "escalate" | "requires_approval" | "max_revisions" | "composed" | "flow";
export type EventType =
  | "created"
  | "step_started"
  | "step_done"
  | "review_revise"
  | "review_approved"
  | "relation_skipped"
  | "approval_requested"
  | "approval_decided"
  | "flow_started"
  | "flow_waiting"
  | "flow_done"
  | "completed"
  | "failed"
  | "cancelled"
  | "stopped_budget";

export interface CreateInterface {
  title: string;
  brief: string;
  entry_agent_id: string;
  inputs: Record<string, string>;
  priority: TaskPriority;
  due_at: string | null;
  /** Batas biaya tugas dalam rupiah */
  budget_limit: number;
  /** Lampiran yang sudah diunggah lewat POST /tugas/lampiran (E1c); maks 10 */
  attachment_ids?: string[];
  /** `role` = ikut pengaturan role; `off` = tanpa internet untuk tugas ini (E1d) */
  web_search?: WebSearchMode;
  /** `role` = ikut mode role; selain itu mengganti mode semua role di tugas ini (E3c) */
  compose_mode?: ComposeChoice;
  /** Alur aplikasi milik role pertama yang dijalankan sesudah pekerjaan selesai (E4c) */
  flow_id?: string | null;
  /** Isian alur yang ditentukan sekarang; yang kosong diisi role dari bahan tugas */
  flow_values?: Record<string, string>;
}

/** `waiting`: pekerjaan belum selesai; `prepare`: isian sedang disusun; `running`: aplikasi dibuka */
export type TaskFlowStage = "waiting" | "prepare" | "running" | "done";

export interface TaskFlow {
  flow_id: string;
  name: string;
  stage: TaskFlowStage;
  run_id: string | null;
  run_status: RunStatus | null;
  run_message: string;
  /** Hanya untuk yang boleh mengelola alur; selain itu kosong */
  values: NamedValue[];
  outputs: NamedValue[];
}

export interface ApprovalFlow {
  run_id: string;
  /** Yang akan dikirim ke aplikasi */
  values: NamedValue[];
  screenshot_url: string | null;
}

export type ComposeChoice = "role" | ComposeMode;

export type WebSearchMode = "role" | "off";

/** Ringkasan satu lembar data pada lampiran Excel atau CSV (E3b) */
export interface TableSummary {
  name: string;
  columns: string[];
  row_count: number;
}

/** Lampiran tugas: gambar (PNG, JPG, WEBP), PDF, atau data (XLSX, CSV). */
export interface TaskAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  /** Ukuran gambar asli (piksel); 0 untuk PDF */
  width: number;
  height: number;
  /** 1 untuk gambar; jumlah halaman yang dibaca untuk PDF (maks 20) */
  page_count: number;
  /** Gambar per halaman (gambar = satu). Backend: path API; data contoh: data URL */
  pages: string[];
  /** Lembar data yang terbaca; null untuk gambar dan PDF */
  table: TableSummary[] | null;
  /** Metadata foto, bila ada */
  exif: { taken_at: string | null; location: string | null } | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export type FindingSeverity = "info" | "perlu_perbaikan" | "penting";

/** Temuan atas gambar: kotak bernomor di atas lampiran atau halaman dokumen. */
export interface Finding {
  no: number;
  title: string;
  description: string;
  severity: FindingSeverity;
  target:
    | { kind: "attachment"; attachment_id: string; page_no: number }
    | { kind: "document"; document_id: string; version_id: string; page_no: number };
  /** Kotak [y0, x0, y1, x1] dalam skala 0–1000 terhadap gambar; null bila temuan tentang gambar secara umum */
  box: [number, number, number, number] | null;
  /** Nomor rujukan (1-based) pada `citations` langkah itu; null bila tidak merujuk pedoman */
  source_index: number | null;
  recommendation: string;
  /** Butir kriteria diterima yang dinilai temuan ini, bila ada */
  criterion: string | null;
}

export interface AgentRef {
  id: string;
  name: string;
  title: string;
  avatar: AvatarConfig;
  unit_color: string | null;
}

export interface StepInterface {
  id: string;
  agent: AgentRef;
  kind: StepKind;
  via_relation_type: RelationType | null;
  attempt_no: number;
  status: StepStatus;
  input_notes: string;
  output: string;
  citations: SearchHit[];
  /** Temuan bergambar (E1c); kosong bila langkah tidak membaca gambar */
  findings: Finding[];
  /** Sumber internet yang dipakai (E1d); kosong bila tidak mencari */
  web_sources: WebSource[];
  verdict: "approved" | "revise" | null;
  /** Mode penyusunan yang dipakai (E3c); null sebelum dikerjakan */
  compose_mode: ComposeMode | null;
  /** Bagian yang disusun sendiri oleh role; kosong bila seluruhnya dari data */
  composed: ComposedItem[];
  /** Model yang dipakai; kosong selama langkah belum selesai */
  model: string;
  cost: number;
  tokens: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface ApprovalInterface {
  id: string;
  task_id: string;
  task_title: string;
  step_id: string | null;
  reason: ApprovalReason;
  question: string;
  requested_from_id: string;
  requested_from_name: string;
  status: ApprovalStatus;
  comment: string;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
  /** Hasil terakhir yang diminta untuk diputuskan */
  last_output: string;
  last_agent: AgentRef | null;
  /** Persetujuan alur aplikasi (E4c); null untuk persetujuan lain */
  flow: ApprovalFlow | null;
}

export interface EventInterface {
  id: string;
  type: EventType;
  message: string;
  step_id: string | null;
  created_at: string;
}

export interface ResponseInterface {
  id: string;
  title: string;
  brief: string;
  entry_agent: AgentRef;
  /** Role yang sudah atau sedang terlibat, urut kemunculan */
  participants: AgentRef[];
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  budget_limit: number;
  cost_used: number;
  step_count: number;
  steps_done: number;
  pending_approval_count: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface DetailInterface extends ResponseInterface {
  inputs: Array<{ label: string; value: string }>;
  attachments: TaskAttachment[];
  web_search: WebSearchMode;
  compose_mode: ComposeChoice;
  flow: TaskFlow | null;
  steps: StepInterface[];
  approvals: ApprovalInterface[];
  events: EventInterface[];
}

/** Pemeriksaan hasil terhadap ketentuan rujukan */
export interface DocumentCheck {
  text: string;
  passed: boolean;
  /** Letak ketentuannya, mis. "Aturan, hlm. 14"; boleh kosong */
  ref: string;
}

/** Bagian yang sama pada semua berkas hasil */
interface ResultBase {
  id: string;
  title: string;
  version: number;
  /** Benar selama format, nomor, atau berkasnya masih dikerjakan server */
  processing: boolean;
  checks: DocumentCheck[];
  /** Bagian buatan role pada langkah yang menghasilkan berkas ini (E3c) */
  composed: ComposedItem[];
  created_at: string;
  updated_at: string;
}

/** Surat (E3a); dibuat program dari susunan yang ditulis role */
export interface LetterResult extends ResultBase {
  kind: "letter";
  letter_type: string;
  format_id: string | null;
  /** Diberikan saat surat disetujui; null sebelum itu */
  number: string | null;
  /** Benar bila pengguna ini boleh memberi nomor sekarang */
  can_number: boolean;
  /** Gambar tiap halaman PDF */
  pages: string[];
  docx_url: string | null;
  pdf_url: string | null;
  sources: LetterSource[];
  format_checked: boolean;
  /** Benar bila formatnya bersumber dari aturan atau contoh resmi organisasi */
  official: boolean;
}

export type CellFormat = "text" | "number" | "currency" | "percent" | "date";

export interface SheetColumn {
  header: string;
  format: CellFormat;
  /** Rumus dalam kata, mis. "Realisasi ÷ Pagu"; kosong untuk kolom data */
  formula: string;
}

export interface SheetRow {
  /** flag = ditandai menurut aturan penanda */
  style: "normal" | "flag" | "subtotal" | "total";
  /** Nilai siap tampil, sudah dihitung dan diformat */
  cells: string[];
}

export interface SheetPreview {
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Jumlah baris data seluruhnya; pratinjau bisa lebih sedikit */
  row_count: number;
  flagged: number;
  /** Penjelasan penanda, mis. "Persentase di bawah 50%"; kosong bila tidak ada */
  flag_rule: string;
}

/** Spreadsheet (E3b); barisnya diisi dan dihitung program */
export interface SheetResult extends ResultBase {
  kind: "sheet";
  xlsx_url: string | null;
  /** text = angkanya berasal dari arahan atau dokumen, bukan berkas data */
  origin: "attachment" | "text";
  /** Nama berkas data yang dipakai */
  source_files: string[];
  sheets: SheetPreview[];
}

/** Laporan, notulen, atau proposal (E3c); dibuat program dari susunan role, tanpa nomor register */
export interface ReportResult extends ResultBase {
  kind: "report";
  report_type: string;
  /** Gambar tiap halaman PDF */
  pages: string[];
  docx_url: string | null;
  pdf_url: string | null;
}

export type ResultDocument = LetterResult | SheetResult | ReportResult;

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<TaskStatus, number>;
}

export interface ApprovalListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ApprovalInterface[];
  /** Jumlah yang menunggu keputusan pengguna ini, apa pun saringannya */
  pending_count: number;
}

export interface DecideInterface {
  decision: "approved" | "rejected" | "revise";
  comment: string;
}

export const TASK_STATUS: Record<TaskStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" | "accent" | "dark"; live: boolean }> = {
  queued: { label: "Antre", variant: "neutral", live: true },
  running: { label: "Berjalan", variant: "info", live: true },
  waiting_approval: { label: "Menunggu persetujuan", variant: "accent", live: false },
  completed: { label: "Selesai", variant: "success", live: false },
  failed: { label: "Gagal / ditolak", variant: "danger", live: false },
  cancelled: { label: "Dihentikan", variant: "neutral", live: false },
  stopped_budget: { label: "Batas biaya", variant: "danger", live: false },
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Rendah", normal: "Normal", high: "Tinggi" };

export const STEP_KIND_LABEL: Record<StepKind, string> = { work: "Mengerjakan", review: "Memeriksa", consult: "Konsultasi" };

export const APPROVAL_REASON_LABEL: Record<ApprovalReason, string> = {
  escalate: "Eskalasi",
  requires_approval: "Persetujuan sebelum lanjut",
  max_revisions: "Batas revisi habis",
  composed: "Ada isi buatan role",
  flow: "Kirim ke aplikasi",
};

export const isActiveTask = (status: TaskStatus) => status === "queued" || status === "running";

export const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
