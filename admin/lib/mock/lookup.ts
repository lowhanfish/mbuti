/**
 * Role dan relasi yang sudah dipakai tugas tidak dibuang saat dihapus (soft delete), agar riwayat tugas tetap
 * bisa menampilkan namanya. Daftar dan pilihan hanya membaca yang masih aktif (db.agents, db.relations).
 */
import type { MockDatabase, MockRelation } from "./seed";

export const findAgent = (db: MockDatabase, id: string) => db.agents.find((a) => a.id === id) ?? db.archived_agents.find((a) => a.id === id);

export const findRelation = (db: MockDatabase, id: string | null) =>
  db.relations.find((r) => r.id === id) ?? db.archived_relations.find((r) => r.id === id);

export const removeRelations = (db: MockDatabase, match: (relation: MockRelation) => boolean) => {
  const used = new Set(db.task_steps.map((s) => s.via_relation_id));
  db.archived_relations.push(...db.relations.filter((r) => match(r) && used.has(r.id)));
  db.relations = db.relations.filter((r) => !match(r));
};
