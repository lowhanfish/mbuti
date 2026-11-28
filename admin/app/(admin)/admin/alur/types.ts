/** Alur aplikasi luar: belajar, memutar ulang, dan bukti (E4b, kontrak API bagian 22). */
export type FlowStatus = "learning" | "review" | "approved" | "needs_repair" | "failed";
export type RunMode = "learn" | "replay" | "repair";
export type RunStatus = "queued" | "running" | "waiting_approval" | "waiting_otp" | "succeeded" | "failed" | "stopped" | "needs_repair";
export type StepAction = "open" | "login" | "fill" | "select" | "check" | "click" | "read";
export type StepRisk = "none" | "submit" | "delete";

export interface FlowInput {
  key: string;
  label: string;
  /** Nilai contoh yang dipakai saat belajar */
  sample: string;
}

export interface FlowStep {
  no: number;
  action: StepAction;
  description: string;
  /** Asal nilai yang diisikan, mis. "Isian: Uraian" atau "Password (brankas)"; "" bila tidak mengisi */
  value_label: string;
  risk: StepRisk;
  screenshot_url: string | null;
}

export interface RunSummary {
  id: string;
  mode: RunMode;
  status: RunStatus;
  /** Alasan berhenti atau keterangan hasil */
  message: string;
  flow_version: number;
  created_by_name: string;
  created_at: string;
  finished_at: string | null;
}

export interface FlowAccess {
  /** Mengajari, menyetujui, menjalankan, dan menghapus: penanggung jawab role, pemilik, atau admin */
  can_manage: boolean;
  /** Membebaskan persetujuan kirim: hanya penanggung jawab role dengan verifikasi dua langkah */
  can_trust: boolean;
}

export interface FlowListItem {
  id: string;
  name: string;
  account_id: string | null;
  account_name: string;
  status: FlowStatus;
  version: number;
  steps_count: number;
  trusted_submit: boolean;
  successful_runs: number;
  last_run: RunSummary | null;
  updated_at: string;
}

export interface VaultAccountOption {
  id: string;
  name: string;
  locked: boolean;
}

export interface FlowListResponse {
  flows: FlowListItem[];
  accounts: VaultAccountOption[];
  can_manage: boolean;
}

export interface FlowDetail extends Omit<FlowListItem, "steps_count" | "last_run"> {
  role_id: string;
  role_name: string;
  goal: string;
  inputs: FlowInput[];
  steps: FlowStep[];
  /** Penjelasan saat gagal dipelajari atau perlu diperbaiki */
  note: string;
  approved_at: string | null;
  approved_by_name: string | null;
  /** Putaran yang belum selesai, bila ada */
  active_run_id: string | null;
  access: FlowAccess;
  runs: RunSummary[];
  created_at: string;
}

export interface NamedValue {
  label: string;
  value: string;
}

export interface RunEvent {
  no: number;
  step_no: number | null;
  message: string;
  status: "done" | "waiting" | "blocked" | "failed";
  screenshot_url: string | null;
  created_at: string;
}

export interface RunPending {
  kind: "approval" | "otp";
  question: string;
  values: NamedValue[];
  screenshot_url: string | null;
  /** Batas waktu memasukkan kode OTP */
  expires_at: string | null;
}

export interface RunDetail extends RunSummary {
  flow_id: string;
  flow_name: string;
  role_id: string;
  role_name: string;
  inputs: NamedValue[];
  events: RunEvent[];
  /** Data yang dibaca dari halaman */
  outputs: NamedValue[];
  pending: RunPending | null;
  can_decide: boolean;
}

export interface LearnRequest {
  account_id: string;
  name: string;
  goal: string;
  inputs: FlowInput[];
}

export const MAX_FLOW_INPUTS = 10;
/** Putaran berhasil sebelum kirim boleh dibebaskan dari persetujuan */
export const TRUST_AFTER_RUNS = 3;

export const FLOW_STATUS: Record<FlowStatus, { label: string; variant: "success" | "warning" | "danger" | "info" }> = {
  learning: { label: "Sedang dipelajari", variant: "info" },
  review: { label: "Menunggu diperiksa", variant: "warning" },
  approved: { label: "Siap dipakai", variant: "success" },
  needs_repair: { label: "Perlu diperbaiki", variant: "danger" },
  failed: { label: "Gagal dipelajari", variant: "danger" },
};

export const RUN_STATUS: Record<RunStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  queued: { label: "Antre", variant: "neutral" },
  running: { label: "Berjalan", variant: "info" },
  waiting_approval: { label: "Menunggu persetujuan", variant: "warning" },
  waiting_otp: { label: "Menunggu kode OTP", variant: "warning" },
  succeeded: { label: "Berhasil", variant: "success" },
  failed: { label: "Gagal", variant: "danger" },
  stopped: { label: "Dihentikan", variant: "neutral" },
  needs_repair: { label: "Tampilan berubah", variant: "danger" },
};

export const RUN_MODE_LABEL: Record<RunMode, string> = { learn: "Belajar", replay: "Putaran", repair: "Perbaikan" };
export const RISK_LABEL: Record<Exclude<StepRisk, "none">, string> = { submit: "Mengirim atau menyimpan", delete: "Menghapus" };

export const isActiveRun = (status: RunStatus) => ["queued", "running", "waiting_approval", "waiting_otp"].includes(status);
