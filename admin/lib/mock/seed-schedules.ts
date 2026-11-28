import { emptyRule } from "@/app/(admin)/admin/tugas/rutin/types";
import { isoDate, scheduleNext, type MockSchedule } from "./schedule";
import type { MockDatabase } from "./seed";

const ORG = "org-nusantara";
const at = (daysFromNow: number, time = "00:00") => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return new Date(`${isoDate(d)}T${time}:00`);
};

/** Kalender, shift, cuti, dan tugas rutin contoh (E2). Tanggalnya relatif terhadap hari ini. */
export const seedSchedules = (db: MockDatabase) => {
  db.work_shifts.push(
    { id: "shift-pagi", organization_id: ORG, name: "Pagi", start_time: "07:30", end_time: "15:30", weekdays: [1, 2, 3, 4, 5] },
    { id: "shift-malam", organization_id: ORG, name: "Piket malam", start_time: "22:00", end_time: "06:00", weekdays: [1, 2, 3, 4, 5, 6, 7] }
  );
  db.calendar_days.push(
    { id: "hari-1", organization_id: ORG, date: isoDate(at(3)), kind: "holiday", name: "Hari jadi daerah", label: "Libur daerah" },
    { id: "hari-2", organization_id: ORG, date: isoDate(at(12)), kind: "holiday", name: "Cuti bersama instansi", label: "Cuti bersama" }
  );
  db.member_leaves.push({ id: "cuti-1", member_id: "member-bayu", start_date: isoDate(at(6)), end_date: isoDate(at(8)), note: "Keperluan keluarga" });

  const base = { organization_id: ORG, inputs: {}, priority: "normal" as const, budget_limit: 5000, web_search: "role" as const, compose_mode: "role" as const, flow_id: null, flow_values: {}, created_by_member_id: "member-demo" };
  const schedules: MockSchedule[] = [
    {
      ...base,
      id: "rutin-surat",
      entry_agent_id: "agent-rani",
      title: "Rekap surat masuk harian",
      brief: "Rangkum surat masuk hari ini beserta tindak lanjut yang diperlukan.",
      rule: { ...emptyRule(isoDate(at(-14))), time: "15:00" },
      source_text: "Rekap surat masuk setiap hari kerja pukul 15.00",
      status: "active",
      next_run_at: null,
      created_at: at(-14).toISOString(),
      updated_at: at(-14).toISOString(),
    },
    {
      ...base,
      id: "rutin-bulanan",
      entry_agent_id: "agent-sekar",
      title: "Laporan keuangan bulanan",
      brief: "Susun ringkasan realisasi anggaran bulan berjalan.",
      rule: { ...emptyRule(isoDate(at(-60))), frequency: "monthly", month_day: 0, time: "09:00", on_holiday: "previous" },
      source_text: "Laporan keuangan setiap hari kerja terakhir tiap bulan jam 9",
      status: "paused",
      next_run_at: null,
      created_at: at(-60).toISOString(),
      updated_at: at(-5).toISOString(),
    },
  ];
  db.schedules.push(...schedules);
  for (const s of schedules) scheduleNext(db, s, Date.now());
  db.schedule_runs.push(
    { id: "run-seed-1", schedule_id: "rutin-surat", planned_for: at(-2, "15:00").toISOString(), status: "missed", attempt: 1, reason: "Penjadwal tidak berjalan saat jadwalnya.", task_id: null },
    { id: "run-seed-2", schedule_id: "rutin-surat", planned_for: at(-1, "15:00").toISOString(), status: "failed", attempt: 3, reason: "Layanan model tidak menjawab setelah 2 kali coba ulang.", task_id: null }
  );
};
