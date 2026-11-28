import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { saveDb } from "../db";
import { assignNumber, documentsOf, numberOf, redraw, type MockResultFile } from "../letters";
import { readImage } from "../media";
import { fail, ok, type MockContext, type MockRoute } from "../router";
import type { MockTask } from "../engine";
import type { MockDatabase, MockMembership } from "../seed";
import { reportsOf } from "../reports";
import { sheetsOf } from "../sheets";

const BASE = "/api/v1/admin/pengaturan/persuratan";
const TASK = "/api/v1/admin/tugas/:id/berkas";

const fileOf = (ctx: MockContext) => (ctx.body instanceof FormData ? ctx.body.get("file") : null);

const findTask = (ctx: MockContext, self: MockMembership) => ctx.db.tasks.find((t) => t.id === ctx.params.id && t.organization_id === self.organization_id);

/** Pemilik, admin, atau penanggung jawab role yang mengerjakan tugas */
const canNumber = (db: MockDatabase, self: MockMembership, task: MockTask, doc: MockResultFile) =>
  task.status === "completed" &&
  !doc.number &&
  (self.access_role === "owner" || self.access_role === "admin" || db.agents.find((a) => a.id === task.entry_agent_id)?.owner_member_id === self.id);

/** Route pengaturan yang hanya boleh diubah pemilik dan admin */
const managed = (method: string, path: string, run: (ctx: MockContext, self: MockMembership) => ReturnType<typeof ok> | Promise<ReturnType<typeof ok>>): MockRoute => ({
  method,
  path: `${BASE}${path}`,
  handler: (ctx) => {
    const self = requireManager(ctx);
    return isFailure(self) ? self : run(ctx, self);
  },
});

export const suratRoutes: MockRoute[] = [
  {
    method: "GET",
    path: TASK,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const task = findTask(ctx, self);
      if (!task) return fail(404, "Tugas tidak ditemukan.");
      const documents = documentsOf(ctx.db, task);
      // Berkas dan nomornya dibuat saat pertama dibaca, jadi perlu disimpan
      saveDb();
      // Daftar bagian buatan role diambil dari langkah kerja terakhir (E3c)
      const composed = ctx.db.task_steps.filter((s) => s.task_id === task.id && s.kind === "work" && s.status === "done").at(-1)?.composed ?? [];
      const all = [...documents.map((d) => ({ ...d, can_number: canNumber(ctx.db, self, task, d) })), ...sheetsOf(ctx.db, task), ...reportsOf(ctx.db, task)];
      return ok(all.map((d) => ({ ...d, composed })));
    },
  },
  {
    method: "POST",
    path: `${TASK}/:docId/koreksi`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      if (self.access_role === "viewer") return fail(403, "Pemantau tidak dapat memperbaiki format.");
      const task = findTask(ctx, self);
      const doc = task && documentsOf(ctx.db, task).find((d) => d.id === ctx.params.docId);
      const format = doc && ctx.db.letter_formats.find((f) => f.id === doc.format_id);
      if (!task || !doc || !format) return fail(404, "Berkas tidak ditemukan.");
      if (doc.number) return fail(409, "Surat sudah bernomor dan tidak bisa diubah.");
      const correction = text((ctx.body as { text?: unknown })?.text, 300);
      if (correction.length < 5) return fail(422, "Tulis koreksinya lebih lengkap.");
      const author = ctx.db.users.find((u) => u.id === self.user_id)?.full_name ?? "Anggota";
      format.corrections.push({ id: newId("koreksi"), text: correction, author_name: author, created_at: nowIso() });
      Object.assign(format, { checked: false, updated_at: nowIso() });
      Object.assign(doc, { version: doc.version + 1, updated_at: nowIso() });
      redraw(ctx.db, task, doc);
      return ok(doc, "Format diperbaiki.");
    },
  },
  {
    method: "POST",
    path: `${TASK}/:docId/nomor`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const task = findTask(ctx, self);
      const doc = task && documentsOf(ctx.db, task).find((d) => d.id === ctx.params.docId);
      if (!task || !doc) return fail(404, "Berkas tidak ditemukan.");
      if (task.status !== "completed" || doc.number) return fail(409, "Surat belum selesai atau sudah bernomor.");
      if (!canNumber(ctx.db, self, task, doc)) return fail(403, "Anda tidak dapat memberi nomor surat ini.");
      assignNumber(ctx.db, task, doc);
      redraw(ctx.db, task, doc);
      return ok({ ...doc, can_number: false }, "Nomor surat diberikan.");
    },
  },
  {
    method: "GET",
    path: BASE,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const own = <T extends { organization_id: string }>(rows: T[]) => rows.filter((r) => r.organization_id === self.organization_id);
      return ok({
        formats: own(ctx.db.letter_formats),
        letterheads: own(ctx.db.letterheads),
        registers: own(ctx.db.letter_registers).map((r) => ({ ...r, preview: numberOf(r.pattern, r.next_number, nowIso()) })),
        samples: own(ctx.db.letter_samples),
        can_edit: self.access_role === "owner" || self.access_role === "admin",
      });
    },
  },
  managed("PUT", "/format/:id", (ctx, self) => {
    const format = ctx.db.letter_formats.find((f) => f.id === ctx.params.id && f.organization_id === self.organization_id);
    if (!format) return fail(404, "Catatan format tidak ditemukan.");
    Object.assign(format, { checked: Boolean((ctx.body as { checked?: boolean })?.checked), updated_at: nowIso() });
    return ok(null, "Format diperbarui.");
  }),
  managed("DELETE", "/format/:id", (ctx, self) => {
    const format = ctx.db.letter_formats.find((f) => f.id === ctx.params.id && f.organization_id === self.organization_id);
    if (!format) return fail(404, "Catatan format tidak ditemukan.");
    ctx.db.letter_formats = ctx.db.letter_formats.filter((f) => f !== format);
    // Berkas yang sudah dibuat disusun lagi saat dibuka
    ctx.db.task_documents = ctx.db.task_documents.filter((d) => d.format_id !== format.id || d.number);
    return ok(null, "Catatan format dihapus.");
  }),
  managed("DELETE", "/format/:id/koreksi/:correctionId", (ctx, self) => {
    const format = ctx.db.letter_formats.find((f) => f.id === ctx.params.id && f.organization_id === self.organization_id);
    if (!format?.corrections.some((c) => c.id === ctx.params.correctionId)) return fail(404, "Koreksi tidak ditemukan.");
    format.corrections = format.corrections.filter((c) => c.id !== ctx.params.correctionId);
    return ok(null, "Koreksi dihapus.");
  }),
  managed("POST", "/kop", async (ctx, self) => {
    const file = fileOf(ctx);
    if (!(file instanceof File) || !["image/png", "image/jpeg"].includes(file.type)) return fail(422, "Pilih gambar PNG atau JPG.");
    if (file.size > 2_000_000) return fail(422, "Gambar kop paling besar 2 MB.");
    const image = await readImage(file);
    // Satu kop per organisasi atau unit: unggahan baru menggantikan yang lama
    ctx.db.letterheads = ctx.db.letterheads.filter((k) => !(k.organization_id === self.organization_id && k.unit_id === null));
    ctx.db.letterheads.push({ id: newId("kop"), organization_id: self.organization_id, unit_id: null, unit_name: null, image_url: image.url, created_at: nowIso() });
    return ok(null, "Kop tersimpan.", 201);
  }),
  managed("DELETE", "/kop/:id", (ctx, self) => {
    const before = ctx.db.letterheads.length;
    ctx.db.letterheads = ctx.db.letterheads.filter((k) => !(k.id === ctx.params.id && k.organization_id === self.organization_id));
    return before === ctx.db.letterheads.length ? fail(404, "Kop tidak ditemukan.") : ok(null, "Kop dihapus.");
  }),
  managed("PUT", "/register/:id", (ctx, self) => {
    const register = ctx.db.letter_registers.find((r) => r.id === ctx.params.id && r.organization_id === self.organization_id);
    if (!register) return fail(404, "Register tidak ditemukan.");
    const body = (ctx.body ?? {}) as { pattern?: unknown; next_number?: unknown };
    const pattern = text(body.pattern, 80);
    const next = Math.trunc(Number(body.next_number));
    if (!pattern.includes("[urut]")) return fail(422, "Pola nomor harus memuat [urut].");
    if (!(next >= 1 && next <= 999999)) return fail(422, "Urut berikutnya 1 sampai 999999.");
    if (register.issued.some((n) => n.number === numberOf(pattern, next, nowIso()))) return fail(409, "Nomor itu sudah pernah dipakai.");
    Object.assign(register, { pattern, next_number: next });
    return ok(null, "Register tersimpan.");
  }),
  managed("POST", "/contoh", (ctx, self) => {
    const file = fileOf(ctx);
    if (!(file instanceof File) || !/\.docx$/i.test(file.name)) return fail(422, "Pilih berkas Word (.docx).");
    if (file.size > 10_000_000) return fail(422, "Contoh surat paling besar 10 MB.");
    const author = ctx.db.users.find((u) => u.id === self.user_id)?.full_name ?? null;
    ctx.db.letter_samples.unshift({ id: newId("contoh"), organization_id: self.organization_id, file_name: file.name.slice(0, 200), size_bytes: file.size, uploaded_by_name: author, created_at: nowIso() });
    return ok(null, "Contoh tersimpan.", 201);
  }),
  managed("DELETE", "/contoh/:id", (ctx, self) => {
    const before = ctx.db.letter_samples.length;
    ctx.db.letter_samples = ctx.db.letter_samples.filter((s) => !(s.id === ctx.params.id && s.organization_id === self.organization_id));
    return before === ctx.db.letter_samples.length ? fail(404, "Contoh tidak ditemukan.") : ok(null, "Contoh dihapus.");
  }),
];
