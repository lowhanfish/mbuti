"use client";

import React, { useSyncExternalStore } from "react";
import { applyTheme, DEFAULT_THEME, readTheme, subscribeTheme, type Theme } from "@/lib/theme";
import { Icon } from "./admin-icons";

/** Tombol beralih tema gelap/terang. Pilihan disimpan di peramban ini. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // Di server tema belum diketahui; ikon bawaan dipakai sampai peramban membaca atribut <html>
  const theme = useSyncExternalStore<Theme>(subscribeTheme, readTheme, () => DEFAULT_THEME);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Pakai tema terang" : "Pakai tema gelap";

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={label}
      title={label}
      className={`relative w-10 h-10 rounded-2xl bg-surface/80 border border-rim text-muted hover:text-brand flex items-center justify-center transition-colors cursor-pointer ${className}`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
    </button>
  );
}
