/**
 * Mode penyusunan untuk mode data contoh (E3c). Di backend, daftar bagian buatan role ditulis model;
 * di sini isinya tetap menurut mode.
 */
import { COMPOSE_MODE_LABEL, type ComposedItem, type ComposeMode } from "@/app/(admin)/admin/role/types";
import type { ComposeChoice } from "@/app/(admin)/admin/tugas/types";

export const COMPOSE_MODES = Object.keys(COMPOSE_MODE_LABEL) as ComposeMode[];

export const composeChoice = (value: unknown): ComposeChoice => (COMPOSE_MODES.includes(value as ComposeMode) ? (value as ComposeMode) : "role");

/** Pilihan tugas mengalahkan mode role */
export const effectiveMode = (choice: ComposeChoice | undefined, roleMode: ComposeMode | undefined): ComposeMode =>
  choice && choice !== "role" ? choice : roleMode ?? "data";

export const composedFor = (mode: ComposeMode): ComposedItem[] =>
  mode === "data"
    ? []
    : mode === "complete"
      ? [{ part: "Analisis dan saran", note: "disusun dari arahan karena data pendukungnya tidak ada" }]
      : [
          { part: "Isi dokumen", note: "disusun tanpa data masukan" },
          { part: "Angka dan tanggal", note: "dibuat sebagai contoh; ganti dengan data asli" },
        ];

export const modeText = (mode: ComposeMode, composed: ComposedItem[]) =>
  `mode ${COMPOSE_MODE_LABEL[mode].label}${composed.length ? `, ${composed.length} bagian disusun sendiri` : ""}`;
