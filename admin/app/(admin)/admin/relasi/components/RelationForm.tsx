"use client";

import React from "react";
import { Input, Select, Textarea } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import {
  PAYLOAD_LABEL,
  RELATION_STYLE,
  TRIGGER_LABEL,
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
  disabled = false,
}: {
  value: RelationFields;
  onChange: (next: RelationFields) => void;
  targetKind: GraphNodeKind;
  sourceName: string;
  targetName: string;
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
          options={Object.entries(TRIGGER_LABEL).map(([v, label]) => ({ value: v, label }))}
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
          helperText="Dinilai model profil cepat dari hasil kerja role sumber."
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
                onClick={() => set("max_revisions", n)}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  value.max_revisions === n ? "bg-accent text-ink shadow-md" : "bg-white border border-line text-muted hover:text-ink"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">Setelah batas habis, tugas dieskalasi ke penanggung jawab manusia.</p>
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
