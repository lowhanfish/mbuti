"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Button } from "../ui";
import { Icon } from "../admin-icons";
import {
  ACCESSORY_LABEL,
  CLOTH_COLORS,
  HAIR_COLORS,
  HAIR_STYLE_LABEL,
  SKIN_TONES,
  avatarFromSeed,
  type Accessory,
  type AvatarConfig,
  type HairStyle,
} from "./avatar-config";

/** Three.js hanya dimuat di peramban dan hanya saat editor dibuka. */
export const Avatar3DLazy = dynamic(() => import("./avatar-3d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-xs text-faint" role="status">
      Menyiapkan karakter…
    </div>
  ),
});

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={`${label} ${c}`}
            onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-lg border border-black/10 transition-transform cursor-pointer ${
              value === c ? "ring-2 ring-offset-2 ring-brand scale-110" : "hover:scale-110"
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {(Object.keys(options) as T[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => onChange(key)}
            className={`h-8 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              value === key ? "bg-ink text-accent" : "bg-white border border-line text-muted hover:text-brand hover:border-brand/40"
            }`}
          >
            {options[key]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AvatarEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof AvatarConfig>(key: K, v: AvatarConfig[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_1fr] items-start">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-brand-soft via-white to-accent-soft border border-white shadow-inner">
        <Avatar3DLazy avatar={value} className="h-[300px] w-full" />
        <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-faint pointer-events-none">
          Seret untuk memutar
        </span>
      </div>
      <fieldset disabled={disabled} className="space-y-4">
        <Swatches label="Warna kulit" colors={SKIN_TONES} value={value.skin} onChange={(c) => set("skin", c)} />
        <Chips<HairStyle> label="Gaya rambut" options={HAIR_STYLE_LABEL} value={value.hair_style} onChange={(v) => set("hair_style", v)} />
        <Swatches label="Warna rambut / topi" colors={HAIR_COLORS} value={value.hair} onChange={(c) => set("hair", c)} />
        <Swatches label="Baju" colors={CLOTH_COLORS} value={value.shirt} onChange={(c) => set("shirt", c)} />
        <Swatches label="Celana" colors={CLOTH_COLORS} value={value.pants} onChange={(c) => set("pants", c)} />
        <Chips<Accessory> label="Aksesori" options={ACCESSORY_LABEL} value={value.accessory} onChange={(v) => set("accessory", v)} />
        <Button
          variant="outline"
          size="sm"
          icon={<Icon name="sparkles" size={14} />}
          onClick={() => onChange(avatarFromSeed(`${Date.now()}-${Math.random()}`))}
        >
          Acak
        </Button>
      </fieldset>
    </div>
  );
}
