import type { CalendarDay, WorkShift } from "@/app/(admin)/admin/pengaturan/kalender/types";
import { WEEKDAY_LABEL, emptyRule, type Occurrence, type RunStatus, type ScheduleRule, type ScheduleStatus, type ScheduleTemplate } from "@/app/(admin)/admin/tugas/rutin/types";
import { createTask } from "./engine";
import { monthUsage } from "./settings";
import type { MockDatabase } from "./seed";

export type MockShift = WorkShift & { organization_id: string };
export type MockCalendarDay = CalendarDay & { organization_id: string };
export type MockLeave = { id: string; member_id: string; start_date: string; end_date: string; note: string };
export type MockSchedule = ScheduleTemplate & {
  id: string;
  organization_id: string;
  rule: ScheduleRule;
  source_text: string;
  status: ScheduleStatus;
  next_run_at: string | null;
  created_by_member_id: string;
  created_at: string;
  updated_at: string;
};
export type MockRun = { id: string; schedule_id: string; planned_for: string; status: RunStatus; attempt: number; reason: string; task_id: string | null };

export const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];
/** Putaran yang terlambat lebih dari ini dicatat terlewat */
const LATE_LIMIT_MS = 6 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");
// Data contoh memakai jam peramban; backend memakai zona waktu organisasi
const parseDate = (iso: string) => new Date(`${iso}T00:00:00`);
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const weekdayOf = (iso: string) => parseDate(iso).getDay() || 7;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export const workdaysOf = (db: MockDatabase, org: string) => db.workdays[org] ?? DEFAULT_WORKDAYS;

type Context = { workdays: number[]; shift: MockShift | null; days: Map<string, MockCalendarDay> };

const contextOf = (db: MockDatabase, org: string, rule: ScheduleRule): Context => ({
  workdays: workdaysOf(db, org),
  shift: rule.time_mode === "fixed" ? null : (db.work_shifts.find((s) => s.id === rule.shift_id && s.organization_id === org) ?? null),
  days: new Map(db.calendar_days.filter((d) => d.organization_id === org).map((d) => [d.date, d])),
});

/** Alasan sebuah tanggal bukan hari kerja; kosong berarti hari kerja */
const offReason = (ctx: Context, date: string) => {
  const special = ctx.days.get(date);
  if (special) return special.kind === "holiday" ? `Libur: ${special.name}` : "";
  const active = ctx.shift ? ctx.shift.weekdays : ctx.workdays;
  return active.includes(weekdayOf(date)) ? "" : ctx.shift ? `Shift ${ctx.shift.name} tidak berlaku` : "Libur mingguan";
};

const lastWorkday = (ctx: Context, year: number, month: number) => {
  let date = isoDate(new Date(year, month + 1, 0));
  for (let i = 0; i < 31 && offReason(ctx, date); i++) date = addDays(date, -1);
  return date;
};

/** Tanggal yang diminta aturan, sebelum aturan libur diterapkan */
const wanted = (ctx: Context, rule: ScheduleRule, date: string) => {
  const d = parseDate(date);
  switch (rule.frequency) {
    case "daily":
      return true;
    case "workdays":
      // Hari libur mingguan bukan putaran; libur di kalender tetap dihitung agar aturan libur berlaku
      return !offReason(ctx, date) || ctx.days.get(date)?.kind === "holiday";
    case "weekly":
      return rule.weekdays.includes(weekdayOf(date));
    case "dates":
      return rule.dates.includes(date);
    default: {
      const startMonth = parseDate(rule.start_date).getMonth();
      if (rule.frequency === "quarterly" && (d.getMonth() - startMonth + 12) % 3 !== 0) return false;
      if (rule.month_day === 0) return date === lastWorkday(ctx, d.getFullYear(), d.getMonth());
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(rule.month_day, last);
    }
  }
};

const timeOf = (ctx: Context, rule: ScheduleRule, seed: string) => {
  let minutes = ctx.shift ? minutesOf(rule.time_mode === "shift_start" ? ctx.shift.start_time : ctx.shift.end_time) + rule.offset_minutes : minutesOf(rule.time);
  // Sebaran tetap per jadwal dan tanggal agar pratinjau tidak berubah-ubah
  if (rule.spread_minutes) minutes += [...seed].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 100003, 7) % (rule.spread_minutes + 1);
  return clock(((minutes % 1440) + 1440) % 1440);
};

const onLeave = (db: MockDatabase, agentId: string, date: string) => {
  const owner = db.agents.find((a) => a.id === agentId)?.owner_member_id;
  return Boolean(owner && db.member_leaves.some((l) => l.member_id === owner && l.start_date <= date && date <= l.end_date));
};

/** Putaran setelah `after` (waktu lokal), termasuk yang dilewati, sampai `count` putaran yang jalan. */
export const occurrences = (db: MockDatabase, org: string, rule: ScheduleRule, agentId: string, after: Date, count = 5, seed = ""): Occurrence[] => {
  const ctx = contextOf(db, org, rule);
  if (rule.time_mode !== "fixed" && !ctx.shift) return [];
  const result: Occurrence[] = [];
  const taken = new Set<string>();
  let runs = 0;
  let date = [rule.start_date, addDays(isoDate(after), -14)].sort()[1];
  for (let i = 0; i < 800 && runs < count && result.length < count * 4; i++, date = addDays(date, 1)) {
    if (rule.end_date && date > rule.end_date) break;
    if (!wanted(ctx, rule, date)) continue;
    const reason = offReason(ctx, date);
    let target = date;
    // "Setiap hari" hanya terpengaruh libur di kalender, bukan libur mingguan
    const blocked = rule.frequency === "daily" ? ctx.days.get(date)?.kind === "holiday" : Boolean(reason);
    if (blocked && rule.on_holiday !== "skip") {
      const step = rule.on_holiday === "next" ? 1 : -1;
      for (let k = 0; k < 31 && offReason(ctx, target); k++) target = addDays(target, step);
    }
    const time = timeOf(ctx, rule, `${seed}${target}`);
    if (new Date(`${target}T${time}:00`) <= after) continue;
    if (blocked && rule.on_holiday === "skip") {
      result.push({ date, time, status: "skipped_holiday", moved_from: null, reason });
      continue;
    }
    if (taken.has(target)) continue;
    taken.add(target);
    if (rule.on_leave === "skip" && onLeave(db, agentId, target)) {
      result.push({ date: target, time, status: "skipped_leave", moved_from: null, reason: "Pemilik role sedang cuti" });
      continue;
    }
    const moved = target !== date;
    const waiting = rule.on_leave === "run" && onLeave(db, agentId, target);
    result.push({
      date: target,
      time,
      status: "run",
      moved_from: moved ? date : null,
      reason: [moved ? `Digeser dari ${date} (${reason})` : "", waiting ? "Pemilik cuti: persetujuan menunggu" : ""].filter(Boolean).join(" · "),
    });
    runs++;
  }
  return result;
};

export const ruleError = (db: MockDatabase, org: string, rule: ScheduleRule): string | null => {
  if (!rule.start_date) return "Isi tanggal mulai.";
  if (rule.end_date && rule.end_date < rule.start_date) return "Tanggal berakhir sebelum tanggal mulai.";
  if (rule.frequency === "weekly" && !rule.weekdays.length) return "Pilih minimal satu hari.";
  if (rule.frequency === "dates" && !rule.dates.length) return "Tambahkan minimal satu tanggal.";
  if (rule.time_mode === "fixed" && !/^\d{2}:\d{2}$/.test(rule.time)) return "Isi jam putaran.";
  if (rule.time_mode !== "fixed" && !contextOf(db, org, rule).shift) return "Pilih shift.";
  if (rule.spread_minutes < 0 || rule.spread_minutes > 240) return "Rentang sebar 0–240 menit.";
  if (Math.abs(rule.offset_minutes) > 720) return "Geser waktu paling banyak 720 menit.";
  return null;
};

export const ruleText = (db: MockDatabase, org: string, rule: ScheduleRule) => {
  const monthDay = rule.month_day === 0 ? "hari kerja terakhir" : `tanggal ${rule.month_day}`;
  const base = {
    daily: "Setiap hari",
    workdays: "Setiap hari kerja",
    weekly: `Setiap ${rule.weekdays.map((d) => WEEKDAY_LABEL[d]).join(", ") || "…"}`,
    monthly: `Setiap bulan pada ${monthDay}`,
    quarterly: `Setiap triwulan pada ${monthDay}`,
    dates: `Pada ${rule.dates.length} tanggal tertentu`,
  }[rule.frequency];
  const shift = contextOf(db, org, rule).shift;
  const offset = rule.offset_minutes ? ` ${Math.abs(rule.offset_minutes)} menit ${rule.offset_minutes < 0 ? "sebelum" : "sesudah"}` : " saat";
  const time =
    rule.time_mode === "fixed"
      ? `pukul ${rule.time.replace(":", ".")}`
      : `${offset.trim()} ${rule.time_mode === "shift_start" ? "awal" : "akhir"} shift ${shift?.name ?? "…"}`;
  const spread = rule.spread_minutes ? ` (disebar sampai ${rule.spread_minutes} menit)` : "";
  const holiday = { skip: "libur dilewati", previous: "libur dimajukan", next: "libur dimundurkan" }[rule.on_holiday];
  return `${base} ${time}${spread}, ${holiday}.`;
};

/** Penerjemah kalimat sederhana untuk data contoh; backend memakai Gemini. */
export const parseSentence = (db: MockDatabase, org: string, sentence: string, today: string) => {
  const t = sentence.toLowerCase();
  const rule = emptyRule(today);
  const notes: string[] = [];
  const days = WEEKDAY_LABEL.slice(1).map((d) => d.toLowerCase());
  const found = days.map((d, i) => (new RegExp(`\\b${d}\\b`).test(t) ? i + 1 : 0)).filter(Boolean);
  const range = t.match(new RegExp(`(${days.join("|")})\\s*(?:-|–|sampai|s\\.?d\\.?|hingga)\\s*(${days.join("|")})`));
  const monthDay = t.match(/tanggal\s+(\d{1,2})/);

  if (/triwulan|tiga bulan/.test(t)) rule.frequency = "quarterly";
  else if (/bulan|tanggal\s+\d|hari kerja terakhir/.test(t)) rule.frequency = "monthly";
  else if (range) {
    const from = days.indexOf(range[1]) + 1;
    const to = days.indexOf(range[2]) + 1;
    const span = Array.from({ length: ((to - from + 7) % 7) + 1 }, (_, i) => ((from - 1 + i) % 7) + 1).sort();
    if (span.join() === workdaysOf(db, org).join()) rule.frequency = "workdays";
    else Object.assign(rule, { frequency: "weekly", weekdays: span });
  } else if (found.length) Object.assign(rule, { frequency: "weekly", weekdays: found });
  else if (/hari kerja/.test(t)) rule.frequency = "workdays";
  else if (/setiap hari|harian|tiap hari/.test(t)) rule.frequency = "daily";
  else notes.push("Frekuensi tidak disebut; dipakai setiap hari kerja.");

  if (rule.frequency === "monthly" || rule.frequency === "quarterly") {
    rule.month_day = /hari kerja terakhir|akhir bulan/.test(t) ? 0 : monthDay ? Math.min(31, Number(monthDay[1]) || 1) : 1;
    if (!monthDay && rule.month_day === 1) notes.push("Tanggal tidak disebut; dipakai tanggal 1.");
  }

  const time = t.match(/(?:pukul|jam)\s*(\d{1,2})(?:[.:](\d{2}))?/);
  const shift = db.work_shifts.find((s) => s.organization_id === org && t.includes(`shift ${s.name.toLowerCase()}`));
  if (shift) {
    rule.time_mode = /awal|mulai/.test(t) ? "shift_start" : "shift_end";
    rule.shift_id = shift.id;
    const offset = t.match(/(\d{1,3})\s*menit\s*(sebelum|sesudah|setelah)/);
    if (offset) rule.offset_minutes = Number(offset[1]) * (offset[2] === "sebelum" ? -1 : 1);
  } else if (time) {
    let hour = Number(time[1]);
    if (/sore|malam/.test(t) && hour < 12) hour += 12;
    rule.time = `${pad(Math.min(23, hour))}:${time[2] ?? "00"}`;
  } else notes.push("Jam tidak disebut; dipakai 08.00.");

  if (/(maju|sebelumnya)/.test(t)) rule.on_holiday = "previous";
  else if (/(mundur|berikutnya)/.test(t)) rule.on_holiday = "next";

  const title = sentence
    .replace(/\b(setiap|tiap|pukul|jam|tanggal|pada|di)\b.*$/i, "")
    .replace(/[,.]+$/, "")
    .trim();
  return { rule, notes, title: title.slice(0, 150) };
};

const nextRun = (db: MockDatabase, s: MockSchedule, after: Date) => {
  const next = occurrences(db, s.organization_id, s.rule, s.entry_agent_id, after, 1, s.id).find((o) => o.status === "run");
  return next ? new Date(`${next.date}T${next.time}:00`).toISOString() : null;
};

export const scheduleNext = (db: MockDatabase, s: MockSchedule, now: number) => {
  s.next_run_at = s.status === "active" ? nextRun(db, s, new Date(now)) : null;
  if (s.status === "active" && !s.next_run_at) s.status = "ended";
};

const runId = () => `run-${Math.random().toString(36).slice(2, 10)}`;

/** Buat tugas untuk satu putaran, atau catat mengapa tidak bisa. */
export const startRun = (db: MockDatabase, s: MockSchedule, plannedFor: string, status: "created" | "backfill", at: number, reason = "") => {
  const agent = db.agents.find((a) => a.id === s.entry_agent_id);
  const run: MockRun = { id: runId(), schedule_id: s.id, planned_for: plannedFor, status, attempt: 1, reason, task_id: null };
  if (!agent || agent.status !== "active") Object.assign(run, { status: "failed", reason: "Role tidak aktif." });
  else if (monthUsage(db, s.organization_id, at).remaining <= 0) Object.assign(run, { status: "stopped_budget", reason: "Anggaran bulan ini habis." });
  else {
    run.task_id = createTask(
      db,
      {
        organization_id: s.organization_id,
        title: s.title,
        brief: s.brief,
        inputs: s.inputs,
        entry_agent_id: s.entry_agent_id,
        priority: s.priority,
        due_at: null,
        budget_limit: s.budget_limit,
        created_by_member_id: s.created_by_member_id,
        web_search: s.web_search,
        compose_mode: s.compose_mode,
        flow: s.flow_id ? { flow_id: s.flow_id, name: db.browser_flows.find((f) => f.id === s.flow_id)?.name ?? "", values: s.flow_values ?? {} } : null,
      },
      at
    ).id;
  }
  db.schedule_runs.push(run);
  return run;
};

/** Jalankan putaran yang sudah jatuh tempo (peran Celery beat di backend). */
export const advanceSchedules = (db: MockDatabase, now: number) => {
  let changed = false;
  for (const s of db.schedules) {
    for (let i = 0; i < 20 && s.status === "active" && s.next_run_at && Date.parse(s.next_run_at) <= now; i++) {
      const planned = s.next_run_at;
      if (now - Date.parse(planned) > LATE_LIMIT_MS) {
        db.schedule_runs.push({ id: runId(), schedule_id: s.id, planned_for: planned, status: "missed", attempt: 1, reason: "Penjadwal tidak berjalan saat jadwalnya.", task_id: null });
      } else startRun(db, s, planned, "created", now);
      scheduleNext(db, s, Date.parse(planned));
      changed = true;
    }
  }
  return changed;
};
