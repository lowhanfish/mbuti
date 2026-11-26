/**
 * Token sekali pakai dan kotak keluar email untuk data contoh.
 * Backend menyimpan hash SHA-256 token dan mengirim email lewat antrean; di sini token disimpan apa adanya
 * dan email ditaruh di `db.outbox` agar bisa dibuka dari panel Kotak keluar.
 */
import { newId, nowIso } from "./context";
import type { MockDatabase, MockUser } from "./seed";

export type TokenPurpose = "verify" | "reset" | "invite";

export interface MockAuthToken {
  token: string;
  purpose: TokenPurpose;
  user_id: string;
  /** Hanya untuk undangan */
  membership_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface MockEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  /** Tautan utama di email; dibuka langsung dari panel Kotak keluar */
  link: string | null;
  link_label: string | null;
  created_at: string;
}

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
  invite: 7 * 24 * 60 * 60 * 1000,
};

export const TOKEN_TTL_LABEL: Record<TokenPurpose, string> = {
  verify: "24 jam",
  reset: "1 jam",
  invite: "7 hari",
};

const randomToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Buat token baru; token belum terpakai dengan tujuan yang sama untuk pengguna (atau undangan) itu dibatalkan. */
export const issueToken = (db: MockDatabase, purpose: TokenPurpose, userId: string, membershipId: string | null = null) => {
  const now = nowIso();
  for (const t of db.auth_tokens) {
    if (t.purpose === purpose && t.user_id === userId && t.membership_id === membershipId && !t.used_at) t.used_at = now;
  }
  const token = randomToken();
  db.auth_tokens.push({
    token,
    purpose,
    user_id: userId,
    membership_id: membershipId,
    expires_at: new Date(Date.now() + TOKEN_TTL_MS[purpose]).toISOString(),
    used_at: null,
    created_at: now,
  });
  return token;
};

/** Token yang masih berlaku untuk tujuan itu, atau null. */
export const findToken = (db: MockDatabase, token: unknown, purpose: TokenPurpose) => {
  if (typeof token !== "string" || !token) return null;
  const found = db.auth_tokens.find((t) => t.token === token && t.purpose === purpose);
  if (!found || found.used_at || Date.parse(found.expires_at) < Date.now()) return null;
  return found;
};

export const INVALID_LINK = "Tautan tidak berlaku, sudah dipakai, atau kedaluwarsa. Minta tautan baru.";

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

export const sendEmail = (db: MockDatabase, email: Omit<MockEmail, "id" | "created_at">) => {
  db.outbox.unshift({ ...email, id: newId("email"), created_at: nowIso() });
  // Kotak keluar contoh cukup menyimpan email terbaru
  db.outbox.splice(30);
};

export const sendVerification = (db: MockDatabase, user: MockUser) => {
  const token = issueToken(db, "verify", user.id);
  sendEmail(db, {
    to: user.email,
    subject: "Verifikasi email akun MBUTI",
    body: `Halo ${user.full_name},\n\nKlik tautan di bawah untuk memverifikasi email dan mengaktifkan akun MBUTI Anda. Tautan berlaku ${TOKEN_TTL_LABEL.verify}.\n\nBila Anda tidak mendaftar, abaikan email ini.`,
    link: `${origin()}/verifikasi?token=${token}`,
    link_label: "Verifikasi email",
  });
};

export const sendAlreadyRegistered = (db: MockDatabase, user: MockUser) => {
  sendEmail(db, {
    to: user.email,
    subject: "Anda sudah punya akun MBUTI",
    body: `Halo ${user.full_name},\n\nSeseorang (mungkin Anda) mencoba mendaftar dengan email ini, padahal akunnya sudah ada. Silakan masuk, atau atur ulang kata sandi bila lupa.\n\nBila bukan Anda, abaikan email ini.`,
    link: `${origin()}/lupa-sandi`,
    link_label: "Atur ulang kata sandi",
  });
};

export const sendReset = (db: MockDatabase, user: MockUser) => {
  const token = issueToken(db, "reset", user.id);
  sendEmail(db, {
    to: user.email,
    subject: "Atur ulang kata sandi MBUTI",
    body: `Halo ${user.full_name},\n\nKami menerima permintaan atur ulang kata sandi. Tautan berlaku ${TOKEN_TTL_LABEL.reset} dan hanya bisa dipakai sekali.\n\nBila Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah.`,
    link: `${origin()}/atur-ulang-sandi?token=${token}`,
    link_label: "Atur ulang kata sandi",
  });
};

export const sendPasswordChanged = (db: MockDatabase, user: MockUser) => {
  sendEmail(db, {
    to: user.email,
    subject: "Kata sandi MBUTI Anda diubah",
    body: `Halo ${user.full_name},\n\nKata sandi akun MBUTI Anda baru saja diubah dan semua sesi lama sudah dikeluarkan. Bila bukan Anda yang mengubahnya, segera atur ulang kata sandi dan hubungi admin organisasi.`,
    link: null,
    link_label: null,
  });
};

export const sendInvite = (db: MockDatabase, user: MockUser, membershipId: string, organizationName: string, inviterName: string) => {
  const token = issueToken(db, "invite", user.id, membershipId);
  sendEmail(db, {
    to: user.email,
    subject: `Undangan bergabung ke ${organizationName} di MBUTI`,
    body: `Halo ${user.full_name},\n\n${inviterName} mengundang Anda bergabung ke ${organizationName} di MBUTI. Tautan berlaku ${TOKEN_TTL_LABEL.invite}.`,
    link: `${origin()}/undangan?token=${token}`,
    link_label: "Terima undangan",
  });
};
