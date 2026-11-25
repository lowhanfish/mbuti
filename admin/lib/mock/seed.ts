/**
 * Data contoh awal untuk mode NEXT_PUBLIC_DATA_SOURCE=mock.
 * Semua data fiktif. Tahap berikutnya menambah unit, role, relasi, dokumen, dan tugas di sini.
 */
import type { AccessRole } from "@/types/global";

export interface MockOrganization {
  id: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
  created_at: string;
}

export interface MockUser {
  id: string;
  email: string;
  /** Hanya untuk data contoh di peramban; backend menyimpan hash Argon2id. */
  password: string;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface MockMembership {
  id: string;
  organization_id: string;
  user_id: string;
  access_role: AccessRole;
}

export interface MockDatabase {
  version: number;
  organizations: MockOrganization[];
  users: MockUser[];
  memberships: MockMembership[];
  session: { user_id: string } | null;
}

/** Naikkan bila bentuk data contoh berubah, agar data lama di peramban diganti. */
export const MOCK_DB_VERSION = 1;

/** Akun demo; tombol "Masuk dengan akun demo" di halaman login memakai nilai ini. */
export const DEMO_ACCOUNT = {
  email: "demo@mbuti.test",
  password: "demo-mbuti-2026",
};

export const createSeed = (): MockDatabase => ({
  version: MOCK_DB_VERSION,
  organizations: [
    {
      id: "org-nusantara",
      name: "Dinas Contoh Nusantara",
      slug: "dinas-contoh-nusantara",
      description: "Organisasi contoh untuk memperagakan MBUTI.",
      timezone: "Asia/Makassar",
      created_at: "2026-11-25T08:00:00Z",
    },
  ],
  users: [
    {
      id: "user-demo",
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
      full_name: "Pengguna Demo",
      is_active: true,
      is_verified: true,
      created_at: "2026-11-25T08:00:00Z",
    },
  ],
  memberships: [
    {
      id: "member-demo",
      organization_id: "org-nusantara",
      user_id: "user-demo",
      access_role: "owner",
    },
  ],
  session: null,
});
