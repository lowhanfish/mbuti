import type {
  AgentRef,
  ApprovalInterface,
  DetailInterface,
  ResponseInterface,
  TaskPriority,
  TaskStatus,
} from "@/app/(admin)/admin/tugas/types";
import { UNIT_COLORS } from "@/app/(admin)/admin/organisasi/unit/types";
import { isFailure, requireMember, text } from "../context";
import { cancelTask, createTask, decideApproval, type MockApproval, type MockTask } from "../engine";
import { fail, ok, type MockRoute } from "../router";
import type { MockDatabase, MockMembership } from "../seed";

const PRIORITIES: TaskPriority[] = ["low", "normal", "high"];

const agentRef = (db: MockDatabase, agentId: string): AgentRef => {
  const a = db.agents.find((x) => x.id === agentId);
  const unit = db.units.find((u) => u.id === a?.unit_id);
  return {
    id: agentId,
    name: a?.name ?? "(role dihapus)",
    title: a?.title ?? "",
    avatar: a?.avatar ?? { skin: "#eebd94", hair: "#1f1a24", hair_style: "short", shirt: "#64748b", pants: "#18122b", accessory: "none" },
    unit_color: unit ? UNIT_COLORS[unit.color].hex : null,
  };
};

const memberName = (db: MockDatabase, memberId: string | null) =>
  memberId ? db.users.find((u) => u.id === db.memberships.find((m) => m.id === memberId)?.user_id)?.full_name ?? null : null;

const toItem = (db: MockDatabase, t: MockTask): ResponseInterface => {
  const steps = db.task_steps.filter((s) => s.task_id === t.id);
  const participantIds = [...new Set([t.entry_agent_id, ...steps.map((s) => s.agent_id)])];
  return {
    id: t.id,
    title: t.title,
    brief: t.brief,
    entry_agent: agentRef(db, t.entry_agent_id),
    participants: participantIds.map((id) => agentRef(db, id)),
    status: t.status,
    priority: t.priority,
    due_at: t.due_at,
    budget_limit: t.budget_limit,
    cost_used: t.cost_used,
    step_count: steps.length,
    steps_done: steps.filter((s) => s.status === "done").length,
    pending_approval_count: db.approvals.filter((a) => a.task_id === t.id && a.status === "pending").length,
    created_by_name: memberName(db, t.created_by_member_id),
    created_at: t.created_at,
    updated_at: t.updated_at,
    completed_at: t.completed_at,
  };
};

const toApproval = (db: MockDatabase, a: MockApproval): ApprovalInterface => {
  const task = db.tasks.find((t) => t.id === a.task_id);
  const step = db.task_steps.find((s) => s.id === a.step_id);
  return {
    id: a.id,
    task_id: a.task_id,
    task_title: task?.title ?? "",
    step_id: a.step_id,
    reason: a.reason,
    question: a.question,
    requested_from_id: a.requested_from_member_id,
    requested_from_name: memberName(db, a.requested_from_member_id) ?? "",
    status: a.status,
    comment: a.comment,
    decided_by_name: memberName(db, a.decided_by_member_id),
    decided_at: a.decided_at,
    created_at: a.created_at,
    last_output: step?.output ?? "",
    last_agent: step ? agentRef(db, step.agent_id) : null,
  };
};

const toDetail = (db: MockDatabase, t: MockTask): DetailInterface => {
  const entry = db.agents.find((a) => a.id === t.entry_agent_id);
  return {
    ...toItem(db, t),
    inputs: Object.entries(t.inputs)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ label: entry?.input_spec.find((f) => f.key === k)?.label ?? k, value: v })),
    steps: db.task_steps
      .filter((s) => s.task_id === t.id)
      .map((s) => ({
        id: s.id,
        agent: agentRef(db, s.agent_id),
        kind: s.kind,
        via_relation_type: db.relations.find((r) => r.id === s.via_relation_id)?.relation_type ?? null,
        attempt_no: s.attempt_no,
        status: s.status,
        input_notes: s.input_notes,
        output: s.output,
        citations: s.citations,
        verdict: s.verdict,
        cost: s.cost,
        tokens: s.tokens,
        started_at: s.started_at,
        finished_at: s.finished_at,
      })),
    approvals: db.approvals.filter((a) => a.task_id === t.id).map((a) => toApproval(db, a)),
    events: db.task_events
      .filter((e) => e.task_id === t.id)
      .map(({ id, type, message, step_id, created_at }) => ({ id, type, message, step_id, created_at })),
  };
};

const canDecide = (self: MockMembership, a: MockApproval) =>
  self.access_role === "owner" || self.access_role === "admin" || a.requested_from_member_id === self.id;

const BASE = "/api/v1/admin/tugas";

export const tugasRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${BASE}/read`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const search = (ctx.query.get("search") ?? "").trim().toLowerCase();
      const status = ctx.query.get("status") ?? "";
      const agentId = ctx.query.get("agent_id") ?? "";
      const skip = Number(ctx.query.get("skip") ?? 0);
      const limit = Number(ctx.query.get("limit") ?? 50);

      const all = ctx.db.tasks.filter((t) => t.organization_id === self.organization_id).map((t) => toItem(ctx.db, t));
      const summary = { queued: 0, running: 0, waiting_approval: 0, completed: 0, failed: 0, cancelled: 0, stopped_budget: 0 } as Record<TaskStatus, number>;
      for (const t of all) summary[t.status] += 1;
      const groups: Record<string, TaskStatus[]> = {
        active: ["queued", "running"],
        waiting: ["waiting_approval"],
        done: ["completed"],
        stopped: ["failed", "cancelled", "stopped_budget"],
      };
      const filtered = all
        .filter((t) => !search || `${t.title} ${t.brief}`.toLowerCase().includes(search))
        .filter((t) => !status || (groups[status] ?? [status]).includes(t.status))
        .filter((t) => !agentId || t.participants.some((p) => p.id === agentId))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return {
        status: 200,
        body: { success: true, statusCode: 200, total: filtered.length, skip, limit, data: filtered.slice(skip, skip + limit), summary },
      };
    },
  },
  {
    method: "GET",
    path: `${BASE}/:id`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const t = ctx.db.tasks.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      return t ? ok(toDetail(ctx.db, t)) : fail(404, "Tugas tidak ditemukan.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/create`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      if (self.access_role === "viewer") return fail(403, "Pemantau tidak dapat membuat tugas.");
      const b = (ctx.body ?? {}) as Record<string, unknown>;
      const agent = ctx.db.agents.find((a) => a.id === b.entry_agent_id && a.organization_id === self.organization_id);
      if (!agent) return fail(422, "Pilih role yang akan mengerjakan.");
      if (agent.status !== "active") return fail(422, `${agent.name} sedang ${agent.status === "draft" ? "berstatus draf" : "dijeda"}. Aktifkan role terlebih dahulu.`);
      const title = text(b.title, 150);
      if (title.length < 5) return fail(422, "Judul tugas minimal 5 karakter.");
      const inputs: Record<string, string> = {};
      const raw = (b.inputs ?? {}) as Record<string, unknown>;
      for (const f of agent.input_spec) inputs[f.key] = text(raw[f.key], 2000);
      const missing = agent.input_spec.filter((f) => f.required && !inputs[f.key]).map((f) => f.label);
      if (missing.length) return fail(422, `Lengkapi isian wajib: ${missing.join(", ")}.`);
      const budget = Math.round(Number(b.budget_limit));
      if (!Number.isFinite(budget) || budget < 500 || budget > 1_000_000) return fail(422, "Batas biaya antara Rp500 dan Rp1.000.000.");
      const task = createTask(
        ctx.db,
        {
          organization_id: self.organization_id,
          title,
          brief: text(b.brief, 4000),
          inputs,
          entry_agent_id: agent.id,
          priority: PRIORITIES.includes(b.priority as TaskPriority) ? (b.priority as TaskPriority) : "normal",
          due_at: typeof b.due_at === "string" && b.due_at ? new Date(b.due_at).toISOString() : null,
          budget_limit: budget,
          created_by_member_id: self.id,
        },
        Date.now()
      );
      return ok(toItem(ctx.db, task), "Tugas dibuat dan masuk antrean.", 201);
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/cancel`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const t = ctx.db.tasks.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      if (!t) return fail(404, "Tugas tidak ditemukan.");
      const isManager = self.access_role === "owner" || self.access_role === "admin";
      if (!isManager && t.created_by_member_id !== self.id) return fail(403, "Hanya pembuat tugas atau admin yang dapat menghentikannya.");
      if (!["queued", "running", "waiting_approval"].includes(t.status)) return fail(409, "Tugas ini sudah berakhir.");
      cancelTask(ctx.db, t, self.id, Date.now());
      return ok(toItem(ctx.db, t), "Tugas dihentikan.");
    },
  },
  {
    method: "GET",
    path: "/api/v1/admin/persetujuan/read",
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const status = ctx.query.get("status") ?? "pending";
      const orgTasks = new Set(ctx.db.tasks.filter((t) => t.organization_id === self.organization_id).map((t) => t.id));
      const visible = ctx.db.approvals.filter((a) => orgTasks.has(a.task_id) && canDecide(self, a));
      const list = visible
        .filter((a) => (status === "pending" ? a.status === "pending" : a.status !== "pending"))
        .sort((a, b) => (b.decided_at ?? b.created_at).localeCompare(a.decided_at ?? a.created_at))
        .map((a) => toApproval(ctx.db, a));
      return {
        status: 200,
        body: {
          success: true,
          statusCode: 200,
          total: list.length,
          skip: 0,
          limit: list.length,
          data: list,
          pending_count: visible.filter((a) => a.status === "pending").length,
        },
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/admin/persetujuan/:id/decide",
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const a = ctx.db.approvals.find((x) => x.id === ctx.params.id);
      const task = a ? ctx.db.tasks.find((t) => t.id === a.task_id && t.organization_id === self.organization_id) : null;
      if (!a || !task) return fail(404, "Permintaan persetujuan tidak ditemukan.");
      if (!canDecide(self, a)) return fail(403, "Permintaan ini ditujukan kepada orang lain.");
      if (a.status !== "pending") return fail(409, "Permintaan ini sudah diputuskan.");
      const b = (ctx.body ?? {}) as { decision?: string; comment?: unknown };
      if (!["approved", "rejected", "revise"].includes(b.decision ?? "")) return fail(422, "Keputusan tidak valid.");
      const comment = text(b.comment, 1000);
      if (b.decision !== "approved" && comment.length < 5) return fail(422, "Tuliskan alasan atau catatan perbaikan (minimal 5 karakter).");
      decideApproval(ctx.db, a, b.decision as "approved" | "rejected" | "revise", comment, self.id, Date.now());
      return ok(toApproval(ctx.db, a), "Keputusan tersimpan.");
    },
  },
];
