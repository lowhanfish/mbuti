# MBUTI

MBUTI (Multi-agent Business & Unified Task Intelligence) adalah platform organisasi virtual berbasis AI. Organisasi menyusun **role AI** yang bekerja berdasarkan SOP, manual book, dan panduan kerja yang diunggah, lalu mengatur hubungan antar-role: siapa menyerahkan ke siapa, siapa memeriksa, dan kapan manusia harus memutuskan.

Rencana lengkap: [PLANNING.md](PLANNING.md). Kontrak API (disetujui): [admin/API_CONTRACT.md](admin/API_CONTRACT.md).

## Struktur

| Folder | Isi | Status |
|---|---|---|
| [`admin/`](admin/) | Frontend Next.js | Tahap A0–A8 selesai: kerangka, login, organisasi, unit, pengguna, role, pengetahuan, peta relasi, tugas, persetujuan, kantor 3D, dashboard, pengaturan model AI dan batas biaya (data contoh) |
| [`server/`](server/) | Backend FastAPI (venv + uvicorn) | Tahap B0–B5 selesai: auth, organisasi, role, peta relasi, pengetahuan, pengaturan model dan biaya, uji coba role, tugas lintas role, persetujuan, kantor, dan dashboard. Frontend belum disambungkan (B6) |

## Menjalankan frontend

```bash
cd admin
cp .env.example .env.local
npm install
npm run dev
```

Buka http://localhost:3000 dan masuk dengan tombol **Masuk dengan akun demo**. Semua data adalah data contoh di peramban sampai frontend disambungkan ke backend (tahap B6).

## Menjalankan backend

Butuh Python 3.12, PostgreSQL dengan ekstensi pgvector (lokal atau layanan jarak jauh), dan Redis.

### Persiapan (sekali)

```bash
cd server
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp -n .env.example .env    # -n: berkas .env yang sudah ada tidak ditimpa
```

Isi alamat database di `server/.env`, lewat `DATABASE_URL` atau variabel `DB_*`. Lalu buat dua database di server tersebut, lewat `psql` atau editor SQL penyedia:

```sql
CREATE DATABASE mbuti;
CREATE DATABASE mbuti_test;
```

Ekstensi `vector` diaktifkan oleh migrasi. Isi juga `JWT_SECRET_KEY` bila ingin sesi bertahan saat server dimulai ulang tanpa perlu diperpanjang; di produksi wajib. Bila akun database tidak boleh membuat ekstensi, minta administrator menjalankan `CREATE EXTENSION vector;` di kedua database.

### Menjalankan

Semua perintah dijalankan dari `server/` dengan venv aktif.

```bash
alembic upgrade head
```

Buat akun pemilik pertama (sekali; kata sandi diketik tersembunyi):

```bash
python -m scripts.create_account
```

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Dokumen baru diolah, dan tugas baru dikerjakan, bila worker menyala. Pengolahan, pencarian, dan kerja role memakai
kunci `GEMINI_API_KEY`, `GEMINI_API_KEY1`, … di `server/.env` (dipakai bergiliran). Isi dokumen dan tugas dikirim ke
Google; pada tier gratis, gunakan hanya data contoh atau publik. Berkas asli disimpan di `server/uploads/`.

Dua worker dan penjadwal Celery, masing-masing di terminal sendiri. Worker pertama mengolah dokumen:

```bash
celery -A app.workers.celery_app worker -Q default,ingestion -n umum@%h --loglevel=info
```

Worker kedua mengerjakan tugas, satu langkah pada satu waktu agar kuota model tidak cepat habis:

```bash
celery -A app.workers.celery_app worker -Q execution --concurrency=1 -n eksekusi@%h --loglevel=info
```

Penjadwal mengirim ulang tugas yang pesannya hilang, mis. setelah worker atau Redis mati:

```bash
celery -A app.workers.celery_app beat --loglevel=info
```

- Health check: http://localhost:8000/api/v1/health (200 bila database, pgvector, dan Redis siap; 503 bila tidak).
- Dokumentasi API: http://localhost:8000/docs (hanya saat `APP_DEBUG=true`).
- Redis memakai basis data 1 (`REDIS_URL`) agar tidak bercampur dengan aplikasi lain.

### Menguji

```bash
pytest
```

```bash
ruff check .
```

Bila `server/.env` memakai server jauh (mis. Neon), tes integrasi butuh koneksi internet dan jauh lebih lambat (beberapa menit).

`pytest tests/unit` berjalan tanpa database. Tes di `tests/integration` butuh PostgreSQL dan Redis, memakai database `mbuti_test` pada server yang sama, serta memasang dan membatalkan migrasi di sana. Jangan menyimpan data apa pun di database uji.
