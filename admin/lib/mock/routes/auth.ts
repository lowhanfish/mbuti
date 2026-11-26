import type { UserProfile } from "@/types/global";
import {
  EMAIL_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AuthOptionsResponse,
  type InvitePreviewResponse,
} from "@/app/(auth)/types";
import { SECTOR_OPTIONS } from "@/app/(admin)/admin/organisasi/profil/types";
import {
  INVALID_LINK,
  findToken,
  sendAlreadyRegistered,
  sendPasswordChanged,
  sendReset,
  sendVerification,
} from "../accounts";
import { newId, nowIso, text } from "../context";
import { fail, ok, type MockRoute } from "../router";
import type { MockDatabase, MockUser } from "../seed";
import { defaultSettings } from "../settings";

/** Mode pendaftaran data contoh; backend membacanya dari `REGISTRATION_MODE`. */
const REGISTRATION_MODE = "approval" as AuthOptionsResponse["registration"];

const SAME_ANSWER_REGISTER = "Pendaftaran diterima. Periksa email Anda untuk tautan verifikasi.";
const SAME_ANSWER_EMAIL = "Bila email itu terdaftar, tautannya sudah kami kirim. Periksa kotak masuk dan folder spam.";

export const toProfile = (db: MockDatabase, user: MockUser): UserProfile => {
  const membership = db.memberships.find((m) => m.user_id === user.id && m.status !== "invited") ?? null;
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
      ? { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status }
      : null,
    created_at: user.created_at,
  };
};

export const currentUser = (db: MockDatabase): MockUser | null => {
  if (!db.session) return null;
  return db.users.find((u) => u.id === db.session?.user_id && u.is_active) ?? null;
};

const findUserByEmail = (db: MockDatabase, email: unknown) => {
  const wanted = String(email ?? "").trim().toLowerCase();
  return db.users.find((u) => u.email.toLowerCase() === wanted) ?? null;
};

const passwordProblem = (password: unknown) => {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) return `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`;
  return null;
};

const uniqueSlug = (db: MockDatabase, name: string) => {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 150) || "organisasi";
  let slug = base;
  for (let n = 2; db.organizations.some((o) => o.slug === slug); n += 1) slug = `${base}-${n}`;
  return slug;
};

export const authRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/v1/auth/options",
    handler: () => ok<AuthOptionsResponse>({ registration: REGISTRATION_MODE, password_min_length: PASSWORD_MIN_LENGTH }),
  },
  {
    method: "POST",
    path: "/api/v1/auth/login",
    handler: ({ db, body }) => {
      const { email, password } = (body ?? {}) as { email?: string; password?: string };
      const user = findUserByEmail(db, email);
      if (!user || !user.password || user.password !== password) {
        return fail(401, "Email atau kata sandi salah.");
      }
      if (!user.is_active) {
        return fail(403, "Akun dinonaktifkan. Hubungi admin organisasi.");
      }
      if (!user.is_verified) {
        return fail(403, "Email belum diverifikasi. Buka tautan di email Anda, atau minta tautan baru.", "email_not_verified");
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
  {
    method: "POST",
    path: "/api/v1/auth/register",
    handler: ({ db, body }) => {
      if (REGISTRATION_MODE === "closed") return fail(403, "Pendaftaran sedang ditutup.");
      const b = (body ?? {}) as Record<string, unknown>;
      const fullName = text(b.full_name, 150);
      const email = text(b.email, 150).toLowerCase();
      const organizationName = text(b.organization_name, 150);
      const sector = SECTOR_OPTIONS.find((o) => o.value === b.sector)?.value;
      if (fullName.length < 2) return fail(422, "Nama minimal 2 karakter.");
      if (!EMAIL_PATTERN.test(email)) return fail(422, "Format email tidak valid.");
      const weak = passwordProblem(b.password);
      if (weak) return fail(422, weak);
      if (organizationName.length < 2) return fail(422, "Nama organisasi minimal 2 karakter.");
      if (!sector) return fail(422, "Sektor tidak valid.");
      if (b.accept_terms !== true) return fail(422, "Setujui ketentuan layanan dan kebijakan privasi untuk mendaftar.");

      const existing = findUserByEmail(db, email);
      if (existing) {
        // Jawaban sama agar pendaftaran tidak bisa dipakai menebak email yang terdaftar
        sendAlreadyRegistered(db, existing);
        return ok(null, SAME_ANSWER_REGISTER, 201);
      }

      const now = nowIso();
      const user: MockUser = {
        id: newId("user"),
        email,
        password: String(b.password),
        full_name: fullName,
        is_active: true,
        is_verified: false,
        created_at: now,
      };
      const organizationId = newId("org");
      db.users.push(user);
      db.organizations.push({
        id: organizationId,
        name: organizationName,
        slug: uniqueSlug(db, organizationName),
        description: "",
        sector,
        status: REGISTRATION_MODE === "open" ? "active" : "pending",
        timezone: "Asia/Makassar",
        email: "",
        phone: "",
        address: "",
        website: "",
        created_at: now,
        updated_at: now,
      });
      db.memberships.push({
        id: newId("member"),
        organization_id: organizationId,
        user_id: user.id,
        access_role: "owner",
        unit_id: null,
        status: "active",
        joined_at: now,
        last_active_at: null,
      });
      db.settings.push(defaultSettings(organizationId, now));
      sendVerification(db, user);
      return ok(null, SAME_ANSWER_REGISTER, 201);
    },
  },
  {
    method: "POST",
    path: "/api/v1/auth/verify-email",
    handler: ({ db, body }) => {
      const found = findToken(db, (body as { token?: unknown } | null)?.token, "verify");
      const user = found && db.users.find((u) => u.id === found.user_id && u.is_active);
      if (!found || !user) return fail(400, INVALID_LINK, "invalid_token");
      found.used_at = nowIso();
      user.is_verified = true;
      db.session = { user_id: user.id };
      return ok({ user: toProfile(db, user) }, "Email terverifikasi.");
    },
  },
  {
    method: "POST",
    path: "/api/v1/auth/resend-verification",
    handler: ({ db, body }) => {
      const user = findUserByEmail(db, (body as { email?: unknown } | null)?.email);
      if (user && user.is_active && user.password && !user.is_verified) sendVerification(db, user);
      return ok(null, SAME_ANSWER_EMAIL);
    },
  },
  {
    method: "POST",
    path: "/api/v1/auth/forgot-password",
    handler: ({ db, body }) => {
      const user = findUserByEmail(db, (body as { email?: unknown } | null)?.email);
      // Undangan yang belum diterima tidak punya kata sandi untuk diatur ulang
      if (user && user.is_active && user.password) sendReset(db, user);
      return ok(null, SAME_ANSWER_EMAIL);
    },
  },
  {
    method: "POST",
    path: "/api/v1/auth/reset-password",
    handler: ({ db, body }) => {
      const b = (body ?? {}) as Record<string, unknown>;
      const found = findToken(db, b.token, "reset");
      const user = found && db.users.find((u) => u.id === found.user_id && u.is_active);
      if (!found || !user) return fail(400, INVALID_LINK, "invalid_token");
      const weak = passwordProblem(b.password);
      if (weak) return fail(422, weak);
      found.used_at = nowIso();
      user.password = String(b.password);
      // Tautan sampai ke kotak masuk, jadi emailnya terbukti milik pengguna
      user.is_verified = true;
      // Semua sesi lama dicabut
      if (db.session?.user_id === user.id) db.session = null;
      sendPasswordChanged(db, user);
      return ok(null, "Kata sandi sudah diganti. Silakan masuk dengan kata sandi baru.");
    },
  },
  {
    method: "GET",
    path: "/api/v1/auth/invite/:token",
    handler: ({ db, params }) => {
      const found = findToken(db, params.token, "invite");
      const membership = found && db.memberships.find((m) => m.id === found.membership_id && m.status === "invited");
      const user = membership && db.users.find((u) => u.id === membership.user_id);
      const organization = membership && db.organizations.find((o) => o.id === membership.organization_id);
      if (!found || !membership || !user || !organization) return fail(400, INVALID_LINK, "invalid_token");
      return ok<InvitePreviewResponse>({
        email: user.email,
        full_name: user.full_name,
        organization_name: organization.name,
        inviter_name: db.users.find((u) => u.id === found.created_by)?.full_name ?? organization.name,
        access_role: membership.access_role,
        expires_at: found.expires_at,
      });
    },
  },
  {
    method: "POST",
    path: "/api/v1/auth/accept-invite",
    handler: ({ db, body }) => {
      const b = (body ?? {}) as Record<string, unknown>;
      const found = findToken(db, b.token, "invite");
      const membership = found && db.memberships.find((m) => m.id === found.membership_id && m.status === "invited");
      const user = membership && db.users.find((u) => u.id === membership.user_id && u.is_active);
      if (!found || !membership || !user) return fail(400, INVALID_LINK, "invalid_token");
      if (db.memberships.some((m) => m.user_id === user.id && m.id !== membership.id && m.status !== "invited")) {
        return fail(409, "Email ini sudah dipakai di organisasi lain. Satu akun baru bisa bergabung ke satu organisasi.");
      }
      const fullName = text(b.full_name, 150);
      if (fullName.length < 2) return fail(422, "Nama minimal 2 karakter.");
      const weak = passwordProblem(b.password);
      if (weak) return fail(422, weak);

      found.used_at = nowIso();
      user.full_name = fullName;
      user.password = String(b.password);
      user.is_verified = true;
      membership.status = "active";
      membership.joined_at = nowIso();
      db.session = { user_id: user.id };
      return ok({ user: toProfile(db, user) }, "Selamat bergabung.");
    },
  },
];
