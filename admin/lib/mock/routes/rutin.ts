import { composeChoice, effectiveMode } from "../compose";
import { LIMITS } from "@/app/(admin)/admin/pengaturan/batas-biaya/types";
import type { CalendarDayRequest, ShiftRequest } from "@/app/(admin)/admin/pengaturan/kalender/types";
import type { CreateScheduleRequest, ScheduleDetail, ScheduleItem, ScheduleRun } from "@/app/(admin)/admin/tugas/rutin/types";
import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { fail, ok, type MockContext, type MockRoute } from "../router";
import { isoDate, occurrences, parseSentence, ruleError, ruleText, scheduleNext, startRun, workdaysOf, type MockRun, type MockSchedule } from "../schedule";
import type { MockDatabase, MockMembership } from "../seed";
import { agentRef } from "./tugas";

import { readTaskFlow } from "../task-flow";

const BASE = "/api/v1/admin/tugas-rutin";
const CALENDAR = "/api/v1/admin/pengaturan/kalender";
const LEAVE = "/api/v1/admin/organisasi/pengguna/:id/cuti";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const isManager = (m: MockMembership) => m.access_role === "owner" || m.access_role === "admin";

/** Pemilik dan admin, atau anggota yang menjadi penanggung jawab role */
const canManage = (db: MockDatabase, self: MockMembership, agentId: string) =>
  isManager(self) || (self.access_role === "member" && db.agents.find((a) => a.id === agentId)?.owner_member_id === self.id);

const toRun = (db: MockDatabase, r: MockRun): ScheduleRun => {
  const task = db.tasks.find((t) => t.id === r.task_id);
  return {
    id: r.id,
    planned_for: r.planned_for,
    status: r.status,
    attempt: r.attempt,
    reason: r.reason,
    task_id: task?.id ?? null,
    task_status: task?.status ?? null,
    attachment_count: task?.attachment_ids?.length ?? 0,
  };
};

const runsOf = (db: MockDatabase, id: string) =>
  db.schedule_runs
    .filter((r) => r.schedule_id === id)
    .sort((a, b) => b.planned_for.localeCompare(a.planned_for))
    .map((r) => toRun(db, r));

const toItem = (db: MockDatabase, self: MockMembership, s: MockSchedule): ScheduleItem => ({
  id: s.id,
  title: s.title,
  brief: s.brief,
  entry_agent: agentRef(db, s.entry_agent_id),
  inputs: s.inputs,
  priority: s.priority,
  budget_limit: s.budget_limit,
  web_search: s.web_search,
  compose_mode: s.compose_mode ?? "role",
  flow_id: s.flow_id ?? null,
  flow_name: db.browser_flows.find((f) => f.id === s.flow_id)?.name ?? "",
  flow_values: s.flow_values ?? {},
  rule: s.rule,
  rule_text: ruleText(db, s.organization_id, s.rule),
  source_text: s.source_text,
  status: s.status,
  next_run_at: s.next_run_at,
  last_run: runsOf(db, s.id)[0] ?? null,
  created_by_name: db.users.find((u) => u.id === db.memberships.find((m) => m.id === s.created_by_member_id)?.user_id)?.full_name ?? null,
  can_manage: canManage(db, self, s.entry_agent_id),
  created_at: s.created_at,
  updated_at: s.updated_at,
});

const toDetail = (db: MockDatabase, self: MockMembership, s: MockSchedule): ScheduleDetail => ({
  ...toItem(db, self, s),
  upcoming: occurrences(db, s.organization_id, s.rule, s.entry_agent_id, new Date(), 5, s.id),
  runs: runsOf(db, s.id),
});

const findSchedule = (ctx: MockContext, self: MockMembership) => ctx.db.schedules.find((s) => s.id === ctx.params.id && s.organization_id === self.organization_id);

const readBody = (ctx: MockContext, self: MockMembership): Omit<MockSchedule, "id" | "created_at" | "updated_at" | "created_by_member_id" | "next_run_at"> | string => {
  const b = (ctx.body ?? {}) as CreateScheduleRequest;
  const agent = ctx.db.agents.find((a) => a.id === b.entry_agent_id && a.organization_id === self.organization_id);
  if (!agent) return "Pilih role yang akan mengerjakan.";
  if (agent.status !== "active") return `${agent.name} belum aktif.`;
  if (!canManage(ctx.db, self, agent.id)) return "Anggota hanya dapat menjadwalkan role yang ia tanggung jawabi.";
  const title = text(b.title, 150);
  if (title.length < 5) return "Judul tugas minimal 5 karakter.";
  const { min, max } = LIMITS.task_budget;
  const budget = Math.round(Number(b.budget_limit));
  if (!(budget >= min && budget <= max)) return "Batas biaya di luar rentang.";
  const choice = composeChoice(b.compose_mode);
  const missing = effectiveMode(choice, agent.compose_mode) === "free" ? [] : agent.input_spec.filter((f) => f.required && !text(b.inputs?.[f.key])).map((f) => f.label);
  if (missing.length) return `Lengkapi isian wajib: ${missing.join(", ")}.`;
  const invalid = b.rule ? ruleError(ctx.db, self.organization_id, b.rule) : "Aturan jadwal kosong.";
  if (invalid) return invalid;
  const flow = readTaskFlow(ctx.db, self, agent.id, b.flow_id, b.flow_values);
  if (typeof flow === "string") return flow;
  return {
    organization_id: self.organization_id,
    entry_agent_id: agent.id,
    title,
    brief: text(b.brief, 4000),
    inputs: b.inputs ?? {},
    priority: b.priority ?? "normal",
    budget_limit: budget,
    web_search: b.web_search === "off" ? "off" : "role",
    compose_mode: choice,
    flow_id: flow?.flow_id ?? null,
    flow_values: flow?.values ?? {},
    rule: b.rule,
    source_text: text(b.source_text, 500),
    status: b.status === "draft" ? "draft" : "active",
  };
};

/** Aksi pada satu jadwal yang memerlukan hak kelola */
const action = (path: string, run: (ctx: MockContext, self: MockMembership, s: MockSchedule) => ReturnType<typeof ok> | null): MockRoute => ({
  method: "POST",
  path: `${BASE}/:id/${path}`,
  handler: (ctx) => {
    const self = requireMember(ctx);
    if (isFailure(self)) return self;
    const s = findSchedule(ctx, self);
    if (!s) return fail(404, "Tugas rutin tidak ditemukan.");
    if (!canManage(ctx.db, self, s.entry_agent_id)) return fail(403, "Anda tidak dapat mengubah tugas rutin ini.");
    return run(ctx, self, s) ?? fail(409, "Tindakan ini tidak berlaku untuk keadaan sekarang.");
  },
});

const scheduleRoutes: MockRoute[] = [
  {
    method: "GET",
    path: BASE,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const data = ctx.db.schedules
        .filter((s) => s.organization_id === self.organization_id)
        .sort((a, b) => (a.next_run_at ?? "9").localeCompare(b.next_run_at ?? "9"))
        .map((s) => toItem(ctx.db, self, s));
      return ok(data);
    },
  },
  {
    method: "POST",
    path: `${BASE}/pahami`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      if (self.access_role === "viewer") return fail(403, "Pemantau tidak dapat membuat tugas rutin.");
      const sentence = text((ctx.body as { text?: unknown })?.text, 500);
      if (sentence.length < 8) return fail(422, "Tulis jadwalnya lebih lengkap.");
      const parsed = parseSentence(ctx.db, self.organization_id, sentence, isoDate(new Date()));
      return ok({
        ...parsed,
        rule_text: ruleText(ctx.db, self.organization_id, parsed.rule),
        occurrences: occurrences(ctx.db, self.organization_id, parsed.rule, "", new Date()),
      });
    },
  },
  {
    method: "POST",
    path: `${BASE}/pratinjau`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const b = (ctx.body ?? {}) as { rule?: MockSchedule["rule"]; entry_agent_id?: string };
      if (!b.rule) return fail(422, "Aturan jadwal kosong.");
      const invalid = ruleError(ctx.db, self.organization_id, b.rule);
      if (invalid) return fail(422, invalid);
      return ok({
        rule_text: ruleText(ctx.db, self.organization_id, b.rule),
        occurrences: occurrences(ctx.db, self.organization_id, b.rule, b.entry_agent_id ?? "", new Date()),
      });
    },
  },
  {
    method: "POST",
    path: BASE,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      if (self.access_role === "viewer") return fail(403, "Pemantau tidak dapat membuat tugas rutin.");
      const body = readBody(ctx, self);
      if (typeof body === "string") return fail(422, body);
      const at = nowIso();
      const s: MockSchedule = { ...body, id: newId("rutin"), next_run_at: null, created_by_member_id: self.id, created_at: at, updated_at: at };
      ctx.db.schedules.push(s);
      scheduleNext(ctx.db, s, Date.now());
      return ok(toItem(ctx.db, self, s), "Tugas rutin tersimpan.", 201);
    },
  },
  {
    method: "GET",
    path: `${BASE}/:id`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const s = findSchedule(ctx, self);
      return s ? ok(toDetail(ctx.db, self, s)) : fail(404, "Tugas rutin tidak ditemukan.");
    },
  },
  {
    method: "PUT",
    path: `${BASE}/:id`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const s = findSchedule(ctx, self);
      if (!s) return fail(404, "Tugas rutin tidak ditemukan.");
      if (!canManage(ctx.db, self, s.entry_agent_id)) return fail(403, "Anda tidak dapat mengubah tugas rutin ini.");
      const body = readBody(ctx, self);
      if (typeof body === "string") return fail(422, body);
      Object.assign(s, body, { updated_at: nowIso() });
      scheduleNext(ctx.db, s, Date.now());
      return ok(toItem(ctx.db, self, s), "Tugas rutin diperbarui.");
    },
  },
  {
    method: "DELETE",
    path: `${BASE}/:id`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const s = findSchedule(ctx, self);
      if (!s) return fail(404, "Tugas rutin tidak ditemukan.");
      if (!canManage(ctx.db, self, s.entry_agent_id)) return fail(403, "Anda tidak dapat menghapus tugas rutin ini.");
      ctx.db.schedules = ctx.db.schedules.filter((x) => x.id !== s.id);
      ctx.db.schedule_runs = ctx.db.schedule_runs.filter((r) => r.schedule_id !== s.id);
      return ok(null, "Tugas rutin dihapus.");
    },
  },
  action("jeda", (ctx, self, s) => {
    if (s.status !== "active") return null;
    s.status = "paused";
    scheduleNext(ctx.db, s, Date.now());
    return ok(toDetail(ctx.db, self, s), "Tugas rutin dijeda.");
  }),
  action("lanjutkan", (ctx, self, s) => {
    if (s.status !== "paused" && s.status !== "draft") return null;
    s.status = "active";
    scheduleNext(ctx.db, s, Date.now());
    return ok(toDetail(ctx.db, self, s), "Tugas rutin aktif.");
  }),
  action("jalankan", (ctx, self, s) => {
    const run = startRun(ctx.db, s, nowIso(), "created", Date.now(), "Dijalankan manual.");
    return ok(toDetail(ctx.db, self, s), run.task_id ? "Tugas dibuat." : run.reason);
  }),
  action("susulan/:runId", (ctx, self, s) => {
    const old = ctx.db.schedule_runs.find((r) => r.id === ctx.params.runId && r.schedule_id === s.id);
    if (!old || !["missed", "failed", "stopped_budget"].includes(old.status)) return null;
    const run = startRun(ctx.db, s, old.planned_for, "backfill", Date.now(), "Susulan.");
    if (run.task_id) Object.assign(old, { status: "skipped", reason: "Sudah diisi susulan." });
    return ok(toDetail(ctx.db, self, s), run.task_id ? "Susulan dibuat." : run.reason);
  }),
];

const readShift = (body: unknown): ShiftRequest | string => {
  const b = (body ?? {}) as ShiftRequest;
  const name = text(b.name, 60);
  if (name.length < 2) return "Nama shift minimal 2 karakter.";
  if (!TIME.test(b.start_time) || !TIME.test(b.end_time) || b.start_time === b.end_time) return "Isi jam mulai dan selesai yang berbeda.";
  const weekdays = [...new Set((b.weekdays ?? []).filter((d) => d >= 1 && d <= 7))].sort();
  if (!weekdays.length) return "Pilih minimal satu hari.";
  return { name, start_time: b.start_time, end_time: b.end_time, weekdays };
};

const readDay = (value: CalendarDayRequest): CalendarDayRequest | string => {
  const name = text(value.name, 120);
  if (!DATE.test(value.date ?? "") || Number.isNaN(Date.parse(value.date))) return "Tanggal harus berbentuk YYYY-MM-DD.";
  if (name.length < 2) return "Nama minimal 2 karakter.";
  return { date: value.date, name, kind: value.kind === "workday" ? "workday" : "holiday", label: text(value.label, 60) };
};

/** Satu tanggal per organisasi: isian baru menggantikan yang lama */
const upsertDay = (db: MockDatabase, org: string, day: CalendarDayRequest) => {
  const old = db.calendar_days.find((d) => d.organization_id === org && d.date === day.date);
  if (old) Object.assign(old, day);
  else db.calendar_days.push({ ...day, id: newId("hari"), organization_id: org });
  return Boolean(old);
};

const refresh = (db: MockDatabase, org: string) => {
  for (const s of db.schedules) if (s.organization_id === org) scheduleNext(db, s, Date.now());
};

const shiftNameTaken = (db: MockDatabase, org: string, name: string, exceptId = "") =>
  db.work_shifts.some((s) => s.organization_id === org && s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase());

const DUPLICATE_SHIFT = "Sudah ada shift dengan nama itu.";

const calendarRoutes: MockRoute[] = [
  {
    method: "GET",
    path: CALENDAR,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const org = ctx.db.organizations.find((o) => o.id === self.organization_id);
      return ok({
        timezone: org?.timezone ?? "Asia/Makassar",
        workdays: workdaysOf(ctx.db, self.organization_id),
        shifts: ctx.db.work_shifts.filter((s) => s.organization_id === self.organization_id),
        can_edit: isManager(self),
      });
    },
  },
  {
    method: "PUT",
    path: CALENDAR,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const days = [...new Set(((ctx.body as { workdays?: number[] })?.workdays ?? []).filter((d) => d >= 1 && d <= 7))].sort();
      if (!days.length) return fail(422, "Pilih minimal satu hari kerja.");
      ctx.db.workdays[self.organization_id] = days;
      refresh(ctx.db, self.organization_id);
      return ok(null, "Hari kerja tersimpan.");
    },
  },
  {
    method: "POST",
    path: `${CALENDAR}/shift`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const shift = readShift(ctx.body);
      if (typeof shift === "string") return fail(422, shift);
      if (shiftNameTaken(ctx.db, self.organization_id, shift.name)) return fail(409, DUPLICATE_SHIFT);
      ctx.db.work_shifts.push({ ...shift, id: newId("shift"), organization_id: self.organization_id });
      return ok(null, "Shift tersimpan.", 201);
    },
  },
  {
    method: "PUT",
    path: `${CALENDAR}/shift/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const old = ctx.db.work_shifts.find((s) => s.id === ctx.params.id && s.organization_id === self.organization_id);
      if (!old) return fail(404, "Shift tidak ditemukan.");
      const shift = readShift(ctx.body);
      if (typeof shift === "string") return fail(422, shift);
      if (shiftNameTaken(ctx.db, self.organization_id, shift.name, old.id)) return fail(409, DUPLICATE_SHIFT);
      Object.assign(old, shift);
      refresh(ctx.db, self.organization_id);
      return ok(null, "Shift diperbarui.");
    },
  },
  {
    method: "DELETE",
    path: `${CALENDAR}/shift/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const old = ctx.db.work_shifts.find((s) => s.id === ctx.params.id && s.organization_id === self.organization_id);
      if (!old) return fail(404, "Shift tidak ditemukan.");
      const used = ctx.db.schedules.find((s) => s.rule.shift_id === old.id && s.rule.time_mode !== "fixed");
      if (used) return fail(409, `Shift masih dipakai tugas rutin "${used.title}".`);
      ctx.db.work_shifts = ctx.db.work_shifts.filter((s) => s.id !== old.id);
      return ok(null, "Shift dihapus.");
    },
  },
  {
    method: "GET",
    path: `${CALENDAR}/hari`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const year = ctx.query.get("year") ?? "";
      return ok(ctx.db.calendar_days.filter((d) => d.organization_id === self.organization_id && d.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date)));
    },
  },
  {
    method: "POST",
    path: `${CALENDAR}/hari`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const day = readDay((ctx.body ?? {}) as CalendarDayRequest);
      if (typeof day === "string") return fail(422, day);
      upsertDay(ctx.db, self.organization_id, day);
      refresh(ctx.db, self.organization_id);
      return ok(null, "Tanggal tersimpan.", 201);
    },
  },
  {
    method: "POST",
    path: `${CALENDAR}/hari/impor`,
    handler: async (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const file = ctx.body instanceof FormData ? ctx.body.get("file") : null;
      if (!(file instanceof File)) return fail(422, "Pilih berkas CSV.");
      if (file.size > 200_000) return fail(422, "Berkas CSV paling besar 200 KB.");
      const lines = (await file.text()).replace(/^﻿/, "").split(/\r?\n/);
      let added = 0;
      let updated = 0;
      const errors: string[] = [];
      lines.forEach((line, i) => {
        if (!line.trim() || (i === 0 && /^tanggal\b/i.test(line))) return;
        const [date = "", name = "", label = ""] = line.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
        const day = readDay({ date, name, label, kind: /hari kerja/i.test(label) ? "workday" : "holiday" });
        if (typeof day === "string") errors.push(`Baris ${i + 1}: ${day}`);
        else if (upsertDay(ctx.db, self.organization_id, day)) updated++;
        else added++;
      });
      if (!added && !updated) return fail(422, errors[0] ?? "Tidak ada baris yang bisa diimpor.");
      refresh(ctx.db, self.organization_id);
      return ok({ added, updated, errors: errors.slice(0, 20) }, "Impor selesai.");
    },
  },
  {
    method: "DELETE",
    path: `${CALENDAR}/hari/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const before = ctx.db.calendar_days.length;
      ctx.db.calendar_days = ctx.db.calendar_days.filter((d) => !(d.id === ctx.params.id && d.organization_id === self.organization_id));
      if (ctx.db.calendar_days.length === before) return fail(404, "Tanggal tidak ditemukan.");
      refresh(ctx.db, self.organization_id);
      return ok(null, "Tanggal dihapus.");
    },
  },
];

/** Anggota boleh mengatur cutinya sendiri; pemilik dan admin untuk siapa pun */
const leaveAccess = (ctx: MockContext) => {
  const self = requireMember(ctx);
  if (isFailure(self)) return self;
  const target = ctx.db.memberships.find((m) => m.id === ctx.params.id && m.organization_id === self.organization_id);
  if (!target) return fail(404, "Anggota tidak ditemukan.");
  if (self.access_role === "viewer" || (!isManager(self) && self.id !== target.id)) return fail(403, "Anda hanya dapat mengatur cuti Anda sendiri.");
  return target;
};

const leaveRoutes: MockRoute[] = [
  {
    method: "GET",
    path: LEAVE,
    handler: (ctx) => {
      const target = leaveAccess(ctx);
      if ("body" in target) return target;
      return ok(ctx.db.member_leaves.filter((l) => l.member_id === target.id).sort((a, b) => b.start_date.localeCompare(a.start_date)));
    },
  },
  {
    method: "POST",
    path: LEAVE,
    handler: (ctx) => {
      const target = leaveAccess(ctx);
      if ("body" in target) return target;
      const b = (ctx.body ?? {}) as { start_date?: string; end_date?: string; note?: unknown };
      const start = b.start_date ?? "";
      const end = b.end_date ?? "";
      if (!DATE.test(start) || !DATE.test(end) || end < start) return fail(422, "Isi rentang tanggal cuti yang benar.");
      if (ctx.db.member_leaves.some((l) => l.member_id === target.id && l.start_date <= end && start <= l.end_date)) return fail(409, "Tanggalnya bertumpuk dengan cuti lain.");
      ctx.db.member_leaves.push({ id: newId("cuti"), member_id: target.id, start_date: start, end_date: end, note: text(b.note, 200) });
      refresh(ctx.db, target.organization_id);
      return ok(null, "Cuti tersimpan.", 201);
    },
  },
  {
    method: "DELETE",
    path: `${LEAVE}/:leaveId`,
    handler: (ctx) => {
      const target = leaveAccess(ctx);
      if ("body" in target) return target;
      const before = ctx.db.member_leaves.length;
      ctx.db.member_leaves = ctx.db.member_leaves.filter((l) => !(l.id === ctx.params.leaveId && l.member_id === target.id));
      if (ctx.db.member_leaves.length === before) return fail(404, "Cuti tidak ditemukan.");
      refresh(ctx.db, target.organization_id);
      return ok(null, "Cuti dihapus.");
    },
  },
];

export const rutinRoutes: MockRoute[] = [...scheduleRoutes, ...calendarRoutes, ...leaveRoutes];
