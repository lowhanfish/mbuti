import type { GraphNode, RelationInterface } from "./types";

const COL_W = 300;
const ROW_H = 120;

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

/**
 * Susunan otomatis: satu kolom per unit (urut nama), role tanpa unit di kolom terakhir,
 * lalu kolom manusia di paling kanan. Posisi yang sudah disimpan tetap dipakai.
 */
export const autoLayout = (nodes: GraphNode[], saved: Record<string, { x: number; y: number }>) => {
  const agents = nodes.filter((n) => n.kind === "agent");
  const unitKeys = [...new Set(agents.map((a) => (a.kind === "agent" ? (a.unit_name ?? "~") : "~")))].sort();
  const rowByColumn = new Map<number, number>();
  const result: Record<string, { x: number; y: number }> = {};

  for (const n of nodes) {
    if (saved[n.id]) {
      result[n.id] = saved[n.id];
      continue;
    }
    const col = n.kind === "agent" ? unitKeys.indexOf(n.unit_name ?? "~") : unitKeys.length;
    const row = rowByColumn.get(col) ?? 0;
    rowByColumn.set(col, row + 1);
    result[n.id] = { x: col * COL_W + (n.kind === "human" ? 60 : 0), y: row * ROW_H + (col % 2) * 40 };
  }
  return result;
};
