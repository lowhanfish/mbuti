/** Brankas akun data contoh. Password tidak disimpan di peramban, hanya penandanya. */
export interface MockVaultAccount {
  id: string;
  organization_id: string;
  agent_id: string;
  name: string;
  url: string;
  other_urls: string[];
  username: string;
  has_totp: boolean;
  /** Penanggung jawab saat akun disimpan atau dikonfirmasi */
  responsible_member_id: string;
  password_changed_at: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** `skema://host[:port]`, atau null bila alamatnya tidak bisa dipakai. */
export const originOf = (value: string) => {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
};
