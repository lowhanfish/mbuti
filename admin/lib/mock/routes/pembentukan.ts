import type { AnswerRequest, CardUpdateRequest, FinalRequest, MaterialsRequest, Skill } from "@/app/(admin)/admin/role/formation-types";
import { isFailure, newId, nowIso, requireMember, text } from "../context";
import {
  ANALYSIS_MS,
  ROUND_MS,
  MAX_ROUNDS,
  activeRevision,
  finalize,
  materialDocuments,
  newRevision,
  openRevision,
  revisionsOf,
  toFormation,
  toVersion,
  toVersionDetail,
  writeQaDocument,
  type MockRevision,
} from "../formation";
import { fail, ok, type MockContext, type MockResponse, type MockRoute } from "../router";
import type { MockAgent, MockDatabase, MockMembership } from "../seed";
import { catalogItems, mapTool, weakestSupport } from "../tools";

const BASE = "/api/v1/admin/role";

/** Pembentukan boleh dilakukan admin ke atas dan penanggung jawab role. */
const canForm = (self: MockMembership, agent: MockAgent) =>
  self.access_role === "owner" || self.access_role === "admin" || (self.access_role === "member" && agent.owner_member_id === self.id);

const requireEditor = (ctx: MockContext): { self: MockMembership; agent: MockAgent } | MockResponse => {
  const self = requireMember(ctx);
  if (isFailure(self)) return self;
  const agent = ctx.db.agents.find((a) => a.id === ctx.params.id && a.organization_id === self.organization_id);
  if (!agent) return fail(404, "Role tidak ditemukan.");
  if (!canForm(self, agent)) {
    return fail(403, "Hanya admin dan penanggung jawab role yang dapat membentuk role ini.");
  }
  return { self, agent };
};

const isGuardFailure = (value: unknown): value is MockResponse => typeof value === "object" && value !== null && "status" in value && "body" in value;

const viewable = (ctx: MockContext): { self: MockMembership; agent: MockAgent } | MockResponse => {
  const self = requireMember(ctx);
  if (isFailure(self)) return self;
  const agent = ctx.db.agents.find((a) => a.id === ctx.params.id && a.organization_id === self.organization_id);
  return agent ? { self, agent } : fail(404, "Role tidak ditemukan.");
};

const requireOpen = (db: MockDatabase, agent: MockAgent): MockRevision | MockResponse => {
  const rev = openRevision(db, agent.id);
  return rev ?? fail(409, "Tidak ada revisi yang sedang disusun. Mulai revisi baru terlebih dahulu.");
};

const isRevision = (value: unknown): value is MockRevision => typeof value === "object" && value !== null && "version_no" in value;

const busy = (rev: MockRevision) => (rev.pending ? fail(409, "Role masih memproses putaran sebelumnya. Tunggu sebentar.") : null);

const cleanSkill = (raw: unknown, index: number): Skill | null => {
  const s = (raw ?? {}) as Partial<Skill>;
  const name = text(s.name, 120);
  if (!name) return null;
  const tools = Array.isArray(s.tools) ? s.tools.slice(0, 12).map((t) => mapTool(text((t as { requested?: unknown }).requested, 80))).filter((t) => t.requested) : [];
  const list = (value: unknown, max: number) => (Array.isArray(value) ? value.map((v) => text(v, 200)).filter(Boolean).slice(0, max) : []);
  return {
    key: text(s.key, 40) || `skill-${index + 1}`,
    name,
    description: text(s.description, 600),
    steps: Array.isArray(s.steps)
      ? s.steps.slice(0, 15).flatMap((st) => {
          const step = st as { text?: unknown; approval?: unknown };
          const t = text(step.text, 200);
          return t ? [{ text: t, approval: Boolean(step.approval) }] : [];
        })
      : [],
    inputs: list(s.inputs, 8),
    outputs: list(s.outputs, 8),
    tools,
    support: weakestSupport(tools),
    substitute_note: text(s.substitute_note, 400),
  };
};

export const pembentukanRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${BASE}/:id/pembentukan`,
    handler: (ctx) => {
      const found = viewable(ctx);
      if (isGuardFailure(found)) return found;
      const rev = openRevision(ctx.db, found.agent.id) ?? activeRevision(ctx.db, found.agent) ?? revisionsOf(ctx.db, found.agent.id)[0];
      return rev ? ok(toFormation(ctx.db, rev, canForm(found.self, found.agent))) : fail(404, "Role belum punya versi.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/pembentukan/mulai`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const { self, agent } = found;
      if (openRevision(ctx.db, agent.id)) return fail(409, "Masih ada revisi yang sedang disusun. Lanjutkan atau buang revisi itu.");
      const fromId = text((ctx.body as { from_version_id?: unknown } | null)?.from_version_id, 60);
      const base = fromId ? ctx.db.agent_revisions.find((r) => r.id === fromId && r.agent_id === agent.id) : activeRevision(ctx.db, agent);
      if (fromId && !base) return fail(404, "Versi tidak ditemukan.");
      const rev = newRevision(ctx.db, agent, { source: fromId ? "restore" : "formation", status: base?.card ? "ready" : "draft", base, memberId: self.id, at: nowIso() });
      if (base?.card) rev.agent_satisfied = true;
      return ok(toFormation(ctx.db, rev), "Revisi baru dibuat.", 201);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/:id/pembentukan/bahan`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const rev = requireOpen(ctx.db, found.agent);
      if (!isRevision(rev)) return rev;
      const waiting = busy(rev);
      if (waiting) return waiting;
      const b = (ctx.body ?? {}) as Partial<MaterialsRequest>;
      const ownerId = typeof b.owner_member_id === "string" && b.owner_member_id ? b.owner_member_id : null;
      if (ownerId && !ctx.db.memberships.some((m) => m.id === ownerId && m.organization_id === found.agent.organization_id)) {
        return fail(422, "Penanggung jawab tidak ditemukan.");
      }
      rev.materials = {
        description: text(b.description, 4000),
        tools: Array.isArray(b.tools) ? [...new Set(b.tools.map((t) => text(t, 80)).filter(Boolean))].slice(0, 30) : [],
        represented: text(b.represented, 160),
        owner_member_id: ownerId,
      };
      rev.updated_at = nowIso();
      return ok(toFormation(ctx.db, rev), "Bahan disimpan.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/pembentukan/analisis`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const rev = requireOpen(ctx.db, found.agent);
      if (!isRevision(rev)) return rev;
      const waiting = busy(rev);
      if (waiting) return waiting;
      const docs = materialDocuments(ctx.db, found.agent.id);
      if (docs.some((d) => d.status === "queued" || d.status === "processing")) return fail(409, "Uraian jabatan masih diolah. Tunggu sampai selesai.");
      if (!docs.some((d) => d.status === "ready") && rev.materials.description.length < 80) {
        return fail(422, "Unggah uraian jabatan, atau tulis deskripsi pekerjaan minimal 80 karakter.");
      }
      // Analisis ulang memulai tanya jawab dari awal
      rev.messages = [];
      rev.round_no = 0;
      rev.card = null;
      rev.agent_satisfied = false;
      rev.status = "analyzing";
      rev.pending = { kind: "analysis", until: Date.now() + ANALYSIS_MS };
      rev.updated_at = nowIso();
      return ok(toFormation(ctx.db, rev), "Analisis dimulai.", 202);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/:id/pembentukan/kartu`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const rev = requireOpen(ctx.db, found.agent);
      if (!isRevision(rev)) return rev;
      const waiting = busy(rev);
      if (waiting) return waiting;
      if (!rev.card) return fail(409, "Kartu keterampilan belum ada. Jalankan analisis terlebih dahulu.");
      const b = (ctx.body ?? {}) as Partial<CardUpdateRequest>;
      const skills = Array.isArray(b.skills) ? b.skills.slice(0, 20).map(cleanSkill).filter((s): s is Skill => Boolean(s)) : rev.card.skills;
      if (!skills.length) return fail(422, "Kartu harus punya minimal satu keterampilan.");
      rev.card = { ...rev.card, summary: text(b.summary, 1500) || rev.card.summary, goal: text(b.goal, 500) || rev.card.goal, skills };
      rev.snapshot = { ...rev.snapshot, goal: rev.card.goal };
      rev.changed = [];
      rev.updated_at = nowIso();
      return ok(toFormation(ctx.db, rev), "Kartu disimpan.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/pembentukan/jawab`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const { self, agent } = found;
      const rev = requireOpen(ctx.db, agent);
      if (!isRevision(rev)) return rev;
      const waiting = busy(rev);
      if (waiting) return waiting;
      if (!rev.card) return fail(409, "Jalankan analisis terlebih dahulu.");
      const b = (ctx.body ?? {}) as Partial<AnswerRequest>;
      const answers = Array.isArray(b.answers) ? b.answers : [];
      const note = text(b.note, 2000);
      if (!answers.length && !note && !b.finish) return fail(422, "Isi minimal satu jawaban atau catatan.");
      if (rev.round_no >= MAX_ROUNDS && !b.finish) return fail(409, `Batas ${MAX_ROUNDS} putaran tanya jawab tercapai. Lanjutkan ke Final.`);
      const user = ctx.db.users.find((u) => u.id === self.user_id);
      const at = nowIso();
      const already = new Set(rev.messages.filter((m) => m.kind === "answer").map((m) => m.question_id));
      for (const a of answers) {
        const question = rev.messages.find((m) => m.id === a.question_id && m.kind === "question");
        if (!question || already.has(question.id)) continue;
        const answerText = text(a.text, 2000);
        if (!a.skipped && !answerText) continue;
        rev.messages.push({
          id: newId("msg"),
          round_no: rev.round_no,
          author: "member",
          kind: "answer",
          question_id: question.id,
          required: question.required,
          text: a.skipped ? answerText || "Dilewati" : answerText,
          skipped: Boolean(a.skipped),
          author_name: user?.full_name ?? "Pembuat role",
          created_at: at,
        });
      }
      if (note) {
        rev.messages.push({ id: newId("msg"), round_no: rev.round_no, author: "member", kind: "note", question_id: null, required: false, text: note, skipped: false, author_name: user?.full_name ?? "Pembuat role", created_at: at });
      }
      rev.status = "questioning";
      rev.pending = { kind: "round", until: Date.now() + ROUND_MS, finish: Boolean(b.finish) };
      rev.updated_at = at;
      return ok(toFormation(ctx.db, rev), "Jawaban dikirim.", 202);
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/pembentukan/final`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const { self, agent } = found;
      const rev = requireOpen(ctx.db, agent);
      if (!isRevision(rev)) return rev;
      const waiting = busy(rev);
      if (waiting) return waiting;
      if (!rev.card) return fail(409, "Jalankan analisis terlebih dahulu.");
      if (materialDocuments(ctx.db, agent.id).some((d) => d.status === "queued" || d.status === "processing")) {
        return fail(409, "Uraian jabatan masih diolah.");
      }
      const b = (ctx.body ?? {}) as Partial<FinalRequest>;
      const open = toFormation(ctx.db, rev).open_required;
      const reason = text(b.override_reason, 500);
      if (open > 0 && reason.length < 5) return fail(409, `Masih ada ${open} pertanyaan wajib yang belum dijawab. Jawab dulu, atau tulis alasan untuk tetap Final.`);
      if (rev.snapshot.goal.trim().length < 10) return fail(422, "Tujuan kerja minimal 10 karakter.");
      const at = nowIso();
      const note = [text(b.change_note, 500), open > 0 ? `Final dengan ${open} pertanyaan wajib terbuka: ${reason}` : ""].filter(Boolean).join(" · ");
      finalize(ctx.db, agent, rev, self.id, note || `Versi ${rev.version_no}`, at);
      agent.status = b.status_after === "paused" ? "paused" : "active";
      writeQaDocument(ctx.db, agent, rev, at);
      return ok(toFormation(ctx.db, rev), `Versi ${rev.version_no} Final.`);
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/pembentukan/batal`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const rev = requireOpen(ctx.db, found.agent);
      if (!isRevision(rev)) return rev;
      if (!found.agent.active_revision_id) return fail(409, "Role belum pernah Final, jadi revisi pertamanya tidak bisa dibuang. Hapus role bila tidak jadi dipakai.");
      rev.status = "discarded";
      rev.pending = null;
      rev.updated_at = nowIso();
      return ok(null, "Revisi dibuang.");
    },
  },
  {
    method: "GET",
    path: `${BASE}/:id/versi`,
    handler: (ctx) => {
      const found = viewable(ctx);
      if (isGuardFailure(found)) return found;
      return ok(revisionsOf(ctx.db, found.agent.id).filter((r) => r.status !== "discarded").map((r) => toVersion(ctx.db, r, found.agent)));
    },
  },
  {
    method: "GET",
    path: `${BASE}/:id/versi/:vid`,
    handler: (ctx) => {
      const found = viewable(ctx);
      if (isGuardFailure(found)) return found;
      const rev = ctx.db.agent_revisions.find((r) => r.id === ctx.params.vid && r.agent_id === found.agent.id);
      return rev ? ok(toVersionDetail(ctx.db, rev, found.agent)) : fail(404, "Versi tidak ditemukan.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/versi/:vid/pulihkan`,
    handler: (ctx) => {
      const found = requireEditor(ctx);
      if (isGuardFailure(found)) return found;
      const { self, agent } = found;
      if (openRevision(ctx.db, agent.id)) return fail(409, "Masih ada revisi yang sedang disusun. Lanjutkan atau buang revisi itu.");
      const base = ctx.db.agent_revisions.find((r) => r.id === ctx.params.vid && r.agent_id === agent.id && (r.status === "final" || r.status === "superseded"));
      if (!base) return fail(404, "Versi tidak ditemukan.");
      const rev = newRevision(ctx.db, agent, { source: "restore", status: "ready", base, memberId: self.id, at: nowIso() });
      rev.agent_satisfied = true;
      rev.change_note = `Dipulihkan dari versi ${base.version_no}`;
      return ok(toFormation(ctx.db, rev), `Revisi dari versi ${base.version_no} dibuat.`, 201);
    },
  },
  {
    method: "GET",
    path: "/api/v1/admin/alat/katalog",
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      return ok(catalogItems());
    },
  },
  {
    method: "GET",
    path: "/api/v1/admin/alat/permintaan",
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      return ok(
        ctx.db.tool_requests
          .filter((r) => r.organization_id === self.organization_id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((r) => ({
            id: r.id,
            agent_id: r.agent_id,
            agent_name: ctx.db.agents.find((a) => a.id === r.agent_id)?.name ?? "Role terhapus",
            skill_name: r.skill_name,
            requested: r.requested,
            status: r.status,
            created_at: r.created_at,
          }))
      );
    },
  },
];
