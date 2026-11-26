/**
 * Pengaturan organisasi di mode data contoh: pilihan model, batas biaya, dan pemakaian bulan berjalan.
 */
import type { UpdateInterface as BudgetFields, MonthUsage } from "@/app/(admin)/admin/pengaturan/batas-biaya/types";
import type { ModelOption, ModelSlot } from "@/app/(admin)/admin/pengaturan/model-ai/types";
import type { MockDatabase } from "./seed";

export interface MockSettings extends BudgetFields {
  organization_id: string;
  models: Record<ModelSlot, string>;
  updated_at: string;
}

/** Daftar contoh. Daftar model sebenarnya dibaca dari akun Google pada fase backend. */
export const MODEL_CATALOG: ModelOption[] = [
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", hint: "Paling hemat dan cepat.", estimated_step_cost: 120 },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Generasi lama yang masih ringan.", estimated_step_cost: 260 },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "Seimbang antara mutu dan biaya.", estimated_step_cost: 380 },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (pratinjau)", hint: "Penalaran paling teliti, paling mahal.", estimated_step_cost: 820 },
];

export const MODEL_ENV: Record<ModelSlot, string> = {
  fast: "LLM_MODEL_FAST",
  balanced: "LLM_MODEL_BALANCED",
  thorough: "LLM_MODEL_THOROUGH",
  fallback: "LLM_FALLBACK_MODEL",
};

export const defaultSettings = (organization_id: string, updated_at: string): MockSettings => ({
  organization_id,
  models: {
    fast: "gemini-3.5-flash-lite",
    balanced: "gemini-3.8-flash",
    thorough: "gemini-3.1-pro-preview",
    fallback: "gemini-3.5-flash-lite",
  },
  monthly_budget: 100_000,
  default_task_budget: 15_000,
  max_steps_per_task: 20,
  max_revisions: 3,
  updated_at,
});

export const settingsOf = (db: MockDatabase, orgId: string): MockSettings => {
  const found = db.settings.find((s) => s.organization_id === orgId);
  if (found) return found;
  const created = defaultSettings(orgId, new Date().toISOString());
  db.settings.push(created);
  return created;
};

export const modelOption = (modelId: string) => MODEL_CATALOG.find((m) => m.id === modelId) ?? MODEL_CATALOG[0];

const pad = (n: number) => String(n).padStart(2, "0");

export const dayKey = (at: number | string) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const monthKey = (at: number | string) => dayKey(at).slice(0, 7);

/** Langkah milik organisasi yang selesai pada bulan kalender dari waktu `at`. */
export const stepsInMonth = (db: MockDatabase, orgId: string, at: number) => {
  const month = monthKey(at);
  const taskIds = new Set(db.tasks.filter((t) => t.organization_id === orgId).map((t) => t.id));
  return db.task_steps.filter((s) => taskIds.has(s.task_id) && s.finished_at && monthKey(s.finished_at) === month);
};

export const monthUsage = (db: MockDatabase, orgId: string, at: number): MonthUsage => {
  const steps = stepsInMonth(db, orgId, at);
  const used = steps.reduce((sum, s) => sum + s.cost, 0);
  return {
    month: monthKey(at),
    used,
    remaining: Math.max(0, settingsOf(db, orgId).monthly_budget - used),
    task_count: new Set(steps.map((s) => s.task_id)).size,
  };
};
