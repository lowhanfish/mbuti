import type { RecoveryCodes, TwoFactorSetup, TwoFactorStatus } from "@/app/(admin)/admin/akun/types";
import { nowIso } from "../context";
import { fail, ok, type MockContext, type MockRoute } from "../router";
import { checkCode, newRecoveryCodes, twoFactorEnabled, twoFactorOf } from "../two-factor";
import type { MockUser } from "../seed";
import { currentUser } from "./auth";

const BASE = "/api/v1/auth/dua-langkah";
export const WRONG_CODE = "Kode verifikasi salah.";
const MOCK_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const statusOf = (ctx: MockContext, user: MockUser): TwoFactorStatus => {
  const entry = twoFactorOf(ctx.db, user.id);
  const memberships = ctx.db.memberships.filter((m) => m.user_id === user.id).map((m) => m.id);
  return {
    enabled: Boolean(entry?.enabled_at),
    enabled_at: entry?.enabled_at ?? null,
    recovery_codes_left: entry?.enabled_at ? entry.recovery_codes.length : 0,
    vault_accounts: ctx.db.vault_accounts.filter((a) => memberships.includes(a.responsible_member_id)).length,
  };
};

const field = (ctx: MockContext, key: string) => String((ctx.body as Record<string, unknown> | null)?.[key] ?? "");

export const akunRoutes: MockRoute[] = [
  {
    method: "GET",
    path: BASE,
    handler: (ctx) => {
      const user = currentUser(ctx.db);
      if (!user) return fail(401, "Silakan masuk terlebih dahulu.");
      return ok(statusOf(ctx, user));
    },
  },
  {
    method: "POST",
    path: `${BASE}/mulai`,
    handler: (ctx) => {
      const user = currentUser(ctx.db);
      if (!user) return fail(401, "Silakan masuk terlebih dahulu.");
      if (field(ctx, "password") !== user.password) return fail(422, "Kata sandi salah.");
      if (twoFactorEnabled(ctx.db, user.id)) return fail(409, "Verifikasi dua langkah sudah aktif.");
      ctx.db.two_factors = ctx.db.two_factors.filter((t) => t.user_id !== user.id);
      ctx.db.two_factors.push({ user_id: user.id, enabled_at: null, recovery_codes: [] });
      return ok<TwoFactorSetup>({
        secret: MOCK_SECRET,
        otpauth_url: `otpauth://totp/MBUTI:${encodeURIComponent(user.email)}?secret=${MOCK_SECRET}&issuer=MBUTI`,
        qr_svg: "",
      });
    },
  },
  {
    method: "POST",
    path: `${BASE}/aktifkan`,
    handler: (ctx) => {
      const user = currentUser(ctx.db);
      if (!user) return fail(401, "Silakan masuk terlebih dahulu.");
      const entry = twoFactorOf(ctx.db, user.id);
      if (!entry) return fail(409, "Mulai pemasangan terlebih dahulu.");
      if (entry.enabled_at) return fail(409, "Verifikasi dua langkah sudah aktif.");
      if (!checkCode(ctx.db, user.id, field(ctx, "code"))) return fail(422, WRONG_CODE, "two_factor_invalid");
      entry.enabled_at = nowIso();
      entry.recovery_codes = newRecoveryCodes();
      return ok<RecoveryCodes>({ recovery_codes: [...entry.recovery_codes] }, "Verifikasi dua langkah aktif.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/kode-cadangan`,
    handler: (ctx) => {
      const user = currentUser(ctx.db);
      if (!user) return fail(401, "Silakan masuk terlebih dahulu.");
      const entry = twoFactorOf(ctx.db, user.id);
      if (!entry?.enabled_at) return fail(409, "Verifikasi dua langkah belum aktif.");
      if (!checkCode(ctx.db, user.id, field(ctx, "code"))) return fail(422, WRONG_CODE, "two_factor_invalid");
      entry.recovery_codes = newRecoveryCodes();
      return ok<RecoveryCodes>({ recovery_codes: [...entry.recovery_codes] }, "Kode cadangan baru dibuat.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/matikan`,
    handler: (ctx) => {
      const user = currentUser(ctx.db);
      if (!user) return fail(401, "Silakan masuk terlebih dahulu.");
      if (!twoFactorEnabled(ctx.db, user.id)) return fail(409, "Verifikasi dua langkah belum aktif.");
      if (field(ctx, "password") !== user.password) return fail(422, "Kata sandi salah.");
      if (!checkCode(ctx.db, user.id, field(ctx, "code"))) return fail(422, WRONG_CODE, "two_factor_invalid");
      ctx.db.two_factors = ctx.db.two_factors.filter((t) => t.user_id !== user.id);
      return ok(null, "Verifikasi dua langkah dimatikan.");
    },
  },
];
