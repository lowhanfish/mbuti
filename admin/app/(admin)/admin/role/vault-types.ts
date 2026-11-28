/** Brankas akun aplikasi luar per role (E4a, kontrak API bagian 21). */
export interface VaultAccount {
  id: string;
  name: string;
  /** Alamat halaman masuk aplikasi */
  url: string;
  /** Alamat lain yang boleh diisi program, mis. halaman masuk terpusat */
  other_urls: string[];
  /** Kosong bila Anda bukan pemilik, admin, atau penanggung jawab role */
  username: string;
  has_password: boolean;
  has_totp: boolean;
  /** Penanggung jawab role berganti: tidak dipakai program sampai dikonfirmasi */
  locked: boolean;
  /** Gagal masuk 2 kali: tidak dipakai sampai password diganti atau dikonfirmasi */
  login_failed: boolean;
  password_changed_at: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export type VaultBlocker = "" | "viewer" | "no_responsible" | "not_responsible" | "two_factor_off";

export interface VaultAccess {
  can_manage: boolean;
  /** Alasan brankas tidak bisa diubah; kosong bila bisa */
  blocker: VaultBlocker;
  responsible_name: string | null;
}

export interface VaultResponse {
  accounts: VaultAccount[];
  access: VaultAccess;
}

export interface VaultInput {
  name: string;
  url: string;
  other_urls: string[];
  username: string;
  /** Saat mengubah: kosong berarti tidak diganti */
  password: string;
  /** Kunci authenticator aplikasi tujuan (base32 atau alamat otpauth://); kosong berarti tidak diganti */
  totp_key: string;
  /** Saat mengubah: hapus kunci authenticator yang tersimpan */
  remove_totp: boolean;
  /** Kode verifikasi dua langkah Anda */
  code: string;
}

export interface VaultCode {
  code: string;
  /** Detik sebelum kode berganti */
  expires_in: number;
  period: number;
}

export const VAULT_MAX_ACCOUNTS = 20;
export const VAULT_MAX_OTHER_URLS = 5;

export const VAULT_BLOCKER_TEXT: Record<Exclude<VaultBlocker, "">, string> = {
  viewer: "Pemantau tidak dapat mengubah brankas.",
  no_responsible: "Role ini belum punya penanggung jawab. Tetapkan di tab Profil sebelum menyimpan akun.",
  not_responsible: "Hanya penanggung jawab role yang dapat mengubah brankas.",
  two_factor_off: "Aktifkan verifikasi dua langkah di Akun Saya untuk mengubah brankas.",
};
