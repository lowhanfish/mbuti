import { LIMITS, type ResponseInterface as BudgetResponse } from "@/app/(admin)/admin/pengaturan/batas-biaya/types";
import type { ApiKeyInfo, ModelSlot, ResponseInterface as ModelResponse } from "@/app/(admin)/admin/pengaturan/model-ai/types";
import { formatRupiah } from "@/app/(admin)/admin/tugas/types";
import { isFailure, nowIso, requireManager, requireMember } from "../context";
import { fail, ok, type MockRoute } from "../router";
import type { MockDatabase, MockMembership } from "../seed";
import { MODEL_CATALOG, MODEL_ENV, monthUsage, settingsOf } from "../settings";

const SLOTS: ModelSlot[] = ["fast", "balanced", "thorough", "fallback"];

/** Status kunci contoh. Nilai kunci tidak ada di sini sama sekali. */
const sampleKeys = (now: number): ApiKeyInfo[] => {
  const iso = (offset: number) => new Date(now + offset).toISOString();
  return [
    { env_name: "GEMINI_API_KEY", status: "active", requests_today: 42, last_used_at: iso(-3 * 60_000), cooldown_until: null },
    { env_name: "GEMINI_API_KEY1", status: "cooling", requests_today: 118, last_used_at: iso(-60_000), cooldown_until: iso(4 * 60_000) },
    { env_name: "GEMINI_API_KEY2", status: "not_set", requests_today: 0, last_used_at: null, cooldown_until: null },
  ];
};

const toModels = (db: MockDatabase, self: MockMembership): ModelResponse => {
  const s = settingsOf(db, self.organization_id);
  const agents = db.agents.filter((a) => a.organization_id === self.organization_id);
  return {
    provider: "gemini",
    profiles: SLOTS.map((slot) => ({
      slot,
      model: s.models[slot],
      env_name: MODEL_ENV[slot],
      agent_count: agents.filter((a) => a.model_profile === slot).length,
    })),
    available_models: MODEL_CATALOG,
    // Kunci milik server, jadi statusnya hanya untuk pemilik
    api_keys: self.access_role === "owner" ? sampleKeys(Date.now()) : [],
    embedding: { model: "gemini-embedding-2", dimension: 768 },
    updated_at: s.updated_at,
  };
};

const toBudget = (db: MockDatabase, orgId: string): BudgetResponse => {
  const s = settingsOf(db, orgId);
  return {
    monthly_budget: s.monthly_budget,
    default_task_budget: s.default_task_budget,
    max_steps_per_task: s.max_steps_per_task,
    max_revisions: s.max_revisions,
    usage: monthUsage(db, orgId, Date.now()),
    updated_at: s.updated_at,
  };
};

const integerIn = (value: unknown, range: { min: number; max: number }) => {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isInteger(n) && n >= range.min && n <= range.max ? n : null;
};

const BASE = "/api/v1/admin/pengaturan";

export const pengaturanRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${BASE}/model-ai`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      return ok(toModels(ctx.db, self));
    },
  },
  {
    method: "PUT",
    path: `${BASE}/model-ai/update`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const models = ((ctx.body ?? {}) as { models?: Record<string, unknown> }).models ?? {};
      const next = {} as Record<ModelSlot, string>;
      for (const slot of SLOTS) {
        const id = String(models[slot] ?? "");
        if (!MODEL_CATALOG.some((m) => m.id === id)) return fail(422, "Pilih model yang tersedia untuk setiap profil.");
        next[slot] = id;
      }
      Object.assign(settingsOf(ctx.db, self.organization_id), { models: next, updated_at: nowIso() });
      return ok(toModels(ctx.db, self), "Model AI diperbarui.");
    },
  },
  {
    method: "GET",
    path: `${BASE}/batas-biaya`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      return ok(toBudget(ctx.db, self.organization_id));
    },
  },
  {
    method: "PUT",
    path: `${BASE}/batas-biaya/update`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const b = (ctx.body ?? {}) as Record<string, unknown>;
      const range = (r: { min: number; max: number }) => `antara ${formatRupiah(r.min)} dan ${formatRupiah(r.max)}`;
      const monthly = integerIn(b.monthly_budget, LIMITS.monthly_budget);
      if (monthly === null) return fail(422, `Batas bulanan ${range(LIMITS.monthly_budget)}.`);
      const perTask = integerIn(b.default_task_budget, LIMITS.task_budget);
      if (perTask === null) return fail(422, `Batas bawaan per tugas ${range(LIMITS.task_budget)}.`);
      if (perTask > monthly) return fail(422, "Batas bawaan per tugas tidak boleh melebihi batas bulanan.");
      const steps = integerIn(b.max_steps_per_task, LIMITS.max_steps_per_task);
      if (steps === null) return fail(422, `Batas langkah antara ${LIMITS.max_steps_per_task.min} dan ${LIMITS.max_steps_per_task.max}.`);
      const revisions = integerIn(b.max_revisions, LIMITS.max_revisions);
      if (revisions === null) return fail(422, `Batas revisi antara ${LIMITS.max_revisions.min} dan ${LIMITS.max_revisions.max}.`);

      Object.assign(settingsOf(ctx.db, self.organization_id), {
        monthly_budget: monthly,
        default_task_budget: perTask,
        max_steps_per_task: steps,
        max_revisions: revisions,
        updated_at: nowIso(),
      });
      return ok(toBudget(ctx.db, self.organization_id), "Batas biaya diperbarui.");
    },
  },
];
