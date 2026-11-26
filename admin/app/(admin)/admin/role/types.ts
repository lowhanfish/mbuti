import type { AvatarConfig } from "../../_components/agent/avatar-config";
import type { SearchHit } from "../pengetahuan/types";

export type AgentStatus = "draft" | "active" | "paused";
export type OutputFormat = "text" | "template" | "table" | "json";
export type KnowledgeScope = "own" | "unit" | "organization";
export type ModelProfile = "fast" | "balanced" | "thorough";
export type InputFieldType = "short_text" | "long_text" | "number" | "date" | "choice";

/** Isian yang diminta role saat diberi tugas. */
export interface InputField {
  key: string;
  label: string;
  type: InputFieldType;
  required: boolean;
  options?: string[];
}

export interface CreateInterface {
  name: string;
  title: string;
  unit_id: string | null;
  goal: string;
  status: AgentStatus;
}

export interface UpdateInterface extends CreateInterface {
  instructions: string;
  input_spec: InputField[];
  output_format: OutputFormat;
  output_template: string;
  acceptance_criteria: string[];
  knowledge_scope: KnowledgeScope;
  model_profile: ModelProfile;
  owner_member_id: string | null;
  avatar: AvatarConfig;
}

export interface ResponseInterface extends UpdateInterface {
  id: string;
  unit_name: string | null;
  unit_color: string | null;
  owner_name: string | null;
  document_count: number;
  relation_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<AgentStatus, number>;
}

export interface TrialRequest {
  brief: string;
  inputs: Record<string, string>;
}

export interface TrialResult {
  simulated: boolean;
  status: "done" | "need_info" | "not_in_documents";
  output: string;
  notes: string;
  prompt_preview: string;
  missing_inputs: string[];
  /** Potongan dokumen yang dipakai sebagai dasar (kosong bila tidak ada) */
  citations: SearchHit[];
  /** Biaya dalam rupiah; 0 bila model tidak dipanggil */
  cost: number;
  /** Kosong bila model tidak dipanggil */
  model: string;
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  draft: "Draf",
  active: "Aktif",
  paused: "Dijeda",
};

export const OUTPUT_FORMAT_LABEL: Record<OutputFormat, string> = {
  text: "Teks bebas",
  template: "Mengikuti templat",
  table: "Tabel",
  json: "Data terstruktur (JSON)",
};

export const KNOWLEDGE_SCOPE_LABEL: Record<KnowledgeScope, { label: string; hint: string }> = {
  own: { label: "Dokumen role ini", hint: "Paling ketat: dokumen role ini dan dokumen seluruh organisasi." },
  unit: { label: "Dokumen satu unit", hint: "Ditambah dokumen unit dan role lain di unit yang sama." },
  organization: { label: "Semua dokumen", hint: "Paling luas, termasuk milik unit dan role lain." },
};

export const MODEL_PROFILE_LABEL: Record<ModelProfile, { label: string; hint: string }> = {
  fast: { label: "Cepat", hint: "Hemat, untuk langkah ringan." },
  balanced: { label: "Seimbang", hint: "Bawaan untuk kerja sehari-hari." },
  thorough: { label: "Teliti", hint: "Untuk pemeriksa dan dokumen panjang." },
};

export const INPUT_TYPE_LABEL: Record<InputFieldType, string> = {
  short_text: "Teks singkat",
  long_text: "Teks panjang",
  number: "Angka",
  date: "Tanggal",
  choice: "Pilihan",
};
