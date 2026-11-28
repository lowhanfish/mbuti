import type { ComposeChoice, AgentRef, TaskPriority, TaskStatus, WebSearchMode } from "../types";

export type Frequency = "daily" | "workdays" | "weekly" | "monthly" | "quarterly" | "dates";
export type TimeMode = "fixed" | "shift_start" | "shift_end";
export type OnHoliday = "skip" | "previous" | "next";
export type OnLeave = "run" | "skip";
export type OnFail = "backfill" | "skip";
export type ScheduleStatus = "draft" | "active" | "paused" | "ended";
export type RunStatus =
  | "scheduled"
  | "created"
  | "skipped_holiday"
  | "skipped_leave"
  | "missed"
  | "failed"
  | "retrying"
  | "backfill"
  | "skipped"
  | "stopped_budget";

export type ScheduleRule = {
  frequency: Frequency;
  /** Mingguan: 1 = Senin … 7 = Minggu */
  weekdays: number[];
  /** Bulanan dan triwulan: tanggal 1–31, atau 0 = hari kerja terakhir */
  month_day: number;
  /** Tanggal tertentu (YYYY-MM-DD) */
  dates: string[];
  time_mode: TimeMode;
  /** Jam tetap "HH:MM" */
  time: string;
  shift_id: string | null;
  /** Menit sebelum (negatif) atau sesudah awal/akhir shift */
  offset_minutes: number;
  /** Rentang sebar dalam menit; 0 = tepat pada jamnya */
  spread_minutes: number;
  start_date: string;
  end_date: string | null;
  on_holiday: OnHoliday;
  on_leave: OnLeave;
  on_fail: OnFail;
};

export type Occurrence = {
  date: string;
  time: string;
  status: "run" | "skipped_holiday" | "skipped_leave";
  /** Tanggal asal bila putaran digeser karena libur */
  moved_from: string | null;
  reason: string;
};

export type ScheduleRun = {
  id: string;
  planned_for: string;
  status: RunStatus;
  attempt: number;
  reason: string;
  task_id: string | null;
  task_status: TaskStatus | null;
  attachment_count: number;
};

export type ScheduleTemplate = {
  title: string;
  brief: string;
  entry_agent_id: string;
  inputs: Record<string, string>;
  priority: TaskPriority;
  budget_limit: number;
  web_search: WebSearchMode;
  compose_mode: ComposeChoice;
  /** Alur aplikasi yang dijalankan tiap putaran (E4c) */
  flow_id: string | null;
  flow_values: Record<string, string>;
};

export type CreateScheduleRequest = ScheduleTemplate & {
  rule: ScheduleRule;
  source_text: string;
  status: Extract<ScheduleStatus, "draft" | "active">;
};

export type ScheduleItem = Omit<ScheduleTemplate, "entry_agent_id"> & {
  id: string;
  entry_agent: AgentRef;
  /** Kosong bila tanpa alur atau alurnya sudah dihapus */
  flow_name: string;
  rule: ScheduleRule;
  /** Jadwal dalam satu kalimat, disusun server */
  rule_text: string;
  source_text: string;
  status: ScheduleStatus;
  next_run_at: string | null;
  last_run: ScheduleRun | null;
  created_by_name: string | null;
  can_manage: boolean;
  created_at: string;
  updated_at: string;
};

export type ScheduleDetail = ScheduleItem & { upcoming: Occurrence[]; runs: ScheduleRun[] };

export type PreviewResponse = { rule_text: string; occurrences: Occurrence[] };

export type ParseResponse = PreviewResponse & {
  rule: ScheduleRule;
  title: string;
  /** Hal yang tidak dipahami atau diasumsikan */
  notes: string[];
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Setiap hari",
  workdays: "Setiap hari kerja",
  weekly: "Mingguan",
  monthly: "Bulanan",
  quarterly: "Triwulan",
  dates: "Tanggal tertentu",
};

export const WEEKDAY_LABEL = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export const SCHEDULE_STATUS: Record<ScheduleStatus, { label: string; variant: "success" | "warning" | "neutral" | "dark" }> = {
  active: { label: "Aktif", variant: "success" },
  paused: { label: "Dijeda", variant: "warning" },
  draft: { label: "Draf", variant: "neutral" },
  ended: { label: "Berakhir", variant: "dark" },
};

export const RUN_STATUS: Record<RunStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" | "accent" }> = {
  scheduled: { label: "Dijadwalkan", variant: "neutral" },
  created: { label: "Tugas dibuat", variant: "success" },
  skipped_holiday: { label: "Dilewati: libur", variant: "neutral" },
  skipped_leave: { label: "Dilewati: pemilik cuti", variant: "neutral" },
  missed: { label: "Terlewat", variant: "warning" },
  failed: { label: "Gagal", variant: "danger" },
  retrying: { label: "Dicoba lagi", variant: "info" },
  backfill: { label: "Susulan", variant: "accent" },
  skipped: { label: "Dilewati", variant: "neutral" },
  stopped_budget: { label: "Berhenti: anggaran", variant: "danger" },
};

/** Putaran yang bisa diisi susulan */
export const CAN_BACKFILL: RunStatus[] = ["missed", "failed", "stopped_budget"];

export const emptyRule = (today: string): ScheduleRule => ({
  frequency: "workdays",
  weekdays: [1],
  month_day: 1,
  dates: [],
  time_mode: "fixed",
  time: "08:00",
  shift_id: null,
  offset_minutes: 0,
  spread_minutes: 0,
  start_date: today,
  end_date: null,
  on_holiday: "skip",
  on_leave: "run",
  on_fail: "backfill",
});

/** Tanggal lokal hari ini dalam bentuk YYYY-MM-DD */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "2026-12-01" → "Sel, 1 Des 2026" */
export const formatDay = (date: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date.slice(0, 10)}T00:00:00`));

export const formatDateTime = (iso: string) =>
  `${formatDay(iso.length > 10 ? localDate(iso) : iso)} · ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}`;

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
