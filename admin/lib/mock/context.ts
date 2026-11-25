import { fail, type MockContext, type MockResponse } from "./router";
import type { MockMembership } from "./seed";

/** Keanggotaan pengguna yang sedang masuk, atau respons galat bila belum masuk. */
export const requireMember = (ctx: MockContext): MockMembership | MockResponse => {
  const userId = ctx.db.session?.user_id;
  const membership = ctx.db.memberships.find((m) => m.user_id === userId && m.status === "active");
  if (!userId || !membership) return fail(401, "Silakan masuk terlebih dahulu.");
  return membership;
};

/** Sama seperti requireMember, tetapi hanya pemilik dan admin yang boleh mengubah data organisasi. */
export const requireManager = (ctx: MockContext): MockMembership | MockResponse => {
  const membership = requireMember(ctx);
  if (isFailure(membership)) return membership;
  if (membership.access_role !== "owner" && membership.access_role !== "admin") {
    return fail(403, "Hanya pemilik atau admin yang dapat melakukan perubahan ini.");
  }
  return membership;
};

export function isFailure(value: MockMembership | MockResponse): value is MockResponse {
  return "body" in value;
}

export const nowIso = () => new Date().toISOString();

export const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;

export const text = (value: unknown, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");
