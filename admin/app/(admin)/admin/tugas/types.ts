import type { AvatarConfig } from "../../_components/agent/avatar-config";
import type { SearchHit } from "../pengetahuan/types";
import type { RelationType } from "../relasi/types";

export type TaskStatus = "queued" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled" | "stopped_budget";
export type TaskPriority = "low" | "normal" | "high";
export type StepKind = "work" | "review" | "consult";
export type StepStatus = "queued" | "running" | "done" | "revise_requested" | "failed" | "skipped";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "revise";
export type ApprovalReason = "escalate" | "requires_approval" | "max_revisions";
export type EventType =
  | "created"
  | "step_started"
  | "step_done"
  | "review_revise"
  | "review_approved"
  | "relation_skipped"
  | "approval_requested"
  | "approval_decided"
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
  verdict: "approved" | "revise" | null;
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
  steps: StepInterface[];
  approvals: ApprovalInterface[];
  events: EventInterface[];
}

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
};

export const isActiveTask = (status: TaskStatus) => status === "queued" || status === "running";

export const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
