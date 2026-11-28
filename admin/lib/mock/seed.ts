/**
 * Data contoh untuk mode NEXT_PUBLIC_DATA_SOURCE=mock.
 * Semua data fiktif. Tahap berikutnya menambah role, relasi, dokumen, dan tugas di sini.
 */
import type { MockAuditLog } from "./audit";
import type { AccessRole } from "@/types/global";
import type { UpdateInterface as AgentFields } from "@/app/(admin)/admin/role/types";
import { SEED_DOC_VERSIONS, SEED_DOCUMENTS, type MockDocVersion, type MockDocument } from "./seed-documents";
import type { RelationFields } from "@/app/(admin)/admin/relasi/types";
import type { MockApproval, MockEvent, MockStep, MockTask } from "./engine";
import { seedTasks } from "./seed-tasks";
import { defaultSettings, type MockSettings } from "./settings";
import type { MockAuthToken, MockEmail } from "./accounts";
import type { MockRevision, MockToolRequest } from "./formation";
import type { MockAttachment } from "./media";
import type { MockProposal } from "./web";
import { seedFormation } from "./seed-formation";
import { seedPolicies } from "./seed-policies";
import { seedSchedules } from "./seed-schedules";
import type { MockLetterFormat, MockLetterhead, MockRegister, MockResultFile, MockSample } from "./letters";
import type { MockCalendarDay, MockLeave, MockRun, MockSchedule, MockShift } from "./schedule";

export type { MockDocVersion, MockDocument };

export type OrganizationSector = "pemerintahan" | "pendidikan" | "kesehatan" | "usaha" | "nirlaba" | "lainnya";
export type UnitColor = "violet" | "honey" | "pink" | "teal" | "sky" | "lime" | "orange" | "slate";
export type MemberStatus = "active" | "invited" | "disabled";
/** `pending` = baru mendaftar dan menunggu persetujuan pengelola platform. */
export type OrganizationStatus = "pending" | "active" | "suspended";

export interface MockOrganization {
  id: string;
  name: string;
  slug: string;
  description: string;
  sector: OrganizationSector;
  status: OrganizationStatus;
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
  /** Versi Final yang dipakai bekerja; null sebelum Final pertama */
  active_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockRelation extends RelationFields {
  id: string;
  organization_id: string;
  source_id: string;
  target_id: string;
  created_at: string;
  updated_at: string;
}

/** Panggilan model di luar langkah tugas (uji coba role); biayanya ikut anggaran bulanan. */
export interface MockLlmCall {
  id: string;
  organization_id: string;
  agent_id: string;
  model: string;
  cost: number;
  /** Jenis pemakaian untuk rincian kuota; kosong = uji coba */
  purpose?: "task" | "trial" | "formation" | "vision_ingest" | "web_search" | "schedule_parse" | "letter_format";
  created_at: string;
}

export interface MockDatabase {
  version: number;
  organizations: MockOrganization[];
  users: MockUser[];
  memberships: MockMembership[];
  units: MockUnit[];
  agents: MockAgent[];
  /** Versi role: pembentukan, isian manual, dan pulihkan */
  agent_revisions: MockRevision[];
  /** Alat yang diminta pembuat role tetapi belum didukung */
  tool_requests: MockToolRequest[];
  documents: MockDocument[];
  doc_versions: MockDocVersion[];
  relations: MockRelation[];
  /** Manusia (id keanggotaan) yang ditampilkan di peta relasi */
  flow_humans: string[];
  /** Posisi node di peta relasi; kosong = disusun otomatis */
  flow_positions: Record<string, { x: number; y: number }>;
  tasks: MockTask[];
  /** Kalender kerja, cuti, dan tugas rutin (E2) */
  workdays: Record<string, number[]>;
  work_shifts: MockShift[];
  calendar_days: MockCalendarDay[];
  member_leaves: MockLeave[];
  schedules: MockSchedule[];
  letter_formats: MockLetterFormat[];
  letterheads: MockLetterhead[];
  letter_registers: MockRegister[];
  letter_samples: MockSample[];
  task_documents: MockResultFile[];
  schedule_runs: MockRun[];
  /** Usulan temuan internet menjadi pengetahuan (E1d) */
  knowledge_proposals: MockProposal[];
  /** Lampiran tugas dan uji coba (E1c) */
  task_attachments: MockAttachment[];
  task_steps: MockStep[];
  approvals: MockApproval[];
  task_events: MockEvent[];
  /** Pengaturan model AI dan batas biaya per organisasi */
  settings: MockSettings[];
  llm_calls: MockLlmCall[];
  audit_logs: MockAuditLog[];
  /** Role dan relasi yang dihapus setelah dipakai tugas */
  archived_agents: MockAgent[];
  archived_relations: MockRelation[];
  /** Token sekali pakai: verifikasi email, atur ulang kata sandi, undangan */
  auth_tokens: MockAuthToken[];
  /** Email yang "terkirim"; di mode data contoh ditampilkan di panel Kotak keluar */
  outbox: MockEmail[];
  session: { user_id: string } | null;
}

/** Naikkan bila bentuk data contoh berubah, agar data lama di peramban diganti. */
export const MOCK_DB_VERSION = 13;

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

const createBase = (): MockDatabase => ({
  version: MOCK_DB_VERSION,
  audit_logs: [],
  organizations: [
    {
      id: ORG,
      name: "Dinas Contoh Nusantara",
      slug: "dinas-contoh-nusantara",
      description: "Organisasi contoh untuk memperagakan MBUTI: pelayanan administrasi, persuratan, dan data.",
      sector: "pemerintahan",
      status: "active",
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
  agents: structuredClone(SEED_AGENTS),
  agent_revisions: [],
  tool_requests: [],
  documents: structuredClone(SEED_DOCUMENTS),
  doc_versions: structuredClone(SEED_DOC_VERSIONS),
  relations: SEED_RELATIONS.map((r) => ({ ...r })),
  flow_humans: ["member-bayu", "member-maya", "member-sari"],
  flow_positions: {},
  tasks: [],
  knowledge_proposals: [],
  workdays: {},
  work_shifts: [],
  calendar_days: [],
  member_leaves: [],
  schedules: [],
  schedule_runs: [],
  letter_formats: [],
  letterheads: [],
  letter_registers: [],
  letter_samples: [],
  task_documents: [],
  task_attachments: [],
  task_steps: [],
  approvals: [],
  task_events: [],
  settings: [defaultSettings(ORG, T0)],
  llm_calls: [],
  archived_agents: [],
  archived_relations: [],
  auth_tokens: [],
  outbox: [],
  session: null,
});

/** Data contoh lengkap, termasuk tugas yang riwayatnya dijalankan mesin simulasi. */
export const createSeed = (): MockDatabase => {
  const db = createBase();
  seedPolicies(db);
  seedSchedules(db);
  seedFormation(db);
  seedTasks(db);
  return db;
};

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

const agent = (
  fields: Omit<MockAgent, "organization_id" | "created_at" | "updated_at" | "web_search" | "active_revision_id"> & { web_search?: boolean }
): MockAgent => ({
  web_search: false,
  active_revision_id: null,
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
    web_search: true,
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

const relation = (
  id: string,
  source_id: string,
  target_id: string,
  fields: Partial<RelationFields> & Pick<RelationFields, "relation_type">
): MockRelation => ({
  id,
  organization_id: ORG,
  source_id,
  target_id,
  trigger: "on_complete",
  condition: "",
  payload_spec: "result_context",
  expected_output: "",
  max_revisions: 2,
  requires_approval: false,
  label: "",
  ...fields,
  created_at: T0,
  updated_at: T0,
});

const SEED_RELATIONS: MockRelation[] = [
  relation("rel-rani-tegar", "agent-rani", "agent-tegar", {
    relation_type: "review",
    payload_spec: "references",
    expected_output: "Daftar temuan beserta halaman pedoman, dan keputusan DITERIMA atau PERLU REVISI.",
    max_revisions: 2,
    label: "Periksa draf surat",
  }),
  relation("rel-tegar-bayu", "agent-tegar", "member-bayu", {
    relation_type: "escalate",
    requires_approval: true,
    expected_output: "Persetujuan akhir sebelum surat ditandatangani dan dikirim.",
    label: "Persetujuan akhir",
  }),
  relation("rel-lumi-maya", "agent-lumi", "member-maya", {
    relation_type: "escalate",
    trigger: "on_condition",
    condition: "Pertanyaan menyangkut data pribadi, keluhan, atau tidak diatur di SOP.",
    requires_approval: true,
    label: "Di luar SOP",
  }),
  relation("rel-sekar-sari", "agent-sekar", "member-sari", {
    relation_type: "escalate",
    requires_approval: true,
    expected_output: "Pemeriksaan angka sebelum laporan dikirim ke pimpinan.",
    label: "Setujui laporan",
  }),
  relation("rel-bima-sekar", "agent-data", "agent-sekar", {
    relation_type: "consult",
    expected_output: "Angka realisasi per kegiatan untuk bahan ringkasan.",
    label: "Minta angka realisasi",
  }),
  relation("rel-dana-sekar", "agent-dana", "agent-sekar", {
    relation_type: "handoff",
    expected_output: "Daftar pembayaran yang lolos verifikasi untuk dicatat di laporan.",
    label: "Teruskan pembayaran lolos",
  }),
];
