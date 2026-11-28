import { composeChoice, effectiveMode } from "../compose";
import { LIMITS } from "@/app/(admin)/admin/pengaturan/batas-biaya/types";
import { MAX_IMAGE_BYTES } from "@/app/(admin)/admin/pengetahuan/types";
import { MAX_ATTACHMENTS, MAX_PDF_PAGES, placeholderPage, readImage, toAttachment, type MockAttachment } from "../media";
import { SAMPLE_TABLE, parseCsv, type MockTable } from "../sheets";
import {
  formatRupiah,
  type AgentRef,
  type ApprovalInterface,
  type DetailInterface,
  type ResponseInterface,
  type TaskPriority,
  type TaskStatus,
} from "@/app/(admin)/admin/tugas/types";
import { UNIT_COLORS } from "@/app/(admin)/admin/organisasi/unit/types";
import { isFailure, newId, nowIso, requireMember, text } from "../context";
import { cancelTask, createTask, decideApproval, type MockApproval, type MockTask } from "../engine";
import { readTaskFlow } from "../task-flow";
import { findAgent, findRelation } from "../lookup";
import { fail, ok, paging, type MockRoute } from "../router";
import type { MockDatabase, MockMembership } from "../seed";
import { monthUsage, settingsOf } from "../settings";

const PRIORITIES: TaskPriority[] = ["low", "normal", "high"];

export const agentRef = (db: MockDatabase, agentId: string): AgentRef => {
  const a = findAgent(db, agentId);
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

const toApprovalFlow = (db: MockDatabase, a: MockApproval): ApprovalInterface["flow"] => {
  if (a.follow_up.type !== "browser_run") return null;
  const runId = a.follow_up.run_id;
  const run = db.browser_runs.find((r) => r.id === runId);
  if (!run) return null;
  const asked = [...run.events].reverse().find((e) => e.status === "waiting");
  return { run_id: run.id, values: run.inputs, screenshot_url: asked?.screenshot_url ?? null };
};

const toTaskFlow = (db: MockDatabase, t: MockTask): DetailInterface["flow"] => {
  if (!t.flow) return null;
  const run = db.browser_runs.filter((r) => r.task_id === t.id).at(-1);
  return {
    flow_id: t.flow.flow_id,
    name: t.flow.name,
    stage: t.flow_stage ?? "waiting",
    run_id: run?.id ?? null,
    run_status: run?.status ?? null,
    run_message: run?.message ?? "",
    values: run?.inputs ?? [],
    outputs: run?.outputs ?? [],
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
    flow: toApprovalFlow(db, a),
  };
};

const toDetail = (db: MockDatabase, t: MockTask): DetailInterface => {
  const entry = findAgent(db, t.entry_agent_id);
  return {
    ...toItem(db, t),
    inputs: Object.entries(t.inputs)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ label: entry?.input_spec.find((f) => f.key === k)?.label ?? k, value: v })),
    attachments: db.task_attachments.filter((a) => (t.attachment_ids ?? []).includes(a.id)).map((a) => toAttachment(db, a)),
    web_search: t.web_search ?? "role",
    compose_mode: t.compose_mode ?? "role",
    flow: toTaskFlow(db, t),
    steps: db.task_steps
      .filter((s) => s.task_id === t.id)
      .map((s) => ({
        id: s.id,
        agent: agentRef(db, s.agent_id),
        kind: s.kind,
        via_relation_type: findRelation(db, s.via_relation_id)?.relation_type ?? null,
        attempt_no: s.attempt_no,
        status: s.status,
        input_notes: s.input_notes,
        output: s.output,
        citations: s.citations,
        findings: s.findings ?? [],
        web_sources: s.web_sources ?? [],
        verdict: s.verdict,
        compose_mode: s.compose_mode ?? null,
        composed: s.composed ?? [],
        model: s.model,
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

export const canDecide = (self: MockMembership, a: MockApproval) =>
  self.access_role === "owner" || self.access_role === "admin" || (self.access_role !== "viewer" && a.requested_from_member_id === self.id);

const BASE = "/api/v1/admin/tugas";

/** Lampiran yang dipilih untuk tugas atau uji coba: milik organisasi ini dan belum dipakai tugas lain. */
export const claimAttachments = (db: MockDatabase, orgId: string, ids: unknown): MockAttachment[] | string => {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string"))] : [];
  if (list.length > MAX_ATTACHMENTS) return `Lampiran maksimal ${MAX_ATTACHMENTS} berkas.`;
  const found = list.map((x) => db.task_attachments.find((a) => a.id === x && a.organization_id === orgId && !a.task_id));
  if (found.some((a) => !a)) return "Lampiran tidak ditemukan atau sudah dipakai tugas lain. Unggah ulang.";
  return found as MockAttachment[];
};

const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export const tugasRoutes: MockRoute[] = [
  {
    method: "POST",
    path: `${BASE}/lampiran`,
    handler: async (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      if (self.access_role === "viewer") return fail(403, "Pemantau tidak dapat mengunggah lampiran.");
      const file = ctx.body instanceof FormData ? ctx.body.get("file") : null;
      if (!(file instanceof File)) return fail(422, "Pilih berkas lampiran.");
      // Jenis berkas data dikenali dari namanya: peramban memberi jenis media yang berbeda-beda
      const data = /\.(csv|xlsx)$/i.exec(file.name)?.[1].toLowerCase();
      if (!data && !ATTACHMENT_TYPES.includes(file.type)) return fail(422, "Lampiran berupa gambar, PDF, Excel (.xlsx), atau CSV.");
      if (file.size > MAX_IMAGE_BYTES) return fail(422, "Ukuran lampiran melebihi 10 MB.");
      if (file.size === 0) return fail(422, "Berkas kosong.");
      let pages: string[];
      let width = 0;
      let height = 0;
      let tables: MockTable[] | undefined;
      if (data) {
        // Peramban tidak membaca XLSX di mode data contoh; dipakai isi contoh
        const table = data === "csv" ? parseCsv(await file.text()) : SAMPLE_TABLE;
        if (!table.rows.length || !table.columns.some(Boolean)) return fail(422, "Berkas data tidak berisi baris.");
        if (table.rows.length > 5000) return fail(422, "Berkas data paling banyak 5.000 baris.");
        tables = [table];
        pages = [];
      } else if (file.type === "application/pdf") {
        // Peramban tidak merender PDF di mode data contoh; backend merender maks 20 halaman dengan pypdfium2
        const count = Math.min(MAX_PDF_PAGES, Math.max(1, Math.round(file.size / 120_000)));
        pages = Array.from({ length: count }, (_, i) => placeholderPage(file.name, i + 1));
      } else {
        try {
          const image = await readImage(file);
          pages = [image.url];
          width = image.width;
          height = image.height;
        } catch {
          return fail(422, "Gambar tidak bisa dibaca.");
        }
      }
      const attachment: MockAttachment = {
        id: newId("att"),
        organization_id: self.organization_id,
        task_id: null,
        file_name: file.name.slice(0, 200),
        mime_type: data ? (data === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") : file.type,
        size_bytes: file.size,
        width,
        height,
        pages,
        tables,
        exif: null,
        uploaded_by_member_id: self.id,
        created_at: nowIso(),
      };
      ctx.db.task_attachments.push(attachment);
      return ok(toAttachment(ctx.db, attachment), "Lampiran diterima.", 201);
    },
  },
  {
    method: "GET",
    path: `${BASE}/read`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const search = (ctx.query.get("search") ?? "").trim().toLowerCase();
      const status = ctx.query.get("status") ?? "";
      const agentId = ctx.query.get("agent_id") ?? "";
      const { skip, limit } = paging(ctx.query, 50);

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
      const choice = composeChoice(b.compose_mode);
      const missing = effectiveMode(choice, agent.compose_mode) === "free" ? [] : agent.input_spec.filter((f) => f.required && !inputs[f.key]).map((f) => f.label);
      if (missing.length) return fail(422, `Lengkapi isian wajib: ${missing.join(", ")}.`);
      const budget = Math.round(Number(b.budget_limit));
      const { min, max } = LIMITS.task_budget;
      if (!Number.isFinite(budget) || budget < min || budget > max) return fail(422, `Batas biaya antara ${formatRupiah(min)} dan ${formatRupiah(max)}.`);
      if (budget > settingsOf(ctx.db, self.organization_id).monthly_budget) return fail(422, "Batas biaya tugas melebihi batas bulanan organisasi.");
      if (monthUsage(ctx.db, self.organization_id, Date.now()).remaining <= 0) {
        return fail(409, "Anggaran bulan ini sudah habis. Naikkan batas bulanan di Pengaturan > Batas Biaya.");
      }
      const flow = readTaskFlow(ctx.db, self, agent.id, b.flow_id, b.flow_values);
      if (typeof flow === "string") return fail(422, flow);
      const attachments = claimAttachments(ctx.db, self.organization_id, b.attachment_ids);
      if (typeof attachments === "string") return fail(422, attachments);
      const task = createTask(
        ctx.db,
        {
          organization_id: self.organization_id,
          title,
          brief: text(b.brief, 4000),
          inputs,
          entry_agent_id: agent.id,
          priority: PRIORITIES.includes(b.priority as TaskPriority) ? (b.priority as TaskPriority) : "normal",
          // Tanggal tanpa jam berarti sampai akhir hari itu
          due_at: typeof b.due_at === "string" && b.due_at ? new Date(b.due_at.length === 10 ? `${b.due_at}T23:59:59` : b.due_at).toISOString() : null,
          budget_limit: budget,
          created_by_member_id: self.id,
          attachment_ids: attachments.map((a) => a.id),
          web_search: b.web_search === "off" ? "off" : "role",
          compose_mode: choice,
          flow,
        },
        Date.now()
      );
      for (const a of attachments) a.task_id = task.id;
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
      const { skip, limit } = paging(ctx.query, 50);
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
          skip,
          limit,
          data: list.slice(skip, skip + limit),
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
      if (b.decision === "revise" && a.reason === "flow") return fail(422, "Persetujuan alur hanya bisa disetujui atau ditolak.");
      decideApproval(ctx.db, a, b.decision as "approved" | "rejected" | "revise", comment, self.id, Date.now());
      return ok(toApproval(ctx.db, a), "Keputusan tersimpan.");
    },
  },
];
