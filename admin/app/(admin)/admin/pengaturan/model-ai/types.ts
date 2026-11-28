import type { ModelProfile } from "../../role/types";

/** Tiga profil yang dipakai role, ditambah model cadangan. */
export type ModelSlot = ModelProfile | "fallback";
export type ApiKeyStatus = "active" | "cooling" | "invalid" | "not_set";

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
  /** Perkiraan biaya satu langkah kerja dalam rupiah */
  estimated_step_cost: number;
}

export interface ModelProfileSetting {
  slot: ModelSlot;
  model: string;
  /** Nama variabel di server/.env yang menjadi nilai bawaan */
  env_name: string;
  /** Jumlah role yang memakai profil ini (cadangan selalu 0) */
  agent_count: number;
}

/** Status kunci API. Nilai kunci tidak pernah dikirim ke peramban. */
export interface ApiKeyInfo {
  env_name: string;
  status: ApiKeyStatus;
  requests_today: number;
  last_used_at: string | null;
  /** Terisi bila status `cooling` (kena batas permintaan) */
  cooldown_until: string | null;
}

export interface ResponseInterface {
  provider: "gemini";
  profiles: ModelProfileSetting[];
  available_models: ModelOption[];
  /** Hanya terisi untuk pemilik */
  api_keys: ApiKeyInfo[];
  embedding: { model: string; dimension: number };
  /** Pemakaian model hari ini per jenis, untuk memantau kuota (E1) */
  usage_today: UsageToday[];
  updated_at: string;
}

export type UsagePurpose = "task" | "trial" | "formation" | "vision_ingest" | "web_search" | "schedule_parse";

export interface UsageToday {
  purpose: UsagePurpose;
  calls: number;
  /** Rupiah */
  cost: number;
}

export const USAGE_PURPOSE_LABEL: Record<UsagePurpose, string> = {
  task: "Langkah tugas",
  trial: "Uji coba role",
  formation: "Pembentukan role",
  vision_ingest: "Gambar halaman (embedding)",
  web_search: "Pencarian internet",
  schedule_parse: "Memahami jadwal",
};

export interface UpdateInterface {
  models: Record<ModelSlot, string>;
}

export const SLOT_LABEL: Record<ModelSlot, { label: string; hint: string; icon: string }> = {
  fast: { label: "Cepat", hint: "Menilai kondisi relasi, merangkum, dan langkah ringan.", icon: "sparkles" },
  balanced: { label: "Seimbang", hint: "Kerja role sehari-hari.", icon: "agent" },
  thorough: { label: "Teliti", hint: "Pemeriksa dan dokumen panjang.", icon: "approval" },
  fallback: { label: "Cadangan", hint: "Dipakai saat model utama kena batas kuota atau galat sementara.", icon: "shield" },
};

export const API_KEY_STATUS: Record<ApiKeyStatus, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Aktif", variant: "success" },
  cooling: { label: "Diistirahatkan (batas 429)", variant: "warning" },
  invalid: { label: "Ditolak Google", variant: "danger" },
  not_set: { label: "Belum diisi", variant: "neutral" },
};
