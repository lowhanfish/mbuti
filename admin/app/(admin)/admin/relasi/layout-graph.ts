import type { GraphNode, RelationInterface } from "./types";

/** Kartu role lebar 220 px dan tinggi sekitar 80 px */
const COL_W = 300;
const ROW_H = 110;
/** Jarak antar-kelompok (alur terpisah, atau blok role tanpa relasi) */
const GROUP_GAP = 90;
/** Role tanpa relasi disusun dalam kisi, paling banyak sekian kartu per baris */
const GRID_COLS = 4;

type Point = { x: number; y: number };

/** Hitung keturunan semua node, untuk menyorot rute dari node yang dipilih. */
export const downstream = (startId: string, relations: RelationInterface[]) => {
  const nodes = new Set([startId]);
  const edges = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const r of relations) {
      if (r.source_id !== current) continue;
      edges.add(r.id);
      if (!nodes.has(r.target_id)) {
        nodes.add(r.target_id);
        queue.push(r.target_id);
      }
    }
  }
  return { nodes, edges };
};

const unitOf = (n: GraphNode) => (n.kind === "agent" ? (n.unit_name ?? "~") : "~~");
const byUnitThenName = (a: GraphNode, b: GraphNode) =>
  unitOf(a).localeCompare(unitOf(b), "id") || a.name.localeCompare(b.name, "id");

/** Kelompok node yang saling terhubung (arah garis diabaikan). */
function components(ids: string[], edges: [string, string][]): string[][] {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (const [a, b] of edges) parent.set(find(a), find(b));
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()];
}

/**
 * Lapisan tiap node = jalur terpanjang dari node awal, mengikuti arah relasi.
 * Garis yang membentuk putaran (mis. revisi balik) diabaikan agar tidak berulang tanpa henti.
 */
function layers(ids: string[], edges: [string, string][]): Map<string, number> {
  const out = new Map(ids.map((id) => [id, [] as string[]]));
  for (const [a, b] of edges) out.get(a)?.push(b);
  const state = new Map<string, 1 | 2>();
  const acyclic = new Map(ids.map((id) => [id, [] as string[]]));
  const visit = (id: string) => {
    state.set(id, 1);
    for (const next of out.get(id) ?? []) {
      if (state.get(next) === 1) continue; // garis balik
      acyclic.get(id)!.push(next);
      if (!state.has(next)) visit(next);
    }
    state.set(id, 2);
  };
  const incoming = new Set(edges.map(([, b]) => b));
  for (const id of [...ids.filter((i) => !incoming.has(i)), ...ids]) if (!state.has(id)) visit(id);

  const layer = new Map(ids.map((id) => [id, 0]));
  // Relaksasi berulang cukup untuk graf kecil; batas putaran mencegah macet
  for (let round = 0; round < ids.length; round++) {
    let changed = false;
    for (const [a, targets] of acyclic) {
      for (const b of targets) {
        if (layer.get(b)! < layer.get(a)! + 1) {
          layer.set(b, layer.get(a)! + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  // Node awal digeser ke kanan, tepat sebelum tujuan terdekatnya, agar garisnya tidak melompati kolom
  for (const id of ids) {
    if (incoming.has(id) || !acyclic.get(id)!.length) continue;
    layer.set(id, Math.min(...acyclic.get(id)!.map((t) => layer.get(t)!)) - 1);
  }
  return layer;
}

/** Susun satu alur: kolom per lapisan, urutan dalam kolom dikurangi silangnya dengan metode barycenter. */
function layoutFlow(ids: string[], edges: [string, string][], nodeById: Map<string, GraphNode>, top: number) {
  const layer = layers(ids, edges);
  const columns: string[][] = [];
  for (const id of ids) {
    const l = layer.get(id)!;
    (columns[l] ??= []).push(id);
  }
  for (const col of columns) col.sort((a, b) => byUnitThenName(nodeById.get(a)!, nodeById.get(b)!));

  const neighbours = (id: string, dir: "in" | "out") =>
    edges.filter(([a, b]) => (dir === "in" ? b === id : a === id)).map(([a, b]) => (dir === "in" ? a : b));
  const index = () => new Map(columns.flatMap((col) => col.map((id, i) => [id, i] as const)));

  for (let sweep = 0; sweep < 6; sweep++) {
    const forward = sweep % 2 === 0;
    const order = forward ? columns.map((_, i) => i).slice(1) : columns.map((_, i) => i).slice(0, -1).reverse();
    for (const c of order) {
      const pos = index();
      const score = new Map(
        columns[c].map((id, i) => {
          const near = neighbours(id, forward ? "in" : "out").filter((n) => layer.get(n) === c + (forward ? -1 : 1));
          return [id, near.length ? near.reduce((s, n) => s + pos.get(n)!, 0) / near.length : i] as const;
        })
      );
      columns[c].sort((a, b) => score.get(a)! - score.get(b)!);
    }
  }

  const tallest = Math.max(...columns.map((col) => col.length));
  const result: Record<string, Point> = {};
  columns.forEach((col, c) => {
    const offset = ((tallest - col.length) * ROW_H) / 2;
    col.forEach((id, i) => {
      result[id] = { x: c * COL_W + (nodeById.get(id)!.kind === "human" ? 30 : 0), y: top + offset + i * ROW_H };
    });
  });
  return { result, height: tallest * ROW_H };
}

/**
 * Susunan otomatis yang mengikuti relasi:
 * 1. Setiap alur yang saling terhubung disusun kiri ke kanan sesuai arah relasi, alur terbesar di atas.
 * 2. Role tanpa relasi dikumpulkan per unit dalam kisi di bawahnya.
 * Posisi yang sudah disimpan tetap dipakai; node baru ditaruh di bawah node yang sudah ada.
 */
export const autoLayout = (nodes: GraphNode[], saved: Record<string, Point>, relations: RelationInterface[] = []) => {
  const result: Record<string, Point> = {};
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const free = nodes.filter((n) => !saved[n.id]);
  for (const n of nodes) if (saved[n.id]) result[n.id] = saved[n.id];

  const freeIds = new Set(free.map((n) => n.id));
  const edges = relations
    .filter((r) => r.source_id !== r.target_id && freeIds.has(r.source_id) && freeIds.has(r.target_id))
    .map((r) => [r.source_id, r.target_id] as [string, string]);

  const savedPoints = Object.values(result);
  let top = savedPoints.length ? Math.max(...savedPoints.map((p) => p.y)) + ROW_H + GROUP_GAP : 0;
  const left = savedPoints.length ? Math.min(...savedPoints.map((p) => p.x)) : 0;

  // Manusia tujuan eskalasi sering dipakai banyak alur; ia tidak dihitung sebagai penyambung alur,
  // melainkan ditaruh di kolom paling kanan sejajar dengan role yang mengarah kepadanya.
  const isHuman = (id: string) => nodeById.get(id)?.kind === "human";
  const linked = new Set(edges.flat());
  const agentEdges = edges.filter(([a, b]) => !isHuman(a) && !isHuman(b));
  const flowStart = top;
  let flowRight = 0;
  const flows = components([...linked].filter((id) => !isHuman(id)), agentEdges).sort((a, b) => b.length - a.length);
  for (const flow of flows) {
    const flowEdges = agentEdges.filter(([a]) => flow.includes(a));
    const { result: placed, height } = layoutFlow(flow, flowEdges, nodeById, top);
    for (const [id, p] of Object.entries(placed)) {
      result[id] = { x: left + p.x, y: p.y };
      flowRight = Math.max(flowRight, p.x);
    }
    top += height + GROUP_GAP;
  }
  const humans = [...linked].filter(isHuman).sort((a, b) => nodeById.get(a)!.name.localeCompare(nodeById.get(b)!.name, "id"));
  let humanFloor = flowStart;
  for (const id of humans) {
    const sources = edges.filter(([, b]) => b === id).map(([a]) => result[a]).filter(Boolean);
    const wanted = sources.length ? sources.reduce((s, p) => s + p.y, 0) / sources.length : humanFloor;
    const y = Math.max(wanted, humanFloor);
    result[id] = { x: left + (flows.length ? flowRight + COL_W : 0) + 30, y };
    humanFloor = y + ROW_H;
  }
  if (!flows.length && humans.length) top = humanFloor + GROUP_GAP;

  // Role (dan manusia) tanpa relasi: satu blok per unit, kisi GRID_COLS kolom
  const loose = free.filter((n) => !linked.has(n.id)).sort(byUnitThenName);
  const blocks = new Map<string, GraphNode[]>();
  for (const n of loose) blocks.set(unitOf(n), [...(blocks.get(unitOf(n)) ?? []), n]);
  for (const block of blocks.values()) {
    block.forEach((n, i) => {
      result[n.id] = { x: left + (i % GRID_COLS) * COL_W, y: top + Math.floor(i / GRID_COLS) * ROW_H };
    });
    top += Math.ceil(block.length / GRID_COLS) * ROW_H + GROUP_GAP / 2;
  }
  return result;
};
