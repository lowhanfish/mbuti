import type {
  GraphInterface,
  GraphNode,
  PayloadSpec,
  RelationInterface,
  RelationTrigger,
  RelationType,
} from "@/app/(admin)/admin/relasi/types";
import { UNIT_COLORS } from "@/app/(admin)/admin/organisasi/unit/types";
import { ACCESS_ROLE_LABEL } from "@/utilities/labels";
import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { fail, ok, type MockRoute } from "../router";
import type { MockDatabase, MockRelation } from "../seed";

const TYPES: RelationType[] = ["handoff", "review", "consult", "escalate"];
const TRIGGERS: RelationTrigger[] = ["on_complete", "on_rejected", "on_condition"];
const PAYLOADS: PayloadSpec[] = ["result_only", "result_context", "references"];

const kindOf = (id: string) => (id.startsWith("member-") ? "human" : "agent");

const toRelation = (r: MockRelation): RelationInterface => {
  const { organization_id: _org, ...rest } = r;
  void _org;
  return { ...rest, source_kind: kindOf(r.source_id), target_kind: kindOf(r.target_id) };
};

const buildGraph = (db: MockDatabase, orgId: string): GraphInterface => {
  const agents: GraphNode[] = db.agents
    .filter((a) => a.organization_id === orgId)
    .map((a) => {
      const unit = db.units.find((u) => u.id === a.unit_id);
      return {
        id: a.id,
        kind: "agent",
        name: a.name,
        title: a.title,
        status: a.status,
        unit_id: a.unit_id,
        unit_name: unit?.name ?? null,
        unit_color: unit ? UNIT_COLORS[unit.color].hex : null,
        avatar: a.avatar,
      };
    });
  const humans: GraphNode[] = db.flow_humans.flatMap((memberId) => {
    const m = db.memberships.find((x) => x.id === memberId && x.organization_id === orgId);
    const user = m ? db.users.find((u) => u.id === m.user_id) : null;
    if (!m || !user) return [];
    const unit = db.units.find((u) => u.id === m.unit_id);
    return [{ id: m.id, kind: "human", name: user.full_name, title: unit ? `${ACCESS_ROLE_LABEL[m.access_role]} · ${unit.name}` : ACCESS_ROLE_LABEL[m.access_role] }];
  });
  return {
    nodes: [...agents, ...humans],
    relations: db.relations.filter((r) => r.organization_id === orgId).map(toRelation),
    positions: db.flow_positions,
  };
};

/** Cari lingkaran serah-terima: apakah dari target bisa kembali ke source lewat garis handoff. */
const handoffCyclePath = (db: MockDatabase, orgId: string, source: string, target: string, ignoreId: string | null) => {
  const edges = db.relations.filter((r) => r.organization_id === orgId && r.relation_type === "handoff" && r.id !== ignoreId);
  const prev = new Map<string, string>();
  const queue = [target];
  const seen = new Set([target]);
  while (queue.length) {
    const node = queue.shift()!;
    if (node === source) {
      const path = [source];
      let cur = source;
      while (cur !== target) {
        cur = prev.get(cur)!;
        path.unshift(cur);
      }
      return [source, ...path];
    }
    for (const e of edges) {
      if (e.source_id === node && !seen.has(e.target_id)) {
        seen.add(e.target_id);
        prev.set(e.target_id, node);
        queue.push(e.target_id);
      }
    }
  }
  return null;
};

const nodeName = (db: MockDatabase, id: string) =>
  db.agents.find((a) => a.id === id)?.name ??
  db.users.find((u) => u.id === db.memberships.find((m) => m.id === id)?.user_id)?.full_name ??
  id;

/** Validasi dan bersihkan isian relasi. Mengembalikan pesan galat atau data. */
const parseRelation = (db: MockDatabase, orgId: string, body: unknown, selfId: string | null, base?: MockRelation) => {
  const b = (body ?? {}) as Record<string, unknown>;
  const source = String(b.source_id ?? base?.source_id ?? "");
  const target = String(b.target_id ?? base?.target_id ?? "");
  const type = (b.relation_type ?? base?.relation_type) as RelationType;
  if (!TYPES.includes(type)) return "Jenis relasi tidak valid.";
  if (!db.agents.some((a) => a.id === source && a.organization_id === orgId)) return "Relasi harus dimulai dari sebuah role.";
  if (source === target) return "Role tidak bisa berelasi dengan dirinya sendiri.";

  const targetIsHuman = kindOf(target) === "human";
  if (targetIsHuman) {
    if (!db.memberships.some((m) => m.id === target && m.organization_id === orgId)) return "Manusia tujuan tidak ditemukan.";
    if (type !== "escalate") return "Ke manusia hanya bisa memakai relasi Eskalasi.";
  } else {
    if (!db.agents.some((a) => a.id === target && a.organization_id === orgId)) return "Role tujuan tidak ditemukan.";
    if (type === "escalate") return "Eskalasi ditujukan ke manusia, bukan ke role.";
  }

  if (
    db.relations.some(
      (r) => r.organization_id === orgId && r.id !== selfId && r.source_id === source && r.target_id === target && r.relation_type === type
    )
  ) {
    return "Relasi dengan jenis yang sama di antara keduanya sudah ada.";
  }
  if (type === "handoff") {
    const cycle = handoffCyclePath(db, orgId, source, target, selfId);
    if (cycle) {
      return `Serah-terima ini membentuk lingkaran: ${cycle.map((id) => nodeName(db, id)).join(" → ")}. Gunakan relasi Periksa bila memang perlu bolak-balik.`;
    }
  }

  const trigger = (b.trigger ?? base?.trigger) as RelationTrigger;
  const condition = text(b.condition ?? base?.condition, 500);
  if (trigger === "on_condition" && condition.length < 5) return "Tuliskan kondisi kapan relasi ini dijalankan.";
  const maxRev = Number(b.max_revisions ?? base?.max_revisions ?? 2);

  return {
    source_id: source,
    target_id: target,
    relation_type: type,
    trigger: TRIGGERS.includes(trigger) ? trigger : "on_complete",
    condition,
    payload_spec: PAYLOADS.includes((b.payload_spec ?? base?.payload_spec) as PayloadSpec)
      ? ((b.payload_spec ?? base?.payload_spec) as PayloadSpec)
      : "result_context",
    expected_output: text(b.expected_output ?? base?.expected_output, 500),
    max_revisions: Math.min(5, Math.max(1, Number.isFinite(maxRev) ? Math.round(maxRev) : 2)),
    requires_approval: type === "escalate" ? true : Boolean(b.requires_approval ?? base?.requires_approval),
    label: text(b.label ?? base?.label, 60),
  };
};

const BASE = "/api/v1/admin/relasi";

export const relasiRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${BASE}/graph`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      return ok(buildGraph(ctx.db, self.organization_id));
    },
  },
  {
    method: "POST",
    path: `${BASE}/create`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const parsed = parseRelation(ctx.db, self.organization_id, ctx.body, null);
      if (typeof parsed === "string") return fail(422, parsed);
      const rel: MockRelation = { id: newId("rel"), organization_id: self.organization_id, ...parsed, created_at: nowIso(), updated_at: nowIso() };
      ctx.db.relations.push(rel);
      if (kindOf(rel.target_id) === "human" && !ctx.db.flow_humans.includes(rel.target_id)) ctx.db.flow_humans.push(rel.target_id);
      return ok(toRelation(rel), "Relasi dibuat.", 201);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/update/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const rel = ctx.db.relations.find((r) => r.id === ctx.params.id && r.organization_id === self.organization_id);
      if (!rel) return fail(404, "Relasi tidak ditemukan.");
      const parsed = parseRelation(ctx.db, self.organization_id, ctx.body, rel.id, rel);
      if (typeof parsed === "string") return fail(422, parsed);
      Object.assign(rel, parsed, { updated_at: nowIso() });
      return ok(toRelation(rel), "Relasi diperbarui.");
    },
  },
  {
    method: "DELETE",
    path: `${BASE}/delete/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const index = ctx.db.relations.findIndex((r) => r.id === ctx.params.id && r.organization_id === self.organization_id);
      if (index < 0) return fail(404, "Relasi tidak ditemukan.");
      ctx.db.relations.splice(index, 1);
      return ok(null, "Relasi dihapus.");
    },
  },
  {
    method: "PUT",
    path: `${BASE}/positions`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const b = (ctx.body ?? {}) as { positions?: Record<string, { x: unknown; y: unknown }> };
      for (const [id, p] of Object.entries(b.positions ?? {})) {
        const x = Number(p?.x);
        const y = Number(p?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) ctx.db.flow_positions[id] = { x: Math.round(x), y: Math.round(y) };
      }
      return ok(null, "Posisi disimpan.");
    },
  },
  {
    method: "DELETE",
    path: `${BASE}/positions`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      ctx.db.flow_positions = {};
      return ok(null, "Posisi dikembalikan ke susunan otomatis.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/humans`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const memberId = String((ctx.body as { member_id?: unknown })?.member_id ?? "");
      if (!ctx.db.memberships.some((m) => m.id === memberId && m.organization_id === self.organization_id)) {
        return fail(422, "Pengguna tidak ditemukan.");
      }
      if (!ctx.db.flow_humans.includes(memberId)) ctx.db.flow_humans.push(memberId);
      return ok(null, "Manusia ditambahkan ke peta.");
    },
  },
  {
    method: "DELETE",
    path: `${BASE}/humans/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      if (ctx.db.relations.some((r) => r.organization_id === self.organization_id && r.target_id === ctx.params.id)) {
        return fail(409, "Masih ada eskalasi ke orang ini. Hapus relasinya terlebih dahulu.");
      }
      ctx.db.flow_humans = ctx.db.flow_humans.filter((id) => id !== ctx.params.id);
      return ok(null, "Manusia dikeluarkan dari peta.");
    },
  },
];
