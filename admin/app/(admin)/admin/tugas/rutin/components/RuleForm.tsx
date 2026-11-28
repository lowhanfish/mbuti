"use client";

import Link from "next/link";
import React from "react";
import { Button, Input, Select } from "../../../../_components/ui";
import type { WorkShift } from "../../../pengaturan/kalender/types";
import { FREQUENCY_LABEL, WEEKDAY_LABEL, formatDay, type Frequency, type OnFail, type OnHoliday, type OnLeave, type ScheduleRule, type TimeMode } from "../types";

const options = <T extends string>(map: Record<T, string>) => Object.entries(map).map(([value, label]) => ({ value, label: label as string }));

export default function RuleForm({ rule, shifts, onChange }: { rule: ScheduleRule; shifts: WorkShift[]; onChange: (rule: ScheduleRule) => void }) {
  const set = <K extends keyof ScheduleRule>(key: K, value: ScheduleRule[K]) => onChange({ ...rule, [key]: value });
  const shiftBased = rule.time_mode !== "fixed";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Frekuensi" value={rule.frequency} options={options(FREQUENCY_LABEL)} onChange={(e) => set("frequency", e.target.value as Frequency)} />
        {(rule.frequency === "monthly" || rule.frequency === "quarterly") && (
          <Select label="Pada tanggal" value={String(rule.month_day)} onChange={(e) => set("month_day", Number(e.target.value))}>
            <option value="0">Hari kerja terakhir</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Tanggal {i + 1}
              </option>
            ))}
          </Select>
        )}
        {rule.frequency === "dates" && (
          <Input
            label="Tambah tanggal"
            type="date"
            value=""
            onChange={(e) => e.target.value && !rule.dates.includes(e.target.value) && set("dates", [...rule.dates, e.target.value].sort())}
          />
        )}
      </div>

      {rule.frequency === "weekly" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hari">
          {WEEKDAY_LABEL.slice(1).map((label, i) => {
            const day = i + 1;
            const on = rule.weekdays.includes(day);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => set("weekdays", on ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day].sort())}
                className={`h-9 px-3 rounded-xl text-xs font-semibold cursor-pointer transition-all ${on ? "bg-brand text-white" : "bg-surface border border-line text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {rule.frequency === "dates" && rule.dates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rule.dates.map((d) => (
            <button
              key={d}
              type="button"
              title="Hapus tanggal"
              onClick={() => set("dates", rule.dates.filter((x) => x !== d))}
              className="rounded-full bg-brand-soft text-brand-strong text-xs font-semibold px-3 py-1 cursor-pointer"
            >
              {formatDay(d)} ✕
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Waktu"
          value={rule.time_mode}
          options={options<TimeMode>({ fixed: "Jam tetap", shift_start: "Awal shift", shift_end: "Akhir shift" })}
          onChange={(e) => {
            const mode = e.target.value as TimeMode;
            onChange({ ...rule, time_mode: mode, shift_id: mode === "fixed" ? null : (rule.shift_id ?? shifts[0]?.id ?? null) });
          }}
        />
        {shiftBased ? (
          <>
            <Select label="Shift" value={rule.shift_id ?? ""} onChange={(e) => set("shift_id", e.target.value || null)}>
              <option value="">— Pilih shift —</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time}–{s.end_time})
                </option>
              ))}
            </Select>
            <Input label="Geser (menit)" type="number" step={5} min={-720} max={720} value={rule.offset_minutes} onChange={(e) => set("offset_minutes", Number(e.target.value))} helperText="Negatif = sebelumnya" />
          </>
        ) : (
          <Input label="Jam" type="time" value={rule.time} onChange={(e) => set("time", e.target.value)} />
        )}
        <Input label="Rentang sebar (menit)" type="number" min={0} max={240} step={5} value={rule.spread_minutes} onChange={(e) => set("spread_minutes", Number(e.target.value))} helperText="0 = tepat pada jamnya" />
      </div>
      {shiftBased && shifts.length === 0 && (
        <p className="text-xs text-amber-700">
          Belum ada shift. Tambahkan di{" "}
          <Link href="/admin/pengaturan/kalender" className="font-bold underline">
            Kalender kerja
          </Link>
          .
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Mulai" type="date" value={rule.start_date} onChange={(e) => set("start_date", e.target.value)} />
        <div className="flex items-end gap-2">
          <Input label="Berakhir" type="date" value={rule.end_date ?? ""} onChange={(e) => set("end_date", e.target.value || null)} helperText="Kosong = tanpa batas" />
          {rule.end_date && (
            <Button size="sm" variant="ghost" onClick={() => set("end_date", null)}>
              Hapus
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Jatuh pada hari libur"
          value={rule.on_holiday}
          options={options<OnHoliday>({ skip: "Lewati", previous: "Maju ke hari kerja sebelumnya", next: "Mundur ke hari kerja berikutnya" })}
          onChange={(e) => set("on_holiday", e.target.value as OnHoliday)}
        />
        <Select
          label="Pemilik role cuti"
          value={rule.on_leave}
          options={options<OnLeave>({ run: "Tetap jalan, persetujuan menunggu", skip: "Lewati" })}
          onChange={(e) => set("on_leave", e.target.value as OnLeave)}
        />
        <Select
          label="Bila tetap gagal"
          value={rule.on_fail}
          options={options<OnFail>({ backfill: "Susulan di hari kerja berikutnya", skip: "Lewati" })}
          onChange={(e) => set("on_fail", e.target.value as OnFail)}
          helperText="Setelah 2 kali coba ulang"
        />
      </div>
    </div>
  );
}
