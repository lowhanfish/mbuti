/** Verifikasi dua langkah akun MBUTI (E4a, kontrak API bagian 21). */
export interface TwoFactorStatus {
  enabled: boolean;
  enabled_at: string | null;
  /** Sisa kode cadangan yang belum dipakai */
  recovery_codes_left: number;
  /** Jumlah akun di brankas role yang Anda tanggung */
  vault_accounts: number;
}

export interface TwoFactorSetup {
  /** Kunci base32 untuk diketik di aplikasi authenticator */
  secret: string;
  otpauth_url: string;
  /** Gambar QR (data URI SVG); kosong di mode data contoh */
  qr_svg: string;
}

export interface RecoveryCodes {
  /** Ditampilkan sekali; server hanya menyimpan sidik jarinya */
  recovery_codes: string[];
}

export const CODE_LENGTH = 6;
