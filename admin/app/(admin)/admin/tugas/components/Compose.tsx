"use client";

import React from "react";
import { Badge, Select } from "../../../_components/ui";
import { COMPOSE_MODE_LABEL, type ComposedItem, type ComposeMode } from "../../role/types";
import type { ComposeChoice } from "../types";

const MODES = Object.keys(COMPOSE_MODE_LABEL) as ComposeMode[];

/** Pilihan mode penyusunan untuk satu tugas atau tugas rutin (E3c). */
export function ComposeSelect({ value, roleMode, onChange }: { value: ComposeChoice; roleMode?: ComposeMode; onChange: (v: ComposeChoice) => void }) {
  const effective = value === "role" ? roleMode ?? "data" : value;
  return (
    <Select
      label="Mode penyusunan"
      value={value}
      onChange={(e) => onChange(e.target.value as ComposeChoice)}
      helperText={COMPOSE_MODE_LABEL[effective].hint}
      options={[
        { value: "role", label: `Ikut role (${COMPOSE_MODE_LABEL[roleMode ?? "data"].label})` },
        ...MODES.map((m) => ({ value: m, label: COMPOSE_MODE_LABEL[m].label })),
      ]}
    />
  );
}

export function ComposeBadge({ mode }: { mode: ComposeMode | null }) {
  if (!mode || mode === "data") return null;
  return (
    <Badge size="sm" variant={mode === "free" ? "warning" : "info"}>
      {COMPOSE_MODE_LABEL[mode].label}
    </Badge>
  );
}

/** Daftar bagian buatan role, untuk diperiksa; tidak ikut tercetak di dokumen. */
export function ComposedList({ items }: { items: ComposedItem[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <p className="font-bold">Disusun sendiri oleh role ({items.length}), periksa sebelum dipakai</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.part + item.note}>
            <span className="font-semibold">{item.part}</span>
            {item.note && <span>: {item.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
