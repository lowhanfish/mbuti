/**
 * Bentuk karakter blok untuk role AI. Dipakai oleh avatar 2D (kartu), 3D (pratinjau), dan kantor 3D (tahap A6).
 * Karakter dan nama buatan sendiri; tidak memakai aset atau merek pihak lain.
 */
export type HairStyle = "short" | "long" | "bun" | "cap" | "bald";
export type Accessory = "none" | "glasses" | "headset" | "tie" | "flower" | "antenna";

export interface AvatarConfig {
  skin: string;
  hair: string;
  hair_style: HairStyle;
  shirt: string;
  pants: string;
  accessory: Accessory;
}

export const SKIN_TONES = ["#f6d5b8", "#eebd94", "#d9a074", "#b97a4f", "#8d5a37", "#5e3a22"];
export const HAIR_COLORS = ["#1f1a24", "#4a2e1f", "#8a5a2b", "#d9a441", "#c2410c", "#6d28d9"];
export const CLOTH_COLORS = [
  "#7c4dff",
  "#ffb81c",
  "#18122b",
  "#ec4899",
  "#14b8a6",
  "#0ea5e9",
  "#f97316",
  "#84cc16",
  "#ffffff",
  "#64748b",
];

export const HAIR_STYLE_LABEL: Record<HairStyle, string> = {
  short: "Pendek",
  long: "Panjang",
  bun: "Sanggul",
  cap: "Topi",
  bald: "Tanpa rambut",
};

export const ACCESSORY_LABEL: Record<Accessory, string> = {
  none: "Tidak ada",
  glasses: "Kacamata",
  headset: "Headset",
  tie: "Dasi",
  flower: "Bunga",
  antenna: "Antena lebah",
};

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: SKIN_TONES[1],
  hair: HAIR_COLORS[0],
  hair_style: "short",
  shirt: CLOTH_COLORS[0],
  pants: CLOTH_COLORS[2],
  accessory: "none",
};

/** Avatar acak yang tetap untuk nama yang sama, dipakai saat role baru dibuat. */
export const avatarFromSeed = (seed: string): AvatarConfig => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = <T,>(list: readonly T[], shift: number) => list[(h >>> shift) % list.length];
  const styles: HairStyle[] = ["short", "long", "bun", "cap", "short"];
  const accessories: Accessory[] = ["none", "glasses", "headset", "tie", "flower", "antenna"];
  return {
    skin: pick(SKIN_TONES, 1),
    hair: pick(HAIR_COLORS, 4),
    hair_style: pick(styles, 7),
    shirt: pick(CLOTH_COLORS.slice(0, 8), 10),
    pants: pick(["#18122b", "#334155", "#1e3a8a", "#3f3f46"], 13),
    accessory: pick(accessories, 16),
  };
};
