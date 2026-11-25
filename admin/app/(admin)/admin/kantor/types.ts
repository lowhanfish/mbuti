import type { AvatarConfig } from "../../_components/agent/avatar-config";
import type { RelationType } from "../relasi/types";
import type { AgentStatus } from "../role/types";

/** Apa yang sedang dilakukan role saat ini, diturunkan dari tugas yang berjalan. */
export type AgentActivity = "idle" | "working" | "reviewing" | "consulting" | "incoming" | "waiting" | "paused" | "draft";

export type OfficeAgent = {
  id: string;
  name: string;
  title: string;
  unit_id: string | null;
  status: AgentStatus;
  avatar: AvatarConfig;
  activity: AgentActivity;
  /** Judul tugas yang sedang dikerjakan atau ditunggu */
  task_id: string | null;
  task_title: string | null;
  tasks_today: number;
};

export type OfficeUnit = {
  id: string;
  name: string;
  code: string;
  color: string;
  parent_id: string | null;
  lead_name: string | null;
  member_count: number;
  document_count: number;
  active_task_count: number;
};

/** Pekerjaan yang sedang berpindah dari satu role ke role lain (digambar sebagai amplop). */
export type OfficeTransfer = {
  task_id: string;
  from_agent_id: string;
  to_agent_id: string;
  relation_type: RelationType | null;
};

export type OfficeState = {
  units: OfficeUnit[];
  agents: OfficeAgent[];
  transfers: OfficeTransfer[];
  generated_at: string;
};

export const ACTIVITY_LABEL: Record<AgentActivity, { label: string; color: string; symbol: string }> = {
  idle: { label: "Siap", color: "#10b981", symbol: "" },
  working: { label: "Bekerja", color: "#7c4dff", symbol: "…" },
  reviewing: { label: "Memeriksa", color: "#f59e0b", symbol: "?" },
  consulting: { label: "Konsultasi", color: "#14b8a6", symbol: "💬" },
  incoming: { label: "Menerima pekerjaan", color: "#0ea5e9", symbol: "✉" },
  waiting: { label: "Menunggu keputusan", color: "#ec4899", symbol: "!" },
  paused: { label: "Dijeda", color: "#94a3b8", symbol: "z" },
  draft: { label: "Draf", color: "#cbd5e1", symbol: "·" },
};
