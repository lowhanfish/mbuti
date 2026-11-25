import type { ResponseInterface } from "@/app/(admin)/admin/organisasi/pengguna/types";
import type { AccessRole } from "@/types/global";
import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { fail, ok, type MockRoute } from "../router";
import type { MemberStatus, MockDatabase, MockMembership } from "../seed";

const ROLES: AccessRole[] = ["owner", "admin", "member", "viewer"];
const ROLE_ORDER: Record<AccessRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

const toItem = (db: MockDatabase, m: MockMembership, selfId: string): ResponseInterface => {
  const user = db.users.find((u) => u.id === m.user_id);
  return {
    id: m.id,
    user_id: m.user_id,
    full_name: user?.full_name ?? "(tanpa nama)",
    email: user?.email ?? "",
    access_role: m.access_role,
    unit_id: m.unit_id,
    unit_name: db.units.find((u) => u.id === m.unit_id)?.name ?? null,
    status: m.status,
    joined_at: m.joined_at,
    last_active_at: m.last_active_at,
    is_self: m.id === selfId,
  };
};

const activeOwners = (db: MockDatabase, orgId: string) =>
  db.memberships.filter((m) => m.organization_id === orgId && m.access_role === "owner" && m.status === "active");

const BASE = "/api/v1/admin/pengguna";

export const penggunaRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${BASE}/read`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const search = (ctx.query.get("search") ?? "").trim().toLowerCase();
      const role = ctx.query.get("access_role") ?? "";
      const status = ctx.query.get("status") ?? "";
      const skip = Number(ctx.query.get("skip") ?? 0);
      const limit = Number(ctx.query.get("limit") ?? 10);

      const all = ctx.db.memberships
        .filter((m) => m.organization_id === self.organization_id)
        .map((m) => toItem(ctx.db, m, self.id));
      const summary: Record<MemberStatus, number> = { active: 0, invited: 0, disabled: 0 };
      for (const item of all) summary[item.status] += 1;

      const filtered = all
        .filter((m) => !search || `${m.full_name} ${m.email} ${m.unit_name ?? ""}`.toLowerCase().includes(search))
        .filter((m) => !role || m.access_role === role)
        .filter((m) => !status || m.status === status)
        .sort((a, b) => ROLE_ORDER[a.access_role] - ROLE_ORDER[b.access_role] || a.full_name.localeCompare(b.full_name));

      return {
        status: 200,
        body: {
          success: true,
          statusCode: 200,
          total: filtered.length,
          skip,
          limit,
          data: filtered.slice(skip, skip + limit),
          summary,
        },
      };
    },
  },
  {
    method: "POST",
    path: `${BASE}/invite`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const b = (ctx.body ?? {}) as Record<string, unknown>;
      const fullName = text(b.full_name, 150);
      const email = text(b.email, 150).toLowerCase();
      const role = b.access_role as AccessRole;
      if (fullName.length < 2) return fail(422, "Nama minimal 2 karakter.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(422, "Format email tidak valid.");
      if (!ROLES.includes(role)) return fail(422, "Hak akses tidak valid.");
      if (role === "owner" && self.access_role !== "owner") return fail(403, "Hanya pemilik yang dapat mengundang pemilik lain.");
      const unitId = typeof b.unit_id === "string" && b.unit_id ? b.unit_id : null;
      if (unitId && !ctx.db.units.some((u) => u.id === unitId && u.organization_id === self.organization_id)) {
        return fail(422, "Unit tidak ditemukan.");
      }

      let user = ctx.db.users.find((u) => u.email === email);
      if (user && ctx.db.memberships.some((m) => m.user_id === user?.id && m.organization_id === self.organization_id)) {
        return fail(409, "Email ini sudah menjadi anggota organisasi.");
      }
      if (!user) {
        user = { id: newId("user"), email, password: "", full_name: fullName, is_active: true, is_verified: false, created_at: nowIso() };
        ctx.db.users.push(user);
      }
      const membership: MockMembership = {
        id: newId("member"),
        organization_id: self.organization_id,
        user_id: user.id,
        access_role: role,
        unit_id: unitId,
        status: "invited",
        joined_at: nowIso(),
        last_active_at: null,
      };
      ctx.db.memberships.push(membership);
      return ok(toItem(ctx.db, membership, self.id), "Undangan dibuat.", 201);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/update/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const target = ctx.db.memberships.find((m) => m.id === ctx.params.id && m.organization_id === self.organization_id);
      if (!target) return fail(404, "Pengguna tidak ditemukan.");
      const b = (ctx.body ?? {}) as Record<string, unknown>;
      const role = b.access_role as AccessRole;
      if (!ROLES.includes(role)) return fail(422, "Hak akses tidak valid.");
      const touchesOwner = role === "owner" || target.access_role === "owner";
      if (touchesOwner && self.access_role !== "owner") return fail(403, "Hanya pemilik yang dapat mengubah hak akses pemilik.");

      const status = b.status === "disabled" ? "disabled" : target.status === "invited" ? "invited" : "active";
      const losesOwner = target.access_role === "owner" && (role !== "owner" || status === "disabled");
      if (losesOwner && activeOwners(ctx.db, self.organization_id).length <= 1) {
        return fail(409, "Organisasi harus punya minimal satu pemilik aktif.");
      }
      if (target.id === self.id && status === "disabled") return fail(409, "Anda tidak dapat menonaktifkan akun sendiri.");

      const unitId = typeof b.unit_id === "string" && b.unit_id ? b.unit_id : null;
      if (unitId && !ctx.db.units.some((u) => u.id === unitId && u.organization_id === self.organization_id)) {
        return fail(422, "Unit tidak ditemukan.");
      }
      Object.assign(target, { access_role: role, unit_id: unitId, status });
      return ok(toItem(ctx.db, target, self.id), "Pengguna diperbarui.");
    },
  },
  {
    method: "DELETE",
    path: `${BASE}/delete/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const index = ctx.db.memberships.findIndex((m) => m.id === ctx.params.id && m.organization_id === self.organization_id);
      if (index < 0) return fail(404, "Pengguna tidak ditemukan.");
      const target = ctx.db.memberships[index];
      if (target.id === self.id) return fail(409, "Anda tidak dapat mengeluarkan diri sendiri.");
      if (target.access_role === "owner" && self.access_role !== "owner") return fail(403, "Hanya pemilik yang dapat mengeluarkan pemilik.");
      if (target.access_role === "owner" && activeOwners(ctx.db, self.organization_id).length <= 1) {
        return fail(409, "Organisasi harus punya minimal satu pemilik aktif.");
      }
      ctx.db.memberships.splice(index, 1);
      for (const u of ctx.db.units) if (u.lead_member_id === target.id) u.lead_member_id = null;
      for (const a of ctx.db.agents) if (a.owner_member_id === target.id) a.owner_member_id = null;
      ctx.db.relations = ctx.db.relations.filter((r) => r.target_id !== target.id);
      ctx.db.flow_humans = ctx.db.flow_humans.filter((id) => id !== target.id);
      return ok(null, "Pengguna dikeluarkan dari organisasi.");
    },
  },
];
