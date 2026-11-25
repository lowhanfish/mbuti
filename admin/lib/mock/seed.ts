/**
 * Data contoh untuk mode NEXT_PUBLIC_DATA_SOURCE=mock.
 * Semua data fiktif. Tahap berikutnya menambah role, relasi, dokumen, dan tugas di sini.
 */
import type { AccessRole } from "@/types/global";
import type { UpdateInterface as AgentFields } from "@/app/(admin)/admin/role/types";

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

export interface MockAgent extends AgentFields {
  id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export interface MockDatabase {
  version: number;
  organizations: MockOrganization[];
  users: MockUser[];
  memberships: MockMembership[];
  units: MockUnit[];
  agents: MockAgent[];
  session: { user_id: string } | null;
}

/** Naikkan bila bentuk data contoh berubah, agar data lama di peramban diganti. */
export const MOCK_DB_VERSION = 3;

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
  agents: SEED_AGENTS,
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

const agent = (fields: Omit<MockAgent, "organization_id" | "created_at" | "updated_at">): MockAgent => ({
  ...fields,
  organization_id: ORG,
  created_at: T0,
  updated_at: T0,
});

const SEED_AGENTS: MockAgent[] = [
  agent({
    id: "agent-rani",
    name: "Rani",
    title: "Penyusun Surat Dinas",
    unit_id: "unit-persuratan",
    goal: "Menyusun draf surat dinas yang sesuai pedoman tata naskah dinas, siap diperiksa.",
    status: "active",
    instructions:
      "1. Baca permintaan dan tentukan jenis surat (undangan, edaran, pemberitahuan, balasan).\n2. Ambil format, penomoran, dan susunan bagian surat dari pedoman tata naskah dinas.\n3. Tulis isi surat dengan bahasa resmi, singkat, dan jelas.\n4. Sebutkan halaman pedoman yang dipakai untuk setiap aturan format.\n5. Jika data wajib (tujuan, tanggal, perihal) belum ada, minta dilengkapi; jangan mengarang.",
    input_spec: [
      { key: "jenis_surat", label: "Jenis surat", type: "choice", required: true, options: ["Undangan", "Edaran", "Pemberitahuan", "Balasan"] },
      { key: "tujuan", label: "Tujuan surat", type: "short_text", required: true },
      { key: "perihal", label: "Perihal", type: "short_text", required: true },
      { key: "pokok_isi", label: "Pokok isi", type: "long_text", required: true },
      { key: "tanggal_kegiatan", label: "Tanggal kegiatan", type: "date", required: false },
    ],
    output_format: "template",
    output_template: "KOP SURAT\nNomor   : …\nSifat   : …\nLampiran: …\nPerihal : …\n\nYth. …\n\n[Isi surat]\n\n[Penutup]\n\n[Jabatan penandatangan]\n[Nama]",
    acceptance_criteria: [
      "Format kop, nomor, dan susunan bagian sesuai pedoman",
      "Bahasa resmi dan tidak bertele-tele",
      "Semua data wajib terisi; tidak ada data karangan",
      "Setiap aturan format menyebut halaman pedoman",
    ],
    knowledge_scope: "unit",
    model_profile: "balanced",
    owner_member_id: "member-bayu",
    avatar: { skin: "#eebd94", hair: "#1f1a24", hair_style: "long", shirt: "#7c4dff", pants: "#18122b", accessory: "headset" },
  }),
  agent({
    id: "agent-tegar",
    name: "Tegar",
    title: "Pemeriksa Surat",
    unit_id: "unit-persuratan",
    goal: "Memeriksa draf surat terhadap pedoman tata naskah dinas dan memberi catatan perbaikan yang jelas.",
    status: "active",
    instructions:
      "1. Periksa format, penomoran, dan susunan bagian terhadap pedoman.\n2. Periksa ejaan dan bahasa resmi.\n3. Untuk setiap temuan, sebutkan bagian yang salah, aturan yang dilanggar, dan halaman pedomannya.\n4. Putuskan: DITERIMA atau PERLU REVISI.",
    input_spec: [],
    output_format: "table",
    output_template: "",
    acceptance_criteria: ["Setiap temuan menyebut aturan dan halaman pedoman", "Keputusan akhir jelas: diterima atau perlu revisi"],
    knowledge_scope: "unit",
    model_profile: "thorough",
    owner_member_id: "member-bayu",
    avatar: { skin: "#b97a4f", hair: "#4a2e1f", hair_style: "short", shirt: "#18122b", pants: "#334155", accessory: "glasses" },
  }),
  agent({
    id: "agent-sekar",
    name: "Sekar",
    title: "Penyusun Laporan Keuangan",
    unit_id: "unit-keuangan",
    goal: "Menyusun ringkasan realisasi anggaran bulanan sesuai format laporan yang berlaku.",
    status: "active",
    instructions: "Susun ringkasan realisasi per kegiatan, bandingkan dengan pagu, dan tandai penyerapan di bawah 50%.",
    input_spec: [{ key: "bulan", label: "Bulan laporan", type: "short_text", required: true }],
    output_format: "table",
    output_template: "",
    acceptance_criteria: ["Angka sesuai sumber", "Persentase penyerapan dihitung benar"],
    knowledge_scope: "own",
    model_profile: "balanced",
    owner_member_id: "member-sari",
    avatar: { skin: "#f6d5b8", hair: "#8a5a2b", hair_style: "bun", shirt: "#14b8a6", pants: "#1e3a8a", accessory: "flower" },
  }),
  agent({
    id: "agent-dana",
    name: "Dana",
    title: "Verifikator Pembayaran",
    unit_id: "unit-keuangan",
    goal: "Memeriksa kelengkapan berkas pengajuan pembayaran sebelum diproses.",
    status: "draft",
    instructions: "",
    input_spec: [],
    output_format: "text",
    output_template: "",
    acceptance_criteria: [],
    knowledge_scope: "own",
    model_profile: "thorough",
    owner_member_id: null,
    avatar: { skin: "#d9a074", hair: "#1f1a24", hair_style: "cap", shirt: "#ffb81c", pants: "#18122b", accessory: "tie" },
  }),
  agent({
    id: "agent-lumi",
    name: "Lumi",
    title: "Petugas Layanan Informasi",
    unit_id: "unit-layanan",
    goal: "Menjawab pertanyaan masyarakat tentang syarat dan alur layanan berdasarkan SOP pelayanan.",
    status: "active",
    instructions: "Jawab singkat dan ramah. Sebutkan dokumen dan halaman sumber. Bila tidak ada di SOP, katakan belum tersedia.",
    input_spec: [{ key: "pertanyaan", label: "Pertanyaan warga", type: "long_text", required: true }],
    output_format: "text",
    output_template: "",
    acceptance_criteria: ["Jawaban bersumber dari SOP", "Tidak menebak bila informasi tidak ada"],
    knowledge_scope: "organization",
    model_profile: "fast",
    owner_member_id: "member-maya",
    avatar: { skin: "#eebd94", hair: "#6d28d9", hair_style: "long", shirt: "#ffb81c", pants: "#18122b", accessory: "antenna" },
  }),
  agent({
    id: "agent-data",
    name: "Bima",
    title: "Analis Statistik",
    unit_id: "unit-data",
    goal: "Merangkum data statistik menjadi poin-poin yang mudah dipahami pimpinan.",
    status: "paused",
    instructions: "Rangkum tren utama, sebutkan angka penting beserta sumbernya, dan hindari kesimpulan yang tidak didukung data.",
    input_spec: [{ key: "topik", label: "Topik data", type: "short_text", required: true }],
    output_format: "text",
    output_template: "",
    acceptance_criteria: ["Setiap angka menyebut sumber dan periode"],
    knowledge_scope: "unit",
    model_profile: "thorough",
    owner_member_id: "member-dimas",
    avatar: { skin: "#8d5a37", hair: "#1f1a24", hair_style: "short", shirt: "#ec4899", pants: "#3f3f46", accessory: "headset" },
  }),
];
