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
14. [Jejak audit, batas laju, dan kode permintaan](#14-jejak-audit-batas-laju-dan-kode-permintaan)
15. [Akun mandiri (D1)](#15-akun-mandiri-d1)
16. [Pembentukan role dan pengetahuan (E1)](#16-pembentukan-role-dan-pengetahuan-e1)
17. [Tugas rutin, kalender kerja, dan cuti (E2)](#17-tugas-rutin-kalender-kerja-dan-cuti-e2)
18. [Surat dan berkas hasil (E3a)](#18-surat-dan-berkas-hasil-e3a)
19. [Spreadsheet (E3b)](#19-spreadsheet-e3b)
20. [Mode penyusunan dan laporan (E3c)](#20-mode-penyusunan-dan-laporan-e3c)

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

Galat yang perlu ditangani khusus oleh frontend membawa `code` (mis. `email_not_verified`, `invalid_token`,
`organization_pending`; daftar lengkap di bagian 15). Galat lain tidak menyertakan `code`.

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

/** `pending`: baru mendaftar, menunggu persetujuan pengelola platform. */
export type OrganizationStatus = "pending" | "active" | "suspended";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
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
- B1 hanya login dan skrip pembuat akun pertama. Pendaftaran, verifikasi email, lupa kata sandi, dan penerimaan
  undangan ada di bagian 15. Email belum terverifikasi dijawab `403` dengan `code: "email_not_verified"`.

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
| POST | `/admin/pengguna/resend-invite/{id}` | Admin+ | | `ResponseInterface` |
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
- Undang: `full_name` 2–150, email valid, `409` bila sudah anggota. Hasilnya berstatus `invited`, dan email berisi
  tautan undangan (berlaku 7 hari) dikirim. Pesan: `Undangan terkirim.`
- Kirim ulang undangan: hanya untuk `invited` (`409` bila sudah bergabung); tautan lama tidak berlaku lagi. Mengundang
  ulang pemilik hanya oleh pemilik (`403`).
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
- `on_rejected` tidak berlaku untuk `consult`, karena konsultasi terjadi sebelum role sumber bekerja.
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

Ini kontrak perilaku mesin. Backend menjalankannya sejak B5; `lib/mock/engine.ts` menirunya untuk mode data contoh.

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

**Relasi `on_rejected`**

Dijalankan saat langkah `failed`, atau saat persetujuan atas sebuah hasil ditolak. Yang dipakai adalah relasi milik
pembuat hasil (pada langkah `review`: role yang diperiksa). Bila relasi seperti itu ada, tugas tidak langsung gagal:
`escalate` meminta keputusan, `review` dan `handoff` menambah langkah. Penolakan atas izin konsultasi, atau atas
persetujuan yang lahir dari relasi `on_rejected`, tetap menggagalkan tugas.

**Hasil yang tidak lengkap**

Bila role (selain konsultasi) menjawab `need_info` atau `not_in_documents`, dibuat persetujuan `escalate` untuk
penanggung jawabnya. `approved` melanjutkan rute dengan hasil itu; `revise` mengulang dengan catatan. Pemeriksaan
tanpa keputusan yang jelas dianggap `revise`.

**Gangguan**

- Relasi ke role yang draf, dijeda, atau terhapus, dan relasi yang dihapus saat izinnya menunggu, dilewati
  (`relation_skipped`).
- Model tidak tersedia: langkah kembali antre dan dicoba lagi dengan jeda yang makin panjang, sampai 6 kali.
  Jawaban yang tidak terbaca dicoba 2 kali. Setelah itu langkah `failed`.
- Langkah yang ditinggalkan worker diambil lagi setelah 10 menit; tugas yang diam diperiksa tiap 5 menit.
- Tugas yang dihentikan saat model sedang menulis membuang hasilnya, tetapi biayanya tetap tercatat.
- Biaya penilaian kondisi ikut dihitung pada `cost_used` tugas.

**Keputusan manusia**

| Keputusan | Akibat |
|---|---|
| `approved` | Menjalankan relasi atau konsultasi yang ditahan, atau melanjutkan rute setelah batas revisi |
| `revise` | Role pembuat hasil terakhir mengerjakan ulang dengan catatan. Pada izin konsultasi: lanjut tanpa konsultasi itu, dengan catatan |
| `rejected` | Relasi `on_rejected` bila ada; selain itu tugas `failed` dan persetujuan lain ikut ditutup |

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
biaya dihitung dari tabel tetap; model cadangan tidak pernah dipakai; langkah tidak pernah gagal dan tidak pernah
menjawab `need_info` atau `not_in_documents`.

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
| 13 | `on_rejected` disembunyikan sampai dijalankan mesin; sejak B5 ditawarkan lagi | Ya |
| 14 | Pemantau bukan tujuan eskalasi dan tidak memutuskan | Ya |
| 15 | Unit atau role yang masih punya dokumen tidak bisa dihapus | Ya |
| 16 | Dokumen organisasi terbaca semua role | Ya |
| 17 | Bulan dan tenggat menurut zona waktu organisasi | Memakai jam peramban |
| 18 | Anggaran bulanan boleh terlampaui sedikit oleh langkah yang berjalan | Ya |
| 19 | Persetujuan berhalaman | Ya |
| 20 | Konsultasi dijalankan sebelum role penanya bekerja | Ya |
| 21 | Teks melebihi batas ditolak `422` | Backend |

---

## 14. Jejak audit, batas laju, dan kode permintaan

Ditambahkan pada fase C.

### Jejak audit

| Method | Path | Akses | Query | Jawaban |
|---|---|---|---|---|
| GET | `/admin/audit/read` | Admin+ | `search`, `group`, `skip`, `limit` (bawaan 50) | `ResponseListInterface` |

```ts
export type ResponseInterface = {
  id: string;
  action: string; // mis. "role.buat"
  label: string;
  target: string; // nama benda yang dikenai; kosong bila tidak ada
  actor_name: string;
  actor_email: string;
  ip: string;
  request_id: string;
  created_at: string;
};
```

- Urutan terbaru dulu. `search` mencocokkan sasaran, nama, dan email. `group` adalah bagian kode sebelum titik
  (`auth`, `tugas`, `persetujuan`, `role`, `relasi`, `dokumen`, `anggota`, `unit`, `organisasi`, `pengaturan`).
- Dicatat: setiap permintaan yang mengubah data dan berhasil (kecuali posisi peta), masuk, gagal masuk, dan keluar.
  Yang gagal karena validasi atau hak akses tidak dicatat. Isi dokumen, arahan tugas, dan kata sandi tidak dicatat.
- Gagal masuk dengan email yang tidak dikenal disimpan tanpa organisasi dan tidak tampil di organisasi mana pun.
- `403` untuk anggota dan pemantau: `Jejak audit hanya untuk pemilik dan admin.`

### Batas laju

Per menit dan per pengguna (perpanjangan sesi: per alamat), diatur di `server/.env`:

| Tindakan | Bawaan |
|---|---|
| Uji coba role | 10 |
| Unggah dokumen dan versi | 20 |
| Buat tugas | 20 |
| Pencarian dokumen | 60 |
| Perpanjang sesi | 60 |

Melampauinya dijawab `429` dengan `Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.`

### Kode permintaan

Setiap jawaban membawa header `X-Request-ID`. Galat tak terduga (`500`) menyebutnya di `message`
(`… Kode galat: 1a2b3c4d5e6f.`), dan kode yang sama ada di log server.


---

## 15. Akun mandiri (D1)

Ditambahkan pada fase D (rancangan di `PLANNING.md`, bagian D1). Semua endpoint di bawah **Publik**: tanpa sesi dan
tanpa `X-CSRF-Token` (seperti login), tetapi header `Origin` tetap diperiksa.

### 15.1 Endpoint

| Method | Path | Body | `data` |
|---|---|---|---|
| GET | `/auth/options` | | `AuthOptionsResponse` |
| POST | `/auth/register` | `RegisterInterface` | `null` (201) |
| POST | `/auth/verify-email` | `{ token }` | `AuthDataResponse` (cookie sesi dipasang) |
| POST | `/auth/resend-verification` | `{ email }` | `null` |
| POST | `/auth/forgot-password` | `{ email }` | `null` |
| POST | `/auth/reset-password` | `{ token, password }` | `null` |
| GET | `/auth/invite/{token}` | | `InvitePreviewResponse` |
| POST | `/auth/accept-invite` | `AcceptInviteInterface` | `AuthDataResponse` (cookie sesi dipasang) |

```ts
/** `approval`: organisasi baru menunggu persetujuan pengelola setelah email diverifikasi. */
export type RegistrationMode = "closed" | "approval" | "open";

export interface AuthOptionsResponse {
  registration: RegistrationMode; // dari REGISTRATION_MODE di server/.env, bawaan "approval"
  password_min_length: number; // 10
}

export interface RegisterInterface {
  full_name: string; // 2–150
  email: string; // maks 150, disimpan huruf kecil
  password: string; // 10–128
  organization_name: string; // 2–150
  sector: OrganizationSector; // lihat 3.1
  accept_terms: boolean; // harus true
}

export interface InvitePreviewResponse {
  email: string;
  full_name: string; // nama yang ditulis pengundang; boleh diubah penerima
  organization_name: string;
  inviter_name: string; // pengirim undangan terakhir
  access_role: AccessRole;
  expires_at: string;
}

export interface AcceptInviteInterface {
  token: string;
  full_name: string; // 2–150
  password: string; // 10–128
}
```

### 15.2 Perilaku

**Daftar**

- `registration: "closed"` → `403` "Pendaftaran sedang ditutup." Halaman daftar menampilkan keadaan tertutup.
- Membuat akun (`is_verified=false`), organisasi baru (slug unik dari nama, zona waktu bawaan `Asia/Makassar`),
  keanggotaan **pemilik** berstatus aktif, dan pengaturan bawaan organisasi. Lalu mengirim email verifikasi.
- Status organisasi baru: `pending` bila mode `approval`, `active` bila mode `open`.
- Email yang sudah terdaftar dijawab **sama persis** (`201`, pesan yang sama) dan pemiliknya menerima email
  "Anda sudah punya akun". Tidak ada akun atau organisasi yang dibuat.
- Pesan berhasil: `Pendaftaran diterima. Periksa email Anda untuk tautan verifikasi.`

**Token**

- Tabel `auth_tokens`: `user_id`, `purpose` (`verify`, `reset`, `invite`), `membership_id` (undangan),
  `token_hash` (SHA-256), `expires_at`, `used_at`. Token asli hanya ada di tautan email, minimal 32 byte acak.
- Masa berlaku: verifikasi 24 jam, atur ulang 1 jam, undangan 7 hari. Sekali pakai.
- Token baru dengan tujuan sama (untuk pengguna itu, atau keanggotaan itu untuk undangan) membatalkan yang lama.
- Token tidak ada, sudah dipakai, kedaluwarsa, atau tujuannya lain → `400` dengan `code: "invalid_token"` dan
  `Tautan tidak berlaku, sudah dipakai, atau kedaluwarsa. Minta tautan baru.`

**Verifikasi**

- Berhasil: `is_verified=true`, token terpakai, sesi dibuat seperti login. Frontend lalu ke `/menunggu-persetujuan`
  bila `organization.status` bukan `active`, selain itu ke `/admin`.
- Kirim ulang verifikasi dan lupa kata sandi selalu menjawab `200` dengan pesan yang sama:
  `Bila email itu terdaftar, tautannya sudah kami kirim. Periksa kotak masuk dan folder spam.`
  Email hanya dikirim untuk akun aktif yang punya kata sandi (dan, untuk verifikasi, belum terverifikasi).

**Atur ulang kata sandi**

- Berhasil: kata sandi diganti, `is_verified=true`, **semua** sesi refresh pengguna dicabut, email pemberitahuan
  "Kata sandi diubah" dikirim. Tidak membuat sesi baru; pengguna masuk lagi.
- Pesan: `Kata sandi sudah diganti. Silakan masuk dengan kata sandi baru.`

**Undangan**

- `GET /auth/invite/{token}` hanya untuk keanggotaan yang masih `invited`.
- Terima: nama dan kata sandi disimpan, `is_verified=true`, keanggotaan menjadi `active` (`joined_at` sekarang),
  sesi dibuat.
- Pengguna yang sudah aktif di organisasi lain → `409` `Email ini sudah dipakai di organisasi lain. Satu akun baru bisa
  bergabung ke satu organisasi.` (sampai fitur banyak organisasi ada).

**Login dan organisasi yang belum aktif**

- Kata sandi benar tetapi email belum diverifikasi → `403` dengan `code: "email_not_verified"`
  (`Email belum diverifikasi. Buka tautan di email Anda, atau minta tautan baru.`). Undangan yang belum diterima tidak
  punya kata sandi, jadi tetap `401`.
- Organisasi `pending` atau `suspended` tetap bisa masuk dan memanggil `/auth/me`, tetapi semua `/admin/*` dijawab
  `403` dengan `code: "organization_pending"` (`Organisasi masih menunggu persetujuan.`) atau
  `"organization_suspended"` (`Organisasi ditangguhkan. Hubungi pengelola MBUTI.`).
- Pengelola menyetujui lewat `python -m scripts.setujui_organisasi <slug>` (atau `--daftar` untuk melihat yang
  menunggu). Setelah disetujui, pemilik menerima email pemberitahuan.

### 15.3 Email

- Dikirim lewat antrean Celery `default`. `EMAIL_BACKEND`: `console` (bawaan pengembangan; isi email, termasuk
  tautan, ditulis ke log worker) atau `smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_STARTTLS`). Pengirim `EMAIL_FROM`. Tautan memakai `APP_URL`.
- Email dalam Bahasa Indonesia, teks polos ditambah HTML sederhana: verifikasi, sudah punya akun, atur ulang,
  kata sandi diubah, undangan, organisasi disetujui.
- Kegagalan kirim diulang oleh worker; jawaban API tidak menunggu email terkirim.

### 15.4 Batas laju dan jejak audit

| Tindakan | Batas |
|---|---|
| Daftar | 5 per jam per alamat |
| Kirim ulang verifikasi, lupa kata sandi | 3 per jam per email dan 10 per jam per alamat |
| Verifikasi, atur ulang, lihat dan terima undangan | 30 per jam per alamat |

Melampauinya dijawab `429` seperti bagian 14. Jejak audit baru: `auth.daftar` (Mendaftarkan organisasi),
`auth.verifikasi` (Memverifikasi email), `auth.sandi` (Mengatur ulang kata sandi), `anggota.terima` (Menerima
undangan), dan `anggota.kirim_ulang` (Mengirim ulang undangan). Token dan kata sandi tidak dicatat.

### 15.5 Khusus data contoh

`GET`/`DELETE /api/v1/mock/outbox` (Kotak keluar) dan `POST /api/v1/mock/approve-organization` (setujui simulasi)
hanya ada di `lib/mock/routes/mock.ts` dan **tidak** dibuat di backend.

---

## 16. Pembentukan role dan pengetahuan (E1)

Ditambahkan pada fase E (rancangan di `PLANNING.md`, bagian "E1. Pembentukan role dan pengetahuan"). Bagian ini
menambah, bukan mengganti, bagian 4, 5, 7, 11, dan 12. Kolom yang ditambahkan ke tipe yang sudah ada disebut di
masing-masing subbagian. Lampiran tugas (16.6) mengakhiri penundaan "lampiran tugas" pada keputusan 11.

### 16.1 Pembentukan role dan versi (E1a)

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/role/{id}/pembentukan` | Semua | | `FormationInterface`: revisi yang sedang disusun, atau versi Final aktif bila tidak ada |
| POST | `/admin/role/{id}/pembentukan/mulai` | Pembentuk | `StartRequest` | `FormationInterface` (201) |
| PUT | `/admin/role/{id}/pembentukan/bahan` | Pembentuk | `MaterialsRequest` | `FormationInterface` |
| POST | `/admin/role/{id}/pembentukan/analisis` | Pembentuk | `{}` | `FormationInterface` (202) |
| PUT | `/admin/role/{id}/pembentukan/kartu` | Pembentuk | `CardUpdateRequest` | `FormationInterface` |
| POST | `/admin/role/{id}/pembentukan/jawab` | Pembentuk | `AnswerRequest` | `FormationInterface` (202) |
| POST | `/admin/role/{id}/pembentukan/final` | Pembentuk | `FinalRequest` | `FormationInterface` |
| POST | `/admin/role/{id}/pembentukan/batal` | Pembentuk | `{}` | `null` |
| GET | `/admin/role/{id}/versi` | Semua | | `VersionInterface[]` (terbaru dulu, tanpa yang dibuang) |
| GET | `/admin/role/{id}/versi/{vid}` | Semua | | `VersionDetailInterface` |
| POST | `/admin/role/{id}/versi/{vid}/pulihkan` | Pembentuk | `{}` | `FormationInterface` (201) |

**Pembentuk** = pemilik, admin, atau anggota yang menjadi penanggung jawab role itu (`owner_member_id`). Pemantau
tidak pernah. `can_edit` pada `FormationInterface` dihitung server untuk pengguna yang sedang masuk.

```ts
export type RevisionStatus = "draft" | "analyzing" | "questioning" | "ready" | "final" | "superseded" | "discarded";

export type RevisionSource = "formation" | "manual" | "restore";

/** `upcoming` = alat direncanakan di tahap E3–E5. */
export type ToolSupport = "supported" | "upcoming" | "substitute" | "unsupported";

export type FindingKind = "unclear" | "conflict" | "missing_tool" | "missing_material";

export type MessageAuthor = "agent" | "member";

export type MessageKind = "question" | "answer" | "objection" | "note";

/** Alat yang disebut pembuat role, setelah dipetakan ke katalog. */
export interface ToolRef {
  /** Kunci katalog; null bila tidak ada padanannya */
  key: string | null;
  /** Nama yang ditulis pembuat role, mis. "Ms Word" */
  requested: string;
  /** Nama di katalog, atau sama dengan `requested` bila tidak ada padanan */
  name: string;
  support: ToolSupport;
  note: string;
}

export interface SkillStep {
  text: string;
  /** Langkah ini menunggu persetujuan manusia */
  approval: boolean;
}

export interface Skill {
  key: string;
  name: string;
  description: string;
  steps: SkillStep[];
  inputs: string[];
  outputs: string[];
  tools: ToolRef[];
  /** Status terlemah di antara alat-alatnya */
  support: ToolSupport;
  substitute_note: string;
}

export interface CardFinding {
  id: string;
  kind: FindingKind;
  text: string;
  /** Rujukan ke uraian jabatan, mis. "Uraian jabatan, hlm. 2"; kosong bila tidak ada */
  ref: string;
}

export interface SkillCard {
  summary: string;
  goal: string;
  skills: Skill[];
  findings: CardFinding[];
}

export interface FormationMaterials {
  description: string;
  tools: string[];
  /** Orang yang diwakili role, ditulis bebas */
  represented: string;
  owner_member_id: string | null;
}

/** Isian kerja role yang disalin ke role saat Final. */
export interface RevisionSnapshot {
  goal: string;
  instructions: string;
  input_spec: InputField[];
  output_format: OutputFormat;
  output_template: string;
  acceptance_criteria: string[];
  knowledge_scope: KnowledgeScope;
  model_profile: ModelProfile;
  web_search: boolean;
}

export interface FormationMessage {
  id: string;
  round_no: number;
  author: MessageAuthor;
  kind: MessageKind;
  /** Untuk jawaban: pertanyaan yang dijawab. Untuk pertanyaan: id pertanyaan itu sendiri */
  question_id: string | null;
  required: boolean;
  text: string;
  skipped: boolean;
  author_name: string;
  created_at: string;
}

/** Uraian jabatan yang diunggah sebagai bahan (dokumen berjenis `uraian_jabatan`). */
export interface MaterialDocument {
  id: string;
  title: string;
  file_name: string;
  status: IngestionStatus;
  progress: number;
  page_count: number;
}

export interface FormationInterface {
  id: string;
  agent_id: string;
  version_no: number;
  status: RevisionStatus;
  source: RevisionSource;
  /** Analisis atau putaran tanya jawab sedang berjalan di latar */
  processing: boolean;
  /** Pengguna yang sedang masuk boleh membentuk role ini (admin ke atas atau penanggung jawabnya) */
  can_edit: boolean;
  materials: FormationMaterials;
  material_documents: MaterialDocument[];
  card: SkillCard | null;
  /** Rancangan isian kerja; terisi setelah analisis */
  snapshot: RevisionSnapshot | null;
  round_no: number;
  messages: FormationMessage[];
  /** Pertanyaan wajib yang belum dijawab atau dilewati */
  open_required: number;
  /** Bagian kartu yang berubah pada putaran terakhir: "summary", "goal", "findings", atau kunci keterampilan */
  changed: string[];
  /** Role menyatakan sudah jelas */
  agent_satisfied: boolean;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersionInterface {
  id: string;
  version_no: number;
  status: RevisionStatus;
  source: RevisionSource;
  change_note: string;
  finalized_at: string | null;
  finalized_by_name: string | null;
  /** Versi yang sedang dipakai role bekerja */
  is_active: boolean;
  skill_count: number;
  question_count: number;
}

export interface VersionDetailInterface extends VersionInterface {
  snapshot: RevisionSnapshot;
  card: SkillCard | null;
}

export interface StartRequest {
  /** Kosong = dari versi aktif */
  from_version_id?: string;
}

export interface MaterialsRequest {
  description: string;
  tools: string[];
  represented: string;
  owner_member_id: string | null;
}

export interface AnswerRequest {
  answers: Array<{ question_id: string; text: string; skipped: boolean }>;
  note: string;
  /** Pembuat memilih "Cukup, ke Final" */
  finish: boolean;
}

export interface FinalRequest {
  change_note: string;
  status_after: "active" | "paused";
  /** Wajib bila masih ada pertanyaan wajib terbuka */
  override_reason: string;
}

export interface CardUpdateRequest {
  summary: string;
  goal: string;
  skills: Skill[];
}
```

**Revisi**

- Tabel baru `agent_revisions`, `agent_skills`, dan `agent_formation_messages` (rinciannya di PLANNING). Kartu
  (`card`) dan isian kerja (`snapshot`) disimpan per revisi. Nomor versi berurutan per role, termasuk revisi yang
  kemudian dibuang.
- Satu role paling banyak punya **satu revisi terbuka** (`draft`, `analyzing`, `questioning`, `ready`). `mulai`
  dan `pulihkan` saat masih ada revisi terbuka → `409` `Masih ada revisi yang sedang disusun. Lanjutkan atau buang
  revisi itu.`
- `mulai` tanpa `from_version_id` menyalin versi Final aktif (bahan, kartu, isian kerja). Bila sumbernya punya kartu,
  revisi langsung `ready` dan `agent_satisfied: true`; tanpa kartu (versi manual), revisi `draft`.
  `source`: `formation`, atau `restore` bila `from_version_id` diisi.
- Selama revisi disusun, **versi Final aktif tetap dipakai bekerja**. Role yang belum pernah Final
  (`active_version_no: 0`) tetap draf dan tidak menerima tugas.
- `batal` hanya untuk role yang sudah punya versi Final (`409` bila belum: `Role belum pernah Final, jadi revisi
  pertamanya tidak bisa dibuang. Hapus role bila tidak jadi dipakai.`). Revisi menjadi `discarded`.
- Selama `processing: true`, semua perubahan pada revisi dijawab `409` `Role masih memproses putaran sebelumnya.
  Tunggu sebentar.`

**Bahan dan analisis**

- Uraian jabatan diunggah lewat `POST /admin/pengetahuan/create` dengan `doc_type=uraian_jabatan`, `scope=agent`,
  `scope_id={id}`. Penanggung jawab role (anggota) boleh mengunggahnya untuk role itu saja. Dokumen ini mendapat
  `category: "formation"` dan tampil di `material_documents`.
- `bahan`: `description` ≤ 4000, `tools` ≤ 30 × 80 (duplikat dibuang), `represented` ≤ 160, `owner_member_id`
  anggota organisasi (`422` bila bukan). Penanggung jawab ini disalin ke role saat Final.
- `analisis` → `409` bila uraian jabatan masih `queued`/`processing`; `422` bila tidak ada uraian jabatan yang
  `ready` dan `description` < 80 karakter (`Unggah uraian jabatan, atau tulis deskripsi pekerjaan minimal 80
  karakter.`). Analisis ulang menghapus kartu dan percakapan revisi itu, lalu mulai dari putaran 1.
- Analisis dan putaran tanya jawab berjalan di antrean `execution` (satu per satu). Selama berjalan:
  `processing: true`, status `analyzing` atau `questioning`; frontend memuat ulang tiap 1,5 detik. Bila kuota habis
  (429), pekerjaan diantre ulang dengan jeda; gagal permanen mengisi `error_message` dan revisi kembali ke status
  sebelumnya.
- Analisis memakai profil **teliti** (cadangan: seimbang) dan keluaran terstruktur: ringkasan, tujuan,
  keterampilan (langkah dengan titik persetujuan, bahan, hasil, alat), temuan dengan rujukan ke uraian jabatan, dan
  pertanyaan putaran 1 (maks 5, ditandai wajib/opsional, ditambah keberatan bila ada pertentangan).
- Nama alat dari pembuat dipetakan **oleh server** ke katalog (16.2): model mengusulkan, server memeriksa kuncinya.
  `support` keterampilan = status terlemah alat-alatnya. Alat `unsupported` dicatat di `tool_requests` (sekali per
  role per nama alat).

**Kartu dan tanya jawab**

- `kartu`: hanya bila kartu sudah ada (`409`). `skills` 1–20; nama ≤ 120, uraian ≤ 600, langkah ≤ 15 × 200,
  bahan dan hasil ≤ 8 × 200, alat ≤ 12 (dipetakan ulang ke katalog). `summary` ≤ 1500, `goal` ≤ 500. `changed`
  dikosongkan.
- `jawab`: minimal satu jawaban, catatan, atau `finish: true` (`422`). Jawaban untuk pertanyaan yang tidak ada atau
  sudah dijawab diabaikan. `skipped: true` menyimpan teks `Dilewati` atau `Tidak tahu` (dari frontend). Catatan
  ≤ 2000 menjadi pesan `note`.
- Setiap putaran: jawaban dimasukkan ke kartu, `changed` diisi bagian kartu yang berubah, `snapshot` disusun ulang,
  lalu role mengajukan pertanyaan berikutnya atau menyatakan jelas (`agent_satisfied: true`, status `ready`,
  ditambah pesan `note` dari role). `finish: true` memproses jawaban terakhir tanpa pertanyaan baru.
- Batas `FORMATION_ROUNDS_MAX` (bawaan 6): setelah itu `jawab` tanpa `finish` → `409` `Batas 6 putaran tanya jawab
  tercapai. Lanjutkan ke Final.`
- `open_required` = pertanyaan wajib yang belum dijawab atau dilewati.

**Final**

- `409` bila kartu belum ada, analisis sedang berjalan, atau uraian jabatan masih diolah.
- `open_required > 0` dan `override_reason` < 5 karakter → `409` `Masih ada N pertanyaan wajib yang belum dijawab.
  Jawab dulu, atau tulis alasan untuk tetap Final.` Alasannya ditambahkan ke `change_note`.
- `snapshot.goal` < 10 karakter → `422`.
- Final menyalin `snapshot` ke kolom role (`goal`, `instructions`, `input_spec`, `output_format`,
  `output_template`, `acceptance_criteria`, `knowledge_scope`, `model_profile`, `web_search`), mengisi
  `active_revision_id`, menyetel status role menurut `status_after`, dan menandai versi Final sebelumnya
  `superseded`.
- Bila ada pasangan pertanyaan dan jawaban (bukan dilewati), server menyusun dokumen sistem
  `Hasil tanya jawab – {nama} v{N}` (`category: "qa"`, lingkup role, satu bagian per pertanyaan) dan mengolahnya
  seperti dokumen lain. Dokumen tanya jawab versi sebelumnya diarsipkan (`deleted_at`).

### 16.2 Katalog dan permintaan alat

| Method | Path | Akses | `data` |
|---|---|---|---|
| GET | `/admin/alat/katalog` | Semua | `ToolCatalogItem[]` |
| GET | `/admin/alat/permintaan` | Semua | `ToolRequestInterface[]` (terbaru dulu) |

```ts
export type ToolGroup = "dokumen" | "data" | "media" | "pembacaan" | "browser" | "pencarian" | "integrasi";

export interface ToolCatalogItem {
  key: string;
  name: string;
  group: ToolGroup;
  support: "supported" | "upcoming";
  /** Tahap yang menghadirkannya, mis. "E3" */
  stage: string;
  description: string;
  software: string;
}

export interface ToolRequestInterface {
  id: string;
  agent_id: string;
  agent_name: string;
  skill_name: string;
  requested: string;
  status: "open" | "planned" | "done" | "declined";
  created_at: string;
}
```

- Katalog ditulis di kode (`app/services/tools/catalog.py`): kunci, nama, kelompok, status, tahap, perangkat lunak
  dan lisensinya, serta kata pengenal untuk pemetaan. Di E1 yang `supported`: `read.document`, `read.image`,
  `search.web`. Lainnya `upcoming` dengan tahapnya (E3–E5).
- Pemetaan: cocok dengan kata pengenal → alat katalog; alat yang dikenal tetapi tidak ada (mis. AutoCAD) bisa diberi
  `substitute` dengan catatan; selain itu `unsupported`.

### 16.3 Perubahan pada Role (bagian 4)

Kolom baru:

```ts
// UpdateInterface
web_search: boolean; // boleh mencari di internet (16.7); bawaan false

// ResponseInterface
active_version_no: number; // 0 bila belum pernah Final
revision_status: RevisionStatus | null; // status revisi terbuka; null bila tidak ada

// CreateInterface
mode?: "formation" | "manual"; // hanya saat membuat; bawaan backend "manual"
```

- `create` dengan `mode: "formation"`: role selalu `draft` dan revisi 1 `draft` dibuat. Frontend lalu membuka
  `/admin/role/{id}/bentuk`. Dengan `mode: "manual"` (atau tanpa `mode`): isian langsung menjadi versi 1
  `source: "manual"` yang Final.
- `update` yang mengubah isian kerja role yang sudah punya versi Final mencatat **versi manual baru** yang langsung
  Final (`change_note`: `Diubah langsung di detail role.`). Mengubah nama, jabatan, unit, avatar, atau status tidak
  membuat versi.
- `update` ke `status: "active"` untuk role tanpa versi Final → `409` `Role belum Final. Selesaikan pembentukan
  role terlebih dahulu.`
- Role lama (sebelum E1) mendapat versi 1 `manual` lewat migrasi.
- Hapus role: uraian jabatan dan hasil tanya jawab miliknya tidak menghalangi (`409` hanya untuk dokumen biasa) dan
  ikut diarsipkan.

### 16.4 Kebijakan & Aturan dan urutan rujukan (E1b)

```ts
/**
 * `knowledge` dokumen biasa, `policy` kebijakan dan aturan (E1b), `formation` uraian jabatan,
 * `qa` hasil tanya jawab pembentukan role, `web` temuan internet yang disetujui (E1d).
 */
export type DocumentCategory = "knowledge" | "policy" | "formation" | "qa" | "web";

export type PolicyKind = "peraturan" | "kebijakan" | "standar_mutu" | "panduan_merek" | "lainnya";

export type PolicyStatus = "berlaku" | "dicabut";

/** Sumber sebuah rujukan; menentukan urutan rujukan: kebijakan → tanya jawab → dokumen → internet. */
export type SourceKind = "policy" | "qa" | "document" | "web" | "image" | "attachment";

/** Keterangan tambahan untuk dokumen di pustaka Kebijakan & Aturan. */
export interface PolicyFields {
  kind: PolicyKind;
  /** Nomor peraturan atau kode kebijakan, mis. "KEP-07/2026" */
  reference_no: string;
  issuer: string;
  /** Tanggal (YYYY-MM-DD); null = tidak dibatasi */
  effective_from: string | null;
  effective_until: string | null;
  status: PolicyStatus;
}

export interface PolicyInfo extends PolicyFields {
  /** Dihitung server: berstatus berlaku dan hari ini di dalam masa berlaku */
  in_force: boolean;
}
```

Perubahan pada bagian 5:

- `ResponseInterface` (dokumen) mendapat `category: DocumentCategory`, `policy: PolicyInfo | null` (terisi untuk
  `policy`), dan `source_url: string | null` (untuk `web`). `DocumentType` mendapat `uraian_jabatan`.
- `GET /admin/pengetahuan/read` menerima `category`: satu atau beberapa nilai dipisah koma. Tab Dokumen memakai
  `knowledge,formation,qa,web`, tab Kebijakan & Aturan memakai `policy`. Nilai yang tidak dikenal diabaikan.
- `POST /admin/pengetahuan/create` menerima `category=policy` beserta `policy_kind`, `reference_no` (≤ 100),
  `issuer` (≤ 150), `effective_from`, `effective_until` (`YYYY-MM-DD`, kosong = tidak dibatasi). Status awal
  `berlaku`. `effective_until` sebelum `effective_from` → `422`.
- `PUT /admin/pengetahuan/update/{id}` menerima `policy: PolicyFields` untuk dokumen kebijakan (termasuk
  `status`). Kategori tidak bisa diubah lewat update.
- Dokumen `qa` hanya-baca: ubah, versi baru, dan hapus → `409` `Hasil tanya jawab disusun sistem …`.
- **Uraian jabatan dan hasil tanya jawab hanya dibaca role pemiliknya**, walaupun role lain berlingkup organisasi
  atau unit (juga di `document_count` dan `agent_id` pada `read`/`search`).
- `SearchHit` mendapat `source_kind`: `policy` (dokumen kebijakan), `qa`, `image` (halaman bergambar, 16.5), selain
  itu `document`. Kebijakan `dicabut`, belum berlaku, atau lewat masa berlaku tidak ikut pencarian.
- **Urutan rujukan:** pencarian mengambil potongan terbaik, lalu mengurutkannya `policy` → `qa` → `document`/`image`,
  dan di dalam kelompok menurut skor. Prompt mengelompokkannya di bawah `ATURAN ORGANISASI`, `HASIL TANYA JAWAB`,
  `DOKUMEN` (dan `INTERNET`, 16.7) dengan perintah: bila berbeda, aturan organisasi yang dipakai dan perbedaannya
  disebut di `notes`. Nomor rujukan `[n]` tetap mengikuti urutan `citations`.

### 16.5 PDF kompleks dan gambar di pengetahuan (E1c)

```ts
/** `text` dibaca lokal; `scan` dan `visual` (tabel bergaris, grafik, diagram, foto) dibaca Gemini multimodal (E1c). */
export type PageRender = "text" | "scan" | "visual";

export type MediaKind = "text" | "pdf" | "image";
```

- `DocumentVersion` mendapat `media_kind`, `visual_pages`, `visual_pages_over_limit`.
- `DocumentSection` mendapat `render` (bawaan `text`), `image_url`, dan `visual_text`. Backend selalu mengirim
  ketiganya. `image_url` berupa path API (frontend menambahkan alamat backend; data URL dipakai apa adanya).
- `SearchHit` mendapat `image_url` (gambar halaman yang cocok, bila ada).
- Unggah: PDF, DOCX, TXT, MD (maks 20 MB) dan **gambar PNG, JPG, WEBP (maks 10 MB)**. Jenis diperiksa dari isi.
- Pemilahan halaman PDF dengan pypdf dan pypdfium2: `text` (lapisan teks cukup dan terbaca), `scan` (teks sedikit
  atau rusak), `visual` (banyak gambar atau garis). Halaman `scan`/`visual` dirender ke WebP (sisi panjang ±1600 px)
  dan dibuat satu embedding multimodal (`gemini-embedding-2`, 768) di `document_chunks` dengan `kind: page_image`.
- Berkas gambar: satu bagian `visual`, diperkecil sampai 2048 px, satu embedding multimodal; tanggal dan lokasi EXIF
  disimpan sebagai metadata.
- `VISION_PAGES_PER_DOCUMENT` (bawaan 40): halaman berat di atasnya disimpan gambarnya tanpa embedding
  (`visual_pages_over_limit`).
- Tidak ada transkripsi saat unggah. Bacaan Gemini atas halaman bergambar yang pertama kali dipakai tugas disimpan
  ke `visual_text` dan ikut pencarian kata kunci berikutnya.

| Method | Path | Akses | `data` |
|---|---|---|---|
| GET | `/admin/pengetahuan/{id}/versions/{vid}/pages/{page}/image` | Semua | gambar WebP (biner) |

- Query `box=y0,x0,y1,x1` (0–1000) memotong bagian gambar untuk tampilan rujukan; nilai di luar rentang → `422`.
- Hak akses sama dengan `GET /admin/pengetahuan/{id}`, termasuk dokumen yang diarsipkan tetapi pernah dirujuk.

### 16.6 Lampiran tugas dan temuan bergambar (E1c)

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| POST | `/admin/tugas/lampiran` | Anggota+ | multipart: `file` | `TaskAttachment` (201) |
| GET | `/admin/tugas/lampiran/{aid}/pages/{page}` | Semua | query `box` seperti 16.5 | gambar WebP (biner); juga untuk lampiran yang belum terikat tugas |

```ts
export type WebSearchMode = "role" | "off";

/** Lampiran tugas: gambar (PNG, JPG, WEBP) atau PDF. */
export interface TaskAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  /** Ukuran gambar asli (piksel); 0 untuk PDF */
  width: number;
  height: number;
  /** 1 untuk gambar; jumlah halaman yang dibaca untuk PDF (maks 20) */
  page_count: number;
  /** Gambar per halaman (gambar = satu). Backend: path API; data contoh: data URL */
  pages: string[];
  /** Metadata foto, bila ada */
  exif: { taken_at: string | null; location: string | null } | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export type FindingSeverity = "info" | "perlu_perbaikan" | "penting";

/** Temuan atas gambar: kotak bernomor di atas lampiran atau halaman dokumen. */
export interface Finding {
  no: number;
  title: string;
  description: string;
  severity: FindingSeverity;
  target:
    | { kind: "attachment"; attachment_id: string; page_no: number }
    | { kind: "document"; document_id: string; version_id: string; page_no: number };
  /** Kotak [y0, x0, y1, x1] dalam skala 0–1000 terhadap gambar; null bila temuan tentang gambar secara umum */
  box: [number, number, number, number] | null;
  /** Nomor rujukan (1-based) pada `citations` langkah itu; null bila tidak merujuk pedoman */
  source_index: number | null;
  recommendation: string;
  /** Butir kriteria diterima yang dinilai temuan ini, bila ada */
  criterion: string | null;
}
```

Perubahan pada bagian 4 dan 7:

- `CreateInterface` (tugas) mendapat `attachment_ids?: string[]` (maks 10) dan `web_search?: WebSearchMode`
  (bawaan `role`). `DetailInterface` mendapat `attachments` dan `web_search`.
- `StepInterface` mendapat `findings: Finding[]` dan `web_sources: WebSource[]` (16.7).
- `TrialRequest` mendapat `attachment_ids?: string[]`; `TrialResult` mendapat `attachments`, `findings`,
  `web_sources`.

Perilaku:

- Lampiran: PNG, JPG, WEBP, atau PDF; maks 10 MB; jenis diperiksa dari isi. Gambar diperkecil untuk dikirim ke
  model; PDF dirender maks 20 halaman (`MAX_PDF_PAGES`). `pages` berisi path gambar tiap halaman.
- Lampiran yang diunggah belum terikat tugas (`task_id` kosong) dan dibuang setelah 24 jam bila tidak dipakai.
  `create` tugas dengan lampiran milik organisasi lain, sudah dipakai tugas lain, atau tidak ada → `422`
  `Lampiran tidak ditemukan atau sudah dipakai tugas lain. Unggah ulang.` Uji coba boleh memakai ulang lampiran tanpa
  mengikatnya.
- Lampiran ikut dibaca langkah `work` role pertama dan role yang menerimanya lewat relasi bila `payload_spec`
  berisi konteks. Maks `MAX_IMAGES_PER_STEP` (bawaan 6) gambar per langkah, termasuk halaman pengetahuan bergambar
  yang terpilih; `media_resolution` sedang.
- Uji coba dengan lampiran memanggil model walau tidak ada potongan dokumen yang cocok.
- Keluaran terstruktur model mendapat `findings` (judul, uraian, tingkat, gambar yang dimaksud, kotak `[y0, x0, y1,
  x1]` skala 0–1000, nomor potongan pedoman, rekomendasi, butir kriteria). Server memeriksa: gambar harus yang
  dikirim, kotak dalam 0–1000 dengan y0 < y1 dan x0 < x1 (selain itu `box: null`), nomor potongan harus ada (selain
  itu `source_index: null`), kriteria harus salah satu `acceptance_criteria` role (selain itu `null`). `no` diberi
  server berurutan. Maks 12 temuan per langkah.
- Temuan pemeriksa (`review`) yang menyebut kriteria ikut mengisi `criteria_results`.
- Frontend menggambar kotak sebagai lapisan SVG; gambar asli tidak diubah.

### 16.7 Pencarian internet dan usulan pengetahuan (E1d)

```ts
/** Sumber internet yang dipakai role (E1d). Tautan dibuat server dari grounding metadata Gemini, bukan dari teks model. */
export interface WebSource {
  /** Nomor rujukan W1, W2, … */
  no: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  retrieved_at: string;
}

export type ProposalStatus = "pending" | "approved" | "rejected";

/** Usulan menyimpan temuan internet sebagai pengetahuan organisasi; admin yang memutuskan. */
export interface KnowledgeProposal {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  status: ProposalStatus;
  task_id: string | null;
  task_title: string | null;
  agent_name: string | null;
  proposed_by_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  /** Dokumen yang dibuat saat disetujui */
  document_id: string | null;
  created_at: string;
}

export interface ProposalRequest {
  url: string;
  title: string;
  excerpt: string;
  task_id?: string | null;
  agent_id?: string | null;
}
```

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/pengetahuan/usulan` | Semua | `status` (opsional) | daftar `KnowledgeProposal` + `summary: Record<ProposalStatus, number>` |
| POST | `/admin/pengetahuan/usulan` | Anggota+ | `ProposalRequest` | `KnowledgeProposal` (201) |
| POST | `/admin/pengetahuan/usulan/{id}/setujui` | Admin+ | `{}` | `KnowledgeProposal` |
| POST | `/admin/pengetahuan/usulan/{id}/tolak` | Admin+ | `{}` | `KnowledgeProposal` |

Pencarian:

- Dijalankan hanya bila role `web_search: true`, tugas `web_search` bukan `off`, dan salah satu: tidak ada potongan
  dokumen, skor teratas < 60, atau arahan meminta informasi terkini. Maks satu pencarian per langkah dan
  `WEB_SEARCH_PER_DAY` per organisasi (bawaan 50); setelah batas, langkah berjalan tanpa internet.
- **Pencarian gratis lebih dulu** (`WEB_SEARCH_FREE`, pustaka `ddgs`, tanpa kunci API): mesin di
  `WEB_SEARCH_BACKENDS` dicoba berurutan; hanya hasil `https` yang dipakai (judul, alamat, domain, cuplikan) dan
  langsung masuk prompt utama, tanpa panggilan model tambahan. Dicatat di `llm_calls` dengan `provider: "ddgs"` dan
  biaya 0. Mesin pencari menerima **kata pencarian pendek** dari judul tugas (atau baris pertama arahan uji coba) dan
  jabatan role saja: alamat email, tautan, nomor panjang, sapaan beserta nama, dan nama anggota serta role dibuang.
  Arahan lengkap, isian, dan bahan tidak dikirim.
- Bila tidak ada hasil dan `WEB_SEARCH_PROVIDER_FALLBACK` aktif, dipakai Gemini. Dua panggilan: (1) alat `google_search` Gemini menghasilkan temuan dan grounding metadata; **judul, alamat, dan
  domain dibuat server dari metadata itu**, bukan dari teks model; (2) temuan masuk prompt utama sebagai potongan
  `W1…` di bawah `INTERNET`, sesudah semua sumber organisasi. Bila model mendukung alat dan keluaran terstruktur
  sekaligus, cukup satu panggilan (dicek saat E1d).
- Panggilan pencarian dicatat di `llm_calls` dengan `kind: "web_search"`, ikut `cost_used` tugas dan anggaran
  bulanan. Linimasa mencatat bahwa role mencari di internet.
- Hasil yang hanya bertumpu pada internet tidak boleh berstatus `not_in_documents`; `notes` menyebut bahwa sumbernya
  di luar dokumen organisasi.

Usulan:

- `url` harus `http(s)` (`422`); usulan `pending` dengan alamat yang sama di organisasi itu → `409`. `title` ≤ 200,
  `excerpt` ≤ 2000. `task_id` dan `agent_id` diabaikan bila bukan milik organisasi.
- Setujui: server membuat dokumen `category: "web"` berisi `title`, `excerpt`, dan alamat sumber, lingkup
  organisasi, `source_url` terisi, lalu mengolahnya seperti dokumen lain. Isi halaman sumber **tidak** diambil
  ulang (mengambil alamat dari luar ditunda karena perlu perlindungan jaringan tersendiri). Usulan yang sudah
  diputuskan → `409`; organisasi lain → `404`. Setelah diputuskan, alamat yang sama boleh diusulkan lagi.

### 16.8 Pemakaian kuota (bagian 11.1)

`ResponseInterface` Model AI mendapat `usage_today: UsageToday[]` (selalu lima baris, urut seperti di bawah, nol bila
tidak dipakai), dihitung menurut zona waktu organisasi.

```ts
export type UsagePurpose = "task" | "trial" | "formation" | "vision_ingest" | "web_search";

export interface UsageToday {
  purpose: UsagePurpose;
  calls: number;
  /** Rupiah */
  cost: number;
}
```

Jenisnya dibaca dari kolom `llm_calls.kind` yang sudah ada: `step` dan `condition` = `task`; `trial`; analisis dan
putaran tanya jawab = `formation`; embedding gambar halaman = `vision_ingest` dan pencarian internet = `web_search`
(kolom diperlebar saat E1c dan E1d). Panggilan yang gagal ikut dihitung. Embedding teks dokumen dan pertanyaan tidak
dihitung di sini.

### 16.9 Pengaturan server baru

| `.env` | Bawaan | Dipakai untuk |
|---|---|---|
| `FORMATION_ROUNDS_MAX` | 6 | Batas putaran tanya jawab |
| `VISION_PAGES_PER_DOCUMENT` | 40 | Halaman berat per berkas yang dibuat embedding gambarnya |
| `MAX_IMAGES_PER_STEP` | 6 | Gambar per langkah atau uji coba |
| `WEB_SEARCH_PER_DAY` | 50 | Pencarian internet per organisasi per hari |
| `WEB_SEARCH_FREE` | true | Pencarian gratis lebih dulu |
| `WEB_SEARCH_BACKENDS` | `yahoo,auto` | Urutan mesin pencarian gratis |
| `WEB_SEARCH_PROVIDER_FALLBACK` | true | Gemini Google Search bila tidak ada hasil |
| `WEB_SEARCH_TIMEOUT_SECONDS` | 25 | Batas waktu pencarian gratis |

### 16.10 Batas laju dan jejak audit

| Tindakan | Batas per menit per pengguna |
|---|---|
| Analisis dan jawab pembentukan | 10 |
| Unggah lampiran tugas | 30 |
| Usulan pengetahuan | 20 |

Jejak audit baru: `role.bentuk` (mulai revisi, simpan bahan, analisis, ubah kartu, jawab, buang revisi),
`role.final` (Mem-Final versi role), `role.pulihkan` (Memulihkan versi role), `tugas.lampiran` (Mengunggah lampiran
tugas), dan `dokumen.usulan` (mengusulkan, menyetujui, atau menolak usulan). Isi jawaban, bahan, dan lampiran tidak
dicatat.

### 16.11 Khusus data contoh

Hanya simulasi, jangan ditiru backend: analisis menyusun keterampilan dari kalimat berkata kerja di bahan;
pertanyaan, putaran, dan pemetaan alat memakai aturan tetap; putaran kedua selalu diakhiri role yang menyatakan
jelas; temuan gambar memakai pola tetap; halaman PDF bergambar dan lampiran PDF berupa gambar pengganti; gambar
disimpan sebagai data URL di peramban; sumber internet fiktif dengan domain `.test`; usulan yang disetujui tidak
mengambil ulang halaman; lampiran dibaca semua langkah `work` tanpa melihat `payload_spec`; temuan tidak mengisi
`criteria_results`; analisis tidak pernah gagal.

## 17. Tugas rutin, kalender kerja, dan cuti (E2)

Ditambahkan pada fase E (rancangan di `PLANNING.md`, bagian "E2. Tugas rutin: rancangan"). Dikerjakan tiga bagian:
**E2a** kalender kerja, shift, dan cuti (17.1–17.2); **E2b** jadwal, pemahaman kalimat, dan pratinjau (17.3–17.5);
**E2c** penjadwal (17.6). Semua tanggal dan jam memakai zona waktu organisasi (`organizations.timezone`). Hari dalam
seminggu ditulis angka: 1 = Senin … 7 = Minggu.

### 17.1 Kalender kerja (E2a)

| Method | Path | Akses | Body / query | `data` |
|---|---|---|---|---|
| GET | `/admin/pengaturan/kalender` | Semua | | `CalendarSettings` |
| PUT | `/admin/pengaturan/kalender` | Admin+ | `{ workdays: number[] }` | `null` |
| POST | `/admin/pengaturan/kalender/shift` | Admin+ | `ShiftRequest` | `null` (201) |
| PUT | `/admin/pengaturan/kalender/shift/{id}` | Admin+ | `ShiftRequest` | `null` |
| DELETE | `/admin/pengaturan/kalender/shift/{id}` | Admin+ | | `null` |
| GET | `/admin/pengaturan/kalender/hari` | Semua | `year` (opsional) | `CalendarDay[]`, urut tanggal |
| POST | `/admin/pengaturan/kalender/hari` | Admin+ | `CalendarDayRequest` | `null` (201) |
| POST | `/admin/pengaturan/kalender/hari/impor` | Admin+ | `multipart/form-data`: `file` | `ImportResult` |
| DELETE | `/admin/pengaturan/kalender/hari/{id}` | Admin+ | | `null` |

```ts
export type DayKind = "holiday" | "workday";

export type WorkShift = {
  id: string;
  name: string;
  /** "HH:MM"; jam selesai lebih kecil dari jam mulai berarti melewati tengah malam */
  start_time: string;
  end_time: string;
  /** 1 = Senin … 7 = Minggu */
  weekdays: number[];
};

export type ShiftRequest = Omit<WorkShift, "id">;

export type CalendarSettings = {
  timezone: string;
  workdays: number[];
  shifts: WorkShift[];
  can_edit: boolean;
};

export type CalendarDay = {
  id: string;
  date: string;
  /** holiday = libur; workday = hari kerja pengganti */
  kind: DayKind;
  name: string;
  /** Label bebas milik organisasi, mis. "Libur nasional" */
  label: string;
};

export type CalendarDayRequest = Omit<CalendarDay, "id">;

export type ImportResult = { added: number; updated: number; errors: string[] };
```

- Organisasi baru memakai hari kerja Senin–Jumat, tanpa shift dan tanpa tanggal khusus. Tidak ada libur bawaan negara
  mana pun. `can_edit` benar untuk pemilik dan admin.
- `workdays`: minimal satu hari, nilai 1–7; server membuang yang berulang dan mengurutkannya. Berlaku juga untuk
  `weekdays` shift.
- Shift: `name` 2–60 karakter, unik per organisasi tanpa membedakan huruf besar (`409`); `start_time` dan `end_time`
  berbentuk `HH:MM` (00:00–23:59) dan tidak boleh sama; jam selesai yang lebih kecil berarti melewati tengah malam.
  Tidak ada batas jumlah. Daftar diurutkan menurut jam mulai lalu nama.
- Shift yang masih dipakai tugas rutin (waktu terkait shift) tidak bisa dihapus: `409` dengan judul tugasnya (E2b).
- Tanggal khusus: satu per tanggal per organisasi; isian baru untuk tanggal yang sama **menggantikan** yang lama.
  `name` 2–120, `label` ≤ 60 (bebas). `holiday` = libur untuk semua hari dan shift; `workday` = hari kerja pengganti
  untuk semua hari dan shift. `year` empat angka; kosong atau tidak dikenal berarti semua tahun.
- Impor CSV: berkas UTF-8 (BOM diabaikan) paling besar 200 KB dan 1.000 baris isi; pemisah koma atau titik koma
  (ditentukan dari baris pertama), tanda kutip CSV dihormati. Baris pertama yang diawali `tanggal` dianggap judul
  kolom. Kolom: `tanggal` (YYYY-MM-DD), `nama`, `jenis` (opsional, disimpan sebagai `label`). `jenis` yang memuat
  "hari kerja" menjadikan baris itu `workday`; selain itu `holiday`. Baris yang salah dilewati dan disebut di
  `errors` (paling banyak 20, bentuk `"Baris 3: …"`); baris yang benar tetap disimpan. Tidak ada satu pun baris yang
  benar → `422` berisi galat pertama. Tanggal yang sudah ada dihitung `updated`.
- Setiap perubahan kalender menghitung ulang `next_run_at` semua tugas rutin organisasi (E2b).

### 17.2 Cuti anggota (E2a)

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/organisasi/pengguna/{id}/cuti` | Khusus | | `MemberLeave[]`, terbaru dulu |
| POST | `/admin/organisasi/pengguna/{id}/cuti` | Khusus | `MemberLeaveRequest` | `null` (201) |
| DELETE | `/admin/organisasi/pengguna/{id}/cuti/{cutiId}` | Khusus | | `null` |

```ts
/** Cuti anggota (E2): dipakai tugas rutin untuk pemilik role */
export type MemberLeave = { id: string; start_date: string; end_date: string; note: string };

export type MemberLeaveRequest = Omit<MemberLeave, "id">;
```

- `{id}` = ID keanggotaan. **Khusus:** pemilik dan admin untuk siapa pun; anggota hanya untuk dirinya; pemantau
  tidak pernah (`403`). Anggota organisasi lain → `404`.
- `start_date` ≤ `end_date` (satu hari: sama), `note` ≤ 200. Rentang yang bertumpuk dengan cuti lain anggota itu →
  `409`.
- Perubahan cuti menghitung ulang `next_run_at` tugas rutin organisasi (E2b).

### 17.3 Tugas rutin (E2b)

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/tugas-rutin` | Semua | | `ScheduleItem[]`, putaran terdekat dulu, tanpa putaran di akhir |
| POST | `/admin/tugas-rutin/pahami` | Anggota+ | `{ text: string }` | `ParseResponse` |
| POST | `/admin/tugas-rutin/pratinjau` | Semua | `{ rule: ScheduleRule, entry_agent_id?: string }` | `PreviewResponse` |
| POST | `/admin/tugas-rutin` | Pengelola | `CreateScheduleRequest` | `ScheduleItem` (201) |
| GET | `/admin/tugas-rutin/{id}` | Semua | | `ScheduleDetail` |
| PUT | `/admin/tugas-rutin/{id}` | Pengelola | `CreateScheduleRequest` | `ScheduleItem` |
| DELETE | `/admin/tugas-rutin/{id}` | Pengelola | | `null` |
| POST | `/admin/tugas-rutin/{id}/jeda` | Pengelola | | `ScheduleDetail` |
| POST | `/admin/tugas-rutin/{id}/lanjutkan` | Pengelola | | `ScheduleDetail` |
| POST | `/admin/tugas-rutin/{id}/jalankan` | Pengelola | | `ScheduleDetail` |
| POST | `/admin/tugas-rutin/{id}/susulan/{runId}` | Pengelola | | `ScheduleDetail` |

**Pengelola** = pemilik, admin, atau anggota yang menjadi penanggung jawab role yang dijadwalkan. Pemantau tidak
pernah. `can_manage` dihitung server. Saat `PUT` mengganti role, pengguna harus berhak atas role lama dan role baru.

```ts
export type Frequency = "daily" | "workdays" | "weekly" | "monthly" | "quarterly" | "dates";
export type TimeMode = "fixed" | "shift_start" | "shift_end";
export type OnHoliday = "skip" | "previous" | "next";
export type OnLeave = "run" | "skip";
export type OnFail = "backfill" | "skip";
export type ScheduleStatus = "draft" | "active" | "paused" | "ended";
export type RunStatus =
  | "scheduled"
  | "created"
  | "skipped_holiday"
  | "skipped_leave"
  | "missed"
  | "failed"
  | "retrying"
  | "backfill"
  | "skipped"
  | "stopped_budget";

export type ScheduleRule = {
  frequency: Frequency;
  /** Mingguan: 1 = Senin … 7 = Minggu */
  weekdays: number[];
  /** Bulanan dan triwulan: tanggal 1–31, atau 0 = hari kerja terakhir */
  month_day: number;
  /** Tanggal tertentu (YYYY-MM-DD) */
  dates: string[];
  time_mode: TimeMode;
  /** Jam tetap "HH:MM" */
  time: string;
  shift_id: string | null;
  /** Menit sebelum (negatif) atau sesudah awal/akhir shift */
  offset_minutes: number;
  /** Rentang sebar dalam menit; 0 = tepat pada jamnya */
  spread_minutes: number;
  start_date: string;
  end_date: string | null;
  on_holiday: OnHoliday;
  on_leave: OnLeave;
  on_fail: OnFail;
};

export type Occurrence = {
  date: string;
  time: string;
  status: "run" | "skipped_holiday" | "skipped_leave";
  /** Tanggal asal bila putaran digeser karena libur */
  moved_from: string | null;
  reason: string;
};

export type ScheduleRun = {
  id: string;
  planned_for: string;
  status: RunStatus;
  attempt: number;
  reason: string;
  task_id: string | null;
  task_status: TaskStatus | null;
  attachment_count: number;
};

export type ScheduleTemplate = {
  title: string;
  brief: string;
  entry_agent_id: string;
  inputs: Record<string, string>;
  priority: TaskPriority;
  budget_limit: number;
  web_search: WebSearchMode;
};

export type CreateScheduleRequest = ScheduleTemplate & {
  rule: ScheduleRule;
  source_text: string;
  status: Extract<ScheduleStatus, "draft" | "active">;
};

export type ScheduleItem = Omit<ScheduleTemplate, "entry_agent_id"> & {
  id: string;
  entry_agent: AgentRef;
  rule: ScheduleRule;
  /** Jadwal dalam satu kalimat, disusun server */
  rule_text: string;
  source_text: string;
  status: ScheduleStatus;
  next_run_at: string | null;
  last_run: ScheduleRun | null;
  created_by_name: string | null;
  can_manage: boolean;
  created_at: string;
  updated_at: string;
};

export type ScheduleDetail = ScheduleItem & { upcoming: Occurrence[]; runs: ScheduleRun[] };

export type PreviewResponse = { rule_text: string; occurrences: Occurrence[] };

export type ParseResponse = PreviewResponse & {
  rule: ScheduleRule;
  title: string;
  /** Hal yang tidak dipahami atau diasumsikan */
  notes: string[];
};
```

- Isian: `entry_agent_id` role aktif milik organisasi; `title` 5–150; `brief` ≤ 4000; `inputs` melengkapi isian wajib
  role; `budget_limit` dalam rentang batas biaya tugas (11.2); `source_text` ≤ 500; `status` `draft` atau `active`.
  Tugas rutin tidak membawa lampiran.
- `jeda`: hanya dari `active`. `lanjutkan`: dari `paused` atau `draft`; putaran selama dijeda tidak disusulkan.
  Keadaan lain → `409`.
- `jalankan`: membuat satu putaran sekarang, apa pun statusnya; jadwal berikutnya tidak bergeser. Role tidak aktif
  atau anggaran habis tidak dijawab galat: putaran dicatat `failed` atau `stopped_budget` dan `message` menyebut
  sebabnya.
- `susulan`: hanya untuk putaran `missed`, `failed`, atau `stopped_budget` (`409`). Membuat putaran `backfill` dengan
  `planned_for` yang sama; bila tugasnya terbuat, putaran lama menjadi `skipped` ("Sudah diisi susulan.").
- `DELETE` menghapus jadwal dan riwayat putarannya; tugas yang sudah dibuat tetap ada.
- Menghapus role mengakhiri jadwalnya (`ended`). Mengubah zona waktu organisasi menghitung ulang putaran
  berikutnya, sama seperti perubahan kalender dan cuti.
- `runs` paling banyak 100 putaran terbaru. `last_run` = putaran terbaru, tanpa susulan yang masih menunggu.
  Menghapus role juga membatalkan susulan dan coba ulang yang menunggu.
- `attachment_count` = jumlah lampiran pada tugas putaran itu.

### 17.4 Aturan jadwal dan penghitungan putaran (E2b)

Penghitungan tanggal sepenuhnya di server; AI tidak menghitung tanggal.

Pemeriksaan `rule` (`422`): `start_date` wajib; `end_date` tidak sebelum `start_date`; `weekly` memerlukan
`weekdays`; `dates` berisi 1–100 tanggal; `month_day` 0–31; `fixed` memerlukan `time` `HH:MM`; `shift_start` dan
`shift_end` memerlukan `shift_id` milik organisasi; `spread_minutes` 0–240; `offset_minutes` −720 sampai 720.

**Hari kerja** sebuah tanggal: tanggal khusus menang (`holiday` bukan hari kerja, `workday` hari kerja); selain itu
mengikuti hari shift (jadwal terkait shift) atau hari kerja organisasi.

**Tanggal yang diminta:**

| `frequency` | Tanggal |
|---|---|
| `daily` | Setiap tanggal; hanya libur di kalender yang kena aturan libur, bukan libur mingguan |
| `workdays` | Setiap hari kerja, ditambah libur di kalender yang jatuh pada hari yang biasanya kerja (agar aturan libur berlaku) |
| `weekly` | Hari yang dipilih |
| `monthly` | `month_day` tiap bulan (melebihi panjang bulan → hari terakhir); 0 = hari kerja terakhir |
| `quarterly` | Sama dengan bulanan, pada bulan ke-0, 3, 6, 9 dihitung dari bulan `start_date` |
| `dates` | Tanggal yang disebut |

- Tanggal yang bukan hari kerja mengikuti `on_holiday`: `skip` (dicatat dilewati dengan alasannya), `previous`
  (hari kerja sebelumnya), atau `next` (berikutnya). Pencarian paling jauh 31 hari. Dua tanggal yang bergeser ke hari
  yang sama hanya menghasilkan satu putaran. `moved_from` berisi tanggal asal.
- **Jam:** `fixed` memakai `time`; `shift_start` dan `shift_end` memakai jam shift ditambah `offset_minutes`. Akhir
  shift yang melewati tengah malam jatuh pada hari berikutnya. `date` dan `time` pada `Occurrence` adalah saat putaran
  benar-benar jalan; aturan libur dan cuti memakai tanggal shiftnya.
- **Sebaran:** tambahan 0–`spread_minutes` menit yang tetap untuk pasangan jadwal dan tanggal (turunan hash, bukan
  acak). Jadwal yang belum disimpan memakai sebaran sementara.
- **Cuti:** bila penanggung jawab role cuti pada tanggal itu: `on_leave: "skip"` → `skipped_leave`; `"run"` → tetap
  jalan, `reason` menyebut persetujuan menunggu pemilik kembali.
- `next_run_at` = putaran `run` terdekat sesudah sekarang, hanya untuk status `active`. Jadwal aktif yang tidak punya
  putaran lagi menjadi `ended`.
- `upcoming` dan `PreviewResponse.occurrences`: sampai 5 putaran `run` berikutnya beserta yang dilewati di antaranya
  (paling banyak 20 butir). Pratinjau tanpa `entry_agent_id` tidak memeriksa cuti.
- `rule_text` disusun server, mis. "Setiap hari kerja pukul 16.05, libur dilewati."

### 17.5 Memahami kalimat jadwal (E2b)

- `text` 8–500 karakter. Satu panggilan model per permintaan, keluaran terstruktur berbentuk aturan, dicatat di
  `llm_calls` dengan `kind: "schedule_parse"` dan ikut anggaran bulanan (habis → `409`). Model diberi tanggal hari ini,
  zona waktu, hari kerja, dan nama shift organisasi.
- Server memeriksa hasilnya dengan aturan 17.4. Bagian yang tidak sah atau tidak disebut diganti nilai bawaan dan
  disebut di `notes`; model tidak boleh membuat shift atau role. `title` ≤ 150, boleh kosong.
- Hasilnya hanya usulan: tidak ada yang disimpan sampai pengguna menyimpan jadwalnya.
- Memakai model profil cepat, lalu cadangan.
- Model gagal atau jawabannya tidak bisa dibaca → `503` dengan pesan agar mencoba lagi atau mengisi formulir.
- `UsagePurpose` (16.8) bertambah `schedule_parse` ("Memahami jadwal"), sehingga `usage_today` menjadi enam baris.

### 17.6 Penjadwal dan putaran (E2c)

- Celery beat menjalankan `dispatch_schedules` setiap menit (antrean `default`). Setiap jadwal atau putaran diproses
  dalam transaksinya sendiri dengan `FOR UPDATE SKIP LOCKED`. Satu jadwal tidak menghasilkan dua putaran terjadwal
  untuk `planned_for` yang sama. Satu kegagalan tidak menghentikan yang lain.
- Semua kejadian sejak terakhir diproses dicatat: putaran jalan, dan yang dilewati (`skipped_holiday`,
  `skipped_leave`) segera sesudah waktunya. Menyimpan, melanjutkan, atau mengubah kalender memulai hitungan dari saat
  itu; putaran selama dijeda tidak dicatat.
- Terlambat kurang dari 6 jam tetap dijalankan. Lebih lama dicatat `missed`.
- Tugas putaran adalah tugas biasa (role, relasi, persetujuan, kantor). Pembuatnya pembuat jadwal (`jalankan` dan
  `susulan`: pengguna yang menekan); bila tidak aktif atau pemantau, penanggung jawab role, lalu pemilik organisasi.
  Batas biaya tugas tidak melebihi batas bulanan.
- Organisasi yang ditangguhkan tidak diproses. Anggaran bulanan habis → `stopped_budget` (tanpa coba ulang).
- Putaran gagal (role tidak aktif, isian wajib baru, atau tugasnya berakhir gagal) dicoba ulang 2 kali, 15 menit
  lalu 1 jam (`retrying`, `attempt` bertambah, `task_id` menunjuk tugas terakhir). Sesudah itu `failed`. Coba ulang
  yang terlambat 6 jam atau lebih langsung `failed`.
- Tugas yang gagal karena **ditolak manusia** pada persetujuan menjadi `failed` tanpa coba ulang, susulan, atau
  email. Tugas yang dihentikan pengguna tidak ditindaklanjuti.
- Putaran manual (`jalankan` dan `susulan`) tidak dicoba ulang otomatis, tidak disusulkan, dan tidak dikirimi email,
  kecuali anggaran habis tetap tercatat `stopped_budget`.
- **Susulan otomatis:** putaran terjadwal yang `missed` atau `failed` pada jadwal `on_fail: "backfill"` mendapat satu
  putaran `scheduled` pada hari kerja berikutnya di jam yang sama, yang saat jalan menjadi `backfill`. Beberapa
  putaran terlewat dengan waktu susulan sama cukup satu susulan. Susulan yang gagal tidak disusulkan lagi.
- Jadwal yang dijeda menahan susulan dan coba ulang yang menunggu. `susulan` manual membatalkan susulan otomatis
  putaran itu.
- **Pemberitahuan:** `failed` dan `stopped_budget` (selain manual) dikirim ke email penanggung jawab role (bila tidak
  ada atau tidak aktif: pembuat jadwal, lalu pemilik organisasi) lewat antrean email yang sudah ada.

### 17.7 Pengaturan server, batas laju, dan jejak audit

| `.env` | Bawaan | Dipakai untuk |
|---|---|---|
| `RATE_SCHEDULE_PARSE_PER_MINUTE` | 10 | Memahami kalimat jadwal, per pengguna |

Jejak audit baru: `kalender.ubah` (hari kerja, shift, tanggal khusus, impor), `cuti.ubah` (tambah dan hapus cuti,
sasaran = nama anggota), dan mulai E2b `rutin.ubah` (buat, ubah, hapus, jeda, lanjutkan) serta `rutin.jalankan`
(jalankan sekarang dan susulan). Memahami dan pratinjau tidak dicatat. Catatan cuti dan arahan tugas tidak dicatat.

### 17.8 Khusus data contoh

Hanya simulasi, jangan ditiru backend: impor CSV memecah baris pada setiap koma atau titik koma (termasuk di dalam
tanda kutip) dan tidak membatasi jumlah baris; tanggal dan jam memakai jam peramban; kalimat dipahami dengan pola tetap;
sebaran memakai hash sederhana; akhir shift lintas tengah malam belum pindah hari; libur di akhir pekan masih ikut
dihitung untuk `workdays`; tidak ada coba ulang, susulan otomatis, atau email; `jalankan` dan `susulan` membuat tugas
simulasi.

## 18. Surat dan berkas hasil (E3a)

Ditambahkan pada fase E (rancangan di `PLANNING.md`, bagian "E3. Surat dan berkas hasil"). Hasil tugas yang berupa
surat menjadi berkas DOCX dan PDF. Tidak ada templat wajib dan tidak ada penanda isian. Semua rujukan, catatan
format, kop, contoh, dan nomor milik satu organisasi.

### 18.1 Berkas hasil

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/tugas/{id}/berkas` | Semua | | `ResultDocument[]` |
| POST | `/admin/tugas/{id}/berkas/{berkasId}/koreksi` | Anggota+ | `{ text: string }` | `ResultDocument` |
| POST | `/admin/tugas/{id}/berkas/{berkasId}/nomor` | Pemberi nomor | | `ResultDocument` |
| GET | `/admin/tugas/{id}/berkas/{berkasId}/halaman/{n}` | Semua | | gambar halaman |
| GET | `/admin/tugas/{id}/berkas/{berkasId}/unduh/{docx|pdf}` | Semua | | berkas |

```ts
/** Pemeriksaan hasil terhadap ketentuan rujukan */
export interface DocumentCheck {
  text: string;
  passed: boolean;
  /** Letak ketentuannya, mis. "Aturan, hlm. 14"; boleh kosong */
  ref: string;
}

/** Berkas hasil tugas (E3a); dibuat program dari susunan yang ditulis role */
export interface ResultDocument {
  id: string;
  title: string;
  letter_type: string;
  format_id: string | null;
  version: number;
  /** Diberikan saat surat disetujui; null sebelum itu */
  number: string | null;
  /** Benar bila pengguna ini boleh memberi nomor sekarang */
  can_number: boolean;
  /** Gambar tiap halaman PDF */
  pages: string[];
  docx_url: string | null;
  pdf_url: string | null;
  sources: LetterSource[];
  format_checked: boolean;
  /** Benar bila formatnya bersumber dari aturan atau contoh resmi organisasi */
  official: boolean;
  checks: DocumentCheck[];
  created_at: string;
  updated_at: string;
}
```

- `pages`, `docx_url`, dan `pdf_url` berisi alamat dua endpoint terakhir; hanya bisa dibuka dengan sesi anggota
  organisasi itu. Nama unduhan = judul berkas yang sudah dibersihkan.
- **Permintaan membuat surat** ("buat/susun/siapkan … surat, undangan, nota dinas, edaran") tetap dikerjakan walau
  tidak ada potongan aturan: model dipanggil, diberi tahu bahwa belum ada aturan persuratan, dan dilarang mengarang
  data. Pertanyaan lain tanpa potongan tetap tidak memanggil model.
- **Kapan berkas dibuat.** Jawaban model untuk langkah kerja boleh memuat objek `letter` bila hasilnya surat: jenis
  naskah, sifat, lampiran, hal, tujuan, isi berupa blok berurutan (paragraf, daftar, tabel, pasangan label-nilai),
  penutup, jabatan dan nama penanda tangan, serta tembusan. Tidak ada panggilan model tambahan untuk isinya. Program
  memeriksa panjang dan jumlah blok; isi yang tidak sah diabaikan dan hasil teks tetap tersimpan.
- Satu berkas per pasangan tugas dan role; hasil revisi menaikkan `version` pada berkas yang sama. `title` = judul
  tugas.
- Program membuat DOCX (python-docx) dari isi dan catatan format, lalu LibreOffice membuat PDF dan gambar halaman
  dibuat dari PDF. Bila PDF gagal, `pdf_url` `null`, `pages` kosong, pemeriksaan menyebutnya, dan DOCX tetap ada.
- Model **tidak** menulis nomor surat dan tidak membubuhkan tanda tangan. Nama pejabat yang tidak ada di rujukan atau
  arahan dikosongkan.
- `processing` benar selama format, nomor otomatis, atau berkas masih dikerjakan; halaman membaca ulang selama itu.
- `checks` dihitung program: bagian wajib menurut catatan format ada, penanda tangan terisi, nomor dari register, PDF
  terbuat.
- `official` benar bila salah satu sumber berjenis `rule` atau `sample`.

### 18.2 Nomor surat

- Nomor diberikan **otomatis** saat tugas menjadi `completed` dan sedikitnya satu persetujuan tugas itu disetujui
  manusia.
- Tugas yang selesai tanpa persetujuan manusia tidak mendapat nomor sendiri. **Pemberi nomor** (pemilik, admin, atau
  penanggung jawab role pembuat berkas) menekan `nomor`. `can_number` benar bila tugas `completed`, belum bernomor,
  dan pengguna termasuk pemberi nomor; selain itu endpoint dijawab `409` (belum selesai atau sudah bernomor) atau
  `403`.
- Satu register per jenis naskah per organisasi. Pola boleh memuat `[urut]` (wajib, tiga angka), `[bulan]` (angka
  Romawi), dan `[tahun]`, menurut zona waktu organisasi. Urutan kembali ke 1 saat tahun berganti. Pola awal diambil
  dari rujukan; bila tidak ada, `[urut]/[bulan]/[tahun]`.
- Baris register dikunci saat nomor diambil, dan nomor unik per register: dua persetujuan bersamaan tidak
  menghasilkan nomor sama. Nomor yang sudah terbit tidak dipakai ulang walau tugasnya dihapus.
- Sesudah bernomor, DOCX dan PDF dibuat ulang dengan nomornya. **Surat bernomor tidak bisa diubah** (`409` pada
  koreksi); isi baru memakai tugas baru.

### 18.3 Catatan format dan koreksi

- Saat sebuah jenis naskah **pertama kali** dibuat di organisasi itu, server menyusun catatan format dari sumber
  pertama yang tersedia:
  1. `rule`: potongan pengetahuan organisasi tentang persuratan (pustaka kebijakan didahulukan);
  2. `sample`: contoh surat Word (nama berkas yang memuat jenis naskahnya, selain itu yang terbaru): ukuran kertas,
     margin, huruf, dan kop dibaca langsung dari berkasnya;
  3. `internet`: pencarian (16.7), hanya bila role dan tugas mengizinkan internet;
  4. `general`: A4, margin atas 2,5, kanan 2, bawah 2,5, kiri 3 cm, Arial 12 pt.

  Aturan menentukan ketentuan dan contoh menentukan tampilan; keduanya dicantumkan di `sources`. Pertentangan
  disebut di `checks`.
- Penyusunan memakai **satu** panggilan model (tidak ada bila hanya contoh Word atau `general`), dicatat dengan `kind: "letter_format"`.
  Server memeriksa hasilnya: margin 0,5–5 cm, huruf 8–16 pt, susunan bagian dari daftar yang dikenal; yang tidak sah
  memakai nilai bawaan. Model gagal → format `general`, tugas tetap jalan.
- `koreksi`: teks 5–300 karakter. Satu panggilan model mengubah catatan format (kertas, margin, huruf, urutan bagian,
  posisi tanggal, tanda tangan, dan tembusan). Koreksi yang tidak bisa diterapkan → `422` dan tidak disimpan. Bila
  berhasil: koreksi dicatat, `checked` kembali `false`, berkas dibuat ulang dengan `version` naik. Isi surat tidak
  diubah lewat koreksi.
- Perubahan catatan format tidak mengubah berkas lain yang sudah ada.

### 18.4 Pengaturan persuratan

| Method | Path | Akses | Body | `data` |
|---|---|---|---|---|
| GET | `/admin/pengaturan/persuratan` | Semua | | `LetterSettings` |
| PUT | `/admin/pengaturan/persuratan/format/{id}` | Admin+ | `{ checked: boolean }` | `null` |
| DELETE | `/admin/pengaturan/persuratan/format/{id}` | Admin+ | | `null` |
| DELETE | `/admin/pengaturan/persuratan/format/{id}/koreksi/{koreksiId}` | Admin+ | | `null` |
| POST | `/admin/pengaturan/persuratan/kop` | Admin+ | `multipart/form-data`: `file`, `unit_id` (opsional) | `null` (201) |
| GET | `/admin/pengaturan/persuratan/kop/{id}/gambar` | Semua | | gambar |
| DELETE | `/admin/pengaturan/persuratan/kop/{id}` | Admin+ | | `null` |
| PUT | `/admin/pengaturan/persuratan/register/{id}` | Admin+ | `RegisterRequest` | `null` |
| POST | `/admin/pengaturan/persuratan/contoh` | Admin+ | `multipart/form-data`: `file` | `null` (201) |
| DELETE | `/admin/pengaturan/persuratan/contoh/{id}` | Admin+ | | `null` |

```ts
/** Urutan rujukan format surat (E3a): aturan, contoh Word, internet, lalu bentuk umum */
export type LetterSourceKind = "rule" | "sample" | "internet" | "general";

export type LetterSource = {
  kind: LetterSourceKind;
  title: string;
  /** Letak di rujukan, mis. "hlm. 14"; boleh kosong */
  detail: string;
  url: string | null;
  document_id: string | null;
};

export type FormatCorrection = { id: string; text: string; author_name: string; created_at: string };

/** Catatan format satu jenis naskah, disusun saat pertama kali diminta */
export type LetterFormat = {
  id: string;
  name: string;
  paper: string;
  /** Sentimeter */
  margins: { top: number; right: number; bottom: number; left: number };
  font: string;
  sections: string[];
  sources: LetterSource[];
  checked: boolean;
  corrections: FormatCorrection[];
  updated_at: string;
};

export type Letterhead = { id: string; unit_id: string | null; unit_name: string | null; image_url: string; created_at: string };

export type IssuedNumber = { number: string; title: string; task_id: string; issued_at: string };

export type NumberRegister = {
  id: string;
  name: string;
  /** Boleh memuat [urut], [bulan], dan [tahun]; [urut] wajib */
  pattern: string;
  next_number: number;
  /** Contoh nomor berikutnya menurut pola */
  preview: string;
  issued: IssuedNumber[];
};

export type RegisterRequest = { pattern: string; next_number: number };

export type LetterSample = { id: string; file_name: string; size_bytes: number; uploaded_by_name: string | null; created_at: string };

export type LetterSettings = {
  formats: LetterFormat[];
  letterheads: Letterhead[];
  registers: NumberRegister[];
  samples: LetterSample[];
  can_edit: boolean;
};
```

- Menghapus catatan format: berkas yang sudah ada tetap; catatan disusun lagi saat surat berikutnya. Menghapus satu
  koreksi hanya menghapus catatannya, tata letak yang sudah berubah tidak dikembalikan (gunakan susun ulang).
- Kop: PNG atau JPG ≤ 2 MB, ditulis ulang oleh server (metadata dibuang); satu per organisasi atau unit, unggahan
  baru menggantikan. Surat memakai kop unit role, lalu kop organisasi, lalu kop dari contoh Word, lalu teks nama
  organisasi. Halaman saat ini mengelola kop organisasi saja.
- Register: `pattern` ≤ 80 karakter memuat `[urut]`; `next_number` 1–999999 (`422`). Nomor hasil yang sudah pernah
  terbit → `409`. `preview` = nomor berikutnya hari ini; `issued` = 50 terbaru.
- Contoh: `.docx` ≤ 10 MB, isi terurai ≤ 50 MB, tanpa makro (`422`).

### 18.5 Keamanan pengolahan berkas

Berkas dari tenant dianggap tidak tepercaya. LibreOffice dijalankan sebagai proses terpisah tanpa layar, dengan
profil sementara, makro dan pembaruan tautan luar dimatikan, serta batas waktu. Berkas disimpan per organisasi di
folder unggahan. Isi rujukan dan contoh masuk prompt sebagai data, bukan perintah.

### 18.6 Pengaturan server, batas laju, dan jejak audit

| `.env` | Bawaan | Dipakai untuk |
|---|---|---|
| `LIBREOFFICE_PATH` | dicari otomatis | Program `soffice` |
| `DOCUMENT_CONVERT_TIMEOUT_SECONDS` | 60 | Batas waktu membuat PDF |
| `RATE_LETTER_CORRECTION_PER_MINUTE` | 10 | Koreksi format, per pengguna |

`UsagePurpose` (16.8) bertambah `letter_format` ("Format surat"), sehingga `usage_today` menjadi tujuh baris.

Jejak audit baru: `surat.koreksi`, `surat.nomor` (memberi nomor dan mengubah register), dan `surat.pengaturan`
(catatan format, kop, contoh). Isi surat tidak dicatat.

### 18.7 Khusus data contoh

Hanya simulasi, jangan ditiru backend: surat dikenali dari kata di judul atau arahan; isi dan pemeriksaan memakai
pola tetap; halaman berupa gambar SVG; DOCX berupa HTML berekstensi `.doc` dan PDF tidak ada; koreksi hanya memahami
letak tembusan; pola awal register dikarang; urutan tidak diulang per tahun; berkas dibuat saat pertama dibaca.

## 19. Spreadsheet (E3b)

Ditambahkan pada fase E (rancangan di `PLANNING.md`, bagian "E3b. Spreadsheet: rancangan"). Role merancang tabel;
program membaca datanya, mengisi semua baris, menulis rumus, dan menghitung. Model tidak menghitung dan tidak menulis
rumus.

### 19.1 Lampiran data

`POST /admin/tugas/lampiran` (16.6) juga menerima Excel (`.xlsx`) dan CSV.

```ts
export interface TableSummary {
  name: string;
  columns: string[];
  row_count: number;
}
```

- `TaskAttachment` mendapat `table: TableSummary[] | null` (satu per lembar berisi data); `null` untuk gambar dan PDF.
  Lampiran data punya `width`, `height`, dan `page_count` 0 serta `pages` kosong.
- Baris pertama yang berisi menjadi judul kolom. Judul kosong menjadi `Kolom N`, judul kembar diberi nomor.
- Batas: 10 MB; isi XLSX terurai 50 MB; 10 lembar berisi data; 50 kolom per lembar; 5.000 baris data per berkas;
  sel 1.000 karakter. Melewati batas, tanpa baris data, bermakro, rusak, atau terkunci → `422` dengan alasannya.
- XLSX: nilai sel yang dipakai (hasil tersimpan untuk sel berumus; rumus tanpa hasil tersimpan terbaca kosong).
  CSV: pemisah koma, titik koma, atau tab; UTF-8 atau Windows-1252.
- Jenis kolom (`teks`, `angka`, `tanggal`) ditentukan program. Angka bertulisan Indonesia (`Rp 1.250.000`, `12,5`,
  `45%`) dikenali. Angka berawalan nol atau lebih dari 15 digit (NIP, telepon) tetap teks.

### 19.2 Yang dilihat role

- Role hanya menerima, per lembar (`D1`, `D2`, …): nama berkas dan lembar, nama dan jenis kolom, jumlah baris, dan
  paling banyak 5 baris contoh; paling banyak 10 lembar per langkah. Sisa baris tidak dikirim ke model. Isinya masuk prompt sebagai data, bukan perintah.
- Lampiran data dibaca langkah yang sama dengan lampiran gambar (16.6).
- Model dipanggil walau tidak ada potongan dokumen bila ada lampiran data, atau arahan meminta dibuatkan
  Excel/spreadsheet.
- Rancangan tabel (`sheet` di jawaban model) hanya diminta bila ada lampiran data atau judul/arahan menyebut rekap,
  Excel, atau spreadsheet. Tidak ada panggilan model tambahan.
- Uji coba role membaca ringkasan data yang sama, tetapi tidak membuat berkas.

### 19.3 Rancangan tabel dan perhitungan

Per lembar hasil (maksimal 10, kolom maksimal 30):

| Isian | Arti |
|---|---|
| sumber | Lembar data yang dipakai (`D1`, …) |
| kolom | Judul, kolom data asalnya **atau** operasi antar kolom sebelumnya (`add`, `subtract`, `multiply`, `divide`), format (`text`, `number`, `currency`, `percent`, `date`), dan total (`sum`, `average`, `count`, `min`, `max`, `none`) |
| kelompok | Satu kolom; tiap kelompok diberi baris subtotal |
| urutan | Satu kolom, naik atau turun; di dalam kelompok |
| penanda | Satu kolom, pembanding (`lt`, `lte`, `gt`, `gte`, `eq`, `ne`, `empty`), dan nilai |

- Bila ada lampiran data, setiap lembar wajib memakai sumber data; **semua baris** diambil dari berkas asli. Nilai
  yang diketik model diabaikan.
- Tanpa lampiran data, baris boleh diisi model dari arahan atau dokumen (maksimal 200), `origin` = `text`.
- Bagian rancangan yang tidak sah diabaikan dan disebut di `checks`. Tanpa satu pun lembar sah, tidak ada berkas;
  hasil teks tetap tersimpan.
- Excel memuat rumus: operasi antar kolom (pembagian dengan nol atau operand kosong menghasilkan kosong), subtotal
  dan total memakai `SUBTOTAL`. Pada baris subtotal dan total, kolom hasil bagi, tambah, dan kurang dihitung ulang
  dari total kolomnya; hasil kali dijumlahkan.
- Teks yang diawali `=` disimpan sebagai teks. Nama lembar dibersihkan dan dibuat unik.
- LibreOffice membuka dan menyimpan ulang berkas untuk menghitung rumus; hasilnya dicocokkan dengan hitungan program.
  Bila LibreOffice gagal, berkas berumus tetap tersedia (dihitung saat dibuka) dan `checks` menyebutnya.

### 19.4 Berkas hasil

`GET /admin/tugas/{id}/berkas` mengembalikan `ResultDocument = LetterResult | SheetResult`. `LetterResult` = bentuk 18.1
ditambah `kind: "letter"`.

```ts
export type CellFormat = "text" | "number" | "currency" | "percent" | "date";

export interface SheetColumn {
  header: string;
  format: CellFormat;
  /** Rumus dalam kata, mis. "Realisasi ÷ Pagu"; kosong untuk kolom data */
  formula: string;
}

export interface SheetRow {
  /** flag = ditandai menurut aturan penanda */
  style: "normal" | "flag" | "subtotal" | "total";
  /** Nilai siap tampil, sudah dihitung dan diformat */
  cells: string[];
}

export interface SheetPreview {
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Jumlah baris data seluruhnya; pratinjau bisa lebih sedikit */
  row_count: number;
  flagged: number;
  /** Penjelasan penanda, mis. "Persentase di bawah 50%"; kosong bila tidak ada */
  flag_rule: string;
}

export interface SheetResult {
  kind: "sheet";
  id: string;
  title: string;
  version: number;
  processing: boolean;
  checks: DocumentCheck[];
  created_at: string;
  updated_at: string;
  xlsx_url: string | null;
  /** text = angkanya berasal dari arahan atau dokumen, bukan berkas data */
  origin: "attachment" | "text";
  source_files: string[];
  sheets: SheetPreview[];
}
```

| Method | Path | Akses | `data` |
|---|---|---|---|
| GET | `/admin/tugas/{id}/berkas/{berkasId}/unduh/xlsx` | Semua | berkas |

- Satu spreadsheet per pasangan tugas dan role (terpisah dari surat); revisi menaikkan `version`.
- Pratinjau memuat paling banyak 50 baris data per lembar beserta subtotal kelompoknya dan total seluruh data;
  `flagged` dihitung dari semua baris.
- `koreksi` dan `nomor` pada spreadsheet → `409`. Perubahan isi memakai minta revisi pada persetujuan.
- Pemeriksa (langkah `review`) menerima ringkasan spreadsheet pembuat: kolom, jumlah baris, penanda, dan baris total.

### 19.5 Khusus data contoh

Hanya simulasi, jangan ditiru backend: rancangan memakai pola tetap, XLSX unggahan tidak dibaca (diganti tabel
contoh), dan unduhan berupa CSV.

---

## 20. Mode penyusunan dan laporan (E3c)

Mode menentukan seberapa banyak role boleh menyusun sendiri. Rancangannya ada di `PLANNING.md` (E3c).

### 20.1 Isian dan nilai bawaan

```ts
export type ComposeMode = "data" | "complete" | "free"; // Dari data, Lengkapi, Susun bebas
export type ComposeChoice = "role" | ComposeMode;

export interface ComposedItem {
  part: string; // maks 100 karakter
  note: string; // maks 200 karakter
}
```

| Tempat | Isian | Bawaan |
|---|---|---|
| Role (`UpdateInterface`) | `compose_mode: ComposeMode` | `data` |
| Isian kerja versi role (`RevisionSnapshot`) | `compose_mode`; versi lama tanpa isian ini tidak mengubah mode role | |
| Buat tugas dan tugas rutin | `compose_mode?: ComposeChoice` | `role` |
| Detail tugas, tugas rutin | `compose_mode: ComposeChoice` | |
| Langkah tugas (`StepInterface`) | `compose_mode: ComposeMode \| null`, `composed: ComposedItem[]` | |
| Berkas hasil (semua jenis) | `composed: ComposedItem[]` | |
| Hasil uji coba role | `compose_mode: ComposeMode`, `composed: ComposedItem[]` | |

- Mode yang berlaku pada satu langkah: pilihan tugas bila bukan `role`, selain itu mode role yang mengerjakan.
- `compose_mode` dan `composed` langkah hanya terisi pada langkah kerja. Konsultasi dan pemeriksaan selalu memakai
  aturan Dari data.
- Nilai di luar daftar ditolak (422).

### 20.2 Perilaku

| | `data` | `complete` | `free` |
|---|---|---|---|
| Narasi, analisis, saran | Hanya dari data | Disusun role | Disusun role |
| Angka, tanggal, kejadian yang tidak ada | Isian kosong | Isian kosong | Boleh dibuat sebagai contoh |
| Aturan atau data tidak ditemukan | `need_info` atau `not_in_documents` | Tetap disusun | Tetap disusun |
| Isian wajib role belum diisi | Ditolak | Ditolak | Diterima |
| Tanpa potongan dokumen | Model tidak dipanggil, kecuali surat, tabel, atau laporan | Model dipanggil | Model dipanggil |

- Isian wajib diperiksa saat membuat tugas, menyimpan tugas rutin, dan saat putaran rutin berjalan, memakai mode yang
  berlaku bagi role pertama.
- Pada `complete` dan `free`, jawaban model hanya bisa berstatus `done`.
- Di semua mode role dilarang mengarang nama orang, NIP, tanda tangan, nomor surat, dan nomor peraturan.
- `composed` ditulis model dan dibersihkan server (maksimal 20 butir); pada `data` selalu kosong. Pada `free`, bila
  langkah tidak punya dasar apa pun (potongan dokumen, lampiran, data, internet) dan model tidak mendaftarkan apa pun,
  server menambahkan butir "Isi dokumen".
- Daftar itu berasal dari laporan model, jadi bisa tidak lengkap; karena itu ditampilkan untuk diperiksa.
- Linimasa: pesan selesai langkah kerja menyebut mode dan jumlah bagian buatan, mis.
  `"Sari menyelesaikan pekerjaan (mode Susun bebas, 2 bagian disusun sendiri)."`
- Role pemeriksa menerima mode pembuat dan daftar `composed`. Isi buatan yang terdaftar dan sesuai modenya tidak
  menjadi alasan revisi.

### 20.3 Persetujuan "Ada isi buatan role"

- `ApprovalReason` bertambah `composed`.
- Dibuat saat tugas tidak punya pekerjaan dan persetujuan lain yang tertunda, untuk hasil kerja **terakhir** tiap role
  yang bermode `free` dengan `composed` tidak kosong dan belum pernah dimintakan. Diminta kepada penanggung jawab role.
- `approved`: tugas lanjut atau selesai. `revise`: role pembuat mengerjakan ulang; hasil barunya dimintakan lagi.
  `rejected`: sama seperti persetujuan lain.
- Surat yang disetujui lewat jalur ini mendapat nomor seperti 18.2.

### 20.4 Laporan, notulen, proposal

- Diminta bila judul atau arahan memuat permintaan membuat laporan, notula, notulen, atau proposal, dan bukan
  permintaan surat atau spreadsheet. Tidak ada panggilan model tambahan.
- Pada `data` tanpa potongan dokumen, model tetap dipanggil: isinya dari arahan, isian, bahan, dan lampiran; bila
  tidak ada data sama sekali jawabannya `need_info`.
- Program membuat DOCX dan PDF (A4, bentuk umum, kop unit atau organisasi bila ada). Tanpa nomor register dan tanpa
  catatan format. Isi yang diawali tanda apa pun disimpan sebagai teks biasa.
- Satu laporan per pasangan tugas dan role; revisi menaikkan `version`.

`ResultDocument = LetterResult | SheetResult | ReportResult`.

```ts
export interface ReportResult {
  kind: "report";
  id: string;
  title: string;
  version: number;
  processing: boolean;
  checks: DocumentCheck[];
  composed: ComposedItem[];
  created_at: string;
  updated_at: string;
  report_type: string; // mis. "Laporan", "Notulen", "Proposal"
  pages: string[];
  docx_url: string | null;
  pdf_url: string | null;
}
```

- Unduhan memakai jalur 18.1 (`/unduh/docx`, `/unduh/pdf`). Koreksi format dan beri nomor → 409.
- Format laporan menurut aturan organisasi dan lampiran surat otomatis belum termasuk.

### 20.5 Khusus data contoh

Hanya simulasi, jangan ditiru backend: daftar bagian buatan memakai isi tetap menurut mode, dan halaman laporan
digambar sederhana dari judul dan arahan.

