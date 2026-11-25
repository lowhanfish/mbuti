import type { OfficeAgent, OfficeUnit } from "./types";

export const DESK_COLS = 3;
const DESK_DX = 2.5;
const DESK_DZ = 2.9;
const ROOM_W = DESK_COLS * DESK_DX + 1.4;
const GAP = 1.6;

export type RoomLayout = {
  unit: OfficeUnit;
  x: number;
  z: number;
  w: number;
  d: number;
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
 * Denah kantor: satu ruangan per unit dalam kisi, meja tiga per baris.
 * Koordinat dunia (x, z) dengan pusat denah di titik (0, 0).
 */
export const buildLayout = (units: OfficeUnit[], agents: OfficeAgent[]) => {
  const ordered = treeOrder(units);
  const unplaced = agents.filter((a) => !a.unit_id || !units.some((u) => u.id === a.unit_id));
  if (unplaced.length) ordered.push(LOBBY);

  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(ordered.length))));
  const rooms: RoomLayout[] = [];
  let zCursor = 0;
  for (let rowStart = 0; rowStart < ordered.length; rowStart += cols) {
    const row = ordered.slice(rowStart, rowStart + cols);
    const depths = row.map((u) => {
      const count = u.id === LOBBY.id ? unplaced.length : agents.filter((a) => a.unit_id === u.id).length;
      return Math.max(1, Math.ceil(count / DESK_COLS)) * DESK_DZ + 1.8;
    });
    const rowDepth = Math.max(...depths);
    row.forEach((unit, i) => {
      const members = unit.id === LOBBY.id ? unplaced : agents.filter((a) => a.unit_id === unit.id);
      const x = i * (ROOM_W + GAP);
      const z = zCursor;
      rooms.push({
        unit,
        x,
        z,
        w: ROOM_W,
        d: rowDepth,
        agents: members.map((agent, k) => ({
          agent,
          x: x - ROOM_W / 2 + 1.45 + (k % DESK_COLS) * DESK_DX,
          z: z - rowDepth / 2 + 1.5 + Math.floor(k / DESK_COLS) * DESK_DZ,
        })),
      });
    });
    zCursor += rowDepth + GAP;
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
