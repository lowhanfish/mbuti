# Rencana Pengembangan MBUTI

Diperbarui: 26 November 2026. Status: **A0–A7 selesai** (kerangka, identitas visual lebah, organisasi, unit, pengguna, role dengan karakter 3D, pengetahuan, peta relasi, tugas dan persetujuan, kantor 3D, dashboard dan pengaturan). **A8 selesai**: kontrak API disetujui beserta keputusannya. Fase A selesai. **B0–B4 selesai** (kerangka backend; auth, organisasi, unit, pengguna; role dan peta relasi; pengetahuan; pengaturan dan eksekusi satu role); berikutnya B5.

MBUTI (Multi-agent Business & Unified Task Intelligence) adalah platform untuk menyusun organisasi virtual berisi **role AI**. Setiap role bekerja berdasarkan SOP, manual book, dan panduan kerja yang diunggah, lalu berhubungan dengan role lain lewat relasi yang bisa diatur sendiri (menyerahkan, memeriksa, berkonsultasi, eskalasi ke manusia).

Berkas ini satu-satunya rencana aktif. Centang butir setelah hasilnya diverifikasi. Bagian 13 berisi keputusan yang masih terbuka.

---

## 1. Prinsip

1. **Frontend dulu, backend kemudian.** Seluruh layar dibangun dan disepakati dengan data contoh. Bentuk data di frontend menjadi kontrak API yang kemudian diikuti backend.
2. **Agen bekerja dari dokumen.** Setiap hasil kerja menyertakan rujukan ke dokumen dan halaman atau bagian. Jika aturan tidak ada di dokumen, agen mengatakannya, bukan menebak.
3. **Manusia tetap memegang keputusan.** Setiap alur bisa diberi titik persetujuan manusia. Agen tidak mengirim apa pun keluar sistem pada versi pertama.
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

Kondisi mesin saat ini: Python 3.12 ada, Redis 8 sudah berjalan, Node 20. PostgreSQL tidak dipasang lokal: database pengembangan memakai server jauh (Neon, PostgreSQL 18, lewat pooler) yang alamatnya diisi di `server/.env` (`DATABASE_URL`). Ini hanya untuk pengembangan; server produksi ditentukan di fase C.

Karena database pengembangan berada di layanan luar, isi hanya dengan data dan dokumen contoh atau publik.

- [x] Siapkan PostgreSQL dengan pgvector (Neon). Pilihan lokal bila diperlukan nanti: Postgres.app atau kompilasi sumber, karena pgvector dari Homebrew tidak mendukung PostgreSQL 17.
- [ ] Naikkan Node ke versi 22 LTS atau lebih baru (Node 20 sudah lewat masa dukungan).
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
5. Versi pertama tidak memberi agen alat lain (internet, email, berkas di luar sistem).

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

**B5. Relasi dalam eksekusi** (juga: tabel rujukan hasil, dan dokumen yang dirujuk diarsipkan bukan dihapus; tolak hapus role yang terlibat tugas berjalan, isi `task_count`, batas revisi dari pengaturan): handoff, review dengan batas revisi, eskalasi, persetujuan, hentikan tugas, pengaman biaya dan langkah, konsultasi sebelum bekerja, pemicu `on_rejected` (lalu tampilkan kembali pilihannya di peta).

**B6. Penyambungan**: frontend beralih `NEXT_PUBLIC_DATA_SOURCE=api`, perbaiki selisih kontrak, kantor 3D membaca status nyata.

### Fase C — Pengerasan dan rilis

- [ ] Uji alur ujung ke ujung untuk contoh "Penyusun Surat → Pemeriksa Surat → Persetujuan Kepala".
- [ ] Batas laju, audit log, cadangan database, pemantauan galat.
- [ ] Deploy tanpa Docker: `systemd` untuk uvicorn, worker, dan beat; Nginx sebagai reverse proxy; `next build` + `next start`.
- [ ] README: persiapan lingkungan, migrasi, seed, menjalankan, uji, dan cara membuat modul baru.

## 12. Risiko

| Risiko | Penanganan |
|---|---|
| Agen berputar tanpa henti | Batas revisi, langkah, dan biaya; eskalasi ke manusia |
| Jawaban mengarang | Rujukan dibuat server; status `not_in_documents`; pemeriksa menilai kriteria |
| Biaya model membengkak | Profil model murah untuk langkah ringan, batas per tugas dan bulanan, catatan biaya per panggilan |
| Kantor 3D berat | Geometri sederhana, instancing, tampilan 2D cadangan |
| Kontrak frontend dan backend berbeda | Kontrak ditulis dari mock dan ditinjau di A8; uji kontrak di B6 |
| Hak cipta karakter | Karakter dan nama buatan sendiri |
| Dokumen hasil scan tidak terbaca | Ditandai "belum didukung" pada versi pertama |
| Gemini masih tier gratis (batas permintaan rendah, kuota dipakai bersama Toto-L) | Worker eksekusi berjalan satu per satu, antre ulang dengan jeda saat 429, rotasi kunci, mode `mock` selama pengembangan |
| Ketentuan tier gratis Google mengizinkan isi permintaan dipakai untuk pengembangan produk mereka | Uji coba hanya dengan dokumen contoh atau dokumen publik; SOP internal sungguhan menunggu tier berbayar |

## 13. Keputusan terbuka

| # | Pertanyaan | Usulan |
|---|---|---|
| 3 | Contoh role untuk data contoh dan uji | Penyusun Surat Dinas dan Pemeriksa Surat |
| 4 | Bahasa antarmuka | Bahasa Indonesia, teks dikumpulkan agar mudah diterjemahkan |
| 5 | Server tujuan deploy | Perlu masukan sebelum fase C |

Sudah diputuskan (26 November 2026):

- Model bawaan: cepat `gemini-3.1-flash-lite`, seimbang `gemini-3.6-flash`, teliti `gemini-4-hydrogen`, cadangan `gemini-3.5-flash-lite` (yang menjawab dengan kunci tier gratis). Bisa diubah di `.env` atau Pengaturan > Model AI.
- Kurs biaya Rp18.000 per dolar (`USD_IDR_RATE`).

- Satu organisasi per pengguna di versi pertama; tabel tetap multi-organisasi, pendaftaran terbuka belakangan.
- Keputusan lain tentang API dan perilaku ada di `admin/API_CONTRACT.md` bagian 13.

Sudah diputuskan (25 November 2026):

- Penyedia model AI adalah Gemini; embedding memakai `gemini-embedding-2` dengan 768 dimensi.
- Identitas visual: maskot robot lebah MBUTI (`admin/public/brand/`). Warna diambil dari maskot: ungu sayap untuk aksi utama, madu untuk sorotan, hitam lebah untuk teks dan panel gelap. Token warna ada di `admin/app/globals.css`.
