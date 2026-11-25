/**
 * Data contoh untuk mode NEXT_PUBLIC_DATA_SOURCE=mock.
 * Semua data fiktif. Tahap berikutnya menambah role, relasi, dokumen, dan tugas di sini.
 */
import type { AccessRole } from "@/types/global";

export type OrganizationSector = "pemerintahan" | "pendidikan" | "kesehatan" | "usaha" | "nirlaba" | "lainnya";
export type UnitColor = "violet" | "honey" | "pink" | "teal" | "sky" | "lime" | "orange" | "slate";
export type MemberStatus = "active" | "invited" | "disabled";

export interface MockOrganization {
  id: string;
  name: string;
  slug: string;
  description: string;
  sector: OrganizationSector;
  timezone: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  created_at: string;
  updated_at: string;
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
  unit_id: string | null;
  status: MemberStatus;
  joined_at: string;
  last_active_at: string | null;
}

export interface MockUnit {
  id: string;
  organization_id: string;
  parent_id: string | null;
  name: string;
  code: string;
  description: string;
  color: UnitColor;
  lead_member_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MockDatabase {
  version: number;
  organizations: MockOrganization[];
  users: MockUser[];
  memberships: MockMembership[];
  units: MockUnit[];
  session: { user_id: string } | null;
}

/** Naikkan bila bentuk data contoh berubah, agar data lama di peramban diganti. */
export const MOCK_DB_VERSION = 2;

/** Akun demo; tombol "Masuk dengan akun demo" di halaman login memakai nilai ini. */
export const DEMO_ACCOUNT = {
  email: "demo@mbuti.test",
  password: "demo-mbuti-2026",
};

const ORG = "org-nusantara";
const T0 = "2026-11-25T08:00:00Z";

const people: Array<[string, string, AccessRole, string | null, MemberStatus, string | null]> = [
  // [id, nama, akses, unit, status, terakhir aktif]
  ["rina", "Rina Lestari", "admin", "unit-sekretariat", "active", "2026-11-25T07:40:00Z"],
  ["bayu", "Bayu Pratama", "member", "unit-persuratan", "active", "2026-11-24T15:10:00Z"],
  ["sari", "Sari Wulandari", "member", "unit-keuangan", "active", "2026-11-23T10:05:00Z"],
  ["dimas", "Dimas Saputra", "viewer", "unit-data", "active", "2026-11-20T09:00:00Z"],
  ["maya", "Maya Anggraini", "member", "unit-layanan", "invited", null],
  ["yusuf", "Yusuf Hidayat", "member", "unit-umum", "disabled", "2026-10-30T13:00:00Z"],
];

export const createSeed = (): MockDatabase => ({
  version: MOCK_DB_VERSION,
  organizations: [
    {
      id: ORG,
      name: "Dinas Contoh Nusantara",
      slug: "dinas-contoh-nusantara",
      description: "Organisasi contoh untuk memperagakan MBUTI: pelayanan administrasi, persuratan, dan data.",
      sector: "pemerintahan",
      timezone: "Asia/Makassar",
      email: "halo@contoh-nusantara.test",
      phone: "0401-000000",
      address: "Jl. Contoh No. 1, Kota Nusantara",
      website: "https://contoh-nusantara.test",
      created_at: T0,
      updated_at: T0,
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
      created_at: T0,
    },
    ...people.map(([id, name]) => ({
      id: `user-${id}`,
      email: `${id}@contoh-nusantara.test`,
      password: "",
      full_name: name,
      is_active: true,
      is_verified: true,
      created_at: T0,
    })),
  ],
  memberships: [
    {
      id: "member-demo",
      organization_id: ORG,
      user_id: "user-demo",
      access_role: "owner",
      unit_id: "unit-sekretariat",
      status: "active",
      joined_at: T0,
      last_active_at: T0,
    },
    ...people.map(([id, , role, unit, status, last]) => ({
      id: `member-${id}`,
      organization_id: ORG,
      user_id: `user-${id}`,
      access_role: role,
      unit_id: unit,
      status,
      joined_at: T0,
      last_active_at: last,
    })),
  ],
  units: [
    unit("unit-sekretariat", null, "Sekretariat", "SEK", "Koordinasi administrasi, kepegawaian, dan keuangan.", "violet", "member-rina", 1),
    unit("unit-umum", "unit-sekretariat", "Umum & Kepegawaian", "UMP", "Urusan umum, aset, dan kepegawaian.", "sky", null, 1),
    unit("unit-keuangan", "unit-sekretariat", "Keuangan", "KEU", "Anggaran, pembayaran, dan pelaporan keuangan.", "teal", "member-sari", 2),
    unit("unit-layanan", null, "Bidang Layanan", "LAY", "Pelayanan administrasi kepada masyarakat.", "honey", null, 2),
    unit("unit-persuratan", "unit-layanan", "Persuratan", "SRT", "Penyusunan, pemeriksaan, dan pengarsipan surat dinas.", "orange", "member-bayu", 1),
    unit("unit-data", null, "Bidang Data & Informasi", "DAT", "Statistik, publikasi, dan pengelolaan informasi.", "pink", "member-dimas", 3),
  ],
  session: null,
});

function unit(
  id: string,
  parent_id: string | null,
  name: string,
  code: string,
  description: string,
  color: UnitColor,
  lead_member_id: string | null,
  sort_order: number
): MockUnit {
  return { id, organization_id: ORG, parent_id, name, code, description, color, lead_member_id, sort_order, created_at: T0, updated_at: T0 };
}
