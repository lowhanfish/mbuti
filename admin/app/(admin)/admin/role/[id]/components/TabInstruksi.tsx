"use client";

import React, { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, IconButton, Input, Select, Textarea } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import {
  INPUT_TYPE_LABEL,
  KNOWLEDGE_SCOPE_LABEL,
  MODEL_PROFILE_LABEL,
  OUTPUT_FORMAT_LABEL,
  type InputField,
  type InputFieldType,
  type KnowledgeScope,
  type ModelProfile,
  type OutputFormat,
  type ResponseInterface,
  type UpdateInterface,
} from "../../types";
import { useResponseModelSettings } from "../../../pengaturan/model-ai/hooks/crud";

type InstruksiFields = Pick<
  UpdateInterface,
  "instructions" | "input_spec" | "output_format" | "output_template" | "acceptance_criteria" | "knowledge_scope" | "model_profile"
>;

const pick = (r: ResponseInterface): InstruksiFields => ({
  instructions: r.instructions,
  input_spec: r.input_spec,
  output_format: r.output_format,
  output_template: r.output_template,
  acceptance_criteria: r.acceptance_criteria,
  knowledge_scope: r.knowledge_scope,
  model_profile: r.model_profile,
});

function OptionCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, { label: string; hint: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-muted mb-2">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(options) as T[]).map((key) => (
          <label
            key={key}
            className={`rounded-2xl border p-3 cursor-pointer transition-all ${
              value === key ? "border-brand bg-brand-soft/60 shadow-[0_0_0_3px_rgba(124,77,255,.12)]" : "border-line bg-white hover:border-brand/40"
            }`}
          >
            <input type="radio" className="sr-only" checked={value === key} onChange={() => onChange(key)} />
            <span className="block text-sm font-semibold text-ink">{options[key].label}</span>
            <span className="block text-[11px] text-muted leading-snug mt-0.5">{options[key].hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function TabInstruksi({
  role,
  canEdit,
  saving,
  onSave,
}: {
  role: ResponseInterface;
  canEdit: boolean;
  saving: boolean;
  onSave: (body: Partial<UpdateInterface>) => void;
}) {
  const [form, setForm] = useState<InstruksiFields>(() => pick(role));
  const [criterion, setCriterion] = useState("");
  const { Settings } = useResponseModelSettings();
  // Keterangan tiap profil ikut menyebut model yang dipilih di Pengaturan > Model AI
  const profileOptions = Object.fromEntries(
    (Object.keys(MODEL_PROFILE_LABEL) as ModelProfile[]).map((key) => {
      const model = Settings?.profiles.find((p) => p.slot === key)?.model;
      const { label, hint } = MODEL_PROFILE_LABEL[key];
      return [key, { label, hint: model ? `${hint} Model: ${model}` : hint }];
    })
  ) as typeof MODEL_PROFILE_LABEL;
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(role));
  const set = <K extends keyof InstruksiFields>(key: K, value: InstruksiFields[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateField = (index: number, patch: Partial<InputField>) =>
    set(
      "input_spec",
      form.input_spec.map((f, i) => (i === index ? { ...f, ...patch } : f))
    );

  const addCriterion = () => {
    const value = criterion.trim();
    if (!value) return;
    set("acceptance_criteria", [...form.acceptance_criteria, value]);
    setCriterion("");
  };

  return (
    <fieldset disabled={!canEdit || saving} className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cara kerja</CardTitle>
            <p className="text-xs text-muted mt-0.5">Langkah yang diikuti role. Tulis seperti uraian tugas untuk pegawai baru.</p>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Cara kerja"
            rows={8}
            value={form.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            placeholder={"1. Baca permintaan…\n2. Cari aturan di SOP…\n3. Susun hasil…"}
            className="font-mono text-[13px] leading-relaxed"
            maxLength={8000}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Isian saat diberi tugas</CardTitle>
            <p className="text-xs text-muted mt-0.5">Data yang harus diberikan pemberi tugas. Isian wajib yang kosong membuat role meminta dilengkapi.</p>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              icon={<Icon name="plus" size={14} />}
              onClick={() =>
                set("input_spec", [...form.input_spec, { key: "", label: "", type: "short_text", required: false }])
              }
            >
              Tambah isian
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {form.input_spec.length === 0 && <p className="text-sm text-faint">Belum ada isian. Role hanya menerima arahan bebas.</p>}
          {form.input_spec.map((field, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_170px_auto_auto] items-end rounded-2xl bg-canvas/70 p-3">
              <Input
                label={index === 0 ? "Label" : undefined}
                aria-label="Label isian"
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                placeholder="mis. Perihal"
              />
              <Select
                label={index === 0 ? "Jenis" : undefined}
                aria-label="Jenis isian"
                value={field.type}
                onChange={(e) => updateField(index, { type: e.target.value as InputFieldType })}
                options={Object.entries(INPUT_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
              <label className="h-10 flex items-center gap-2 text-xs font-semibold text-muted px-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                  className="accent-[var(--color-brand)] w-4 h-4"
                />
                Wajib
              </label>
              <IconButton label="Hapus isian" tone="danger" onClick={() => set("input_spec", form.input_spec.filter((_, i) => i !== index))}>
                <Icon name="trash" size={16} />
              </IconButton>
              {field.type === "choice" && (
                <div className="sm:col-span-4">
                  <Input
                    aria-label="Pilihan"
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) => updateField(index, { options: e.target.value.split(",").map((o) => o.trimStart()) })}
                    placeholder="Pilihan, pisahkan dengan koma"
                  />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hasil kerja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Bentuk hasil">
            {(Object.keys(OUTPUT_FORMAT_LABEL) as OutputFormat[]).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={form.output_format === key}
                onClick={() => set("output_format", key)}
                className={`h-11 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  form.output_format === key ? "bg-ink text-accent shadow-md" : "bg-white border border-line text-muted hover:text-ink"
                }`}
              >
                {OUTPUT_FORMAT_LABEL[key]}
              </button>
            ))}
          </div>
          {form.output_format === "template" && (
            <Textarea
              label="Templat hasil"
              rows={7}
              value={form.output_template}
              onChange={(e) => set("output_template", e.target.value)}
              className="font-mono text-[13px]"
              maxLength={4000}
            />
          )}

          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted">Kriteria hasil diterima</span>
            <ul className="space-y-1.5">
              {form.acceptance_criteria.map((c, i) => (
                <li key={`${c}-${i}`} className="flex items-center gap-2 rounded-xl bg-emerald-50/80 border border-emerald-100 pl-3 pr-1 py-1.5 text-sm text-ink">
                  <Icon name="check" size={15} className="text-emerald-600" />
                  <span className="flex-1">{c}</span>
                  <IconButton
                    label={`Hapus kriteria ${c}`}
                    tone="danger"
                    onClick={() => set("acceptance_criteria", form.acceptance_criteria.filter((_, j) => j !== i))}
                  >
                    <Icon name="close" size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="flex gap-2">
                <Input
                  aria-label="Kriteria baru"
                  value={criterion}
                  onChange={(e) => setCriterion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCriterion();
                    }
                  }}
                  placeholder="mis. Setiap angka menyebut sumbernya"
                  maxLength={200}
                />
                <Button variant="outline" onClick={addCriterion} disabled={!criterion.trim()}>
                  Tambah
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted">Role pemeriksa menilai hasil dengan kriteria ini.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pengetahuan dan model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <OptionCards<KnowledgeScope>
            label="Dokumen yang boleh dibaca"
            options={KNOWLEDGE_SCOPE_LABEL}
            value={form.knowledge_scope}
            onChange={(v) => set("knowledge_scope", v)}
          />
          <OptionCards<ModelProfile>
            label="Profil model Gemini"
            options={profileOptions}
            value={form.model_profile}
            onChange={(v) => set("model_profile", v)}
          />
        </CardContent>
      </Card>

      {canEdit && (
        <div className="sticky bottom-4 z-20 flex items-center justify-end gap-3 glass rounded-2xl px-4 py-3">
          {dirty && <span className="text-xs text-amber-700 mr-auto rise">Ada perubahan belum disimpan</span>}
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setForm(pick(role))}>
            Batalkan
          </Button>
          <Button
            loading={saving}
            disabled={!dirty}
            icon={<Icon name="check" size={16} />}
            onClick={() =>
              onSave({
                ...form,
                input_spec: form.input_spec
                  .filter((f) => f.label.trim())
                  .map((f) => ({ ...f, options: f.options?.map((o) => o.trim()).filter(Boolean) })),
              })
            }
          >
            Simpan instruksi
          </Button>
        </div>
      )}
    </fieldset>
  );
}
