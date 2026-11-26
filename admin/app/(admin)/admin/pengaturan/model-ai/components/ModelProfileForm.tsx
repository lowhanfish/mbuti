"use client";

import React, { useState } from "react";
import { Badge, Button, Card, Select } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { isMockMode } from "@/lib/transport";
import { formatRupiah } from "../../../tugas/types";
import { SLOT_LABEL, type ModelSlot, type ResponseInterface, type UpdateInterface } from "../types";

const TONE: Record<ModelSlot, string> = {
  fast: "from-teal-300 to-emerald-500",
  balanced: "from-[#9b6bff] to-brand-strong",
  thorough: "from-[#ffd25c] to-accent-strong",
  fallback: "from-slate-400 to-slate-600",
};

const pick = (s: ResponseInterface) => Object.fromEntries(s.profiles.map((p) => [p.slot, p.model])) as UpdateInterface["models"];

export default function ModelProfileForm({
  settings,
  canEdit,
  saving,
  onSubmit,
}: {
  settings: ResponseInterface;
  canEdit: boolean;
  saving: boolean;
  onSubmit: (body: UpdateInterface) => void;
}) {
  const [models, setModels] = useState(() => pick(settings));
  const original = pick(settings);
  const dirty = settings.profiles.some((p) => models[p.slot] !== original[p.slot]);
  const options = settings.available_models.map((m) => ({ value: m.id, label: m.label }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ models });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2 stagger">
        {settings.profiles.map((p) => {
          const meta = SLOT_LABEL[p.slot];
          const model = settings.available_models.find((m) => m.id === models[p.slot]);
          return (
            <Card key={p.slot} interactive className="group">
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shrink-0 shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${TONE[p.slot]}`}
                  >
                    <Icon name={meta.icon} size={21} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-ink">{meta.label}</h3>
                      {p.slot !== "fallback" && (
                        <Badge size="sm" variant={p.agent_count ? "info" : "neutral"}>
                          {p.agent_count} role
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{meta.hint}</p>
                  </div>
                </div>
                <Select
                  id={`model-${p.slot}`}
                  label={`Model untuk profil ${meta.label.toLowerCase()}`}
                  disabled={!canEdit || saving}
                  value={models[p.slot]}
                  onChange={(e) => setModels((prev) => ({ ...prev, [p.slot]: e.target.value }))}
                  options={options}
                  helperText={model?.hint}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-canvas px-3 py-2 text-[11px] text-muted">
                  <span>
                    ± <strong className="text-ink">{model ? formatRupiah(model.estimated_step_cost) : "—"}</strong> per langkah
                  </span>
                  <span className="font-mono text-faint">{p.env_name}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted px-1">
        {isMockMode()
          ? "Daftar model dan biaya per langkah adalah data contoh. Biaya dipakai simulasi tugas; model cadangan disimpan, tetapi simulasi tidak memperagakan kejadian kuota habis."
          : "Biaya per langkah adalah perkiraan. Biaya sebenarnya dihitung dari token tiap panggilan dan harga model."}
      </p>

      {canEdit && (
        <div className="flex items-center justify-end gap-3 glass rounded-2xl px-4 py-3">
          {dirty && <span className="text-xs text-amber-700 mr-auto rise">Ada perubahan belum disimpan</span>}
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setModels(original)}>
            Batalkan
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty} icon={<Icon name="check" size={16} />}>
            Simpan model
          </Button>
        </div>
      )}
    </form>
  );
}
