import type { OfficeAgent, OfficeUnit } from "./types";

const DESK_DX = 2.5;
const DESK_DZ = 2.9;
/** Ruang tepi di kiri-kanan (lebar) dan depan-belakang (kedalaman) ruangan */
const PAD_W = 1.4;
const PAD_D = 1.8;
const GAP = 1.6;

/**
 * Jumlah meja per baris mengikuti jumlah orang agar ruangan mendekati persegi:
 * 1–4 orang 2 meja, 5–9 orang 3 meja, 10–16 orang 4 meja, dan seterusnya (paling banyak 6).
 */
export const deskColumns = (count: number) => Math.min(6, Math.max(2, Math.ceil(Math.sqrt(count))));

const roomSize = (count: number) => {
  const cols = deskColumns(count);
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, w: cols * DESK_DX + PAD_W, d: rows * DESK_DZ + PAD_D };
};

export type RoomLayout = {
  unit: OfficeUnit;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Meja per baris di ruangan ini */
  cols: number;
  agents: Array<{ agent: OfficeAgent; x: number; z: number }>;
};

const LOBBY: OfficeUnit = {
  id: "__lobby",
  name: "Belum ditempatkan",
  code: "LOBI",
  color: "#94a3b8",
  parent_id: null,
  lead_name: null,
  member_count: 0,
  document_count: 0,
  active_task_count: 0,
};

/** Urutkan unit seperti pohon: induk lalu sub-unitnya. */
const treeOrder = (units: OfficeUnit[]) => {
  const ids = new Set(units.map((u) => u.id));
  const out: OfficeUnit[] = [];
  const walk = (parent: string | null) => {
    for (const u of units.filter((x) => (x.parent_id && ids.has(x.parent_id) ? x.parent_id : null) === parent).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(u);
      walk(u.id);
    }
  };
  walk(null);
  return out;
};

/**
 * Denah kantor: satu ruangan per unit, ukurannya mengikuti jumlah orang di unit itu.
 * Ruangan disusun berurutan (seperti pohon unit) ke dalam baris dengan lebar sasaran yang membuat
 * denah mendekati persegi; ruangan dalam satu baris rata di sisi belakang.
 * Koordinat dunia (x, z) dengan pusat denah di titik (0, 0).
 */
export const buildLayout = (units: OfficeUnit[], agents: OfficeAgent[]) => {
  const ordered = treeOrder(units);
  const unplaced = agents.filter((a) => !a.unit_id || !units.some((u) => u.id === a.unit_id));
  if (unplaced.length) ordered.push(LOBBY);

  const sized = ordered.map((unit) => {
    const members = unit.id === LOBBY.id ? unplaced : agents.filter((a) => a.unit_id === unit.id);
    return { unit, members, ...roomSize(members.length) };
  });
  const area = sized.reduce((s, r) => s + (r.w + GAP) * (r.d + GAP), 0);
  const rowWidth = Math.max(...sized.map((r) => r.w), Math.sqrt(area) * 1.25);

  const rooms: RoomLayout[] = [];
  let zCursor = 0;
  let i = 0;
  while (i < sized.length) {
    const row = [sized[i++]];
    let width = row[0].w;
    while (i < sized.length && width + GAP + sized[i].w <= rowWidth) {
      width += GAP + sized[i].w;
      row.push(sized[i++]);
    }
    let xCursor = 0;
    for (const { unit, members, cols, w, d } of row) {
      const x = xCursor + w / 2;
      const z = zCursor + d / 2;
      xCursor += w + GAP;
      rooms.push({
        unit,
        x,
        z,
        w,
        d,
        cols,
        agents: members.map((agent, k) => ({
          agent,
          x: x - w / 2 + 1.45 + (k % cols) * DESK_DX,
          z: z - d / 2 + 1.5 + Math.floor(k / cols) * DESK_DZ,
        })),
      });
    }
    zCursor += Math.max(...row.map((r) => r.d)) + GAP;
  }

  // Pusatkan denah
  const minX = Math.min(...rooms.map((r) => r.x - r.w / 2));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w / 2));
  const minZ = Math.min(...rooms.map((r) => r.z - r.d / 2));
  const maxZ = Math.max(...rooms.map((r) => r.z + r.d / 2));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (const r of rooms) {
    r.x -= cx;
    r.z -= cz;
    for (const a of r.agents) {
      a.x -= cx;
      a.z -= cz;
    }
  }
  return { rooms, span: Math.max(maxX - minX, maxZ - minZ) };
};

/** Campur warna hex dengan putih (0 = asli, 1 = putih). */
export const tint = (hex: string, amount: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};
