"use client";

import React, { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { formatRupiah } from "../../../tugas/types";
import { LIMITS, type ResponseInterface, type UpdateInterface } from "../types";

/** Angka disimpan sebagai teks agar kotak isian bisa dikosongkan saat mengetik. */
type FormState = Record<keyof UpdateInterface, string>;

const pick = (b: ResponseInterface): FormState => ({
  monthly_budget: String(b.monthly_budget),
  default_task_budget: String(b.default_task_budget),
  max_steps_per_task: String(b.max_steps_per_task),
  max_revisions: String(b.max_revisions),
});

const check = (value: string, range: { min: number; max: number }, format: (n: number) => string = String) => {
  const n = Number(value);
  return value !== "" && Number.isInteger(n) && n >= range.min && n <= range.max
    ? undefined
    : `Isi antara ${format(range.min)} dan ${format(range.max)}.`;
};

const REVISION_CHOICES = Array.from({ length: LIMITS.max_revisions.max + 1 }, (_, i) => i);

export default function BudgetForm({
  budget,
  canEdit,
  saving,
  onSubmit,
}: {
  budget: ResponseInterface;
  canEdit: boolean;
  saving: boolean;
  onSubmit: (body: UpdateInterface) => void;
}) {
  const [form, setForm] = useState<FormState>(() => pick(budget));
  const original = pick(budget);
  const keys = Object.keys(form) as Array<keyof FormState>;
  const dirty = keys.some((k) => form[k] !== original[k]);
  const set = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const errors = {
    monthly_budget: check(form.monthly_budget, LIMITS.monthly_budget, formatRupiah),
    default_task_budget:
      check(form.default_task_budget, LIMITS.task_budget, formatRupiah) ??
      (Number(form.default_task_budget) > Number(form.monthly_budget) ? "Tidak boleh melebihi batas bulanan." : undefined),
    max_steps_per_task: check(form.max_steps_per_task, LIMITS.max_steps_per_task),
  };
  const invalid = Object.values(errors).some(Boolean);
  const revisions = Number(form.max_revisions);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        onSubmit(Object.fromEntries(keys.map((k) => [k, Number(form[k])])) as unknown as UpdateInterface);
      }}
      className="space-y-4"
    >
      <fieldset disabled={!canEdit || saving} className="grid gap-4 lg:grid-cols-2 stagger">
        <Card>
          <CardHeader>
            <CardTitle>Biaya</CardTitle>
            <Icon name="wallet" size={18} className="text-brand" />
          </CardHeader>
          <CardContent className="space-y-5">
            <Input
              id="monthly_budget"
              label="Batas bulanan organisasi (Rp)"
              type="number"
              inputMode="numeric"
              step={1000}
              value={form.monthly_budget}
              error={errors.monthly_budget}
              onChange={(e) => set("monthly_budget", e.target.value)}
              helperText={`${formatRupiah(Number(form.monthly_budget) || 0)} per bulan kalender. Bila habis, tugas baru ditolak.`}
            />
            <Input
              id="default_task_budget"
              label="Batas bawaan per tugas (Rp)"
              type="number"
              inputMode="numeric"
              step={500}
              value={form.default_task_budget}
              error={errors.default_task_budget}
              onChange={(e) => set("default_task_budget", e.target.value)}
              helperText="Terisi otomatis di form Buat tugas dan masih bisa diubah per tugas."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Langkah dan revisi</CardTitle>
            <Icon name="flow" size={18} className="text-brand" />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Input
                id="max_steps_per_task"
                label="Batas langkah per tugas"
                type="number"
                inputMode="numeric"
                value={form.max_steps_per_task}
                error={errors.max_steps_per_task}
                onChange={(e) => set("max_steps_per_task", e.target.value)}
                helperText="Satu langkah adalah satu kali kerja sebuah role. Mencegah putaran tanpa akhir."
              />
              <input
                type="range"
                aria-label="Geser batas langkah"
                min={LIMITS.max_steps_per_task.min}
                max={LIMITS.max_steps_per_task.max}
                value={Number(form.max_steps_per_task) || LIMITS.max_steps_per_task.min}
                onChange={(e) => set("max_steps_per_task", e.target.value)}
                className="w-full accent-brand cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted">Batas putaran revisi</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Batas putaran revisi">
                {REVISION_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={revisions === n}
                    onClick={() => set("max_revisions", String(n))}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:cursor-not-allowed ${
                      revisions === n ? "bg-accent text-ink shadow-md scale-105" : "bg-surface border border-line text-muted hover:text-ink"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted">
                {revisions === 0
                  ? "Revisi otomatis dimatikan: temuan pemeriksa langsung diputuskan manusia."
                  : `Relasi Periksa boleh meminta revisi paling banyak ${revisions}×, walau diatur lebih tinggi di peta.`}
              </p>
            </div>
          </CardContent>
        </Card>
      </fieldset>

      <p className="text-[11px] text-muted px-1">
        Batas langkah dan revisi langsung berlaku, termasuk untuk tugas yang sedang berjalan. Batas biaya per tugas tersimpan pada tiap
        tugas saat dibuat.
      </p>

      {canEdit && (
        <div className="flex items-center justify-end gap-3 glass rounded-2xl px-4 py-3">
          {dirty && <span className="text-xs text-amber-700 mr-auto rise">Ada perubahan belum disimpan</span>}
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setForm(original)}>
            Batalkan
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty || invalid} icon={<Icon name="check" size={16} />}>
            Simpan batas
          </Button>
        </div>
      )}
    </form>
  );
}
