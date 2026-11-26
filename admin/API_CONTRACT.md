# Kontrak API MBUTI (v1)

Status: **disetujui** pada 26 November 2026 (tahap A8), termasuk seluruh usulan yang sekarang tercatat sebagai keputusan di
[bagian 13](#13-keputusan). Backend (fase B) belum dimulai.

Sumber dokumen ini: `types.ts` tiap fitur dan route data contoh di `lib/mock/`. Blok TypeScript di bawah disalin
dari `types.ts`. Bila kontrak berubah, ubah `types.ts`, route data contoh, dan dokumen ini bersamaan.

Dokumen ini menjelaskan perilaku **backend**. Hal yang belum ditiru data contoh ditandai di bagian 13.

## Daftar isi

1. [Aturan umum](#1-aturan-umum)
2. [Auth](#2-auth)
3. [Organisasi, unit, pengguna](#3-organisasi-unit-pengguna)
4. [Role](#4-role)
5. [Pengetahuan](#5-pengetahuan)
6. [Peta relasi](#6-peta-relasi)
7. [Tugas](#7-tugas)
8. [Persetujuan](#8-persetujuan)
9. [Kantor](#9-kantor)
10. [Dashboard](#10-dashboard)
11. [Pengaturan](#11-pengaturan)
12. [Perilaku mesin agen](#12-perilaku-mesin-agen)
13. [Keputusan](#13-keputusan)

---

## 1. Aturan umum

### 1.1 Dasar

- Prefix: `/api/v1`. Fitur aplikasi di `/api/v1/admin/<fitur>`.
- Alamat saat pengembangan: `http://localhost:8000`. Aplikasi dan API harus satu situs (nama host sama) agar cookie
  sesi dan `csrf_token` berfungsi. Di produksi satu domain lewat Nginx.
- Versi pertama: satu organisasi per pengguna. Tabel tetap multi-organisasi.
- Teks yang melebihi batas panjang ditolak `422` (data contoh memotongnya).
- JSON UTF-8, kecuali unggah dokumen (`multipart/form-data`).
- ID berupa string. Frontend tidak menafsirkan isinya, jadi UUID aman dipakai.
- Waktu: ISO 8601 UTC (`2026-11-26T08:00:00Z`). Tanggal tanpa jam: `YYYY-MM-DD`. Bulan: `YYYY-MM`.
- Uang: bilangan bulat rupiah.
- Nama kolom `snake_case`. Kolom yang kosong dikirim sebagai `null`, bukan dihilangkan.
- Organisasi aktif diambil server dari sesi/keanggotaan. Klien **tidak pernah** mengirim `organization_id`.
- Data organisasi lain dijawab `404`.

### 1.2 Bentuk respons

```ts
/** Bentuk respons tunggal dari backend (dan lapisan data contoh). */
export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

/** Bentuk respons daftar dengan pagination skip/limit. */
export interface ApiListResponse<T> {
  success: boolean;
  statusCode: number;
  message?: string;
  total: number;
  skip: number;
  limit: number;
  data: T[];
}

export interface OptionSchema {
  id: string;
  value: string;
  sub_value?: string | null;
}

export type ListOptionSchema = OptionSchema[];
```

Galat:

```json
{ "success": false, "statusCode": 422, "message": "Judul tugas minimal 5 karakter." }
```

`message` ditulis dalam bahasa Indonesia dan ditampilkan apa adanya kepada pengguna. Frontend juga membaca
`detail` (bawaan FastAPI) dan `errors[0].message`, tetapi backend sebaiknya selalu memakai bentuk di atas,
termasuk untuk galat validasi Pydantic.

| Status | Dipakai untuk |
|---|---|
| 200 / 201 | Berhasil / berhasil membuat data |
| 401 | Belum masuk atau sesi berakhir (memicu satu kali refresh) |
| 403 | Hak akses tidak cukup, atau token CSRF salah |
| 404 | Data tidak ada atau milik organisasi lain |
| 409 | Bentrok keadaan (sudah diputuskan, masih dipakai, anggaran habis) |
| 422 | Isian tidak valid |

### 1.3 Daftar

Parameter: `skip` (bawaan 0), `limit` (maksimal 200), dan saringan per endpoint. Parameter kosong berarti tanpa saringan.
`total` adalah jumlah setelah saringan. Beberapa daftar menambah `summary` (jumlah per status).

### 1.4 Sesi dan hak akses

- Cookie sesi HttpOnly; permintaan dikirim dengan `credentials: "include"`.
- `POST`, `PUT`, `PATCH`, `DELETE` (kecuali login) membawa header `X-CSRF-Token` yang dibaca frontend dari cookie
  `csrf_token`, termasuk `/auth/refresh`. Header `Origin` yang tidak dikenal ditolak (`403`).
- Saat 401, frontend memanggil `POST /auth/refresh` sekali lalu mengulang permintaan. Bila gagal, pindah ke `/login`.

Singkatan hak akses di tabel endpoint:

| Singkatan | Siapa |
|---|---|
| **Publik** | Tanpa sesi |
| **Semua** | Anggota aktif organisasi, termasuk pemantau |
| **Anggota+** | Pemilik, admin, anggota |
| **Admin+** | Pemilik, admin |
| **Khusus** | Dijelaskan di bawah tabel |

```ts
export type AccessRole = "owner" | "admin" | "member" | "viewer";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  access_role: AccessRole | null;
  organization: OrganizationSummary | null;
  created_at: string;
}

export interface AuthDataResponse {
  user: UserProfile;
  csrf_token?: string;
}
```

---

## 2. Auth

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| POST | `/auth/login` | Publik | `{ email, password }` | `AuthDataResponse` |
| GET | `/auth/me` | Sesi | | `AuthDataResponse` |
| POST | `/auth/refresh` | Cookie refresh | | `null` |
| POST | `/auth/logout` | Sesi | | `null` |

- Login salah: `401` "Email atau kata sandi salah." (sama untuk email tidak terdaftar atau undangan tanpa kata
  sandi). Kata sandi benar tetapi akun atau keanggotaan nonaktif: `403`.
- Batas laju login: 20 percobaan per menit per alamat, dan 5 kegagalan per 5 menit untuk satu email dari satu
  alamat (`429`). Bila Redis mati, login dijawab `503`.
- Cookie: `access_token` (15 menit) dan `refresh_token` (14 hari, hanya dikirim ke `/api/v1/auth`) HttpOnly;
  `csrf_token` terbaca frontend. Semuanya `SameSite=Lax`, dan `Secure` di produksi. `data.csrf_token` juga dikirim
  saat login.
- Token refresh diganti tiap dipakai. Token lama yang dipakai lagi setelah 10 detik mencabut seluruh sesi.
- Logout tetap berhasil walau token akses sudah kedaluwarsa. Menonaktifkan atau mengeluarkan anggota mengakhiri
  sesinya.
- Pengguna tanpa keanggotaan aktif bisa memanggil `/auth/me` (`access_role: null`), tetapi `/admin/*` menjawab `403`.
- B1 hanya login dan skrip pembuat akun pertama. Penerimaan undangan (`POST /auth/accept-invite`, tautan sekali pakai)
  ditambah bersama halamannya; pendaftaran terbuka menyusul.

---

## 3. Organisasi, unit, pengguna

### 3.1 Profil organisasi

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/organisasi/profil` | Semua | | `ResponseInterface` |
| PUT | `/admin/organisasi/profil/update` | Admin+ | `UpdateInterface` | `ResponseInterface` |

```ts
export type OrganizationSector = "pemerintahan" | "pendidikan" | "kesehatan" | "usaha" | "nirlaba" | "lainnya";

export interface UpdateInterface {
  name: string;
  description: string;
  sector: OrganizationSector;
  timezone: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

export interface ResponseInterface extends UpdateInterface {
  id: string;
  slug: string;
  created_at: string;
  updated_at: string;
  stats: {
    unit_count: number;
    member_count: number;
    agent_count: number;
  };
}
```

Validasi: `name` 3–150; `description` ≤ 1000; `email` kosong atau berformat benar; `website` kosong atau diawali
`http://`/`https://` (≤ 200); `phone` ≤ 30; `address` ≤ 300. `agent_count` menghitung semua role;
`member_count` tidak menghitung anggota nonaktif.

### 3.2 Unit

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/unit/read` | Semua | `search, skip, limit` (bawaan 10) | daftar `ResponseInterface` |
| GET | `/admin/unit/option` | Semua | | `ListOptionSchema` (`sub_value` = kode) |
| POST | `/admin/unit/create` | Admin+ | `CreateInterface` | `ResponseInterface` (201) |
| PUT | `/admin/unit/update/{id}` | Admin+ | `CreateInterface` | `ResponseInterface` |
| DELETE | `/admin/unit/delete/{id}` | Admin+ | | `null` |

```ts
export type UnitColor = "violet" | "honey" | "pink" | "teal" | "sky" | "lime" | "orange" | "slate";

export interface CreateInterface {
  name: string;
  code: string;
  description: string;
  parent_id: string | null;
  color: UnitColor;
  lead_member_id: string | null;
  sort_order: number;
}

export interface ResponseInterface extends CreateInterface {
  id: string;
  parent_name: string | null;
  lead_name: string | null;
  member_count: number;
  agent_count: number;
  child_count: number;
  created_at: string;
  updated_at: string;
}
```

- `name` 2–120, unik tanpa membedakan huruf besar. `code` ≤ 12, disimpan huruf besar, unik bila diisi.
- `parent_id` tidak boleh unit itu sendiri atau turunannya. `color` bawaan `violet`. `sort_order` ≥ 0.
- Urutan: `sort_order`, lalu nama. Halaman unit meminta `limit=200` untuk menyusun pohon.
- Hapus: `409` bila masih ada role, sub-unit, atau dokumen berlingkup unit itu. Anggota di unit itu menjadi tanpa unit.

### 3.3 Pengguna

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/pengguna/read` | Semua | `search, access_role, status, skip, limit` (bawaan 10) | daftar + `summary` |
| POST | `/admin/pengguna/invite` | Admin+ | `InviteInterface` | `ResponseInterface` (201) |
| PUT | `/admin/pengguna/update/{id}` | Admin+ | `UpdateInterface` | `ResponseInterface` |
| DELETE | `/admin/pengguna/delete/{id}` | Admin+ | | `null` |

```ts
export type MemberStatus = "active" | "invited" | "disabled";

export interface InviteInterface {
  full_name: string;
  email: string;
  access_role: AccessRole;
  unit_id: string | null;
}

export interface UpdateInterface {
  access_role: AccessRole;
  unit_id: string | null;
  status: Exclude<MemberStatus, "invited">;
}

export interface ResponseInterface {
  /** ID keanggotaan (bukan ID akun) */
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  access_role: AccessRole;
  unit_id: string | null;
  unit_name: string | null;
  status: MemberStatus;
  joined_at: string;
  last_active_at: string | null;
  is_self: boolean;
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<MemberStatus, number>;
}
```

- `{id}` adalah ID **keanggotaan**. `summary` dihitung sebelum saringan. Urutan: hak akses, lalu nama.
- Undang: `full_name` 2–150, email valid, `409` bila sudah anggota. Hasilnya berstatus `invited`.
- Hanya pemilik yang boleh mengundang, mengubah, atau mengeluarkan pemilik (`403`).
- Selalu minimal satu pemilik aktif; tidak bisa menonaktifkan atau mengeluarkan diri sendiri (`409`).
- Ubah dengan `status: "active"` pada anggota yang masih `invited` tidak mengubah statusnya.
- Menjadikan pemantau orang yang masih menjadi tujuan eskalasi ditolak (`409`).
- Keluarkan: penanggung jawab unit dan role dikosongkan; relasi eskalasi ke orang itu dihapus.
- Halaman unit dan peta relasi memakai daftar ini (`status=active&limit=200`) sebagai pilihan orang.

---

## 4. Role

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/role/read` | Semua | `search, unit_id, status, skip, limit` (bawaan 50) | daftar + `summary` |
| GET | `/admin/role/option` | Semua | | `ListOptionSchema` (belum dipanggil frontend) |
| GET | `/admin/role/{id}` | Semua | | `ResponseInterface` |
| POST | `/admin/role/create` | Admin+ | `CreateInterface` | `ResponseInterface` (201) |
| PUT | `/admin/role/update/{id}` | Admin+ | `Partial<UpdateInterface>` | `ResponseInterface` |
| DELETE | `/admin/role/delete/{id}` | Admin+ | | `null` |
| POST | `/admin/role/{id}/trial` | Anggota+ | `TrialRequest` | `TrialResult` |

```ts
export type AgentStatus = "draft" | "active" | "paused";

export type OutputFormat = "text" | "template" | "table" | "json";

export type KnowledgeScope = "own" | "unit" | "organization";

export type ModelProfile = "fast" | "balanced" | "thorough";

export type InputFieldType = "short_text" | "long_text" | "number" | "date" | "choice";

/** Isian yang diminta role saat diberi tugas. */
export interface InputField {
  key: string;
  label: string;
  type: InputFieldType;
  required: boolean;
  options?: string[];
}

export interface CreateInterface {
  name: string;
  title: string;
  unit_id: string | null;
  goal: string;
  status: AgentStatus;
}

export interface UpdateInterface extends CreateInterface {
  instructions: string;
  input_spec: InputField[];
  output_format: OutputFormat;
  output_template: string;
  acceptance_criteria: string[];
  knowledge_scope: KnowledgeScope;
  model_profile: ModelProfile;
  owner_member_id: string | null;
  avatar: AvatarConfig;
}

export interface ResponseInterface extends UpdateInterface {
  id: string;
  unit_name: string | null;
  unit_color: string | null;
  owner_name: string | null;
  document_count: number;
  relation_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<AgentStatus, number>;
}

export interface TrialRequest {
  brief: string;
  inputs: Record<string, string>;
}

export interface TrialResult {
  simulated: boolean;
  status: "done" | "need_info" | "not_in_documents";
  output: string;
  notes: string;
  prompt_preview: string;
  missing_inputs: string[];
  /** Potongan dokumen yang dipakai sebagai dasar (kosong bila tidak ada) */
  citations: SearchHit[];
  /** Biaya dalam rupiah; 0 bila model tidak dipanggil */
  cost: number;
  /** Kosong bila model tidak dipanggil */
  model: string;
}
/**
 * Bentuk karakter blok untuk role AI. Dipakai oleh avatar 2D (kartu), 3D (pratinjau), dan kantor 3D (tahap A6).
 * Karakter dan nama buatan sendiri; tidak memakai aset atau merek pihak lain.
 */
export type HairStyle = "short" | "long" | "bun" | "cap" | "bald";

export type Accessory = "none" | "glasses" | "headset" | "tie" | "flower" | "antenna";

export interface AvatarConfig {
  skin: string;
  hair: string;
  hair_style: HairStyle;
  shirt: string;
  pants: string;
  accessory: Accessory;
}
```

- `unit_id=none` menyaring role tanpa unit. `summary` dihitung sebelum saringan. Urutan: nama unit, lalu nama.
- **Update bersifat sebagian**: hanya kolom yang dikirim yang berubah (tiap tab menyimpan bagiannya).
- Bawaan saat dibuat: `knowledge_scope: "own"`, `model_profile: "balanced"`, `output_format: "text"`, penanggung
  jawab = pembuat, avatar dibuat dari nama.
- Validasi: `name` 2–60; `title` 3–100; `goal` ≤ 500; role `active` wajib `goal` ≥ 10; `instructions` ≤ 8000;
  `output_template` ≤ 4000; `input_spec` ≤ 20 isian (`label` ≤ 80, `key` ≤ 40, dibuat dari label bila kosong, unik;
  `options` ≤ 12 × 60); `acceptance_criteria` ≤ 15 × 200; warna avatar `#rrggbb`.
- `document_count` = dokumen yang boleh dibaca role menurut lingkupnya. `task_count` = tugas yang pernah ia kerjakan.
- Hapus: `409` bila masih terlibat tugas `queued`/`running`/`waiting_approval` atau masih punya dokumen berlingkup
  role itu. Relasinya ikut dihapus. Role dan relasi yang pernah dipakai tugas hanya ditandai terhapus
  (`deleted_at`): hilang dari daftar dan pilihan, tetapi namanya tetap tampil di riwayat tugas.
- Backend menandai terhapus semua role yang dihapus, dipakai tugas atau belum.
- Backend: model profil dipakai lebih dulu, lalu model cadangan bila tidak tersedia. `503` bila keduanya gagal,
  `502` bila jawaban model ditolak atau tidak terbaca. Nomor rujukan `[n]` pada `output` mengikuti urutan
  `citations`.
- Uji coba tidak membuat tugas dan tidak menjalankan relasi. Isian wajib kosong menghasilkan `need_info`; tidak ada
  potongan dokumen yang cocok menghasilkan `not_in_documents`. Keduanya tidak memanggil model (`cost: 0`,
  `model: ""`). `simulated` bernilai `false` di backend.
- Uji coba yang memanggil model dicatat di `llm_calls`, ikut anggaran bulanan, dan ditolak `409` bila anggaran habis.

---

## 5. Pengetahuan

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/pengetahuan/read` | Semua | `search, scope, scope_id, doc_type, status, agent_id, skip, limit` (bawaan 50) | daftar + `summary` |
| GET | `/admin/pengetahuan/search` | Semua | `q, agent_id` | `SearchHit[]` (maks 8) |
| GET | `/admin/pengetahuan/{id}` | Semua | | `DetailInterface` |
| GET | `/admin/pengetahuan/{id}/versions/{vid}` | Semua | | `VersionDetailInterface` |
| GET | `/admin/pengetahuan/{id}/versions/{vid}/file` | Semua | | berkas asli (biner, `Content-Disposition: attachment`) |
| POST | `/admin/pengetahuan/create` | Admin+ | multipart: `file, title, description, doc_type, scope, scope_id` | `ResponseInterface` (201) |
| PUT | `/admin/pengetahuan/update/{id}` | Admin+ | `UpdateInterface` | `DetailInterface` |
| POST | `/admin/pengetahuan/{id}/versions` | Admin+ | multipart: `file` | `DetailInterface` (201) |
| PUT | `/admin/pengetahuan/{id}/versions/{vid}/activate` | Admin+ | | `DetailInterface` |
| DELETE | `/admin/pengetahuan/delete/{id}` | Admin+ | | `null` |

```ts
export type DocumentScope = "organization" | "unit" | "agent";

export type DocumentType = "sop" | "manual" | "pedoman" | "templat" | "regulasi" | "lainnya";

export type IngestionStatus = "queued" | "processing" | "ready" | "failed";

export interface DocumentVersion {
  id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  page_count: number;
  is_active: boolean;
  status: IngestionStatus;
  /** 0–100, hanya bermakna saat status processing */
  progress: number;
  error_message: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface DocumentSection {
  page_no: number;
  heading: string;
  text: string;
}

export interface ResponseInterface {
  id: string;
  title: string;
  description: string;
  doc_type: DocumentType;
  scope: DocumentScope;
  scope_id: string | null;
  /** Nama unit atau role pemilik dokumen; null untuk lingkup organisasi */
  scope_name: string | null;
  scope_color: string | null;
  active_version: DocumentVersion | null;
  version_count: number;
  created_at: string;
  updated_at: string;
}

export interface DetailInterface extends ResponseInterface {
  versions: DocumentVersion[];
  sections: DocumentSection[];
  /** Terisi bila dokumen sudah dihapus tetapi disimpan karena pernah dirujuk tugas */
  archived_at: string | null;
}

/** Satu versi beserta isinya; dipakai saat membuka rujukan ke versi yang bukan versi aktif. */
export interface VersionDetailInterface extends DocumentVersion {
  /** Kosong selama versi belum selesai diolah */
  sections: DocumentSection[];
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<IngestionStatus, number>;
}

export interface UpdateInterface {
  title: string;
  description: string;
  doc_type: DocumentType;
  scope: DocumentScope;
  scope_id: string | null;
}

/** Satu potongan hasil pencarian beserta rujukannya. */
export interface SearchHit {
  document_id: string;
  document_title: string;
  /** Versi yang dirujuk; rujukan tetap menunjuk versi ini walau versi aktif sudah diganti */
  version_id: string;
  version_no: number;
  page_no: number;
  heading: string;
  snippet: string;
  score: number;
}
```

- `agent_id` membatasi ke dokumen dalam lingkup role. Dokumen berlingkup organisasi **selalu** ikut. Selain itu:
  `own` = dokumen role itu; `unit` = dokumen unitnya dan role seunit; `organization` = semua dokumen.
- `summary` dihitung setelah `agent_id`, sebelum saringan lain, menurut status versi aktif.
- Unggah: PDF, DOCX, TXT, MD; maks 20 MB; tidak kosong. Berkas yang sama persis (SHA-256) dengan versi dokumen itu
  ditolak (`422`). `title` bawaan = nama berkas; `doc_type` bawaan `lainnya`.
- Olah berjalan di latar: `queued` → `processing` (`progress` 0–100) → `ready` / `failed` (`error_message`).
  Frontend memuat ulang tiap 1,5 detik selama ada yang belum selesai.
- Versi baru menjadi aktif hanya setelah `ready`; versi lama dipakai sampai saat itu, dan versi yang gagal tidak
  menggantikannya. Bila versi aktif sendiri belum `ready`, versi baru langsung aktif. Hanya versi `ready` yang bisa
  diaktifkan manual (`409`).
- Rujukan menyimpan `version_id`. Frontend membuka rujukan ke versi bukan aktif lewat
  `/versions/{vid}`; `sections` di sana kosong selama versi belum `ready`.
- Hapus: dokumen yang pernah dirujuk tugas hanya ditandai terhapus. Ia hilang dari daftar, pencarian, dan lingkup
  role, tetapi `GET /{id}` (dengan `archived_at`) dan `/versions/{vid}` tetap bisa dibuka; perubahan dijawab `404`.
  Dokumen yang belum pernah dirujuk dihapus permanen.
- `sections` berisi halaman versi aktif, kosong selama belum `ready`.
- Backend: jenis berkas diperiksa dari isinya; kiriman yang jauh melebihi batas dijawab `413`. Teks TXT/MD harus
  UTF-8; PDF maksimal 500 halaman; sekitar 400 halaman padat per berkas.
- Berkas yang gagal diolah boleh diunggah ulang. Bila kuota model habis, versi kembali `queued` dan dicoba lagi
  dengan jeda.
- Pencarian backend menggabungkan kata kunci dan kemiripan makna (satu hasil per halaman, `score` 0–100). Bila
  model tidak tersedia, hanya kata kunci yang dipakai. Vektor pertanyaan disimpan sehari agar hemat kuota.
- Sampai tabel rujukan dibuat (B4), semua dokumen yang dihapus dibuang beserta berkasnya.
- Pencarian hanya pada versi aktif yang `ready`. Frontend memanggil bila `q` ≥ 3 karakter; `q` ≤ 300.
- Ubah: `title` ≥ 3. `scope` `unit`/`agent` wajib `scope_id` milik organisasi; `organization` → `scope_id: null`.

---

## 6. Peta relasi

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/relasi/graph` | Semua | | `GraphInterface` |
| POST | `/admin/relasi/create` | Admin+ | `CreateInterface` | `RelationInterface` (201) |
| PUT | `/admin/relasi/update/{id}` | Admin+ | `RelationFields` | `RelationInterface` |
| DELETE | `/admin/relasi/delete/{id}` | Admin+ | | `null` |
| PUT | `/admin/relasi/positions` | Admin+ | `{ positions: Record<id, {x, y}> }` | `null` |
| DELETE | `/admin/relasi/positions` | Admin+ | | `null` (kembali ke susunan otomatis) |
| POST | `/admin/relasi/humans` | Admin+ | `{ member_id }` | `null` |
| DELETE | `/admin/relasi/humans/{member_id}` | Admin+ | | `null` |

```ts
export type RelationType = "handoff" | "review" | "consult" | "escalate";

export type RelationTrigger = "on_complete" | "on_rejected" | "on_condition";

export type PayloadSpec = "result_only" | "result_context" | "references";

export type GraphNodeKind = "agent" | "human";

/** Dipakai sebagai data node/garis React Flow, jadi ditulis sebagai `type` (bukan interface). */
export type RelationFields = {
  relation_type: RelationType;
  trigger: RelationTrigger;
  condition: string;
  payload_spec: PayloadSpec;
  expected_output: string;
  max_revisions: number;
  requires_approval: boolean;
  label: string;
}

export type CreateInterface = RelationFields & {
  source_id: string;
  /** Role tujuan (agent-…) atau manusia tujuan (member-…) untuk eskalasi */
  target_id: string;
}

export type RelationInterface = CreateInterface & {
  id: string;
  source_kind: GraphNodeKind;
  target_kind: GraphNodeKind;
  created_at: string;
  updated_at: string;
}

export type GraphAgentNode = {
  id: string;
  kind: "agent";
  name: string;
  title: string;
  status: AgentStatus;
  unit_id: string | null;
  unit_name: string | null;
  unit_color: string | null;
  avatar: AvatarConfig;
}

export type GraphHumanNode = {
  id: string;
  kind: "human";
  name: string;
  title: string;
}

export type GraphNode = GraphAgentNode | GraphHumanNode;

export interface GraphInterface {
  nodes: GraphNode[];
  relations: RelationInterface[];
  positions: Record<string, { x: number; y: number }>;
  /** Batas revisi organisasi (Pengaturan > Batas Biaya); mengalahkan max_revisions yang lebih besar */
  revision_limit: number;
}
```

Aturan simpan (`422`):

- Sumber harus role. Tujuan role atau manusia (ID keanggotaan), tidak boleh sama dengan sumber.
- Ke manusia hanya `escalate`; `escalate` hanya ke manusia, dan `requires_approval` selalu `true`.
- Pemantau tidak bisa menjadi tujuan eskalasi atau ditambahkan ke peta.
- `on_rejected` diterima, tetapi frontend menyembunyikannya sampai mesin menjalankannya.
- Pada `consult`, `on_complete` berarti selalu, sebelum role sumber bekerja; `on_condition` dinilai dari isi tugas.
- Pasangan sumber, tujuan, dan jenis harus unik.
- `handoff` tidak boleh membentuk lingkaran; pesan galat menyebut jalurnya (`A → B → A`).
- `on_condition` wajib `condition` ≥ 5. `max_revisions` 1–5 (bawaan 2). `expected_output` dan `condition` ≤ 500,
  `label` ≤ 60.
- `revision_limit` berasal dari Pengaturan > Batas Biaya. Relasi menyimpan `max_revisions` aslinya; batas efektif
  adalah nilai yang lebih kecil.
- `positions` digabung dengan yang tersimpan, dipakai bersama satu organisasi.
- `update` menerima sebagian kolom. Mengubah atau membuat relasi dengan isian di luar batas dijawab `422`.
- Menjadikan seseorang pemantau mengeluarkannya dari peta. Mengeluarkannya dari organisasi menghapus eskalasinya.
- Membuat eskalasi otomatis menambahkan manusia tujuan ke peta. Manusia yang masih menjadi tujuan relasi tidak bisa
  dikeluarkan (`409`).

---

## 7. Tugas

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/tugas/read` | Semua | `search, status, agent_id, skip, limit` (bawaan 50) | daftar + `summary` |
| GET | `/admin/tugas/{id}` | Semua | | `DetailInterface` |
| POST | `/admin/tugas/create` | Anggota+ | `CreateInterface` | `ResponseInterface` (201) |
| POST | `/admin/tugas/{id}/cancel` | Khusus | | `ResponseInterface` |

**Khusus** (hentikan): Admin+ atau pembuat tugas.

```ts
export type TaskStatus = "queued" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled" | "stopped_budget";

export type TaskPriority = "low" | "normal" | "high";

export type StepKind = "work" | "review" | "consult";

export type StepStatus = "queued" | "running" | "done" | "revise_requested" | "failed" | "skipped";

export type EventType =
  | "created"
  | "step_started"
  | "step_done"
  | "review_revise"
  | "review_approved"
  | "relation_skipped"
  | "approval_requested"
  | "approval_decided"
  | "completed"
  | "failed"
  | "cancelled"
  | "stopped_budget";

export interface CreateInterface {
  title: string;
  brief: string;
  entry_agent_id: string;
  inputs: Record<string, string>;
  priority: TaskPriority;
  due_at: string | null;
  /** Batas biaya tugas dalam rupiah */
  budget_limit: number;
}

export interface AgentRef {
  id: string;
  name: string;
  title: string;
  avatar: AvatarConfig;
  unit_color: string | null;
}

export interface StepInterface {
  id: string;
  agent: AgentRef;
  kind: StepKind;
  via_relation_type: RelationType | null;
  attempt_no: number;
  status: StepStatus;
  input_notes: string;
  output: string;
  citations: SearchHit[];
  verdict: "approved" | "revise" | null;
  /** Model yang dipakai; kosong selama langkah belum selesai */
  model: string;
  cost: number;
  tokens: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface EventInterface {
  id: string;
  type: EventType;
  message: string;
  step_id: string | null;
  created_at: string;
}

export interface ResponseInterface {
  id: string;
  title: string;
  brief: string;
  entry_agent: AgentRef;
  /** Role yang sudah atau sedang terlibat, urut kemunculan */
  participants: AgentRef[];
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  budget_limit: number;
  cost_used: number;
  step_count: number;
  steps_done: number;
  pending_approval_count: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface DetailInterface extends ResponseInterface {
  inputs: Array<{ label: string; value: string }>;
  steps: StepInterface[];
  approvals: ApprovalInterface[];
  events: EventInterface[];
}

export interface ResponseListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ResponseInterface[];
  summary: Record<TaskStatus, number>;
}
```

- `status` menerima satu `TaskStatus` atau kelompok: `active` (queued, running), `waiting` (waiting_approval),
  `done` (completed), `stopped` (failed, cancelled, stopped_budget). `agent_id` = role yang terlibat.
- `summary` dihitung sebelum saringan. Urutan: `updated_at` terbaru.
- Buat, ditolak bila:
  - role tidak ada atau tidak `active`; `title` bukan 5–150; isian wajib `input_spec` kosong (`422`);
  - `budget_limit` di luar Rp500–Rp1.000.000 atau melebihi batas bulanan (`422`);
  - anggaran bulan ini sudah habis (`409`).
- `brief` ≤ 4000, tiap isian ≤ 2000. `priority` bawaan `normal`. `due_at` dikirim `YYYY-MM-DD` atau `null`, disimpan
  sebagai akhir hari itu di zona waktu organisasi.
- Hentikan: `409` bila tugas sudah berakhir.
- `inputs` pada detail memakai label isian role; yang kosong tidak dikirim.
- `steps[].model` kosong (`""`) selama langkah belum selesai.
- Frontend memuat ulang tiap 1,5 detik selama status `queued`/`running`.

---

## 8. Persetujuan

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/persetujuan/read` | Semua | `status=pending` (bawaan) atau `decided`, `skip, limit` | `ApprovalListInterface` |
| POST | `/admin/persetujuan/{id}/decide` | Khusus | `DecideInterface` | `ApprovalInterface` |

**Khusus**: Admin+ atau orang yang diminta (kecuali pemantau). Daftar hanya berisi permintaan yang boleh diputuskan
pengguna itu. Bila penanggung jawab role kosong, nonaktif, atau pemantau, permintaan ditujukan ke pembuat tugas.

```ts
export type ApprovalStatus = "pending" | "approved" | "rejected" | "revise";

export type ApprovalReason = "escalate" | "requires_approval" | "max_revisions";

export interface ApprovalInterface {
  id: string;
  task_id: string;
  task_title: string;
  step_id: string | null;
  reason: ApprovalReason;
  question: string;
  requested_from_id: string;
  requested_from_name: string;
  status: ApprovalStatus;
  comment: string;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
  /** Hasil terakhir yang diminta untuk diputuskan */
  last_output: string;
  last_agent: AgentRef | null;
}

export interface ApprovalListInterface {
  success: boolean;
  statusCode: number;
  total: number;
  skip: number;
  limit: number;
  data: ApprovalInterface[];
  /** Jumlah yang menunggu keputusan pengguna ini, apa pun saringannya */
  pending_count: number;
}

export interface DecideInterface {
  decision: "approved" | "rejected" | "revise";
  comment: string;
}
```

- `skip`/`limit` (bawaan 50), urut dari yang terbaru. Halaman Persetujuan meminta 200 untuk antrean dan 10 per
  halaman untuk riwayat, memuat ulang tiap 5 detik.
- `comment` wajib ≥ 5 karakter untuk `rejected` dan `revise`; ≤ 1000.
- `403` bila ditujukan ke orang lain; `409` bila sudah diputuskan. Backend harus mengunci baris agar dua keputusan
  bersamaan tidak sama-sama diterima.

---

## 9. Kantor

| Method | Path | Akses | `data` |
|---|---|---|---|
| GET | `/admin/kantor/state` | Semua | `OfficeState` |

```ts
/** Apa yang sedang dilakukan role saat ini, diturunkan dari tugas yang berjalan. */
export type AgentActivity = "idle" | "working" | "reviewing" | "consulting" | "incoming" | "waiting" | "paused" | "draft";

export type OfficeAgent = {
  id: string;
  name: string;
  title: string;
  unit_id: string | null;
  status: AgentStatus;
  avatar: AvatarConfig;
  activity: AgentActivity;
  /** Judul tugas yang sedang dikerjakan atau ditunggu */
  task_id: string | null;
  task_title: string | null;
  tasks_today: number;
};

export type OfficeUnit = {
  id: string;
  name: string;
  code: string;
  color: string;
  parent_id: string | null;
  lead_name: string | null;
  member_count: number;
  document_count: number;
  active_task_count: number;
};

/** Pekerjaan yang sedang berpindah dari satu role ke role lain (digambar sebagai amplop). */
export type OfficeTransfer = {
  task_id: string;
  from_agent_id: string;
  to_agent_id: string;
  relation_type: RelationType | null;
};

export type OfficeState = {
  units: OfficeUnit[];
  agents: OfficeAgent[];
  transfers: OfficeTransfer[];
  generated_at: string;
};
```

- Dipanggil tiap 1,5 detik, jadi query harus ringan.
- `activity`: `paused`/`draft` mengikuti status role, selain itu `idle`; ditimpa oleh tugas aktif:
  langkah terdepan berjalan (`working`/`reviewing`/`consulting`), langkah terdepan antre (`incoming`), atau
  persetujuan tertunda atas langkahnya (`waiting`).
- `transfers`: tugas aktif yang langkah terdepannya antre dan berasal dari role lain.
- `tasks_today`: jumlah tugas dengan langkah yang dimulai dalam 24 jam terakhir.
- `color` berupa hex.

---

## 10. Dashboard

| Method | Path | Akses | `data` |
|---|---|---|---|
| GET | `/admin/dashboard/summary` | Semua | `ResponseInterface` |

```ts
export interface BusyAgent {
  agent: AgentRef;
  step_count: number;
  cost: number;
}

export interface DailyCost {
  /** Format YYYY-MM-DD */
  date: string;
  cost: number;
}

export interface ResponseInterface {
  tasks: Record<TaskStatus, number>;
  agents: Record<AgentStatus, number>;
  /** Permintaan persetujuan yang boleh diputuskan pengguna ini */
  pending_approval_count: number;
  budget: MonthUsage & { limit: number };
  /** 7 hari terakhir, urut dari yang terlama; hari tanpa biaya bernilai 0 */
  daily_costs: DailyCost[];
  /** Maksimal 5 role dengan langkah selesai terbanyak bulan ini */
  busiest_agents: BusyAgent[];
}
```

- Biaya dihitung dari langkah yang selesai, dikelompokkan menurut zona waktu organisasi.
- `pending_approval_count` mengikuti aturan bagian 8.
- Daftar "Aktivitas terbaru" memakai `/admin/tugas/read`.

---

## 11. Pengaturan

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/pengaturan/model-ai` | Semua | | `ResponseInterface` (model) |
| PUT | `/admin/pengaturan/model-ai/update` | Admin+ | `UpdateInterface` (model) | `ResponseInterface` (model) |
| GET | `/admin/pengaturan/batas-biaya` | Semua | | `ResponseInterface` (biaya) |
| PUT | `/admin/pengaturan/batas-biaya/update` | Admin+ | `UpdateInterface` (biaya) | `ResponseInterface` (biaya) |

### 11.1 Model AI

```ts
/** Tiga profil yang dipakai role, ditambah model cadangan. */
export type ModelSlot = ModelProfile | "fallback";

export type ApiKeyStatus = "active" | "cooling" | "invalid" | "not_set";

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
  /** Perkiraan biaya satu langkah kerja dalam rupiah */
  estimated_step_cost: number;
}

export interface ModelProfileSetting {
  slot: ModelSlot;
  model: string;
  /** Nama variabel di server/.env yang menjadi nilai bawaan */
  env_name: string;
  /** Jumlah role yang memakai profil ini (cadangan selalu 0) */
  agent_count: number;
}

/** Status kunci API. Nilai kunci tidak pernah dikirim ke peramban. */
export interface ApiKeyInfo {
  env_name: string;
  status: ApiKeyStatus;
  requests_today: number;
  last_used_at: string | null;
  /** Terisi bila status `cooling` (kena batas permintaan) */
  cooldown_until: string | null;
}

export interface ResponseInterface {
  provider: "gemini";
  profiles: ModelProfileSetting[];
  available_models: ModelOption[];
  /** Hanya terisi untuk pemilik */
  api_keys: ApiKeyInfo[];
  embedding: { model: string; dimension: number };
  updated_at: string;
}

export interface UpdateInterface {
  models: Record<ModelSlot, string>;
}
```

- Update mengirim keempat slot sekaligus; tiap nilai harus ada di `available_models` (`422`).
- `api_keys` hanya terisi untuk **pemilik**, karena kunci milik server (selama satu server melayani satu organisasi).
- `server/.env` memberi nilai bawaan tiap slot; pilihan organisasi disimpan di database. Kunci API hanya ada di
  `server/.env`, tidak disimpan di database.
- **Nilai kunci API tidak boleh ada di respons mana pun**, termasuk potongan atau empat huruf terakhir.
- Katalog dan harga ada di `server/app/services/llm/catalog.py`; kurs di `USD_IDR_RATE`.
- Biaya dihitung dari token dengan tabel harga per model dan kurs di konfigurasi server, juga pada tier gratis,
  agar batas tetap berfungsi. `available_models` dan `estimated_step_cost` di data contoh adalah angka rekaan.

### 11.2 Batas biaya

```ts
export interface UpdateInterface {
  /** Batas biaya seluruh organisasi per bulan kalender, dalam rupiah */
  monthly_budget: number;
  /** Batas biaya yang terisi otomatis di form Buat tugas */
  default_task_budget: number;
  max_steps_per_task: number;
  /** Batas atas putaran revisi; relasi Periksa tidak bisa melewatinya. 0 = langsung ke manusia */
  max_revisions: number;
}

export interface MonthUsage {
  /** Bulan berjalan, format YYYY-MM */
  month: string;
  used: number;
  /** Bagian dari `used` yang berasal dari uji coba role */
  trial_cost: number;
  /** Sisa anggaran bulan ini, tidak pernah negatif */
  remaining: number;
  task_count: number;
}

export interface ResponseInterface extends UpdateInterface {
  usage: MonthUsage;
  updated_at: string;
}
```

| Kolom | Rentang | Bawaan |
|---|---|---|
| `monthly_budget` | 1.000 – 100.000.000 | 100.000 (data contoh) |
| `default_task_budget` | 500 – 1.000.000, ≤ `monthly_budget` | 15.000 |
| `max_steps_per_task` | 1 – 50 | 20 |
| `max_revisions` | 0 – 5 | 3 |

Semua bilangan bulat. Dibaca semua anggota karena form Buat tugas memakai batas bawaan dan sisa anggaran. Bulan
dihitung menurut zona waktu organisasi.

---

## 12. Perilaku mesin agen

Ini kontrak perilaku untuk B4–B5, diambil dari `lib/mock/engine.ts`.

**Alur**

1. Tugas dibuat `queued` dengan satu langkah `work` untuk `entry_agent_id`.
2. Setiap kali langkah `work` atau `review` hasil relasi (atau langkah pertama) dibuat, relasi `consult` milik
   role itu dijalankan **lebih dulu**; masukannya dipakai langkah tersebut dan ulangannya. Konsultasi tidak memicu
   relasi lanjutan. Bila ada konsultasi `requires_approval`, langkah ditahan (`queued`) sampai semua izinnya diputuskan.
3. Langkah dikerjakan satu per satu menurut antrean.
4. Setelah langkah `work` selesai, relasi keluar selain `consult` dinilai:
   - `on_condition` yang tidak terpenuhi dilewati dan dicatat (`relation_skipped`);
   - `escalate` membuat persetujuan untuk manusia tujuan;
   - `requires_approval` membuat persetujuan untuk penanggung jawab role sumber, dan relasi baru dijalankan
     setelah disetujui;
   - `review` dan `handoff` menambah langkah untuk role tujuan.
5. Langkah `review` menghasilkan `approved` atau `revise`. Bila `approved`, relasi keluar milik **pemeriksa**
   dinilai. Bila `revise`, langkah pembuat menjadi `revise_requested` dan diulang dengan catatan.
6. Antrean kosong: `waiting_approval` bila masih ada persetujuan tertunda, selain itu `completed`.

`on_rejected` (B5): dijalankan saat langkah `failed` atau persetujuan atas hasilnya ditolak.

**Keputusan manusia**

| Keputusan | Akibat |
|---|---|
| `approved` | Menjalankan relasi atau konsultasi yang ditahan, atau melanjutkan rute setelah batas revisi |
| `revise` | Role pembuat hasil terakhir mengerjakan ulang dengan catatan. Pada izin konsultasi: lanjut tanpa konsultasi itu, dengan catatan |
| `rejected` | Tugas `failed`; persetujuan lain ikut ditutup |

**Pengaman**

| Pengaman | Diperiksa | Akibat |
|---|---|---|
| Batas biaya tugas | Setelah tiap langkah (`cost_used > budget_limit`) | `stopped_budget` |
| Anggaran bulanan | Sebelum tiap langkah dimulai (`terpakai >= batas`); boleh terlampaui sedikit oleh langkah yang berjalan | `stopped_budget` |
| Batas langkah | Sebelum langkah dimulai (langkah yang sudah dimulai ≥ batas) | `failed` |
| Batas revisi | Saat pemeriksa meminta revisi: putaran > min(relasi, organisasi) | Persetujuan `max_revisions` |

Saat dihentikan pengaman atau manusia: langkah yang belum selesai menjadi `skipped` dan persetujuan tertunda ditutup
(`rejected` dengan komentar sistem). Batas langkah, revisi, dan bulanan dibaca saat dijalankan; `budget_limit`
tersimpan pada tugas.

**Hanya simulasi, jangan ditiru:** pemeriksaan pertama selalu `revise`; kondisi dinilai dengan mencocokkan kata;
biaya dihitung dari tabel tetap; model cadangan tidak pernah dipakai.

---

## 13. Keputusan

Disetujui 26 November 2026. Kolom **Data contoh**: apakah perilakunya sudah bisa dicoba di frontend.

| # | Keputusan | Data contoh |
|---|---|---|
| 1 | API pengembangan di `localhost:8000`; produksi satu domain lewat Nginx | Bawaan sudah diganti |
| 2 | Biaya rupiah dari tabel harga per model dan kurs di server, juga pada tier gratis | Backend |
| 3 | B1: login dan skrip akun pertama. Penerimaan undangan menyusul bersama halamannya | Backend |
| 4 | Satu organisasi per pengguna; tabel tetap multi-organisasi | Sudah begitu |
| 5 | Model per organisasi (bawaan dari `.env`); kunci hanya di `.env`; status kunci untuk pemilik | Ya |
| 6 | Role dan relasi yang dipakai tugas hanya ditandai terhapus | Ya |
| 7 | Versi dokumen baru aktif setelah siap | Ya |
| 8 | Rujukan menyimpan versi; dokumen yang dirujuk tidak dihapus permanen | Ya |
| 9 | Uji coba untuk Anggota+, tercatat dan ikut anggaran bulanan | Ya |
| 10 | Unduh berkas dokumen dibuat di backend | Tombol nonaktif sampai ada backend |
| 11 | Ditunda setelah versi pertama: tugas ke unit, lampiran tugas, status `draft` dan `waiting_review` | |
| 12 | `limit` maksimal 200 | Ya |
| 13 | `on_rejected` disembunyikan sampai dijalankan mesin (B5) | Ya |
| 14 | Pemantau bukan tujuan eskalasi dan tidak memutuskan | Ya |
| 15 | Unit atau role yang masih punya dokumen tidak bisa dihapus | Ya |
| 16 | Dokumen organisasi terbaca semua role | Ya |
| 17 | Bulan dan tenggat menurut zona waktu organisasi | Memakai jam peramban |
| 18 | Anggaran bulanan boleh terlampaui sedikit oleh langkah yang berjalan | Ya |
| 19 | Persetujuan berhalaman | Ya |
| 20 | Konsultasi dijalankan sebelum role penanya bekerja | Ya |
| 21 | Teks melebihi batas ditolak `422` | Backend |
