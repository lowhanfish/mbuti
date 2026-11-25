import type { UserProfile } from "@/types/global";
import { fail, ok, type MockRoute } from "../router";
import type { MockDatabase, MockUser } from "../seed";

export const toProfile = (db: MockDatabase, user: MockUser): UserProfile => {
  const membership = db.memberships.find((m) => m.user_id === user.id) ?? null;
  const organization = membership
    ? db.organizations.find((o) => o.id === membership.organization_id) ?? null
    : null;
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    is_active: user.is_active,
    is_verified: user.is_verified,
    access_role: membership?.access_role ?? null,
    organization: organization
      ? { id: organization.id, name: organization.name, slug: organization.slug }
      : null,
    created_at: user.created_at,
  };
};

export const currentUser = (db: MockDatabase): MockUser | null => {
  if (!db.session) return null;
  return db.users.find((u) => u.id === db.session?.user_id && u.is_active) ?? null;
};

export const authRoutes: MockRoute[] = [
  {
    method: "POST",
    path: "/api/v1/auth/login",
    handler: ({ db, body }) => {
      const { email, password } = (body ?? {}) as { email?: string; password?: string };
      const user = db.users.find(
        (u) => u.email.toLowerCase() === String(email ?? "").trim().toLowerCase()
      );
      if (!user || user.password !== password) {
        return fail(401, "Email atau kata sandi salah.");
      }
      if (!user.is_active) {
        return fail(403, "Akun dinonaktifkan. Hubungi admin organisasi.");
      }
      db.session = { user_id: user.id };
      return ok({ user: toProfile(db, user) }, "Berhasil masuk.");
    },
  },
  {
    method: "GET",
    path: "/api/v1/auth/me",
    handler: ({ db }) => {
      const user = currentUser(db);
      if (!user) return fail(401, "Silakan masuk terlebih dahulu.");
      return ok({ user: toProfile(db, user) });
    },
  },
  {
    method: "POST",
    path: "/api/v1/auth/refresh",
    handler: ({ db }) => {
      const user = currentUser(db);
      if (!user) return fail(401, "Sesi login telah berakhir.");
      return ok(null, "Sesi diperbarui.");
    },
  },
  {
    method: "POST",
    path: "/api/v1/auth/logout",
    handler: ({ db }) => {
      db.session = null;
      return ok(null, "Berhasil keluar.");
    },
  },
];
