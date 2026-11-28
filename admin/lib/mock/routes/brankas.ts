import {
  VAULT_MAX_ACCOUNTS,
  VAULT_MAX_OTHER_URLS,
  type VaultAccess,
  type VaultAccount,
  type VaultCode,
  type VaultInput,
  type VaultResponse,
} from "@/app/(admin)/admin/role/vault-types";
import { isFailure, newId, nowIso, requireMember, text } from "../context";
import { fail, ok, type MockContext, type MockResponse, type MockRoute } from "../router";
import type { MockAgent, MockMembership } from "../seed";
import { checkCode, twoFactorEnabled } from "../two-factor";
import { originOf, type MockVaultAccount } from "../vault";
import { WRONG_CODE } from "./akun";

const BASE = "/api/v1/admin/role/:role_id/brankas";

interface Scope {
  self: MockMembership;
  agent: MockAgent;
  access: VaultAccess;
}

const scopeOf = (ctx: MockContext): Scope | MockResponse => {
  const self = requireMember(ctx);
  if (isFailure(self)) return self;
  const agent = ctx.db.agents.find((a) => a.id === ctx.params.role_id && a.organization_id === self.organization_id);
  if (!agent) return fail(404, "Role tidak ditemukan.");
  const owner = ctx.db.memberships.find((m) => m.id === agent.owner_member_id);
  const blocker =
    self.access_role === "viewer"
      ? "viewer"
      : !owner
        ? "no_responsible"
        : owner.id !== self.id
          ? "not_responsible"
          : !twoFactorEnabled(ctx.db, self.user_id)
            ? "two_factor_off"
            : "";
  return {
    self,
    agent,
    access: {
      can_manage: blocker === "",
      blocker,
      responsible_name: ctx.db.users.find((u) => u.id === owner?.user_id)?.full_name ?? null,
    },
  };
};

const failed = (value: Scope | MockResponse): value is MockResponse => "body" in value && "status" in value;

const toAccount = (scope: Scope, a: MockVaultAccount): VaultAccount => {
  const sees = ["owner", "admin"].includes(scope.self.access_role) || scope.agent.owner_member_id === scope.self.id;
  return {
    id: a.id,
    name: a.name,
    url: a.url,
    other_urls: a.other_urls,
    username: sees ? a.username : "",
    has_password: true,
    has_totp: a.has_totp,
    locked: a.responsible_member_id !== scope.agent.owner_member_id,
    login_failed: Boolean(a.login_failed),
    password_changed_at: a.password_changed_at,
    last_used_at: a.last_used_at,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
};

/** Ruang lingkup untuk perubahan: hanya penanggung jawab dengan kode yang benar. */
const manage = (ctx: MockContext): Scope | MockResponse => {
  const scope = scopeOf(ctx);
  if (failed(scope)) return scope;
  if (!scope.access.can_manage) return fail(403, "Hanya penanggung jawab role dengan verifikasi dua langkah yang dapat mengubah brankas.");
  const code = (ctx.body as { code?: unknown } | null)?.code;
  if (!checkCode(ctx.db, scope.self.user_id, code)) return fail(422, WRONG_CODE, "two_factor_invalid");
  return scope;
};

const findAccount = (ctx: MockContext, scope: Scope) =>
  ctx.db.vault_accounts.find((a) => a.id === ctx.params.account_id && a.agent_id === scope.agent.id) ?? null;

const readInput = (ctx: MockContext, scope: Scope, current: MockVaultAccount | null) => {
  const b = (ctx.body ?? {}) as Partial<VaultInput>;
  const name = text(b.name, 80);
  const url = text(b.url, 500);
  const others = (Array.isArray(b.other_urls) ? b.other_urls : []).map((u) => text(u, 500)).filter(Boolean);
  const username = text(b.username, 200);
  const password = typeof b.password === "string" ? b.password : "";
  const totpKey = text(b.totp_key, 500);
  if (name.length < 2) return fail(422, "Nama aplikasi minimal 2 karakter.");
  if (ctx.db.vault_accounts.some((a) => a.agent_id === scope.agent.id && a.id !== current?.id && a.name.toLowerCase() === name.toLowerCase())) {
    return fail(409, "Nama aplikasi sudah dipakai di brankas role ini.");
  }
  if (!originOf(url)) return fail(422, "Alamat aplikasi harus diawali http:// atau https://.");
  if (others.length > VAULT_MAX_OTHER_URLS) return fail(422, `Alamat lain maksimal ${VAULT_MAX_OTHER_URLS}.`);
  if (others.some((u) => !originOf(u))) return fail(422, "Alamat lain harus diawali http:// atau https://.");
  if (!username) return fail(422, "Username wajib diisi.");
  if (!current && !password) return fail(422, "Password wajib diisi.");
  if (current) {
    const known = new Set([current.url, ...current.other_urls].map(originOf));
    const added = [url, ...others].some((u) => !known.has(originOf(u)));
    if (added && !password) return fail(422, "Alamat berubah ke situs lain: isi ulang password.");
    if (added && current.has_totp && !totpKey && !b.remove_totp) {
      return fail(422, "Alamat berubah ke situs lain: isi ulang kunci authenticator atau hapus.");
    }
  }
  if (totpKey && !/^(otpauth:\/\/totp\/.+|[a-z2-7\s=-]{16,})$/i.test(totpKey)) {
    return fail(422, "Kunci authenticator tidak dikenal. Tempel kunci huruf dan angka, atau alamat otpauth://.");
  }
  return {
    name,
    url,
    other_urls: others,
    username,
    newPassword: password.length > 0,
    has_totp: totpKey ? true : b.remove_totp ? false : (current?.has_totp ?? false),
  };
};

export const brankasRoutes: MockRoute[] = [
  {
    method: "GET",
    path: BASE,
    handler: (ctx) => {
      const scope = scopeOf(ctx);
      if (failed(scope)) return scope;
      const accounts = ctx.db.vault_accounts
        .filter((a) => a.agent_id === scope.agent.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => toAccount(scope, a));
      return ok<VaultResponse>({ accounts, access: scope.access });
    },
  },
  {
    method: "POST",
    path: BASE,
    handler: (ctx) => {
      const scope = manage(ctx);
      if (failed(scope)) return scope;
      if (ctx.db.vault_accounts.filter((a) => a.agent_id === scope.agent.id).length >= VAULT_MAX_ACCOUNTS) {
        return fail(409, `Brankas satu role maksimal ${VAULT_MAX_ACCOUNTS} akun.`);
      }
      const input = readInput(ctx, scope, null);
      if ("status" in input) return input;
      const { name, url, other_urls, username, has_totp } = input;
      const fields = { name, url, other_urls, username, has_totp };
      const now = nowIso();
      const account: MockVaultAccount = {
        id: newId("brankas"),
        organization_id: scope.self.organization_id,
        agent_id: scope.agent.id,
        ...fields,
        responsible_member_id: scope.self.id,
        password_changed_at: now,
        last_used_at: null,
        created_at: now,
        updated_at: now,
      };
      ctx.db.vault_accounts.push(account);
      return ok(toAccount(scope, account), "Akun disimpan di brankas.", 201);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/:account_id`,
    handler: (ctx) => {
      const scope = manage(ctx);
      if (failed(scope)) return scope;
      const account = findAccount(ctx, scope);
      if (!account) return fail(404, "Akun brankas tidak ditemukan.");
      if (account.responsible_member_id !== scope.self.id) return fail(409, "Konfirmasi akun ini terlebih dahulu.");
      const input = readInput(ctx, scope, account);
      if ("status" in input) return input;
      const { newPassword, ...fields } = input;
      const before = new Set([account.url, ...account.other_urls].map(originOf));
      const moved = [fields.url, ...fields.other_urls].some((u) => !before.has(originOf(u)));
      Object.assign(account, fields, { updated_at: nowIso() });
      if (newPassword) Object.assign(account, { password_changed_at: account.updated_at, login_failed: false });
      if (moved) {
        for (const flow of ctx.db.browser_flows.filter((f) => f.account_id === account.id)) {
          Object.assign(flow, { trusted_submit: false, status: "needs_repair", note: "Alamat akun berubah. Pelajari ulang alur ini." });
        }
      }
      return ok(toAccount(scope, account), "Akun diperbarui.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:account_id/hapus`,
    handler: (ctx) => {
      const scope = manage(ctx);
      if (failed(scope)) return scope;
      const account = findAccount(ctx, scope);
      if (!account) return fail(404, "Akun brankas tidak ditemukan.");
      ctx.db.vault_accounts = ctx.db.vault_accounts.filter((a) => a.id !== account.id);
      return ok(null, "Akun dihapus dari brankas.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:account_id/konfirmasi`,
    handler: (ctx) => {
      const scope = manage(ctx);
      if (failed(scope)) return scope;
      const account = findAccount(ctx, scope);
      if (!account) return fail(404, "Akun brankas tidak ditemukan.");
      account.responsible_member_id = scope.self.id;
      account.login_failed = false;
      account.updated_at = nowIso();
      for (const flow of ctx.db.browser_flows.filter((f) => f.account_id === account.id)) flow.trusted_submit = false;
      return ok(toAccount(scope, account), "Akun dikonfirmasi.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:account_id/kode`,
    handler: (ctx) => {
      const scope = manage(ctx);
      if (failed(scope)) return scope;
      const account = findAccount(ctx, scope);
      if (!account) return fail(404, "Akun brankas tidak ditemukan.");
      if (account.responsible_member_id !== scope.self.id) return fail(409, "Konfirmasi akun ini terlebih dahulu.");
      if (!account.has_totp) return fail(409, "Akun ini belum punya kunci authenticator.");
      const expires_in = 30 - (Math.floor(Date.now() / 1000) % 30);
      const step = Math.floor(Date.now() / 30000);
      return ok<VaultCode>({ code: String((step * 7919) % 1_000_000).padStart(6, "0"), expires_in, period: 30 });
    },
  },
];
