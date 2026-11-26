"use client";

import React from "react";
import { Input, Select, Textarea } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import {
  PAYLOAD_LABEL,
  RELATION_STYLE,
  SELECTABLE_TRIGGERS,
  triggerLabel,
  type GraphNodeKind,
  type PayloadSpec,
  type RelationFields,
  type RelationTrigger,
  type RelationType,
} from "../types";

/** Isian aturan relasi; dipakai di modal relasi baru dan panel ubah relasi. */
export default function RelationForm({
  value,
  onChange,
  targetKind,
  sourceName,
  targetName,
  revisionLimit,
  disabled = false,
}: {
  value: RelationFields;
  onChange: (next: RelationFields) => void;
  targetKind: GraphNodeKind;
  sourceName: string;
  targetName: string;
  /** Batas revisi organisasi */
  revisionLimit: number;
  disabled?: boolean;
}) {
  const set = <K extends keyof RelationFields>(key: K, v: RelationFields[K]) => onChange({ ...value, [key]: v });
  const allowed: RelationType[] = targetKind === "human" ? ["escalate"] : ["handoff", "review", "consult"];
  const style = RELATION_STYLE[value.relation_type];

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted">Jenis relasi</span>
        <div className={`grid gap-2 ${allowed.length > 1 ? "grid-cols-3" : "grid-cols-1"}`} role="radiogroup" aria-label="Jenis relasi">
          {allowed.map((t) => {
            const s = RELATION_STYLE[t];
            const active = value.relation_type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ ...value, relation_type: t, requires_approval: t === "escalate" ? true : value.requires_approval })}
                className={`rounded-2xl border p-2.5 text-left transition-all cursor-pointer ${active ? "text-white shadow-lg" : "bg-white border-line hover:border-brand/40"}`}
                style={active ? { background: s.color, borderColor: s.color } : undefined}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <Icon name={s.icon} size={15} />
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted rounded-xl bg-canvas px-3 py-2">
          <strong className="text-ink">{sourceName}</strong> {style.verb} <strong className="text-ink">{targetName}</strong>. {style.hint}
        </p>
      </div>

      <Input label="Nama singkat (tampil di garis)" value={value.label} onChange={(e) => set("label", e.target.value)} placeholder={style.label} maxLength={60} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Kapan dijalankan"
          value={value.trigger}
          onChange={(e) => set("trigger", e.target.value as RelationTrigger)}
          options={(SELECTABLE_TRIGGERS.includes(value.trigger) ? SELECTABLE_TRIGGERS : [...SELECTABLE_TRIGGERS, value.trigger]).map((v) => ({
            value: v,
            label: triggerLabel(value.relation_type, v),
          }))}
        />
        <Select
          label="Yang dikirim"
          value={value.payload_spec}
          onChange={(e) => set("payload_spec", e.target.value as PayloadSpec)}
          options={Object.entries(PAYLOAD_LABEL).map(([v, label]) => ({ value: v, label }))}
        />
      </div>
      {value.trigger === "on_condition" && (
        <Textarea
          label="Kondisi"
          rows={2}
          value={value.condition}
          onChange={(e) => set("condition", e.target.value)}
          placeholder="mis. Nilai pembayaran di atas Rp50 juta"
          helperText={
            value.relation_type === "consult"
              ? "Dinilai model profil cepat dari isi tugas, sebelum role sumber bekerja."
              : "Dinilai model profil cepat dari hasil kerja role sumber."
          }
          maxLength={500}
        />
      )}
      <Textarea
        label="Yang diharapkan dari penerima"
        rows={2}
        value={value.expected_output}
        onChange={(e) => set("expected_output", e.target.value)}
        maxLength={500}
      />

      {value.relation_type === "review" && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-muted">Batas putaran revisi</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={value.max_revisions === n}
                disabled={n > revisionLimit && value.max_revisions !== n}
                onClick={() => set("max_revisions", n)}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                  value.max_revisions === n ? "bg-accent text-ink shadow-md" : "bg-white border border-line text-muted hover:text-ink"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">Setelah batas habis, tugas dieskalasi ke penanggung jawab manusia.</p>
          {(value.max_revisions > revisionLimit || revisionLimit < 5) && (
            <p className="text-[11px] text-amber-700">
              {revisionLimit === 0
                ? "Organisasi mematikan revisi otomatis: temuan pemeriksa langsung diputuskan manusia."
                : `Batas organisasi ${revisionLimit}×${value.max_revisions > revisionLimit ? `, jadi relasi ini hanya berjalan sampai ${revisionLimit}×` : ""}.`}{" "}
              Diatur di Pengaturan &gt; Batas Biaya.
            </p>
          )}
        </div>
      )}

      {value.relation_type !== "escalate" && (
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 cursor-pointer">
          <span>
            <span className="block text-sm font-semibold text-ink">Perlu persetujuan manusia dulu</span>
            <span className="block text-[11px] text-muted">Tugas berhenti sebelum relasi ini dijalankan.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={value.requires_approval}
            onChange={(e) => set("requires_approval", e.target.checked)}
            className="w-10 h-6 appearance-none rounded-full bg-line checked:bg-brand relative cursor-pointer transition-colors before:content-[''] before:absolute before:top-1 before:left-1 before:w-4 before:h-4 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-4"
          />
        </label>
      )}
    </fieldset>
  );
}
