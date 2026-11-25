import type { ResponseInterface } from "@/app/(admin)/admin/organisasi/profil/types";
import { isFailure, nowIso, requireManager, requireMember, text } from "../context";
import { fail, ok, type MockRoute } from "../router";
import type { MockDatabase, OrganizationSector } from "../seed";

const SECTORS: OrganizationSector[] = ["pemerintahan", "pendidikan", "kesehatan", "usaha", "nirlaba", "lainnya"];

const toProfile = (db: MockDatabase, orgId: string): ResponseInterface | null => {
  const org = db.organizations.find((o) => o.id === orgId);
  if (!org) return null;
  return {
    ...org,
    stats: {
      unit_count: db.units.filter((u) => u.organization_id === orgId).length,
      member_count: db.memberships.filter((m) => m.organization_id === orgId && m.status !== "disabled").length,
      agent_count: 0,
    },
  };
};

export const organisasiRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/v1/admin/organisasi/profil",
    handler: (ctx) => {
      const member = requireMember(ctx);
      if (isFailure(member)) return member;
      const profile = toProfile(ctx.db, member.organization_id);
      return profile ? ok(profile) : fail(404, "Organisasi tidak ditemukan.");
    },
  },
  {
    method: "PUT",
    path: "/api/v1/admin/organisasi/profil/update",
    handler: (ctx) => {
      const member = requireManager(ctx);
      if (isFailure(member)) return member;
      const org = ctx.db.organizations.find((o) => o.id === member.organization_id);
      if (!org) return fail(404, "Organisasi tidak ditemukan.");

      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const name = text(body.name, 150);
      if (name.length < 3) return fail(422, "Nama organisasi minimal 3 karakter.");
      const email = text(body.email, 150);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(422, "Format email tidak valid.");
      const website = text(body.website, 200);
      if (website && !/^https?:\/\//.test(website)) return fail(422, "Situs web harus diawali http:// atau https://.");
      const sector = SECTORS.includes(body.sector as OrganizationSector) ? (body.sector as OrganizationSector) : org.sector;

      Object.assign(org, {
        name,
        description: text(body.description, 1000),
        sector,
        timezone: text(body.timezone, 60) || org.timezone,
        email,
        phone: text(body.phone, 30),
        address: text(body.address, 300),
        website,
        updated_at: nowIso(),
      });
      return ok(toProfile(ctx.db, org.id), "Profil organisasi diperbarui.");
    },
  },
];
