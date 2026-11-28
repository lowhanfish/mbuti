import {
  MAX_FLOW_INPUTS,
  TRUST_AFTER_RUNS,
  isActiveRun,
  type FlowDetail,
  type FlowInput,
  type FlowListResponse,
  type LearnRequest,
  type RunDetail,
  type RunSummary,
} from "@/app/(admin)/admin/alur/types";
import { finishRun, logEvent, planSteps, startRun, type MockBrowserRun, type MockFlow } from "../browser";
import { isFailure, newId, nowIso, requireMember, text } from "../context";
import { fail, ok, type MockContext, type MockResponse, type MockRoute } from "../router";
import type { MockMembership } from "../seed";
import { checkCode, twoFactorEnabled } from "../two-factor";
import { WRONG_CODE } from "./akun";

const ADMIN = "/api/v1/admin";
const NO_ACCESS = "Hanya penanggung jawab role, pemilik, atau admin yang dapat mengatur alur.";
const BUSY = "Masih ada putaran yang belum selesai.";

const nameOf = (ctx: MockContext, memberId: string | null) =>
  ctx.db.users.find((u) => u.id === ctx.db.memberships.find((m) => m.id === memberId)?.user_id)?.full_name ?? null;

const agentOf = (ctx: MockContext, self: MockMembership, id: string) =>
  ctx.db.agents.find((a) => a.id === id && a.organization_id === self.organization_id);

const canManage = (self: MockMembership, ownerId: string | null | undefined) =>
  ["owner", "admin"].includes(self.access_role) || (self.access_role !== "viewer" && ownerId === self.id);

const accountOf = (ctx: MockContext, id: string) => ctx.db.vault_accounts.find((a) => a.id === id) ?? null;

const lockedAccount = (ctx: MockContext, accountId: string) => {
  const account = accountOf(ctx, accountId);
  const agent = ctx.db.agents.find((a) => a.id === account?.agent_id);
  return !account || account.responsible_member_id !== agent?.owner_member_id;
};

const toSummary = (ctx: MockContext, run: MockBrowserRun): RunSummary => ({
  id: run.id,
  mode: run.mode,
  status: run.status,
  message: run.message,
  flow_version: run.flow_version,
  created_by_name: nameOf(ctx, run.created_by_member_id) ?? "Sistem",
  created_at: run.created_at,
  finished_at: run.finished_at,
});

const runsOf = (ctx: MockContext, flowId: string) =>
  ctx.db.browser_runs.filter((r) => r.flow_id === flowId).sort((a, b) => b.created_at.localeCompare(a.created_at));

const toDetail = (ctx: MockContext, self: MockMembership, flow: MockFlow): FlowDetail => {
  const agent = ctx.db.agents.find((a) => a.id === flow.agent_id)!;
  const account = accountOf(ctx, flow.account_id);
  const runs = runsOf(ctx, flow.id);
  return {
    id: flow.id,
    role_id: agent.id,
    role_name: agent.name,
    account_id: account?.id ?? null,
    account_name: account?.name ?? "",
    name: flow.name,
    goal: flow.goal,
    status: flow.status,
    version: flow.version,
    inputs: flow.inputs,
    steps: flow.steps,
    note: flow.note,
    trusted_submit: flow.trusted_submit,
    successful_runs: flow.successful_runs,
    approved_at: flow.approved_at,
    approved_by_name: nameOf(ctx, flow.approved_by_member_id),
    active_run_id: runs.find((r) => isActiveRun(r.status))?.id ?? null,
    access: {
      can_manage: canManage(self, agent.owner_member_id),
      can_trust: agent.owner_member_id === self.id && self.access_role !== "viewer" && twoFactorEnabled(ctx.db, self.user_id),
    },
    runs: runs.slice(0, 20).map((r) => toSummary(ctx, r)),
    created_at: flow.created_at,
    updated_at: flow.updated_at,
  };
};

const toRun = (ctx: MockContext, self: MockMembership, run: MockBrowserRun): RunDetail => {
  const flow = ctx.db.browser_flows.find((f) => f.id === run.flow_id)!;
  const agent = ctx.db.agents.find((a) => a.id === flow.agent_id)!;
  return {
    ...toSummary(ctx, run),
    flow_id: flow.id,
    flow_name: flow.name,
    role_id: agent.id,
    role_name: agent.name,
    inputs: run.inputs,
    events: run.events,
    outputs: run.outputs,
    pending: run.pending,
    can_decide: canManage(self, agent.owner_member_id),
  };
};

type FlowScope = { self: MockMembership; flow: MockFlow; ownerId: string | null };

const isResponse = <T extends object>(value: T | MockResponse): value is MockResponse => "body" in value && "status" in value && !("flow" in value);

const flowScope = (ctx: MockContext, manage: boolean): FlowScope | MockResponse => {
  const self = requireMember(ctx);
  if (isFailure(self)) return self;
  const flow = ctx.db.browser_flows.find((f) => f.id === ctx.params.id && f.organization_id === self.organization_id);
  const agent = flow && agentOf(ctx, self, flow.agent_id);
  if (!flow || !agent) return fail(404, "Alur tidak ditemukan.");
  if (manage && !canManage(self, agent.owner_member_id)) return fail(403, NO_ACCESS);
  if (manage && runsOf(ctx, flow.id).some((r) => isActiveRun(r.status))) return fail(409, BUSY);
  return { self, flow, ownerId: agent.owner_member_id };
};

type RunScope = { self: MockMembership; run: MockBrowserRun; flow: MockFlow };

const runScope = (ctx: MockContext, manage: boolean): RunScope | MockResponse => {
  const self = requireMember(ctx);
  if (isFailure(self)) return self;
  const run = ctx.db.browser_runs.find((r) => r.id === ctx.params.run_id && r.organization_id === self.organization_id);
  const flow = run && ctx.db.browser_flows.find((f) => f.id === run.flow_id);
  const agent = flow && agentOf(ctx, self, flow.agent_id);
  if (!run || !flow || !agent) return fail(404, "Putaran tidak ditemukan.");
  if (manage && !canManage(self, agent.owner_member_id)) return fail(403, NO_ACCESS);
  return { self, run, flow };
};

const readLearn = (body: Partial<LearnRequest>) => {
  const name = text(body.name, 100);
  const goal = text(body.goal, 1000);
  const inputs: FlowInput[] = (Array.isArray(body.inputs) ? body.inputs : []).map((i) => ({
    key: text(i?.key, 30),
    label: text(i?.label, 60),
    sample: text(i?.sample, 500),
  }));
  if (name.length < 2) return fail(422, "Nama alur minimal 2 karakter.");
  if (goal.length < 10) return fail(422, "Jelaskan tujuannya, minimal 10 karakter.");
  if (inputs.length > MAX_FLOW_INPUTS) return fail(422, `Isian maksimal ${MAX_FLOW_INPUTS}.`);
  if (inputs.some((i) => !/^[a-z0-9_]{1,30}$/.test(i.key) || !i.label || !i.sample)) return fail(422, "Setiap isian perlu nama dan nilai contoh.");
  if (new Set(inputs.map((i) => i.key)).size !== inputs.length) return fail(422, "Nama isian tidak boleh sama.");
  return { name, goal, inputs };
};

const learn = (ctx: MockContext, self: MockMembership, flow: MockFlow, mode: "learn" | "repair") => {
  const account = accountOf(ctx, flow.account_id)!;
  const plan = planSteps(account.name, account.url, flow.goal, flow.inputs, account.has_totp);
  flow.status = "learning";
  flow.steps = [];
  flow.note = "";
  flow.trusted_submit = false;
  flow.successful_runs = 0;
  flow.approved_at = null;
  flow.approved_by_member_id = null;
  startRun(ctx.db, flow, mode, self.id, plan, flow.inputs.map((i) => ({ label: i.label, value: i.sample })));
};

export const alurRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${ADMIN}/role/:role_id/alur`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const agent = agentOf(ctx, self, ctx.params.role_id);
      if (!agent) return fail(404, "Role tidak ditemukan.");
      const flows = ctx.db.browser_flows
        .filter((f) => f.agent_id === agent.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => {
          const last = runsOf(ctx, f.id)[0];
          return {
            id: f.id,
            name: f.name,
            account_id: accountOf(ctx, f.account_id)?.id ?? null,
            account_name: accountOf(ctx, f.account_id)?.name ?? "",
            status: f.status,
            version: f.version,
            steps_count: f.steps.length,
            trusted_submit: f.trusted_submit,
            successful_runs: f.successful_runs,
            last_run: last ? toSummary(ctx, last) : null,
            updated_at: f.updated_at,
          };
        });
      const accounts = ctx.db.vault_accounts
        .filter((a) => a.agent_id === agent.id)
        .map((a) => ({ id: a.id, name: a.name, locked: lockedAccount(ctx, a.id) }));
      return ok<FlowListResponse>({ flows, accounts, can_manage: canManage(self, agent.owner_member_id) });
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/role/:role_id/alur`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const agent = agentOf(ctx, self, ctx.params.role_id);
      if (!agent) return fail(404, "Role tidak ditemukan.");
      if (!canManage(self, agent.owner_member_id)) return fail(403, NO_ACCESS);
      const input = readLearn((ctx.body ?? {}) as Partial<LearnRequest>);
      if ("status" in input) return input;
      const accountId = text((ctx.body as Partial<LearnRequest>)?.account_id, 60);
      const account = ctx.db.vault_accounts.find((a) => a.id === accountId && a.agent_id === agent.id);
      if (!account) return fail(422, "Pilih akun dari brankas role ini.");
      if (lockedAccount(ctx, account.id)) return fail(409, "Akun ini perlu dikonfirmasi penanggung jawab di tab Brankas.");
      const now = nowIso();
      const flow: MockFlow = {
        id: newId("alur"),
        organization_id: self.organization_id,
        agent_id: agent.id,
        account_id: account.id,
        ...input,
        status: "learning",
        version: 1,
        steps: [],
        note: "",
        trusted_submit: false,
        successful_runs: 0,
        approved_at: null,
        approved_by_member_id: null,
        created_at: now,
        updated_at: now,
      };
      ctx.db.browser_flows.push(flow);
      learn(ctx, self, flow, "learn");
      return ok(toDetail(ctx, self, flow), "Role mulai belajar.", 201);
    },
  },
  {
    method: "GET",
    path: `${ADMIN}/alur/:id`,
    handler: (ctx) => {
      const scope = flowScope(ctx, false);
      if (isResponse(scope)) return scope;
      return ok(toDetail(ctx, scope.self, scope.flow));
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur/:id/pelajari`,
    handler: (ctx) => {
      const scope = flowScope(ctx, true);
      if (isResponse(scope)) return scope;
      const input = readLearn((ctx.body ?? {}) as Partial<LearnRequest>);
      if ("status" in input) return input;
      if (!accountOf(ctx, scope.flow.account_id) || lockedAccount(ctx, scope.flow.account_id)) {
        return fail(409, "Akun brankas alur ini tidak bisa dipakai. Periksa tab Brankas.");
      }
      const repair = scope.flow.status === "needs_repair";
      Object.assign(scope.flow, input, { version: scope.flow.version + 1, updated_at: nowIso() });
      learn(ctx, scope.self, scope.flow, repair ? "repair" : "learn");
      return ok(toDetail(ctx, scope.self, scope.flow), "Role mulai belajar.");
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur/:id/setujui`,
    handler: (ctx) => {
      const scope = flowScope(ctx, true);
      if (isResponse(scope)) return scope;
      if (scope.flow.status !== "review") return fail(409, "Alur ini tidak sedang menunggu diperiksa.");
      if ((ctx.body as { version?: number } | null)?.version !== scope.flow.version) return fail(409, "Alur sudah berubah. Muat ulang lalu periksa lagi.");
      Object.assign(scope.flow, { status: "approved", approved_at: nowIso(), approved_by_member_id: scope.self.id, updated_at: nowIso() });
      return ok(toDetail(ctx, scope.self, scope.flow), "Alur disetujui.");
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur/:id/jalankan`,
    handler: (ctx) => {
      const scope = flowScope(ctx, true);
      if (isResponse(scope)) return scope;
      if (scope.flow.status !== "approved") return fail(409, "Alur belum disetujui.");
      if (!accountOf(ctx, scope.flow.account_id) || lockedAccount(ctx, scope.flow.account_id)) {
        return fail(409, "Akun brankas alur ini tidak bisa dipakai. Periksa tab Brankas.");
      }
      const given = ((ctx.body as { inputs?: Record<string, unknown> } | null)?.inputs ?? {}) as Record<string, unknown>;
      const inputs = scope.flow.inputs.map((i) => ({ label: i.label, value: text(given[i.key], 2000) }));
      const missing = inputs.filter((i) => !i.value).map((i) => i.label);
      if (missing.length) return fail(422, `Isian belum lengkap: ${missing.join(", ")}.`);
      const run = startRun(ctx.db, scope.flow, "replay", scope.self.id, scope.flow.steps, inputs);
      return ok(toRun(ctx, scope.self, run), "Putaran dimulai.", 201);
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur/:id/tanpa-persetujuan`,
    handler: (ctx) => {
      const scope = flowScope(ctx, true);
      if (isResponse(scope)) return scope;
      const b = (ctx.body ?? {}) as { enabled?: boolean; code?: string };
      if (scope.ownerId !== scope.self.id || !twoFactorEnabled(ctx.db, scope.self.user_id)) {
        return fail(403, "Hanya penanggung jawab role dengan verifikasi dua langkah yang dapat mengubah ini.");
      }
      if (b.enabled && scope.flow.status !== "approved") return fail(409, "Alur belum disetujui.");
      if (b.enabled && scope.flow.successful_runs < TRUST_AFTER_RUNS) return fail(409, `Perlu ${TRUST_AFTER_RUNS} putaran berhasil lebih dulu.`);
      if (!checkCode(ctx.db, scope.self.user_id, b.code)) return fail(422, WRONG_CODE, "two_factor_invalid");
      scope.flow.trusted_submit = Boolean(b.enabled);
      return ok(toDetail(ctx, scope.self, scope.flow), "Pengaturan persetujuan tersimpan.");
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur/:id/hapus`,
    handler: (ctx) => {
      const scope = flowScope(ctx, true);
      if (isResponse(scope)) return scope;
      ctx.db.browser_flows = ctx.db.browser_flows.filter((f) => f.id !== scope.flow.id);
      ctx.db.browser_runs = ctx.db.browser_runs.filter((r) => r.flow_id !== scope.flow.id);
      return ok(null, "Alur dihapus.");
    },
  },
  {
    method: "GET",
    path: `${ADMIN}/alur-jalan/:run_id`,
    handler: (ctx) => {
      const scope = runScope(ctx, false);
      if ("body" in scope) return scope;
      return ok(toRun(ctx, scope.self, scope.run));
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur-jalan/:run_id/putuskan`,
    handler: (ctx) => {
      const scope = runScope(ctx, true);
      if ("body" in scope) return scope;
      const { run } = scope;
      if (run.status !== "waiting_approval") return fail(409, "Putaran ini tidak sedang menunggu persetujuan.");
      const decision = (ctx.body as { decision?: string } | null)?.decision;
      if (decision !== "approved" && decision !== "rejected") return fail(422, "Keputusan tidak dikenal.");
      const name = nameOf(ctx, scope.self.id) ?? "";
      if (decision === "rejected") {
        logEvent(run, `Ditolak ${name}. Tidak ada yang dikirim.`, "blocked", Date.now());
        finishRun(run, "stopped", "Ditolak. Tidak ada yang dikirim.", Date.now());
      } else {
        logEvent(run, `Disetujui ${name}.`, "done", Date.now());
        Object.assign(run, { status: "queued", pending: null, cleared: true, ready_at: Date.now() + 800 });
      }
      return ok(toRun(ctx, scope.self, run), decision === "approved" ? "Disetujui." : "Ditolak.");
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur-jalan/:run_id/otp`,
    handler: (ctx) => {
      const scope = runScope(ctx, true);
      if ("body" in scope) return scope;
      const { run } = scope;
      if (run.status !== "waiting_otp") return fail(409, "Putaran ini tidak sedang menunggu kode.");
      const code = text((ctx.body as { code?: string } | null)?.code, 12);
      if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return fail(422, "Kode OTP 4 sampai 12 huruf atau angka.");
      logEvent(run, "Kode OTP diterima.", "done", Date.now());
      Object.assign(run, { status: "queued", pending: null, needs_otp: false, ready_at: Date.now() + 800 });
      return ok(toRun(ctx, scope.self, run), "Kode dikirim.");
    },
  },
  {
    method: "POST",
    path: `${ADMIN}/alur-jalan/:run_id/hentikan`,
    handler: (ctx) => {
      const scope = runScope(ctx, true);
      if ("body" in scope) return scope;
      const { run, flow } = scope;
      if (!isActiveRun(run.status)) return fail(409, "Putaran sudah selesai.");
      logEvent(run, "Dihentikan pengguna.", "blocked", Date.now());
      finishRun(run, "stopped", "Dihentikan pengguna.", Date.now());
      if (flow.status === "learning") Object.assign(flow, { status: "failed", note: "Belajar dihentikan." });
      return ok(toRun(ctx, scope.self, run), "Putaran dihentikan.");
    },
  },
];
