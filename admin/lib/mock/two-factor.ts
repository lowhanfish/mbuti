/** Verifikasi dua langkah data contoh. Kode authenticator selalu `123456`. */
import type { MockDatabase } from "./seed";

export const MOCK_CODE = "123456";

export interface MockTwoFactor {
  user_id: string;
  /** Kosong selama pemasangan belum dikonfirmasi */
  enabled_at: string | null;
  recovery_codes: string[];
}

export const twoFactorOf = (db: MockDatabase, userId: string) => db.two_factors.find((t) => t.user_id === userId) ?? null;

export const twoFactorEnabled = (db: MockDatabase, userId: string) => Boolean(twoFactorOf(db, userId)?.enabled_at);

export const newRecoveryCodes = () =>
  Array.from({ length: 8 }, () => {
    const part = () => Math.random().toString(36).slice(2, 7).padEnd(5, "x");
    return `${part()}-${part()}`;
  });

/** Kode authenticator contoh atau salah satu kode cadangan (sekali pakai). */
export const checkCode = (db: MockDatabase, userId: string, code: unknown) => {
  const entry = twoFactorOf(db, userId);
  const given = String(code ?? "").trim().toLowerCase();
  if (!entry) return false;
  if (given.replace(/\s/g, "") === MOCK_CODE) return true;
  const index = entry.recovery_codes.indexOf(given);
  if (index < 0) return false;
  entry.recovery_codes.splice(index, 1);
  return true;
};
