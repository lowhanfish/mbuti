import type { ResponseInterface, UnitColor } from "@/app/(admin)/admin/organisasi/unit/types";
import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { fail, list, ok, type MockRoute } from "../router";
import type { MockDatabase, MockUnit } from "../seed";

const COLORS: UnitColor[] = ["violet", "honey", "pink", "teal", "sky", "lime", "orange", "slate"];

const toItem = (db: MockDatabase, unit: MockUnit): ResponseInterface => {
  const lead = db.memberships.find((m) => m.id === unit.lead_member_id);
  const leadUser = lead ? db.users.find((u) => u.id === lead.user_id) : null;
  return {
    id: unit.id,
    name: unit.name,
    code: unit.code,
    description: unit.description,
    parent_id: unit.parent_id,
    parent_name: db.units.find((u) => u.id === unit.parent_id)?.name ?? null,
    color: unit.color,
    lead_member_id: unit.lead_member_id,
    lead_name: leadUser?.full_name ?? null,
    sort_order: unit.sort_order,
    member_count: db.memberships.filter((m) => m.unit_id === unit.id && m.status !== "disabled").length,
    agent_count: db.agents.filter((a) => a.unit_id === unit.id).length,
    child_count: db.units.filter((u) => u.parent_id === unit.id).length,
    created_at: unit.created_at,
    updated_at: unit.updated_at,
  };
};

/** Semua id keturunan sebuah unit, untuk mencegah unit menjadi induk dirinya sendiri. */
const descendantIds = (units: MockUnit[], id: string): Set<string> => {
  const result = new Set<string>();
  const walk = (parent: string) => {
    for (const u of units) {
      if (u.parent_id === parent && !result.has(u.id)) {
        result.add(u.id);
        walk(u.id);
      }
    }
  };
  walk(id);
  return result;
};

/** Validasi isian form unit. Mengembalikan pesan galat atau data bersih. */
const parseUnitBody = (db: MockDatabase, orgId: string, body: unknown, selfId: string | null) => {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 120);
  if (name.length < 2) return "Nama unit minimal 2 karakter.";
  const code = text(b.code, 12).toUpperCase();
  const orgUnits = db.units.filter((u) => u.organization_id === orgId);
  if (orgUnits.some((u) => u.id !== selfId && u.name.toLowerCase() === name.toLowerCase())) {
    return "Nama unit sudah dipakai.";
  }
  if (code && orgUnits.some((u) => u.id !== selfId && u.code === code)) return "Kode unit sudah dipakai.";

  const parentId = typeof b.parent_id === "string" && b.parent_id ? b.parent_id : null;
  if (parentId) {
    if (!orgUnits.some((u) => u.id === parentId)) return "Unit induk tidak ditemukan.";
    if (selfId && (parentId === selfId || descendantIds(orgUnits, selfId).has(parentId))) {
      return "Unit induk tidak boleh unit itu sendiri atau sub-unitnya.";
    }
  }
  const leadId = typeof b.lead_member_id === "string" && b.lead_member_id ? b.lead_member_id : null;
  if (leadId && !db.memberships.some((m) => m.id === leadId && m.organization_id === orgId)) {
    return "Penanggung jawab tidak ditemukan.";
  }
  return {
    name,
    code,
    description: text(b.description, 1000),
    parent_id: parentId,
    color: COLORS.includes(b.color as UnitColor) ? (b.color as UnitColor) : "violet",
    lead_member_id: leadId,
    sort_order: Number.isFinite(Number(b.sort_order)) ? Math.max(0, Math.round(Number(b.sort_order))) : 0,
  };
};

const BASE = "/api/v1/admin/unit";

export const unitRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${BASE}/read`,
    handler: (ctx) => {
      const member = requireMember(ctx);
      if (isFailure(member)) return member;
      const search = (ctx.query.get("search") ?? "").trim().toLowerCase();
      const items = ctx.db.units
        .filter((u) => u.organization_id === member.organization_id)
        .filter((u) => !search || `${u.name} ${u.code} ${u.description}`.toLowerCase().includes(search))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((u) => toItem(ctx.db, u));
      return list(items, ctx.query);
    },
  },
  {
    method: "GET",
    path: `${BASE}/option`,
    handler: (ctx) => {
      const member = requireMember(ctx);
      if (isFailure(member)) return member;
      const items = ctx.db.units
        .filter((u) => u.organization_id === member.organization_id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => ({ id: u.id, value: u.name, sub_value: u.code || null }));
      return ok(items);
    },
  },
  {
    method: "POST",
    path: `${BASE}/create`,
    handler: (ctx) => {
      const member = requireManager(ctx);
      if (isFailure(member)) return member;
      const parsed = parseUnitBody(ctx.db, member.organization_id, ctx.body, null);
      if (typeof parsed === "string") return fail(422, parsed);
      const unit: MockUnit = {
        id: newId("unit"),
        organization_id: member.organization_id,
        ...parsed,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      ctx.db.units.push(unit);
      return ok(toItem(ctx.db, unit), "Unit ditambahkan.", 201);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/update/:id`,
    handler: (ctx) => {
      const member = requireManager(ctx);
      if (isFailure(member)) return member;
      const unit = ctx.db.units.find((u) => u.id === ctx.params.id && u.organization_id === member.organization_id);
      if (!unit) return fail(404, "Unit tidak ditemukan.");
      const parsed = parseUnitBody(ctx.db, member.organization_id, ctx.body, unit.id);
      if (typeof parsed === "string") return fail(422, parsed);
      Object.assign(unit, parsed, { updated_at: nowIso() });
      return ok(toItem(ctx.db, unit), "Unit diperbarui.");
    },
  },
  {
    method: "DELETE",
    path: `${BASE}/delete/:id`,
    handler: (ctx) => {
      const member = requireManager(ctx);
      if (isFailure(member)) return member;
      const index = ctx.db.units.findIndex((u) => u.id === ctx.params.id && u.organization_id === member.organization_id);
      if (index < 0) return fail(404, "Unit tidak ditemukan.");
      const unit = ctx.db.units[index];
      if (ctx.db.agents.some((a) => a.unit_id === unit.id)) {
        return fail(409, "Unit masih punya role AI. Pindahkan role ke unit lain terlebih dahulu.");
      }
      if (ctx.db.units.some((u) => u.parent_id === unit.id)) {
        return fail(409, "Unit masih punya sub-unit. Pindahkan atau hapus sub-unit terlebih dahulu.");
      }
      ctx.db.units.splice(index, 1);
      for (const m of ctx.db.memberships) if (m.unit_id === unit.id) m.unit_id = null;
      return ok(null, "Unit dihapus.");
    },
  },
];
