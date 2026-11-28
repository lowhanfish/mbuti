/**
 * Pembentukan role (fase E1a): bahan, analisis AI, kartu keterampilan, tanya jawab, Final, dan versi role.
 */
import type { ComposeMode, InputField, KnowledgeScope, ModelProfile, OutputFormat } from "./types";
import type { IngestionStatus } from "../pengetahuan/types";

export type RevisionStatus = "draft" | "analyzing" | "questioning" | "ready" | "final" | "superseded" | "discarded";
export type RevisionSource = "formation" | "manual" | "restore";
/** `upcoming` = alat direncanakan di tahap E3–E5. */
export type ToolSupport = "supported" | "upcoming" | "substitute" | "unsupported";
export type FindingKind = "unclear" | "conflict" | "missing_tool" | "missing_material";
export type MessageAuthor = "agent" | "member";
export type MessageKind = "question" | "answer" | "objection" | "note";

/** Alat yang disebut pembuat role, setelah dipetakan ke katalog. */
export interface ToolRef {
  /** Kunci katalog; null bila tidak ada padanannya */
  key: string | null;
  /** Nama yang ditulis pembuat role, mis. "Ms Word" */
  requested: string;
  /** Nama di katalog, atau sama dengan `requested` bila tidak ada padanan */
  name: string;
  support: ToolSupport;
  note: string;
}

export interface SkillStep {
  text: string;
  /** Langkah ini menunggu persetujuan manusia */
  approval: boolean;
}

export interface Skill {
  key: string;
  name: string;
  description: string;
  steps: SkillStep[];
  inputs: string[];
  outputs: string[];
  tools: ToolRef[];
  /** Status terlemah di antara alat-alatnya */
  support: ToolSupport;
  substitute_note: string;
}

export interface CardFinding {
  id: string;
  kind: FindingKind;
  text: string;
  /** Rujukan ke uraian jabatan, mis. "Uraian jabatan, hlm. 2"; kosong bila tidak ada */
  ref: string;
}

export interface SkillCard {
  summary: string;
  goal: string;
  skills: Skill[];
  findings: CardFinding[];
}

export interface FormationMaterials {
  description: string;
  tools: string[];
  /** Orang yang diwakili role, ditulis bebas */
  represented: string;
  owner_member_id: string | null;
}

/** Isian kerja role yang disalin ke role saat Final. */
export interface RevisionSnapshot {
  goal: string;
  instructions: string;
  input_spec: InputField[];
  output_format: OutputFormat;
  output_template: string;
  acceptance_criteria: string[];
  knowledge_scope: KnowledgeScope;
  model_profile: ModelProfile;
  web_search: boolean;
  compose_mode: ComposeMode;
}

export interface FormationMessage {
  id: string;
  round_no: number;
  author: MessageAuthor;
  kind: MessageKind;
  /** Untuk jawaban: pertanyaan yang dijawab. Untuk pertanyaan: id pertanyaan itu sendiri */
  question_id: string | null;
  required: boolean;
  text: string;
  skipped: boolean;
  author_name: string;
  created_at: string;
}

/** Uraian jabatan yang diunggah sebagai bahan (dokumen berjenis `uraian_jabatan`). */
export interface MaterialDocument {
  id: string;
  title: string;
  file_name: string;
  status: IngestionStatus;
  progress: number;
  page_count: number;
}

export interface FormationInterface {
  id: string;
  agent_id: string;
  version_no: number;
  status: RevisionStatus;
  source: RevisionSource;
  /** Analisis atau putaran tanya jawab sedang berjalan di latar */
  processing: boolean;
  /** Pengguna yang sedang masuk boleh membentuk role ini (admin ke atas atau penanggung jawabnya) */
  can_edit: boolean;
  materials: FormationMaterials;
  material_documents: MaterialDocument[];
  card: SkillCard | null;
  /** Rancangan isian kerja; terisi setelah analisis */
  snapshot: RevisionSnapshot | null;
  round_no: number;
  messages: FormationMessage[];
  /** Pertanyaan wajib yang belum dijawab atau dilewati */
  open_required: number;
  /** Bagian kartu yang berubah pada putaran terakhir: "summary", "goal", "findings", atau kunci keterampilan */
  changed: string[];
  /** Role menyatakan sudah jelas */
  agent_satisfied: boolean;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersionInterface {
  id: string;
  version_no: number;
  status: RevisionStatus;
  source: RevisionSource;
  change_note: string;
  finalized_at: string | null;
  finalized_by_name: string | null;
  /** Versi yang sedang dipakai role bekerja */
  is_active: boolean;
  skill_count: number;
  question_count: number;
}

export interface VersionDetailInterface extends VersionInterface {
  snapshot: RevisionSnapshot;
  card: SkillCard | null;
}

export interface StartRequest {
  /** Kosong = dari versi aktif */
  from_version_id?: string;
}

export interface MaterialsRequest {
  description: string;
  tools: string[];
  represented: string;
  owner_member_id: string | null;
}

export interface AnswerRequest {
  answers: Array<{ question_id: string; text: string; skipped: boolean }>;
  note: string;
  /** Pembuat memilih "Cukup, ke Final" */
  finish: boolean;
}

export interface FinalRequest {
  change_note: string;
  status_after: "active" | "paused";
  /** Wajib bila masih ada pertanyaan wajib terbuka */
  override_reason: string;
}

export interface CardUpdateRequest {
  summary: string;
  goal: string;
  skills: Skill[];
}

export type ToolGroup = "dokumen" | "data" | "media" | "pembacaan" | "browser" | "pencarian" | "integrasi";

export interface ToolCatalogItem {
  key: string;
  name: string;
  group: ToolGroup;
  support: "supported" | "upcoming";
  /** Tahap yang menghadirkannya, mis. "E3" */
  stage: string;
  description: string;
  software: string;
}

export interface ToolRequestInterface {
  id: string;
  agent_id: string;
  agent_name: string;
  skill_name: string;
  requested: string;
  status: "open" | "planned" | "done" | "declined";
  created_at: string;
}

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  draft: "Menyiapkan bahan",
  analyzing: "Sedang dianalisis",
  questioning: "Tanya jawab",
  ready: "Siap Final",
  final: "Final",
  superseded: "Versi lama",
  discarded: "Dibuang",
};

export const REVISION_SOURCE_LABEL: Record<RevisionSource, string> = {
  formation: "Pembentukan",
  manual: "Isian manual",
  restore: "Pulihkan",
};

export const TOOL_SUPPORT_LABEL: Record<ToolSupport, { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
  supported: { label: "Tersedia", variant: "success" },
  upcoming: { label: "Segera", variant: "info" },
  substitute: { label: "Pengganti", variant: "warning" },
  unsupported: { label: "Belum didukung", variant: "danger" },
};

export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  unclear: "Kabur",
  conflict: "Bertentangan",
  missing_tool: "Alat kurang",
  missing_material: "Bahan kurang",
};

export const TOOL_GROUP_LABEL: Record<ToolGroup, string> = {
  dokumen: "Dokumen",
  data: "Data",
  media: "Media",
  pembacaan: "Pembacaan",
  browser: "Browser",
  pencarian: "Pencarian",
  integrasi: "Integrasi",
};

/** Revisi yang masih disusun (belum Final, belum dibuang). */
export const isOpenRevision = (status: RevisionStatus) => ["draft", "analyzing", "questioning", "ready"].includes(status);
