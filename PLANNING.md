# Rencana Pengembangan MBUTI

Diperbarui: 28 November 2026. Status: **A0–A7 selesai** (kerangka, identitas visual lebah, organisasi, unit, pengguna, role dengan karakter 3D, pengetahuan, peta relasi, tugas dan persetujuan, kantor 3D, dashboard dan pengaturan). **A8 selesai**: kontrak API disetujui beserta keputusannya. Fase A selesai. **B0–B6 selesai** (kerangka backend; auth, organisasi, unit, pengguna; role dan peta relasi; pengetahuan; pengaturan dan eksekusi satu role; tugas lintas role, persetujuan, kantor, dan dashboard; frontend tersambung ke backend). Fase B selesai. **Fase C**: pengerasan dan dokumentasi selesai; pemasangan di server menunggu server tujuan. **Fase D**: D1 (akun mandiri) selesai. **Fase E** (role sebagai pekerja) disepakati 27 November 2026; E1 selesai (halaman, kontrak API, backend E1a–E1d) dan migrasinya terpasang di mbuti; pencarian internet belum berhasil dicoba karena kuota; rancangan E2 disepakati dan sedang dikerjakan.

MBUTI (Multi-agent Business & Unified Task Intelligence) adalah platform untuk menyusun organisasi virtual berisi **role AI**. Setiap role bekerja berdasarkan SOP, manual book, dan panduan kerja yang diunggah, lalu berhubungan dengan role lain lewat relasi yang bisa diatur sendiri (menyerahkan, memeriksa, berkonsultasi, eskalasi ke manusia).

Berkas ini satu-satunya rencana aktif. Centang butir setelah hasilnya diverifikasi. Bagian 13 berisi keputusan yang masih terbuka.

---

## 1. Prinsip

1. **Frontend dulu, backend kemudian.** Seluruh layar dibangun dan disepakati dengan data contoh. Bentuk data di frontend menjadi kontrak API yang kemudian diikuti backend.
2. **Agen bekerja dari dokumen.** Setiap hasil kerja menyertakan rujukan ke dokumen dan halaman atau bagian. Jika aturan tidak ada di dokumen, agen mengatakannya, bukan menebak.
3. **Manusia tetap memegang keputusan.** Setiap alur bisa diberi titik persetujuan manusia. Agen tidak mengirim apa pun keluar sistem pada versi pertama. Fase E melonggarkannya untuk role yang diberi alat.
4. **Selalu ada batas.** Batas putaran revisi, jumlah langkah, dan biaya per tugas mencegah agen saling melempar pekerjaan tanpa henti.
5. **Pola kode mengikuti edusetara** (`github.com/lowhanfish/edusetara`, commit acuan `38f214d`), kecuali bagian yang disebut di bagian 3.
6. **Tanpa Docker.** Backend memakai `venv` dan `uvicorn`; layanan lain dipasang langsung di mesin.

## 2. Istilah

| Istilah di layar | Nama di kode | Arti |
|---|---|---|
| Organisasi | `organization` | Ruang kerja satu instansi atau usaha |
| Unit / Divisi | `unit` | Kelompok role, bisa bertingkat; tampil sebagai ruangan di kantor 3D |
| Role | `agent` | Karyawan AI dengan tujuan, instruksi, dokumen, dan format hasil |
| Relasi | `agent_relation` | Garis antara dua role beserta aturannya |
| Tugas | `task` | Pekerjaan yang diberikan manusia, berjalan melewati satu atau lebih role |
| Langkah | `task_step` | Satu kali kerja sebuah role dalam satu tugas |
| Hasil | `artifact` | Keluaran sebuah langkah (teks, tabel, berkas) |
| Pemeriksaan | `review` | Penilaian role pemeriksa: diterima atau perlu revisi |
| Persetujuan | `approval` | Keputusan manusia pada titik yang ditentukan |
| Pengguna | `user` | Manusia yang masuk ke aplikasi |
| Hak akses | `access_role` | Peran pengguna: pemilik, admin, anggota, pemantau |

Nama `agent` dipakai di kode karena kata "role" sudah dipakai untuk hak akses pengguna.

## 3. Stack

| Bagian | Pilihan | Catatan |
|---|---|---|
| Frontend | Next.js (App Router), React, TypeScript strict | Versi stabil terbaru saat kerangka dibuat; baca dokumentasi di `node_modules/next/dist/docs/` sebelum menulis kode |
| Gaya | Tailwind CSS | Komponen UI bersama seperti edusetara |
| Data | TanStack Query | Daftar, opsi, mutasi, invalidasi cache |
| State global | Zustand | Sesi, URL API, organisasi aktif, preferensi tampilan |
| Notifikasi | SweetAlert2 | Seperti edusetara |
| Peta relasi | React Flow (`@xyflow/react`) | Editor node dan garis |
| Kantor 3D | Three.js lewat `@react-three/fiber` dan `@react-three/drei` | Karakter blok buatan sendiri |
| Backend | Python 3.12, FastAPI, Pydantic v2 | Dijalankan dengan `uvicorn` di dalam `venv` |
| ORM | SQLAlchemy 2 async, gaya `Column()` | Alembic untuk migrasi |
| Database | PostgreSQL 17 atau lebih baru + pgvector | Driver `psycopg` 3 (async); pengembangan memakai Neon |
| Antrean | Celery + Redis | Worker untuk olah dokumen dan eksekusi agen |
| Model AI | Google Gemini lewat SDK `google-genai` | Nama model diatur di `.env`, tidak ditulis di kode |
| Embedding | `gemini-embedding-2`, 768 dimensi | Sama dengan Toto-L; 768 masih di bawah batas indeks HNSW pgvector (2.000) |
| Auth | JWT di cookie HttpOnly, refresh session, CSRF, Argon2id | Seperti edusetara |
| Uji | pytest, pytest-asyncio, httpx; oxlint atau ESLint, `tsc` | Uji backend memakai PostgreSQL sungguhan |

**Berbeda dari edusetara**

- MySQL diganti PostgreSQL karena pgvector hanya tersedia di PostgreSQL. Penanganan error unik memakai kode PostgreSQL `23505`, bukan MySQL `1062`.
- Next.js dijalankan biasa (`next dev`, `next build`, `next start`), tanpa vinext dan Cloudflare.
- Celery dan Redis ditambahkan.
- Tidak ditiru: pemetaan nama kolom `title`/`uraian`/`desc` di `CRUDBase`, tipe `any`, dan endpoint ganda untuk satu aksi.
- Primary key memakai UUID PostgreSQL, bukan `String(50)`.

## 4. Lingkungan pengembangan (tanpa Docker)

Kondisi mesin saat ini: Python 3.12 ada, Redis 8 sudah berjalan, Node 24 LTS (lewat nvm, versinya di `.nvmrc`). PostgreSQL tidak dipasang lokal: database pengembangan memakai server jauh (Neon, PostgreSQL 18, lewat pooler) yang alamatnya diisi di `server/.env` (`DATABASE_URL`). Ini hanya untuk pengembangan; server produksi ditentukan di fase C.

Karena database pengembangan berada di layanan luar, isi hanya dengan data dan dokumen contoh atau publik.

- [x] Siapkan PostgreSQL dengan pgvector (Neon). Pilihan lokal bila diperlukan nanti: Postgres.app atau kompilasi sumber, karena pgvector dari Homebrew tidak mendukung PostgreSQL 17.
- [x] Naikkan Node ke versi 22 LTS atau lebih baru (Node 20 sudah lewat masa dukungan). Dipilih Node 24 LTS (27 November 2026): `.nvmrc` dan `engines` di `admin/package.json`.
- [x] Buat database `mbuti` dan `mbuti_test`; ekstensi `vector` diaktifkan oleh migrasi.

Menjalankan sistem (empat terminal):

```bash
# backend
cd server && python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# worker (terminal lain, venv yang sama)
celery -A app.workers.celery_app worker --loglevel=info

# penjadwal
celery -A app.workers.celery_app beat --loglevel=info

# frontend
cd admin && npm install && npm run dev
```

Selama fase frontend, cukup terminal frontend dengan `NEXT_PUBLIC_DATA_SOURCE=mock`.

## 5. Struktur direktori

```text
mbuti/
├─ README.md
├─ PLANNING.md
├─ admin/                                   frontend
│  ├─ app/
│  │  ├─ layout.tsx  providers.tsx  globals.css
│  │  ├─ (auth)/login/  (auth)/register/
│  │  ├─ (publish)/                         halaman depan
│  │  └─ (admin)/
│  │     ├─ _components/
│  │     │  ├─ ui/                          button, card, modal, table, input, ...
│  │     │  ├─ layout/                      sidebar, topbar, org switcher
│  │     │  ├─ flow/                        node, edge, panel untuk React Flow
│  │     │  └─ office3d/                    scene, ruangan, karakter, kamera
│  │     ├─ _data/admin-menu.ts
│  │     └─ admin/
│  │        ├─ dashboard/
│  │        ├─ organisasi/{profil,unit,pengguna}/
│  │        ├─ role/                        daftar dan detail role
│  │        ├─ relasi/                      peta relasi
│  │        ├─ pengetahuan/                 dokumen
│  │        ├─ tugas/                       daftar, buat, detail
│  │        ├─ persetujuan/                 kotak masuk persetujuan
│  │        ├─ kantor/                      kantor 3D
│  │        └─ pengaturan/{model-ai,batas-biaya}/
│  │           (tiap fitur: page.tsx, types.ts, hooks/crud.tsx, components/)
│  ├─ lib/
│  │  ├─ api.ts  api_secure.ts  show_swall.ts
│  │  └─ mock/                              data contoh dan pengganti fetch
│  ├─ store/  useAuthStore.ts  useUrlStore.ts  useOrgStore.ts  useOfficeStore.ts
│  ├─ types/global.ts
│  └─ utilities/
└─ server/                                  backend
   ├─ main.py  pyproject.toml  alembic.ini  .env.example
   ├─ alembic/versions/
   ├─ scripts/                              seed, buat superadmin
   ├─ tests/{unit,integration}/
   └─ app/
      ├─ api/deps.py
      ├─ api/v1/router.py
      ├─ api/v1/endpoints/
      │  ├─ auth/  users/
      │  └─ admin/
      │     ├─ organisasi/  unit/  pengguna/
      │     ├─ role/  relasi/  pengetahuan/
      │     ├─ tugas/  persetujuan/  kantor/  pengaturan/
      │        (tiap fitur: route.py, schema.py, service.py)
      ├─ core/          config, security, cookies, csrf, exceptions, logging, rate_limit
      ├─ db/            base, engine, session, transaction
      ├─ models/        auth/, organisasi/, agent/, pengetahuan/, tugas/, biaya/
      ├─ services/
      │  ├─ crud_service.py
      │  ├─ llm/        provider.py, anthropic.py, gemini.py, mock.py
      │  ├─ knowledge/  extract.py, chunk.py, embed.py, search.py
      │  └─ engine/     runner.py, prompts.py, router.py, guards.py, citations.py
      └─ workers/       celery_app.py, ingestion.py, execution.py
```

## 6. Model data

Semua tabel milik organisasi punya `organization_id` dan setiap query difilter dengannya. Kolom umum: `id` UUID, `created_at`, `updated_at`, `created_by`.

### 6.1 Akun dan organisasi

| Tabel | Kolom utama |
|---|---|
| `users` | email, password_hash, full_name, is_active, is_verified |
| `refresh_sessions` | user_id, token_hash, expires_at, revoked_at, user_agent, ip |
| `organizations` | name, slug, description, logo_url, timezone, monthly_budget, status |
| `memberships` | organization_id, user_id, access_role (`owner`, `admin`, `member`, `viewer`) |
| `units` | organization_id, parent_id, name, description, color, position (x, y di denah), sort_order |

### 6.2 Role dan relasi

**`agents`**

| Kolom | Isi |
|---|---|
| unit_id | Divisi tempat role berada |
| name, title | Nama dan jabatan, mis. "Rani", "Penyusun Surat Dinas" |
| goal | Tujuan kerja dalam satu atau dua kalimat |
| instructions | Uraian tugas dan cara kerja |
| input_spec | Isian yang dibutuhkan saat diberi tugas (JSON schema sederhana) |
| output_format | Bentuk hasil: teks bebas, templat, tabel, JSON |
| acceptance_criteria | Daftar kriteria hasil diterima |
| knowledge_scope | `own` (dokumen sendiri), `unit`, `organization` |
| model_profile | Pilihan model (cepat / seimbang / teliti) |
| owner_user_id | Manusia penanggung jawab |
| avatar | JSON: warna kulit, baju, celana, rambut, aksesori |
| desk_position | Posisi meja di ruangan unit |
| status | `draft`, `active`, `paused` |

**`agent_relations`**

| Kolom | Isi |
|---|---|
| source_agent_id, target_agent_id | Dari dan ke |
| relation_type | `handoff` (serahkan), `review` (periksa), `consult` (konsultasi), `escalate` (ke manusia) |
| trigger | `on_complete`, `on_rejected`, `on_condition` |
| condition | Teks kondisi untuk `on_condition` (dinilai model) |
| payload_spec | Apa yang dikirim: hasil saja, hasil + konteks, rujukan |
| expected_output | Apa yang harus dihasilkan penerima |
| max_revisions | Batas bolak-balik untuk `review` (bawaan 2) |
| requires_approval | Perlu persetujuan manusia sebelum relasi dijalankan |
| label, sort_order | Tampilan di peta |

Aturan saat menyimpan peta relasi:

- `handoff` tidak boleh membentuk lingkaran. Lingkaran hanya diizinkan lewat `review` karena dibatasi `max_revisions`.
- Satu role boleh punya beberapa relasi keluar. Jika lebih dari satu cocok, semuanya dijalankan paralel, lalu tugas menunggu semuanya selesai.
- Role dan relasi tidak dihapus permanen bila sudah dipakai tugas; ditandai terhapus (`deleted_at`).
- `consult` dijalankan sebelum role sumber bekerja agar masukannya terpakai.
- Pemantau tidak bisa menjadi tujuan eskalasi.

### 6.3 Pengetahuan

| Tabel | Kolom utama |
|---|---|
| `documents` | organization_id, scope (`agent`, `unit`, `organization`), scope_id, title, doc_type (SOP, manual, panduan, templat, lainnya), status |
| `document_versions` | document_id, version_no, file_path, mime_type, sha256, page_count, is_active |
| `document_sections` | version_id, page_no, heading_path, order_no, text |
| `document_chunks` | section_id, text, tsvector, embedding `vector(768)` |
| `ingestion_jobs` | version_id, status, error_code, attempts, started_at, finished_at |

Versi baru menjadi aktif hanya setelah selesai diolah. Rujukan menyimpan versi yang dipakai; dokumen yang pernah dirujuk hanya ditandai terhapus. Dokumen berlingkup organisasi terbaca semua role.

Format versi pertama: PDF berteks, DOCX, TXT, MD. Rujukan memakai halaman (PDF) atau judul bagian (DOCX/MD). Hasil scan dan OCR ditunda.

Pencarian memakai gabungan kata kunci (`tsvector`) dan kemiripan makna (pgvector), lalu diurutkan ulang. Hanya dokumen dalam lingkup role yang bisa ditemukan.

### 6.4 Tugas dan eksekusi

| Tabel | Kolom utama |
|---|---|
| `tasks` | organization_id, title, brief, input (JSON), entry_agent_id, status, priority, due_at, budget_limit, cost_used, created_by |
| `task_steps` | task_id, agent_id, parent_step_id, via_relation_id, attempt_no, status, input, started_at, finished_at, error_code |
| `artifacts` | step_id, kind, content, file_path, version_no |
| `citations` | artifact_id, chunk_id, document_version_id, page_no, heading_path, quote |
| `reviews` | step_id (langkah pemeriksa), target_artifact_id, verdict (`approved`, `revise`), notes, criteria_results (JSON) |
| `approvals` | task_id, step_id, requested_from (user/akses), decision (`approved`, `rejected`, `revise`), comment, decided_by, decided_at |
| `task_events` | task_id, step_id, type, message, data (JSON) untuk linimasa |
| `llm_calls` | organization_id, agent_id, step_id (kosong untuk uji coba), provider, model, input_tokens, output_tokens, cost, latency_ms, status |

Status tugas: `draft` → `queued` → `running` → `waiting_review` / `waiting_approval` → `completed`, atau `failed` / `cancelled` / `stopped_budget`.

Status langkah: `queued` → `running` → `done` / `revise_requested` / `failed` / `skipped`.

## 7. Cara kerja mesin agen

1. Manusia membuat tugas untuk satu role (atau satu unit; unit memilih role koordinatornya).
2. Worker Celery mengambil langkah `queued`:
   1. Cari potongan dokumen yang relevan dalam lingkup role.
   2. Susun prompt: profil role, tujuan, instruksi, kriteria, input tugas, hasil langkah sebelumnya, catatan revisi, potongan dokumen bernomor. Isi dokumen ditandai sebagai **data, bukan instruksi**.
   3. Panggil model dengan keluaran terstruktur: `status` (`done` / `need_info` / `not_in_documents`), `output`, `sources` (nomor potongan), `notes`.
   4. Server memeriksa rujukan: nomor potongan harus ada di daftar yang diberikan. Rujukan dibuat server dari nomor itu, bukan ditulis model.
   5. Simpan hasil, rujukan, biaya, dan peristiwa linimasa.
3. Server menilai relasi keluar dari role itu:
   - `handoff`: buat langkah baru untuk role tujuan.
   - `review`: buat langkah pemeriksa. Jika hasilnya `revise`, langkah pembuat diulang dengan catatan revisi, maksimal `max_revisions` kali. Setelah batas habis, tugas dieskalasi ke manusia.
   - `escalate` atau `requires_approval`: tugas berhenti dengan status `waiting_approval` sampai manusia memutuskan.
   - Tidak ada relasi keluar: tugas selesai.
4. Pengaman (`engine/guards.py`): batas langkah per tugas (bawaan 20), batas biaya per tugas dan per bulan per organisasi, batas waktu per panggilan model, percobaan ulang dengan jeda untuk galat sementara, dan idempoten per langkah agar langkah tidak diproses dua kali.
5. Versi pertama tidak memberi agen alat lain (internet, email, berkas di luar sistem). Fase E menambahkan alat, pencarian internet, dan kerja di aplikasi luar.

Biaya dalam rupiah dihitung dari token memakai tabel harga per model dan kurs di konfigurasi server. Rincian perilaku mesin ada di `admin/API_CONTRACT.md` bagian 12.

**Penyedia model.** Gemini lewat antarmuka `LLMProvider` (implementasi `gemini` dan `mock` untuk uji), sehingga penyedia lain bisa ditambah tanpa mengubah mesin.

| Pengaturan `.env` | Dipakai untuk |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_API_KEY1`… | Kunci API dengan rotasi bergilir: kunci yang kena batas (429) diistirahatkan sementara dan permintaan pindah ke kunci berikutnya. Logikanya diadaptasi dari `TotO-L-py/backend/app/ai/gemini_keys.py` |
| `LLM_MODEL_FAST` | Profil "cepat": menilai kondisi relasi, merangkum, langkah ringan |
| `LLM_MODEL_BALANCED` | Profil "seimbang": kerja role sehari-hari |
| `LLM_MODEL_THOROUGH` | Profil "teliti": pemeriksa dan dokumen panjang |
| `LLM_FALLBACK_MODEL` | Cadangan saat model utama kena batas kuota atau galat sementara |
| `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION` | `gemini-embedding-2`, `768` |

Pilihan versi Gemini (2.5, 3.0, 3.1, atau yang lebih baru) cukup diisi di `.env`. Daftar model yang aktif di akun Google dicek saat B4 dimulai, karena model lama bisa dihentikan Google. Sebagai pembanding, Toto-L di produksi memakai `gemini-3.8-flash` dengan cadangan `gemini-3.5-flash-lite`.

Membaca dokumen (PDF berteks, DOCX) dilakukan tanpa model AI. Model Gemini multimodal baru dipakai nanti untuk hasil scan dan gambar.

## 8. Rancangan frontend

### 8.1 Menu

| Menu | Isi |
|---|---|
| Dashboard | Ringkasan tugas berjalan, menunggu persetujuan, biaya bulan ini, role paling sibuk |
| Kantor | Tampilan 3D kantor (bagian 8.3) |
| Tugas | Daftar dengan filter status; buat tugas; detail tugas |
| Persetujuan | Kotak masuk keputusan manusia |
| Role | Daftar role per unit; detail role |
| Peta Relasi | Editor node dan garis |
| Pengetahuan | Semua dokumen beserta lingkup dan status olah |
| Organisasi | Profil, unit/divisi, pengguna dan hak akses |
| Pengaturan | Model AI, kunci API, batas biaya |

### 8.2 Layar utama

**Detail role** (tab):

1. Profil: nama, jabatan, unit, tujuan, avatar (pratinjau karakter 3D).
2. Instruksi: uraian kerja, input yang dibutuhkan, format hasil, kriteria diterima.
3. Dokumen: unggah, status olah, versi, lingkup.
4. Relasi: relasi masuk dan keluar (tautan ke peta).
5. Uji coba: beri tugas percobaan tanpa memicu relasi.
6. Riwayat: langkah yang pernah dikerjakan dan biayanya.

**Peta Relasi**: node = role (dikelompokkan per unit), garis berwarna per jenis relasi. Klik garis membuka panel aturan relasi. Validasi lingkaran `handoff` dilakukan sebelum simpan. Posisi node disimpan.

**Buat tugas**: pilih role, isi judul dan arahan, isian sesuai `input_spec` role, batas biaya, tenggat (tugas ke unit dan lampiran ditunda). Pratinjau rute: role mana saja yang kemungkinan terlibat menurut peta.

**Detail tugas**: linimasa langkah (siapa, kapan, status, biaya), hasil tiap langkah dengan rujukan yang bisa diklik ke halaman dokumen, catatan pemeriksaan, tombol setujui / minta revisi / tolak, dan tombol hentikan tugas. Data diperbarui berkala (polling TanStack Query) selama tugas berjalan.

### 8.3 Kantor 3D

- Denah isometrik: tiap unit menjadi ruangan berwarna dengan papan nama. Ukuran ruangan mengikuti jumlah role.
- Tiap role adalah **karakter blok buatan sendiri** (kepala, badan, lengan, kaki dari bentuk kotak), dengan warna dan aksesori dari kolom `avatar`. Tidak memakai karakter, aset, atau nama Roblox.
- Animasi menurut status: diam, mengetik (bekerja), memegang kertas (menunggu pemeriksaan), tanda seru (butuh manusia), tanda silang (gagal).
- Saat tugas berpindah role, sebuah amplop bergerak di sepanjang garis relasi.
- Klik ruangan membuka panel unit (daftar role dan aktivitas hari ini, dokumen terbaru, tombol **Tugaskan divisi ini**). Klik karakter membuka ringkasan role.
- Kinerja: geometri sederhana, `instancedMesh` bila role banyak, render hanya saat ada perubahan, batas awal sekitar 100 role per tampilan. Pada perangkat lemah atau layar sempit tersedia tampilan daftar 2D.

### 8.4 Data contoh selama fase frontend

- `lib/mock/` berisi satu organisasi contoh: 3 unit, 6 role, 5 relasi, 8 dokumen, 6 tugas dalam berbagai status, termasuk satu yang berputar revisi dan satu yang menunggu persetujuan.
- `hooks/crud.tsx` tetap memakai `fetchData`. Bila `NEXT_PUBLIC_DATA_SOURCE=mock`, `fetchData` dialihkan ke pengendali di `lib/mock/handlers.ts` yang meniru URL dan bentuk respons API. Halaman tidak tahu datanya palsu, sehingga saat backend siap cukup mengganti variabel lingkungan.
- Data contoh disimpan di memori peramban (dan `localStorage`) agar tambah, ubah, hapus terasa nyata selama demo.
- Simulasi eksekusi: tugas contoh berpindah status setiap beberapa detik supaya linimasa dan kantor 3D bisa diperagakan.
- Data contoh fiktif dan netral; tidak memakai data instansi sungguhan.

### 8.5 Bentuk respons API (kontrak)

Mengikuti edusetara:

```json
{ "success": true, "statusCode": 200, "message": "…", "data": { } }
{ "success": true, "statusCode": 200, "total": 42, "skip": 0, "limit": 10, "data": [ ] }
```

Pola URL per fitur: `GET /read`, `GET /option`, `GET /{id}`, `POST /create`, `PUT /update/{id}`, `DELETE /delete/{id}`, ditambah aksi khusus seperti `POST /api/v1/admin/tugas/{id}/approve`. Prefix `/api/v1/admin/<fitur>`. Daftar endpoint lengkap ada di [`admin/API_CONTRACT.md`](admin/API_CONTRACT.md).

## 9. Rancangan backend

- `route.py` tipis: validasi, `Depends`, panggil `service.py`.
- `service.py`: aturan bisnis dan query; selalu menerima `organization_id` dari dependency, tidak dari body.
- `deps.py`: `get_db`, `get_current_user`, `get_current_membership(org_id)`, `require_access("admin", ...)`.
- `CRUDBase` hanya untuk tabel sederhana (unit, pengaturan). Role, relasi, tugas, dan dokumen memakai service sendiri.
- Unggahan disimpan di `server/uploads/<organization_id>/...`, dilayani lewat endpoint yang memeriksa hak akses, bukan folder statis publik.
- Kunci API penyedia model hanya ada di `server/.env`, tidak disimpan di database.
- Celery: antrean `ingestion` dan `execution` terpisah agar olah dokumen besar tidak menahan tugas.
- Uji: database `mbuti_test`, penyedia model `mock`, uji isolasi antar-organisasi untuk setiap endpoint.

## 10. Keamanan

- Isolasi organisasi: setiap query lewat `organization_id` dari keanggotaan pengguna; uji khusus memastikan pengguna organisasi A tidak bisa membaca data B.
- Hak akses: pemilik/admin mengatur organisasi, role, relasi, dan pengaturan; anggota membuat tugas dan memberi persetujuan yang ditujukan padanya; pemantau hanya membaca.
- Prompt injection: isi dokumen dan input tugas dibungkus sebagai data; agen tidak punya alat yang bisa mengirim keluar; rujukan dibuat server.
- Unggahan: batas ukuran, cek tipe dari isi berkas, nama berkas acak, hash SHA-256.
- Cookie HttpOnly + CSRF, batas laju login, Argon2id, sesi bisa dicabut.
- Log tidak menyimpan kunci API atau isi dokumen lengkap.

## 11. Tahapan

### Fase A — Frontend dengan data contoh

**A0. Kerangka frontend**
- [x] Buat `admin/` dengan Next.js, TypeScript, Tailwind, TanStack Query, Zustand, SweetAlert2; `.env.example`.
- [x] Salin pola komponen UI, layout, menu, `api_secure.ts`, `useUrlStore`, `useAuthStore` dari edusetara dan sesuaikan identitas MBUTI.
- [x] Lapisan data contoh (`lib/mock/`) dan pengalih `NEXT_PUBLIC_DATA_SOURCE`.
- Selesai bila: `npm run dev`, lint, typecheck, dan build lulus; halaman login contoh masuk ke dashboard kosong.

**A1. Organisasi, unit, pengguna**
- [x] Profil organisasi, CRUD unit bertingkat, daftar pengguna dan hak akses.

**A2. Role**
- [x] Daftar role per unit, form tambah/ubah, detail role dengan enam tab, editor avatar dengan pratinjau.

**A3. Pengetahuan**
- [x] Unggah dokumen (simulasi status olah), daftar per lingkup, versi, pratinjau rujukan halaman.

**A4. Peta relasi**
- [x] Editor React Flow, panel aturan relasi, validasi lingkaran, simpan posisi.

**A5. Tugas dan persetujuan**
- [x] Buat tugas dengan pratinjau rute, daftar tugas, detail dengan linimasa dan rujukan, kotak masuk persetujuan, simulasi eksekusi.

**A6. Kantor 3D**
- [x] Ruangan per unit, karakter blok, animasi status, panel unit dan role, amplop berpindah, tampilan daftar 2D.

**A7. Dashboard dan pengaturan**
- [x] Ringkasan, pengaturan model AI dan batas biaya. Nilainya dipakai mesin simulasi dan form Buat tugas.

**A8. Kontrak API**
- [x] Tulis [`admin/API_CONTRACT.md`](admin/API_CONTRACT.md) dari `types.ts` dan pengendali mock.
- [x] Ditinjau bersama; seluruh usulan disetujui (26 November 2026, kontrak bagian 13) dan diterapkan ke data contoh.

### Fase B — Backend

**B0. Kerangka backend** (selesai 26 November 2026): `server/` dengan venv, FastAPI, config, exceptions, logging, Alembic, koneksi PostgreSQL, Celery, health check, pytest.

**B1. Auth dan organisasi** (selesai 26 November 2026): login, refresh, logout, CSRF, batas laju, skrip akun pertama, keanggotaan, profil, unit, uji isolasi. Undangan dan pendaftaran menyusul.

**B2. Role dan relasi** (selesai 26 November 2026): CRUD, validasi graf, tandai terhapus alih-alih hapus, `agent_count` di profil dan unit, tolak hapus unit yang masih punya role, dan pemantau bukan tujuan eskalasi. Uji coba role menyusul di B4.

**B3. Pengetahuan** (selesai 26 November 2026): unggah, worker ekstraksi, potong, embedding, pencarian gabungan, baca versi lama, unduh berkas, tolak hapus unit atau role yang masih punya dokumen, `document_count`. Keadaan olah disimpan pada tabel versi (tanpa tabel `ingestion_jobs` terpisah).

**B4. Eksekusi satu role** (selesai 26 November 2026; termasuk pengaturan model AI dan batas biaya): provider model, runner, rujukan, biaya, uji coba role dari tab "Uji coba".

**B5. Relasi dalam eksekusi** (selesai 26 November 2026; juga: tabel rujukan hasil, dan dokumen yang dirujuk diarsipkan bukan dihapus; tolak hapus role yang terlibat tugas berjalan, isi `task_count`, batas revisi dari pengaturan): handoff, review dengan batas revisi, eskalasi, persetujuan, hentikan tugas, pengaman biaya dan langkah, konsultasi sebelum bekerja, pemicu `on_rejected` (lalu tampilkan kembali pilihannya di peta).

**B6. Penyambungan** (selesai 26 November 2026): frontend beralih `NEXT_PUBLIC_DATA_SOURCE=api`, perbaiki selisih kontrak, kantor 3D membaca status nyata.

### Fase C — Pengerasan dan rilis

- [x] Uji alur ujung ke ujung untuk contoh "Penyusun Surat → Pemeriksa Surat → Persetujuan Kepala"
      (`server/tests/integration/test_sample_flow.py`, data contoh lewat `scripts/data_contoh.py`).
- [x] Batas laju, audit log, cadangan database, pemantauan galat. Cadangan dibuat tanpa `pg_dump` dan pemulihannya
      diuji di database uji. Pemantauan berupa pemeriksaan berkala dan kode galat; pemberitahuan email saat gagal,
      pengingat, dan pulih ditambahkan 26 November 2026 (`ALERT_EMAILS`, `app/services/alerts.py`).
- [ ] Deploy tanpa Docker: `systemd` untuk uvicorn, worker, dan beat; Nginx sebagai reverse proxy; `next build` + `next start`.
      Berkas dan panduan ada di `deploy/`, tetapi **belum dipasang di server** (menunggu server tujuan).
- [x] README: persiapan lingkungan, migrasi, seed, menjalankan, uji, dan cara membuat modul baru.

### Fase D — SaaS (setelah fase C)

MBUTI ditujukan menjadi layanan SaaS. Versi pertama (fase A–C) dipakai satu pengguna per organisasi dengan akun yang
dibuat lewat skrip; data sudah dipisah per organisasi. Fase ini dimulai setelah alur utama terbukti jalan, dan
rinciannya disepakati dulu sebelum dikerjakan.

- [x] Pendaftaran mandiri, verifikasi email, penerimaan undangan, dan lupa kata sandi (D1, 26 November 2026).
- [ ] Satu pengguna di beberapa organisasi, dengan pemilih organisasi.
- [ ] Paket langganan, kuota per paket (role, dokumen, biaya model), dan pembayaran. Halaman depan sudah menampilkan
      harga **rencana** (Perintis Rp0, Tim Rp299.000, Instansi Rp1.490.000 per bulan; `admin/app/(publish)/_landing/Pricing.tsx`)
      yang belum diputuskan.
- [ ] Panel pengelola platform: daftar organisasi, pemakaian, dan penangguhan.
- [ ] Kunci model berbayar dengan pembagian kuota antar-organisasi, agar satu pelanggan tidak menghabiskan jatah yang lain.
- [ ] Penyimpanan berkas di luar disk server, ekspor dan penghapusan data organisasi.
- [ ] Ketentuan layanan dan kebijakan privasi.

#### D1. Akun mandiri: rancangan (disepakati 26 November 2026)

Cakupan: daftar, verifikasi email, terima undangan, lupa kata sandi. Langganan dan pembayaran tidak termasuk (D2).
Tetap satu organisasi per pengguna.

**Alur 1. Daftar**

1. `/daftar`: nama lengkap, email, kata sandi (minimal 10 karakter, sama dengan skrip akun), nama organisasi, sektor,
   centang setuju ketentuan layanan.
2. Server membuat akun (`is_verified=false`), organisasi baru, dan keanggotaan **pemilik**, lalu mengirim tautan
   verifikasi (berlaku 24 jam). Halaman berpindah ke `/daftar/terkirim` ("Periksa email Anda") dengan tombol kirim ulang.
3. Jawaban selalu sama walau email sudah terdaftar, supaya orang lain tidak bisa mengecek email siapa yang punya akun.
   Pemilik email itu menerima email "Anda sudah punya akun" berisi tautan masuk dan lupa kata sandi.
4. `/verifikasi?token=…`: akun ditandai terverifikasi, sesi dibuat, lalu masuk ke `/admin` dengan panduan awal
   (buat unit, role pertama, unggah dokumen).
5. Masuk sebelum verifikasi: kata sandi benar tetapi email belum terverifikasi dijawab `403` "Verifikasi email dulu"
   dengan tombol kirim ulang.
6. Mode pendaftaran lewat `.env` `REGISTRATION_MODE`:
   - `closed`: halaman daftar ditutup (perilaku sekarang).
   - `approval` (**dipilih**): setelah verifikasi, organisasi berstatus `pending` dan halaman admin menampilkan
     "Menunggu persetujuan". Pengelola menyetujui lewat skrip `python -m scripts.setujui_organisasi` sampai panel
     pengelola platform ada. Alasannya: Gemini masih tier gratis dan kuotanya dipakai bersama Toto-L.
   - `open`: langsung aktif.

**Alur 2. Undangan**

1. Undangan yang sudah ada (`POST /admin/pengguna/invite`) kini juga mengirim email berisi tautan (berlaku 7 hari);
   admin bisa mengirim ulang atau membatalkan dari halaman Pengguna.
2. `/undangan?token=…` menampilkan nama organisasi, pengundang, email, dan hak akses. Penerima mengisi nama dan kata
   sandi, lalu langsung masuk. Email dianggap terverifikasi karena tautannya sampai ke kotak masuk.
3. Email yang sudah punya akun di organisasi lain ditolak (`409`), sampai fitur satu pengguna di banyak organisasi ada.

**Alur 3. Lupa kata sandi**

1. Tautan "Lupa kata sandi?" di `/login` menuju `/lupa-sandi` (isi email). Jawaban selalu sama.
2. Tautan atur ulang berlaku 1 jam dan sekali pakai. `/atur-ulang-sandi?token=…`: kata sandi baru dua kali.
3. Setelah berhasil, semua sesi lama dicabut, pengguna diberi tahu lewat email, dan kejadiannya masuk jejak audit.

**Teknis**

- Tabel `auth_tokens`: `user_id`, `purpose` (`verify`, `reset`, `invite`), `membership_id` (untuk undangan),
  `token_hash` (SHA-256; token asli hanya ada di email), `expires_at`, `used_at`. Token baru dengan tujuan sama
  membatalkan yang lama.
- Kolom `organizations.status`: `pending`, `active`, `suspended` (juga dipakai panel pengelola nanti).
- Pengirim email lewat antrean Celery `default`, dengan pilihan `EMAIL_BACKEND`: `console` (pengembangan; isi email
  ditulis ke log, tanpa layanan luar), atau `smtp`. Selama pengembangan dipakai `console`; pengirim sungguhan dipilih sebelum pemasangan di server. Templat email dalam
  Bahasa Indonesia dengan teks polos dan HTML sederhana.
- Endpoint publik (dengan pemeriksaan `Origin`, tanpa CSRF seperti login):
  `POST /auth/register`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/forgot-password`,
  `POST /auth/reset-password`, `GET /auth/invite/{token}`, `POST /auth/accept-invite`.
- Batas laju: daftar 5 per jam per alamat; kirim ulang verifikasi dan lupa kata sandi 3 per jam per email dan
  10 per jam per alamat.
- Halaman ketentuan layanan dan kebijakan privasi: tautan di formulir daftar wajib ada. Dipakai halaman
  sementara yang jujur menyebut status uji coba, lalu teks final menyusul sebelum pendaftaran dibuka untuk umum.
- Urutan kerja: halaman dengan data contoh (mode `mock` menampilkan "email" di panel samping) → kontrak API → backend
  → uji (termasuk token kedaluwarsa, dipakai dua kali, dan email ganda).

Kemajuan:

- [x] Halaman dengan data contoh (26 November 2026): `/daftar`, `/daftar/terkirim`, `/verifikasi`, `/lupa-sandi`,
      `/atur-ulang-sandi`, `/undangan`, `/menunggu-persetujuan`, `/ketentuan`, `/privasi`; kirim ulang undangan di
      halaman Pengguna; panel Kotak keluar dan tombol setujui simulasi di mode `mock`. `MOCK_DB_VERSION` naik ke 10.
- [x] Kontrak API (26 November 2026, `admin/API_CONTRACT.md` bagian 15): endpoint di atas, `GET /auth/options`,
      `POST /admin/pengguna/resend-invite/{id}`, `organization.status` pada profil, dan kolom `code` pada galat
      (`email_not_verified`, `invalid_token`, `organization_pending`, `organization_suspended`).
- [x] Backend, skrip `scripts.setujui_organisasi`, dan uji (26 November 2026): tabel `auth_tokens`, kolom
      `organizations.status` dan `users.terms_accepted_at`, pengirim email lewat Celery (`console` atau `smtp`),
      batas laju per jam, dan `tests/integration/test_accounts.py`. Pengirim email sungguhan dipilih sebelum
      pemasangan di server.

### Fase E — Role sebagai pekerja (disepakati 27 November 2026)

Role MBUTI adalah **pekerja virtual yang mewakili orang tertentu**. Ia dibentuk lewat analisis dan tanya jawab,
punya keterampilan yang luwes, bisa bekerja sendiri di aplikasi luar, dan menjalankan tugas sekali maupun tugas
rutin. Fase ini melonggarkan dua batas versi pertama, untuk role yang diberi alat: agen boleh memakai alat
(bagian 7 butir 5) dan boleh bekerja di aplikasi di luar MBUTI (bagian 1 butir 3). Persetujuan manusia tetap bisa
dipasang di setiap alur.

Fase E dan fase D berjalan terpisah: fase D mengurus SaaS (multi-organisasi, paket, kuota, panel pengelola), fase E
mengurus kemampuan role. Rincian tiap tahap E disepakati dulu sebelum dikerjakan, dengan urutan kerja seperti D1:
halaman dengan data contoh → kontrak API → backend → uji.

#### Prinsip fase E

1. **Umum untuk semua jenis tenant.** MBUTI dipakai instansi pemerintah maupun swasta (air minum, pertambangan,
   properti, konten, pendidikan, dan lainnya). Tidak boleh ada fitur yang hanya masuk akal untuk satu sektor. Hal
   khusus sektor masuk lewat dokumen, templat, dan paket industri. Pemerintahan (Perbub tata naskah, e-kinerja,
   SIASN, SIPD) hanya salah satu contoh.
2. **Luwes, tidak kaku.** Tenant menulis dengan bahasa biasa; AI yang menerjemahkannya menjadi keterampilan, alat,
   dan jadwal, lalu menampilkan hasilnya untuk disetujui.
3. **Utamakan perangkat lunak open source** untuk semua alat yang dipasang dan dijalankan sendiri, dengan lisensi
   yang aman untuk SaaS (MIT, Apache, BSD, MPL, LGPL). AGPL dihindari. Lisensi dicek setiap ada alat baru dan dicatat
   di tabel alat di bawah. Perangkat lunak berbayar atau berlisensi khusus tidak dipakai.
4. **Model AI lewat API.** Prinsip open source tidak berlaku untuk model: Gemini dipakai lewat API (penyedia lain
   bisa ditambah lewat `LLMProvider`).
5. **Angka dihitung program, bukan model.** Role menyusun struktur dan rumus; program yang menghitung.
6. **Hemat kuota.** Gemini masih tier gratis dan dipakai bersama Toto-L: pekerjaan yang bisa dikerjakan lokal tidak
   memakai API, dan uji hanya dengan dokumen contoh atau publik.

#### 1. Pembentukan role: analisis, tanya jawab, Final

1. **Bahan dari pembuat role:** uraian jabatan (tupoksi, job description, SOP jabatan) dalam PDF atau DOCX; daftar
   alat, aplikasi, dan kemampuan (misalnya Word, Excel, Visual Studio Code, JavaScript, ERP, aplikasi kinerja);
   deskripsi bebas tentang pekerjaan dan orang yang diwakili.
2. **Analisis AI** menyusun **kartu keterampilan**: ringkasan tugas, kemampuan, alat yang dipakai (dipetakan ke
   katalog alat; nama alat tidak perlu diketahui tenant), langkah kerja termasuk titik persetujuan manusia, bahan yang
   dibutuhkan, dan hal yang masih kabur atau bertentangan.
3. **Sesi tanya jawab.** Role bertanya kepada pembuatnya (*"Pak, laporan bulanan ini dikirim ke siapa dan formatnya
   seperti apa?"*), pembuat menjawab, rancangan diperbarui, dan berulang sampai jelas. Role tidak sekadar menurut:
   alat yang kurang, bahan yang tidak lengkap, atau instruksi yang bertentangan dengan uraian jabatan disampaikan.
4. **Final.** Sebelum Final, role berstatus *draf* dan tidak menerima tugas. Tanya jawab disimpan sebagai pengetahuan
   role dan ikut dipakai saat bekerja.
5. **Ubah setelah Final** membuka tanya jawab baru dan perlu Final lagi. Versi lama tetap tercatat.
6. Keterampilan yang belum bisa dijalankan ditandai **belum didukung**, diberi pengganti bila ada, dan dicatat sebagai
   permintaan untuk pengelola platform.

#### 2. Keterampilan dan alat

- **Alat jadi** didahulukan: aman, hasilnya konsisten, biayanya mudah dihitung.
- **Ruang kerja terisolasi** sebagai cadangan: AI menulis dan menjalankan skrip di ruang berisi FFmpeg, LibreOffice,
  Python, dan alat video. Dibatasi per paket, dengan batas waktu, memori, dan biaya.
- Alat berat (render video, OCR massal, ruang kerja) memakai antrean worker sendiri.
- Berkas dari tenant dianggap tidak tepercaya: makro dimatikan, konversi di proses terpisah dengan batas waktu dan
  memori, folder per organisasi.
- Templat milik tenant (kop surat, format laporan) dihormati: role mengisi kolom yang ditandai.
- **Paket industri:** saat mendaftar, tenant memilih jenis organisasi, lalu MBUTI menyiapkan contoh unit, role,
  relasi, templat, dan keterampilan untuk disesuaikan. Paket bisa terus ditambah (pemerintahan, air minum,
  pertambangan, properti, konten, pendidikan, dan lainnya).

Katalog alat (semua open source):

| Kelompok | Isi | Perangkat lunak (lisensi) |
|---|---|---|
| Dokumen | DOCX/XLSX/PPTX/ODT ke PDF dan sebaliknya; gabung, pisah, kompres, tanda air, isi formulir PDF; isi templat dokumen organisasi. Hasil tetap `.docx`/`.xlsx` yang bisa dibuka di Word dan Excel | LibreOffice tanpa layar (MPL), pypdf (BSD), pikepdf (MPL), python-docx (MIT) |
| Data | Membuat dan mengisi spreadsheet, rumus, grafik sederhana, laporan tabel | openpyxl (MIT), lalu LibreOffice menghitung ulang rumus |
| Media | Video dari templat (pengganti Remotion, yang bukan open source murni), potong, gabung, takarir, gambar, poster | Revideo atau Motion Canvas (MIT), FFmpeg (LGPL), MoviePy (MIT), Pillow (HPND), Inkscape (GPL, dijalankan sebagai program terpisah) |
| Pembacaan | OCR hasil scan | Tesseract (Apache) atau PaddleOCR (Apache); halaman kompleks lewat Gemini (lihat bagian 3) |
| Browser | Membuka dan mengisi aplikasi luar | Playwright (Apache), Chromium (BSD) |
| Integrasi | Webhook atau API milik tenant (CMS, penyimpanan berkas, ERP) | Dikerjakan paling akhir, dengan batasan ketat |

#### 3. Pengetahuan

- Lingkup dokumen **organisasi, unit, dan role sudah ada** (bagian 6.3). Aturan seperti Perbub tata naskah atau SOP K3
  sudah bisa diunggah sebagai pengetahuan organisasi.
- **Pustaka kebijakan dan aturan organisasi**, terpisah dari SOP biasa: peraturan, kebijakan perusahaan, standar mutu,
  panduan merek. Dicek lebih dulu saat role bekerja.
- **Aturan menjadi templat:** AI mengenali jenis dokumen, susunan, penomoran, dan tata letak dari aturan yang
  diunggah, lalu menyusun templat DOCX yang diisi alat dokumen.
- **Pencarian internet** per role (boleh atau tidak), dengan tautan sumber. Sejak 28 November 2026 pencarian gratis
  `ddgs` (MIT, cara Toto-L) dipakai lebih dulu dan Google Search bawaan Gemini menjadi cadangan. Pustaka ini tidak
  resmi (membaca halaman mesin pencari); nilai ulang sebelum dijual sebagai SaaS.
  Temuan yang berguna bisa diusulkan untuk disimpan sebagai pengetahuan organisasi.
- **Urutan rujukan:** aturan organisasi → hasil tanya jawab → dokumen umum → internet. Bila berbeda, aturan organisasi
  yang dipakai.
- **PDF kompleks** (tabel, grafik, diagram, hasil scan), mengikuti cara Toto-L
  (`TotO-L-py/backend/app/ai/providers.py`, `get_multimodal_embedding`; diadaptasi, tanpa bergantung pada Toto-L):
  - halaman teks biasa dibaca lokal lalu dibuat embedding teks (seperti sekarang);
  - halaman berat dideteksi, dibuat **embedding multimodal per halaman** dengan `gemini-embedding-2`, dan gambar
    halamannya disimpan;
  - saat halaman itu terpilih, gambarnya dikirim ke Gemini bersama prompt, dan rujukan menampilkan potongan gambar
    bagian halaman yang dipakai.
  - Toto-L memakai PyMuPDF (AGPL), jadi hanya caranya yang diambil: MBUTI memakai pypdfium2 (Apache/BSD) untuk
    merender dan memeriksa halaman, dan Pillow (HPND) untuk memotong dan mengecilkan gambar.
- **Membaca gambar:** role bisa membaca gambar yang dilampirkan ke tugas maupun yang ada di pengetahuan (desain, foto
  lapangan, kuitansi, grafik, tangkapan layar) lewat Gemini multimodal, sama seperti halaman PDF kompleks. Contoh:
  *"Amir, lihat desain ini, apa yang kurang?"*, atau role auditor yang memeriksa foto dan nota terhadap daftar
  periksa. Hasilnya berupa daftar temuan, kotak bernomor di atas gambar, rujukan ke pedoman, dan rekomendasi.
  Mendesain ulang (berkas SVG/HTML yang bisa diedit, atau gambar baru dari model lewat API) masuk E5.

#### 4. Mode penyusunan

Per role, bisa diganti per tugas:

- **Dari data:** hanya memakai dokumen, catatan, dan hasil tugas yang ada.
- **Lengkapi:** memakai data yang ada, bagian yang kosong disusun sendiri.
- **Susun bebas:** membuat dokumen utuh sesuai perintah dan format walaupun tanpa data masukan (misalnya laporan
  jaringan bulanan).

Linimasa internal mencatat mode setiap hasil; tanda ini tidak tercetak di dokumen. Lampiran: berkas yang sudah ada
dipakai, atau dibuatkan role dalam PDF, DOCX, atau XLSX.

#### 5. Bekerja di aplikasi luar

- **Brankas akun per role:** alamat aplikasi, username, password, dan sumber OTP per aplikasi. Membuka atau mengubah
  isinya memerlukan OTP pemiliknya. Isinya tidak pernah ditampilkan ke model AI; hanya alat yang memakainya, dan
  setiap pemakaian masuk jejak audit.
- **OTP authenticator** (seperti Google Authenticator): kunci rahasianya disimpan di brankas saat OTP diaktifkan,
  lalu MBUTI membuat kodenya sendiri tanpa konfirmasi.
- **OTP lewat email atau SMS:** role meminta kodenya ke pemilik lewat WhatsApp (bagian 7), lalu langsung memakainya.
  Setiap pengguna manusia menyimpan satu nomor HP. Membaca kotak masuk atau meneruskan SMS otomatis bisa ditambah nanti.
- **Browser** dengan sesi tersimpan per role per aplikasi, supaya jarang perlu masuk ulang.
- Hasil dilaporkan di MBUTI (linimasa dan notifikasi) dengan tangkapan layar sebagai bukti.
- **Kapasitas Playwright:** satu proses Chromium dengan banyak context terisolasi (satu per role per aplikasi); sesi
  disimpan sebagai storage state dan context ditutup setelah tugas selesai. Perkiraan: Chromium ±150–250 MB, satu
  context ±50–300 MB tergantung berat aplikasinya. Tugas browser masuk antrean dengan batas jumlah yang jalan
  bersamaan (per server dan per tenant), dan jadwal yang sama disebar otomatis (misalnya 16.00–16.30). Untuk 21 role:
  minimum 2 vCPU/4 GB (2–3 browser bersamaan), disarankan 4 vCPU/8 GB (5 browser bersamaan). Angka ini perlu diukur
  di aplikasi sungguhan.

#### 6. Tugas sekali dan tugas rutin

- **Tugas sekali:** "Buatkan surat ini, laporkan kalau selesai." Berjalan sekali lalu selesai.
- **Tugas rutin:** jadwal ditulis dengan bahasa biasa (*"Isi laporan harian setiap Senin–Jumat pukul 16.05, jangan
  saat libur"*). AI mengubahnya menjadi jadwal dan menampilkan putaran berikutnya untuk disetujui.
  - Pilihan: harian, hari kerja, mingguan, bulanan (tanggal tertentu atau hari kerja terakhir), triwulan, tanggal
    tertentu; batas akhir bila perlu; bisa dijeda dan dilanjutkan.
  - **Kalender:** diatur sepenuhnya oleh tenant (hari kerja, shift, libur apa pun termasuk libur nasional negaranya,
    hari kerja pengganti) dan cuti pemilik role.
  - **Gagal:** coba ulang dengan jeda, beri tahu pemilik, lalu diisi susulan atau dilewati sesuai pilihan saat
    membuat jadwal.
  - **Riwayat putaran:** tanggal, hasil, lampiran, dan bukti setiap putaran.
- Penjadwal (Celery beat) sudah ada; yang ditambah tabel jadwal, kalender, dan halamannya.

#### 7. WhatsApp

Hanya untuk **konfirmasi kode** (meminta OTP yang dikirim lewat email atau SMS dan menerima balasannya). Perintah,
catatan, dan laporan tetap lewat MBUTI. Selama uji coba memakai pustaka tidak resmi (Baileys, MIT; nomor berisiko
diblokir), bukan WhatsApp Business Platform berbayar. Telegram bisa menjadi saluran tambahan.
**Pengerjaannya ditunda sampai diminta.**

#### Tahapan

- [x] **E1. Pembentukan role dan pengetahuan** (selesai 28 November 2026; dicoba dengan Gemini di mbuti_test lalu dibatalkan: analisis, tanya jawab, dan temuan poster berjalan baik; pencarian internet kena 429 di semua kunci, kemungkinan kuota grounding tier gratis): bahan uraian jabatan dan daftar alat, analisis AI, kartu
      keterampilan, tanya jawab, Final, versi role; pustaka kebijakan dan aturan; pencarian internet per role;
      PDF kompleks dan gambar dengan Gemini multimodal, termasuk lampiran gambar pada tugas.
- [x] **E2. Tugas rutin** (selesai 28 November 2026): jadwal dari bahasa biasa, kalender libur dan kalender kerja tenant, cuti pemilik role,
      coba ulang dan susulan, riwayat putaran.
- [ ] **E3. Alat dokumen dan data:** konversi dan olah PDF, templat dokumen dari aturan organisasi, spreadsheet, mode
      penyusunan, lampiran otomatis.
- [ ] **E4. Bekerja di aplikasi luar:** brankas akun per role, browser dengan sesi tersimpan, OTP authenticator.
- [ ] **E5. Media dan ruang kerja:** video dan gambar dari alat open source, ruang kerja terisolasi.
- [ ] **E6. WhatsApp untuk konfirmasi kode** (ditunda sampai diminta).
- [ ] Paket industri, disusun bertahap seiring E1–E5.

#### E1. Pembentukan role dan pengetahuan: rancangan (disepakati 27 November 2026)

Dibagi empat bagian: **E1a** pembentukan role, **E1b** pustaka kebijakan dan urutan rujukan, **E1c** PDF kompleks dan
gambar, **E1d** pencarian internet. Halaman keempatnya dibuat sekaligus dengan data contoh, kontrak API ditulis
sekali, lalu backend dan uji dikerjakan per bagian (commit dan push tiap bagian).

**Alur layar**

1. **Buat role** menawarkan dua jalan: *Bentuk dengan analisis* (disarankan; isi nama, jabatan, unit, lalu masuk ke
   halaman pembentukan) atau *Isi manual* (seperti sekarang, langsung menjadi versi 1). Role yang dibuat sebelum E1
   dianggap versi 1 manual yang sudah Final.
2. Halaman pembentukan `/admin/role/[id]/bentuk` dengan empat langkah **Bahan → Kartu → Tanya jawab → Final**; detail
   role mendapat tab **Pembentukan** dan **Versi**.
   - **Bahan:** unggah uraian jabatan (PDF/DOCX, boleh lebih dari satu; masuk Pengetahuan dengan jenis
     `uraian_jabatan` berlingkup role itu dan diolah seperti dokumen lain), daftar alat dan kemampuan (teks bebas
     atau chip), deskripsi bebas tentang pekerjaan dan orang yang diwakili, dan penanggung jawab. **Analisis** aktif
     setelah bahan selesai diolah; uraian jabatan boleh dilewati bila deskripsinya cukup.
   - **Kartu keterampilan** (hasil analisis, bisa diubah langsung): ringkasan tugas dan tujuan; daftar keterampilan
     (nama, uraian, langkah kerja dengan titik persetujuan manusia, bahan, hasil, alat); setiap alat dipetakan ke
     katalog dengan status *tersedia*, *segera* (E3–E5), *pengganti* (dengan catatan), atau *belum didukung* (otomatis
     dicatat sebagai permintaan alat); kotak **Temuan** untuk hal yang kabur, bertentangan, alat yang kurang, atau
     bahan yang tidak lengkap, dengan rujukan ke uraian jabatan.
   - **Tanya jawab:** tampilan percakapan; role mengajukan paling banyak 5 pertanyaan per putaran (*wajib* atau
     *opsional*), pembuat menjawab, memilih *Lewati* atau *Tidak tahu*, atau menambah catatan sendiri. Role boleh
     berkeberatan bila instruksi bertentangan dengan uraian jabatan. *Kirim jawaban* memperbarui kartu (bagian yang
     berubah disorot) lalu mengajukan putaran berikutnya, sampai role menyatakan jelas atau pembuat memilih
     *Cukup, ke Final*.
   - **Final:** pratinjau isian kerja (tujuan, instruksi, isian tugas, format hasil, kriteria diterima, lingkup
     pengetahuan, izin internet); pertanyaan wajib yang belum terjawab menahan Final kecuali pembuat menulis alasan;
     catatan perubahan; status sesudahnya *aktif* atau *dijeda*. Hasilnya versi N.
3. **Versi:** daftar versi (nomor, sumber pembentukan/manual/pulihkan, siapa, kapan, catatan) dan perbandingan dua
   versi. *Ubah setelah Final* membuat revisi draf; **versi Final terakhir tetap bekerja selama revisi disusun**.
   *Pulihkan* membuat revisi draf dari versi lama. Ubahan di tab Instruksi atau Profil juga menjadi revisi; AI
   memeriksanya dan bertanya hanya bila perlu, sehingga ubahan kecil bisa langsung Final.
4. **Pengetahuan** mendapat tab *Dokumen* dan *Kebijakan & Aturan*; halaman PDF berat dan berkas gambar tampil dengan
   gambar kecil.
5. **Tugas:** Buat tugas dan Uji coba mendapat *Lampiran* (PNG, JPG, WEBP, PDF) dan pilihan *Internet* (ikut role atau
   mati). Detail tugas menampilkan penampil gambar dengan kotak bernomor dan daftar temuan yang saling tertaut;
   rujukan diberi tanda sumber *Aturan*, *Tanya jawab*, *Dokumen*, *Internet*, atau *Gambar*.
6. Pembentukan dan tanya jawab boleh dilakukan admin ke atas dan penanggung jawab role.

**Model data**

| Tabel atau kolom | Isi |
|---|---|
| `agent_revisions` (baru) | agent_id, version_no, status (`draft`, `analyzing`, `questioning`, `ready`, `final`, `superseded`, `discarded`), source (`formation`, `manual`, `restore`), materials JSON, card JSON (ringkasan, temuan), snapshot JSON (semua isian kerja), round_no, change_note, finalized_at, finalized_by_member_id, error_message |
| `agent_skills` (baru) | revision_id, key, name, description, steps JSON (dengan titik persetujuan), inputs, outputs, tools JSON (kunci katalog), support (`supported`, `upcoming`, `substitute`, `unsupported`), substitute_note, sort_order |
| `agent_formation_messages` (baru) | revision_id, round_no, author (`agent`, `member`), kind (`question`, `answer`, `objection`, `note`), question_id, required, text, refs JSON, skipped |
| `tool_requests` (baru) | organization_id, agent_id, revision_id, skill_name, requested, status (`open`, `planned`, `done`, `declined`); nanti dibaca panel pengelola platform |
| `agents` | + active_revision_id, web_search (bawaan mati). Kolom kerja yang ada tetap dibaca mesin sebagai salinan versi Final aktif; Final menyalin snapshot ke sana |
| `documents` | + category (`knowledge`, `policy`, `formation`, `qa`, `web`); untuk kebijakan: policy_kind (peraturan, kebijakan, standar mutu, panduan merek, lainnya), reference_no, issuer, effective_from, effective_until, policy_status (`berlaku`, `dicabut`); source_url untuk temuan internet. doc_type + `uraian_jabatan` |
| `document_versions` | + media_kind (`text`, `pdf`, `image`) |
| `document_sections` | + render (`text`, `scan`, `visual`), image_path, width, height, visual_text |
| `document_chunks` | + kind (`text`, `page_image`); embedding gambar halaman memakai kolom dan indeks HNSW yang sama (768) |
| `task_attachments` (baru) | organization_id, task_id (kosong sebelum tugas dibuat), file_name, storage_path, mime_type, size_bytes, sha256, width, height, page_count, exif JSON (tanggal dan lokasi pengambilan), uploaded_by_member_id, expires_at |
| `tasks` | + web_search (`role`, `off`) |
| `citations` | chunk_id boleh kosong; + source_kind (`policy`, `qa`, `document`, `web`, `image`, `attachment`), url, title, attachment_id, region JSON (kotak 0–1000) |
| `artifacts` | + findings JSON: no, title, description, severity (`info`, `perlu_perbaikan`, `penting`), attachment_id atau version_id+page_no, box, source, recommendation |
| `llm_calls` | kolom `kind` yang sudah ada mendapat nilai `formation`, `vision_ingest`, `web_search` (dipakai sebagai jenis pemakaian) |
| `knowledge_proposals` (baru) | url, title, excerpt, proposed_by, status, decided_by |

Katalog alat ditulis di kode (`app/services/tools/catalog.py`): kunci, nama, kelompok, status, dan kata pengenal untuk
pemetaan ("word", "docx", "ms word"…). Di E1 yang tersedia baru baca dokumen, baca gambar, dan pencarian internet;
alat dokumen, data, browser, dan media berstatus *segera*.

**Endpoint** (prefix `/api/v1/admin`)

- Pembentukan: `GET /role/{id}/pembentukan`, `POST …/pembentukan/mulai`, `PUT …/pembentukan/bahan`,
  `POST …/pembentukan/analisis` (202, dimuat ulang selama `analyzing`), `PUT …/pembentukan/kartu`,
  `POST …/pembentukan/jawab`, `POST …/pembentukan/final` (`409` bila bahan masih diolah atau ada pertanyaan wajib
  tanpa alasan), `POST …/pembentukan/batal`. Uraian jabatan diunggah lewat `POST /pengetahuan/create`.
- Versi: `GET /role/{id}/versi`, `GET /role/{id}/versi/{vid}`, `POST /role/{id}/versi/{vid}/pulihkan`.
- Alat: `GET /alat/katalog`, `GET /alat/permintaan`.
- Pengetahuan: saringan `category` di `read`; kolom kebijakan di `create`/`update`;
  `GET /pengetahuan/{id}/versions/{vid}/pages/{page}/image?box=y0,x0,y1,x1`; usulan temuan internet
  `POST`/`GET /pengetahuan/usulan`, `POST /pengetahuan/usulan/{id}/setujui` dan `/tolak`.
- Tugas: `POST /tugas/lampiran` (multipart) → `attachment_id`, dipakai lewat `attachment_ids` di `POST /tugas/create`
  dan `POST /role/{id}/trial`; `GET /tugas/lampiran/{aid}/pages/{page}?box=…`. `web_search` di update role dan buat tugas.

**Kebijakan dan urutan rujukan (E1b)**

- Pencarian bertingkat: kebijakan organisasi → hasil tanya jawab role → dokumen dalam lingkup → internet. Kebijakan
  `dicabut` atau lewat masa berlaku tidak ikut.
- Prompt mengelompokkan potongan di bawah ATURAN ORGANISASI, HASIL TANYA JAWAB, DOKUMEN, INTERNET; bila berbeda, aturan
  organisasi dipakai dan perbedaannya disebut di `notes`. Rujukan tetap dibuat server.
- Saat Final, server menyusun dokumen sistem "Hasil tanya jawab – {nama} v{N}" (`category=qa`, lingkup role,
  hanya-baca, satu bagian per pertanyaan) lalu dibuat embedding-nya. Versi lama diarsipkan.
- Uraian jabatan dan hasil tanya jawab hanya dibaca role pemiliknya, walaupun role lain berlingkup seluruh organisasi.

**PDF kompleks dan gambar (E1c)**

- Halaman dipilah dengan pypdf dan pypdfium2: `text` (diolah seperti sekarang, tanpa Gemini), `scan` (teks sedikit
  atau rusak), `visual` (banyak gambar atau garis). Halaman `scan`/`visual` dirender ke WebP (sisi panjang ±1600 px)
  di `uploads/<org>/pages/<version>/<page>.webp` dan dibuat satu embedding multimodal per halaman.
- Berkas gambar (PNG, JPG, WEBP, maks 10 MB) bisa diunggah sebagai pengetahuan: diperkecil sampai 2048 px, satu
  embedding multimodal, EXIF disimpan sebagai metadata.
- `VISION_PAGES_PER_DOCUMENT` bawaan 40 halaman berat per berkas; sisanya disimpan sebagai gambar tanpa embedding.
- Tanpa transkripsi saat unggah: bacaan Gemini atas halaman yang pertama kali dipakai disimpan ke `visual_text` agar
  ikut pencarian kata kunci berikutnya.
- Saat bekerja, halaman bergambar yang terpilih dan lampiran tugas dikirim sebagai gambar (PDF lampiran maks 20
  halaman); `MAX_IMAGES_PER_STEP` bawaan 6; `media_resolution` sedang. `LlmProvider.generate` mendapat `images` dan
  `web`; `mock` ikut diperluas.
- Keluaran terstruktur mendapat `findings` dan `regions` dengan kotak 0–1000 (`[y0, x0, y1, x1]`); server memeriksa
  rentang dan gambar yang ditunjuk, kotak tidak sah dibuang. Temuan pemeriksa ditautkan ke `criteria_results`.
- Kotak bernomor digambar frontend sebagai lapisan SVG; potongan rujukan dibuat server lewat `?box=`. Lampiran
  diteruskan lewat relasi bila `payload_spec` berisi konteks.
- Batas lampiran: 10 berkas × 10 MB per tugas.

**Pencarian internet (E1d)**

- Per role *mati* (bawaan) atau *boleh*; tugas bisa mematikannya. Dipicu hanya bila diizinkan dan dokumen internal
  kurang (skor teratas di bawah ambang) atau arahan meminta informasi terkini; maks 1 per langkah dan
  `WEB_SEARCH_PER_DAY` per organisasi.
- Dua panggilan: alat `google_search` Gemini menghasilkan temuan dan grounding metadata (tautan dibuat server dari
  metadata), lalu temuannya menjadi potongan `W1…` di panggilan utama yang terstruktur. Bila model mendukung
  gabungan alat dan keluaran terstruktur (dicek saat E1d), cukup satu panggilan.
- Rujukan internet menampilkan judul, domain, dan tautan; *Usulkan sebagai pengetahuan* → disetujui admin → dokumen
  organisasi `category=web`.

**Perkiraan kuota Gemini** (batas harian tier gratis untuk model, embedding, dan grounding dicek saat mulai)

| Kegiatan | Panggilan |
|---|---|
| Analisis awal | 1 generasi (teliti, cadangan seimbang); masuk 10–25 rb, keluar 3–5 rb token |
| Tiap putaran tanya jawab (biasanya 2–4) | 1 generasi; masuk 10–30 rb, keluar 2–4 rb token |
| Final | 1 generasi + embedding dokumen tanya jawab (±5–15 potongan) |
| Satu role sampai Final | ±4–7 generasi + ±10–30 embedding |
| 21 role | ±85–150 generasi + ±200–600 embedding, dicicil beberapa hari |
| PDF kompleks saat unggah | 1 embedding multimodal per halaman berat (maks 40 per berkas) |
| Membaca halaman atau gambar saat tugas | Tanpa panggilan tambahan; token +±300–1.100 per gambar |
| Pencarian internet | +1 generasi dan +1 grounding per langkah yang memicunya |

Pengaman: analisis dan tanya jawab lewat antrean `execution` (satu per satu), antre ulang dengan jeda saat 429,
`FORMATION_ROUNDS_MAX` bawaan 6, jenis pemakaian di `llm_calls.kind`, dan pemakaian hari ini per jenis di Pengaturan > Model AI. Uji
memakai `mock` serta contoh fiktif atau publik di `server/contoh/`.

**Pustaka baru:** pypdfium2 (Apache/BSD) dan Pillow (HPND), dipasang dengan izin saat E1c setelah sisa disk dicek.
Tidak ada perangkat lunak sistem.

Kemajuan:

- [x] Halaman dengan data contoh untuk E1a–E1d (27 November 2026, `MOCK_DB_VERSION` 11): `/admin/role/[id]/bentuk`
      (Bahan, Kartu, Tanya jawab, Final), tab Pembentukan dan Versi di detail role, dua jalan di Buat role; tab
      Kebijakan & Aturan dan Usulan di Pengetahuan; halaman bergambar dan unggah gambar; lampiran di Buat tugas dan
      Uji coba; temuan bertanda kotak di detail tugas dan uji coba; sumber internet dan izin internet per role;
      pemakaian hari ini di Pengaturan > Model AI. Contoh: Amir (versi 1 Final, revisi versi 2 sedang tanya jawab),
      tugas pemeriksaan poster vendor, tiga kebijakan (satu dicabut), satu usulan temuan internet.
- [x] Kontrak API (27 November 2026, `admin/API_CONTRACT.md` bagian 16): pembentukan dan versi role, katalog dan
      permintaan alat, kebijakan dan urutan rujukan, gambar halaman, lampiran dan temuan, pencarian internet dan usulan,
      pemakaian kuota, pengaturan `.env` baru, batas laju, dan jejak audit.
- [x] E1a backend dan uji (27 November 2026): tabel `agent_revisions`, `agent_skills`, `agent_formation_messages`,
      `tool_requests`, kolom `agents.web_search`/`active_revision_id` dan `documents.category` (migrasi juga membuat
      versi 1 manual untuk role yang sudah ada); katalog alat; analisis dan putaran tanya jawab di antrean `execution`;
      endpoint pembentukan, versi, dan alat; uraian jabatan oleh penanggung jawab; dokumen tanya jawab; pemakaian
      hari ini. Kolom E1b–E1d lain dikirim dengan nilai bawaan agar frontend mode API tidak rusak. Uji:
      `tests/integration/test_formation.py`, `tests/unit/test_tool_catalog.py`; pytest penuh 238 uji lulus.
- [x] E1b backend dan uji (27 November 2026): kolom kebijakan pada `documents` (jenis, nomor, penetap, masa
      berlaku, status) dan `citations.source_kind`; unggah dan ubah kebijakan; kebijakan yang dicabut, belum berlaku,
      atau lewat masa berlaku tidak ikut pencarian (tanggal menurut zona waktu organisasi); hasil pencarian dan
      potongan prompt disusun aturan → tanya jawab → dokumen dengan judul kelompok. Uji:
      `tests/integration/test_policies.py` dan uji unit urutan rujukan; pytest penuh 241 lulus.
- [x] E1c backend dan uji (27 November 2026): pypdfium2 dan Pillow dipasang; halaman PDF dipilah
      `text`/`scan`/`visual`, halaman berat dirender ke WebP dan dibuat embedding multimodal (maks 40 per berkas);
      unggah gambar PNG/JPG/WEBP dengan EXIF; endpoint gambar halaman dan potongan `box`; tabel `task_attachments`,
      unggah lampiran (PDF maks 20 halaman), pengikatan ke tugas, pembersih lampiran tak terpakai tiap jam;
      lampiran dan halaman bergambar dikirim ke Gemini (maks 6 gambar, resolusi sedang); temuan diperiksa server
      dan disimpan di `task_steps.findings`; bacaan halaman disimpan ke `visual_text`. Alamat gambar lampiran menjadi
      `/tugas/lampiran/{aid}/pages/{page}`. Uji: `tests/integration/test_images.py`, `tests/unit/test_visual.py`; pytest penuh 258 lulus
      (satu pesan galat yang diharapkan diperbarui lalu diuji ulang).
- [x] E1d backend dan uji (28 November 2026): kolom `tasks.web_search`, `task_steps.web_sources`,
      `documents.source_url`, tabel `knowledge_proposals`; pencarian Google bawaan Gemini dengan sumber dari
      grounding metadata (dua panggilan), dipicu hanya bila role mengizinkan dan dokumen kurang atau arahan minta
      info terkini, maks satu per langkah dan `WEB_SEARCH_PER_DAY`; kelompok INTERNET di prompt; linimasa mencatat
      pencarian; endpoint usulan dan persetujuannya. Isi halaman sumber tidak diambil ulang saat usulan disetujui
      (ditunda). Uji: `tests/integration/test_web.py`, `tests/unit/test_web_search.py`; pytest penuh 268 lulus.

#### E2. Tugas rutin: rancangan (disepakati 28 November 2026)

Dibagi tiga bagian: **E2a** kalender kerja, shift, dan cuti; **E2b** jadwal, pemahaman kalimat, dan pratinjau;
**E2c** penjadwal, putaran, coba ulang, susulan, dan notifikasi. Halaman dibuat sekaligus dengan data contoh, kontrak
API ditulis sekali (bagian 17), lalu backend dan uji per bagian (commit dan push tiap bagian).

**Alur**

1. Pengguna menulis jadwal dengan bahasa biasa (*"Isi laporan harian setiap Senin–Jumat pukul 16.05, jangan saat
   libur"*). Gemini menerjemahkannya menjadi aturan; server memeriksa aturan itu dan menghitung **5 putaran
   berikutnya** beserta tanggal yang dilewati dan alasannya.
2. Pengguna membetulkan lewat formulir bila perlu, lalu **Aktifkan**.
3. Setiap putaran membuat tugas biasa, sehingga berjalan di alur yang sudah ada (role, relasi, persetujuan, kantor).

**Kalender milik tenant.** MBUTI tidak mengisi libur nasional negara mana pun, karena tenant bisa dari negara lain.
Setiap organisasi mengatur sendiri:

- **Hari kerja:** hari apa saja dalam seminggu (misalnya Senin–Jumat atau Senin–Sabtu).
- **Shift:** dinamis, tanpa batas jumlah. Setiap shift punya nama, jam mulai dan selesai (boleh melewati tengah malam),
  dan hari berlakunya. Tanpa shift, organisasi dianggap satu jam kerja biasa.
- **Hari khusus:** libur (nasional, cuti bersama, perusahaan, daerah; nama jenisnya bebas) dan hari kerja pengganti.
  Diisi satu per satu atau diimpor dari CSV (`tanggal,nama,jenis`).
- Semua tanggal dan jam memakai zona waktu organisasi (`organizations.timezone`).

**Aturan jadwal** (`rule` JSONB, diperiksa server)

- Frekuensi: harian, hari kerja, mingguan (hari tertentu), bulanan (tanggal tertentu atau hari kerja terakhir),
  triwulan, atau tanggal-tanggal tertentu; tanggal mulai dan tanggal berakhir bila ada.
- Jam: jam tetap, atau terkait shift (*awal* atau *akhir* shift tertentu ditambah atau dikurangi menit); jadwal
  terkait shift hanya berjalan pada hari shift itu berlaku.
- Rentang sebar (misalnya 16.00–16.30): jadwal yang jatuh pada jam sama disebar otomatis.
- **Jatuh pada hari libur:** lewati (bawaan), maju ke hari kerja sebelumnya, atau mundur ke hari kerja berikutnya.
- **Pemilik role cuti:** tetap jalan dan persetujuan menunggu pemilik kembali (bawaan), atau lewati.
- **Gagal:** coba ulang otomatis 2 kali (15 menit, lalu 1 jam), beri tahu pemilik, lalu susulan di hari kerja
  berikutnya atau lewati.
- Penghitungan tanggal sepenuhnya oleh server (pasti dan bisa diuji); AI hanya menerjemahkan kalimat.

**Model data**

| Tabel | Isi |
|---|---|
| `schedules` | templat tugas (judul, arahan, role, masukan, prioritas, batas biaya, internet), `rule`, teks asli, status (`draft`, `active`, `paused`, `ended`), `next_run_at`, pembuat |
| `schedule_runs` | `planned_for`, status (`scheduled`, `created`, `skipped_holiday`, `skipped_leave`, `missed`, `failed`, `retrying`, `backfill`, `skipped`, `stopped_budget`), `task_id`, percobaan ke-, alasan |
| `work_shifts` | organisasi, nama, jam mulai, jam selesai, hari berlaku, warna |
| `calendar_days` | organisasi, tanggal, jenis (`holiday` atau `workday`), nama, label jenis |
| `member_leaves` | anggota, tanggal mulai dan selesai, catatan |
| `organizations.workdays` | daftar hari kerja (bawaan Senin–Jumat) |

**Penjadwal.** Celery beat menjalankan `dispatch_schedules` setiap menit: mengambil jadwal jatuh tempo dengan
`FOR UPDATE SKIP LOCKED`, membuat putaran dan tugasnya, lalu menghitung putaran berikutnya. Putaran yang terlambat
kurang dari 6 jam (misalnya worker mati) tetap dijalankan; yang lebih lama dicatat *terlewat* lalu mengikuti aturan
susulan. Anggaran bulanan organisasi yang habis menandai putaran *berhenti karena anggaran* dan memberi tahu pemilik.

**Halaman**

- **Tugas → tab Tugas rutin:** daftar jadwal (judul, role, jadwal dalam kalimat, putaran berikutnya, hasil terakhir,
  status). Buat atau ubah: kotak kalimat dan **Pahami jadwal**, formulir aturan, isian tugas, pratinjau 5 putaran.
  Detail: riwayat putaran (tanggal, status, tugas, lampiran, bukti), Jeda/Lanjutkan, Jalankan sekarang, Isi susulan.
- **Pengaturan → Kalender kerja:** hari kerja, shift, hari khusus per tahun, impor CSV.
- **Organisasi → Pengguna:** cuti setiap anggota.

**Hak akses.** Pemilik dan admin mengelola semua jadwal, kalender, dan cuti; anggota mengelola jadwal untuk role yang
ia tanggung jawabi dan cutinya sendiri; pengamat hanya melihat.

**Kuota Gemini.** Memahami jadwal: 1 panggilan setiap membuat atau mengubah (`llm_calls.kind = schedule_parse`).
Setiap putaran sama dengan satu tugas biasa (±1–3 panggilan per langkah). Contoh: 16 role dengan satu tugas harian
pada hari kerja ±16–50 panggilan sehari; uji coba memakai satu atau dua jadwal saja.

**Urutan kerja:** halaman dengan data contoh → kontrak API bagian 17 → E2a → E2b → E2c → coba sungguhan di
`mbuti_test` lalu dibatalkan.

- [x] Halaman E2 dengan data contoh (28 November 2026): tab Tugas rutin (daftar, buat/ubah, detail dan riwayat),
      Pengaturan → Kalender Kerja, cuti di halaman Pengguna; mock `lib/mock/schedule.ts` dan `routes/rutin.ts`
- [x] Kontrak API bagian 17 (28 November 2026)
- [x] E2a backend dan uji (28 November 2026): kalender kerja, shift, hari khusus beserta impor CSV, cuti; migrasi
      `a1d4e7c9b352` terpasang di database dev. Diuji dengan tes kalender dan migrasi saja (31 lulus), bukan seluruh pytest
- [x] E2b backend dan uji (28 November 2026): jadwal (simpan, ubah, jeda, lanjutkan), pemahaman kalimat, pratinjau;
      migrasi `b7e2f9a4c168` terpasang di database dev. Satu kalimat contoh dipahami benar oleh Gemini (percobaan
      pertama gagal karena model sedang tidak bisa dipakai). Jalankan sekarang, susulan, dan riwayat putaran menunggu E2c
- [x] E2c backend dan uji (28 November 2026): penjadwal Celery beat tiap menit, riwayat putaran, coba ulang,
      susulan, jalankan sekarang, email pemberitahuan; migrasi `c3a8d1e6f257` terpasang di database dev. Worker dan
      beat perlu dinyalakan ulang agar penjadwal aktif
- [x] Coba E2 sungguhan di `mbuti_test` dengan Gemini lalu dibatalkan (28 November 2026): libur dilewati, jalankan
      sekarang, penjadwal, coba ulang, susulan, dan email berjalan. Pemahaman kalimat bershift dan cuti semula salah;
      sesudah prompt diperbaiki, tiga kalimat contoh benar. Role tanpa dokumen tidak memanggil model dan menunggu
      keputusan manusia (perilaku mesin yang sudah ada), sehingga hasil kerja role terjadwal belum diuji dengan Gemini

#### E3. Surat dan berkas hasil: rancangan (disepakati 28 November 2026)

Hasil kerja role menjadi berkas yang bisa langsung dipakai, dimulai dari surat. **Tidak ada templat wajib dan tidak
memakai penanda `{{kolom}}`:** role menyusun surat secara bebas mengikuti rujukan terbaik yang tersedia.

**Bagian dan urutan:** **E3a** surat (DOCX dan PDF); **E3b** spreadsheet (XLSX, angka dihitung program); **E3c** mode
penyusunan (dari data, lengkapi, susun bebas). Presentasi (PPTX) dan alat olah PDF (gabung, pisah, tanda air,
formulir) menyusul bila diperlukan.

**Urutan rujukan format surat** (selalu per organisasi; misalnya Perbup tata naskah hanya berlaku bagi pemerintah
kabupaten yang mengunggahnya):

1. **Aturan persuratan** yang diunggah (PDF atau Word): jenis naskah, susunan, ukuran, penomoran, kewenangan tanda
   tangan.
2. **Contoh surat Word** yang diunggah: kop, huruf, margin, dan gaya dibaca langsung dari berkasnya. Aturan
   menentukan ketentuan, contoh menunjukkan tampilan; bila bertentangan, aturan dipakai dan perbedaannya
   diberitahukan.
3. **Internet** (pencarian gratis, cadangan Gemini), beserta tautan sumber.
4. **Bentuk umum** bila tidak ada satu pun.

Hasil dari urutan 3 dan 4 ditandai belum sesuai aturan resmi. Referensi internet bisa diusulkan menjadi pengetahuan
organisasi (alur usulan E1).

**Alur**

1. Pengguna meminta dengan bahasa biasa; role mengenali jenis naskahnya dan mencari rujukan.
2. Saat sebuah jenis naskah **pertama kali** diminta, AI membaca rujukannya dan mencatat **catatan format** (kertas,
   margin, huruf, kop, susunan bagian, penomoran, penanda tangan) beserta halaman sumbernya. Catatan dipakai lagi
   agar seragam dan hemat kuota. Tidak perlu disahkan dulu; hasilnya ditandai **format belum diperiksa**.
3. Role menyusun isi sebagai **susunan terstruktur** (bagian, paragraf, daftar, tabel) yang boleh bertambah atau
   berkurang sesuai kebutuhan.
4. Program membuat DOCX dari susunan itu dan catatan format, lalu LibreOffice (terpisah, batas waktu, makro mati)
   membuat PDF. Pembuatan berkas tidak memakai panggilan model tambahan.
5. Hasil diperiksa terhadap ketentuan; temuannya ditunjukkan dengan rujukan halaman.
6. Koreksi dengan bahasa biasa (*"tembusan taruh di kiri bawah"*) mengubah catatan format dan diingat. Rujukan yang
   diganti membuat catatan format disusun ulang.

**Nomor, kop, dan tanda tangan**

- **Nomor surat** dari buku register tiap organisasi, polanya mengikuti aturan, diberikan **saat surat disetujui**
  agar draf yang batal tidak membuat nomor loncat. Sebelum itu kolomnya kosong. Model tidak mengarang nomor.
- **Kop dan lambang** diambil dari contoh Word, atau diunggah sekali per organisasi atau unit sebagai gambar.
- **Tanda tangan:** role tidak menandatangani. Ia menyiapkan blok nama dan jabatan pejabat berwenang menurut aturan;
  penandatanganan dilakukan manusia di luar MBUTI (tanda tangan elektronik belum termasuk).

**Urutan kerja:** halaman dengan data contoh → kontrak API → backend → uji dengan dokumen contoh atau publik.

- [x] E3a halaman dengan data contoh (28 November 2026): kartu Berkas hasil di detail tugas dan Pengaturan →
      Persuratan; mock `lib/mock/letters.ts` dan `routes/surat.ts`. Tombol unggah, koreksi, dan simpan register belum
      dicoba di peramban
- [x] E3a kontrak API bagian 18 (28 November 2026). Diperjelas saat menulis: surat yang selesai tanpa persetujuan
      manusia diberi nomor lewat tombol **Beri nomor**; surat bernomor tidak bisa diubah; urutan nomor kembali ke 1
      tiap tahun
- [x] E3a backend dan uji (28 November 2026): isi surat dari role, catatan format, DOCX dan PDF (LibreOffice),
      nomor register, koreksi, dan pengaturan persuratan; migrasi `d9b4c7a2e815` terpasang di database dev. Belum
      dicoba dengan Gemini maupun di peramban dengan backend. Server produksi nanti memerlukan LibreOffice
- [x] Coba E3a sungguhan di `mbuti_test` dengan Gemini lalu dibatalkan (28 November 2026): dari pedoman contoh
      fiktif, format (F4, margin, huruf, susunan, pola nomor) terbaca benar, koreksi dan nomor bekerja. Dua temuan
      diperbaiki: kolom label terlalu lebar, dan isian kosong dianggap nama pejabat. Belum dicoba dengan aturan asli,
      contoh Word, kop gambar, atau pencarian internet
- [ ] E3b spreadsheet
- [ ] E3c mode penyusunan

#### E3b. Spreadsheet: rancangan (disepakati 28 November 2026)

Role menghasilkan berkas Excel dengan rumus hidup; **angka dihitung program, bukan model**.

1. **Lampiran tugas menerima Excel (`.xlsx`) dan CSV.** Program membaca datanya; role hanya melihat nama kolom, jumlah
   baris, dan beberapa contoh baris.
2. Role merancang tabel: kolom yang dipakai, pengelompokan, rumus, total, penanda baris, dan urutan.
3. Program mengisi **semua baris dari berkas asli**, menulis rumus ke Excel, lalu LibreOffice menghitungnya.
4. Hasil tampil di **Berkas hasil** sebagai pratinjau tabel, bisa diunduh, dan mengikuti persetujuan tugas.
5. Tanpa lampiran, role boleh mengisi tabel dari arahan atau dokumen; hasilnya ditandai **angka dari teks, periksa
   dulu**.

**Termasuk:** beberapa lembar; jumlah, rata-rata, hitung, minimum, maksimum; operasi antar kolom (mis. realisasi ÷
pagu); kelompok dengan subtotal, penanda warna, urutan; format angka, rupiah, persen, tanggal.
**Ditunda:** grafik, tabel pivot, rumus bebas dan makro, meniru gaya contoh Excel, PDF dari spreadsheet.
**Keamanan:** berkas dianggap tidak tepercaya (makro ditolak, ukuran dan jumlah baris dibatasi); teks yang diawali `=`
disimpan sebagai teks. Pustaka `openpyxl` (MIT).
**Contoh acuan:** rekap realisasi anggaran per bidang dengan data fiktif (berlaku bagi instansi maupun perusahaan).

- [x] E3b halaman dengan data contoh (28 November 2026): lampiran XLSX dan CSV, pratinjau spreadsheet di Berkas
      hasil; mock `lib/mock/sheets.ts`. Unduhan di data contoh berupa CSV dan XLSX unggahan tidak dibaca
- [x] E3b kontrak API (28 November 2026): bagian 19 di `admin/API_CONTRACT.md`
- [x] E3b backend dan uji (28 November 2026): `services/sheets/`, migrasi `e5c8a3f1b904`, `openpyxl` (MIT) dan
      `defusedxml` (PSF). Tes unit (termasuk hitungan lewat LibreOffice sungguhan) dan tes integrasi dengan model tiruan.
      Halaman belum dicoba terhadap backend
- [x] Coba E3b sungguhan di `mbuti_test` dengan Gemini lalu dibatalkan (28 November 2026): dari lampiran XLSX fiktif
      dan dari angka di arahan, seluruh angka cocok dengan data asli. Dua temuan diperbaiki: permintaan "per bidang"
      tidak dikelompokkan, dan cetakan terpotong jadi dua halaman. Belum dicoba dengan CSV atau berkas asli, beberapa
      lembar, role pemeriksa, dan data ribuan baris

#### E3c. Mode penyusunan: rancangan (disepakati 29 November 2026)

Mode dipilih di tiap role dan bisa diganti per tugas atau tugas rutin. Bawaannya **Dari data**, sehingga role yang ada
tetap bekerja seperti sebelumnya.

| | Dari data | Lengkapi | Susun bebas |
|---|---|---|---|
| Narasi, analisis, saran | Hanya dari data | Disusun role | Disusun role |
| Angka, tanggal, kejadian yang tidak ada | Isian kosong | Isian kosong | Boleh dibuat sebagai contoh |
| Aturan atau data tidak ditemukan | Berhenti dan memberi tahu | Tetap disusun dan ditandai | Tetap disusun dan ditandai |
| Isian wajib role belum diisi | Diminta dulu | Diminta dulu | Tidak diminta |
| Persetujuan manusia | Sesuai alur | Sesuai alur | Wajib bila ada isi buatan |

- **Di semua mode:** role tidak mengarang nama orang, NIP, tanda tangan, nomor surat, atau nomor peraturan; aturan
  organisasi tetap didahulukan; hitungan spreadsheet tetap dilakukan program.
- Bagian buatan role didaftar di aplikasi sebagai **Disusun sendiri oleh role**, tidak tercetak di dokumen. Mode
  setiap hasil tercatat di linimasa.
- Role pemeriksa tahu modenya: isi buatan yang terdaftar tidak ditolak, yang tidak terdaftar tetap diminta direvisi.
- **Berkas laporan:** laporan, notulen, dan proposal menjadi DOCX dan PDF, tanpa nomor register.
- **Ditunda:** menempelkan berkas lampiran ke surat secara otomatis, dan presentasi (PPTX).
- Uji dari halaman aplikasi terhadap backend dikumpulkan untuk sesi perbaikan.

- [x] E3c halaman dengan data contoh (29 November 2026): pilihan mode di role, tugas, dan tugas rutin; daftar bagian
      buatan role; persetujuan "Ada isi buatan role"; berkas laporan; mock `lib/mock/compose.ts` dan `reports.ts`.
      Dicoba di peramban untuk alur Susun bebas sampai disetujui
- [x] E3c kontrak API (29 November 2026): bagian 20 di `admin/API_CONTRACT.md`

#### Pertanyaan terbuka fase E

1. Cara isolasi ruang kerja tanpa Docker (sandbox tingkat sistem operasi atau layanan sandbox terpisah).
2. Tempat menyimpan berkas besar (video, lampiran); terkait butir penyimpanan berkas di fase D.
3. Enkripsi brankas dan kunci per organisasi.
4. Nomor WhatsApp: satu per organisasi atau satu per role.
5. Izin memasang LibreOffice (sekitar 600 MB–1 GB), FFmpeg, dan Chromium, karena disk pengembangan terbatas.
6. Pemakaian kuota Gemini tier gratis untuk tugas rutin (perkiraan untuk E1 ada di rancangan E1).
7. Revideo atau Motion Canvas untuk video dari templat (dipilih saat E5).

## 12. Risiko

| Risiko | Penanganan |
|---|---|
| Agen berputar tanpa henti | Batas revisi, langkah, dan biaya; eskalasi ke manusia |
| Jawaban mengarang | Rujukan dibuat server; status `not_in_documents`; pemeriksa menilai kriteria |
| Biaya model membengkak | Profil model murah untuk langkah ringan, batas per tugas dan bulanan, catatan biaya per panggilan |
| Kantor 3D berat | Geometri sederhana, instancing, tampilan 2D cadangan |
| Kontrak frontend dan backend berbeda | Kontrak ditulis dari mock dan ditinjau di A8; uji kontrak di B6 |
| Hak cipta karakter | Karakter dan nama buatan sendiri |
| Dokumen hasil scan tidak terbaca | Ditandai "belum didukung" pada versi pertama; fase E memakai OCR dan embedding multimodal |
| Gemini masih tier gratis (batas permintaan rendah, kuota dipakai bersama Toto-L) | Worker eksekusi berjalan satu per satu, antre ulang dengan jeda saat 429, rotasi kunci, mode `mock` selama pengembangan |
| Ketentuan tier gratis Google mengizinkan isi permintaan dipakai untuk pengembangan produk mereka | Uji coba hanya dengan dokumen contoh atau dokumen publik; SOP internal sungguhan menunggu tier berbayar |
| Akun aplikasi luar diblokir atau terkunci karena diisi otomatis | Sesi tersimpan, jeda antar-aksi, batas percobaan masuk, pemilik diberi tahu saat gagal |
| Nomor WhatsApp tidak resmi diblokir | Hanya untuk konfirmasi kode; Telegram dan notifikasi MBUTI sebagai cadangan |
| Lisensi perangkat lunak pihak ketiga | Utamakan open source berlisensi aman untuk SaaS; tabel alat dan lisensinya di fase E |

## 13. Keputusan terbuka

| # | Pertanyaan | Usulan |
|---|---|---|
| 3 | Contoh role untuk data contoh dan uji | Penyusun Surat Dinas dan Pemeriksa Surat |
| 4 | Bahasa antarmuka | Bahasa Indonesia, teks dikumpulkan agar mudah diterjemahkan |
| 5 | Server tujuan deploy | Perlu masukan sebelum fase C |

Sudah diputuskan (26 November 2026):

- Model bawaan: cepat `gemini-3.1-flash-lite`, seimbang `gemini-3.5-flash-lite`, teliti `gemini-4-hydrogen`, cadangan `gemini-3.1-flash-lite` (yang menjawab dengan kunci tier gratis). Seimbang semula `gemini-3.6-flash`, diganti karena sering 503 atau kehabisan waktu sehingga satu langkah butuh sekitar 3,5 menit. Bisa diubah di `.env` atau Pengaturan > Model AI.
- Kurs biaya Rp18.000 per dolar (`USD_IDR_RATE`).

- Satu organisasi per pengguna di versi pertama; tabel tetap multi-organisasi, pendaftaran terbuka belakangan.
- Keputusan lain tentang API dan perilaku ada di `admin/API_CONTRACT.md` bagian 13.

Sudah diputuskan (25 November 2026):

- Penyedia model AI adalah Gemini; embedding memakai `gemini-embedding-2` dengan 768 dimensi.
- Identitas visual: maskot robot lebah MBUTI (`admin/public/brand/`). Warna diambil dari maskot: ungu sayap untuk aksi utama, madu untuk sorotan, hitam lebah untuk teks dan panel gelap. Token warna ada di `admin/app/globals.css`.
