# MBUTI

MBUTI (Multi-agent Business & Unified Task Intelligence) adalah platform organisasi virtual berbasis AI. Organisasi menyusun **role AI** yang bekerja berdasarkan SOP, manual book, dan panduan kerja yang diunggah, lalu mengatur hubungan antar-role: siapa menyerahkan ke siapa, siapa memeriksa, dan kapan manusia harus memutuskan.

Rencana lengkap: [PLANNING.md](PLANNING.md). Kontrak API (disetujui): [admin/API_CONTRACT.md](admin/API_CONTRACT.md).

## Struktur

| Folder | Isi | Status |
|---|---|---|
| [`admin/`](admin/) | Frontend Next.js | Tahap A0–A8 selesai: kerangka, login, organisasi, unit, pengguna, role, pengetahuan, peta relasi, tugas, persetujuan, kantor 3D, dashboard, pengaturan model AI dan batas biaya (data contoh) |
| [`server/`](server/) | Backend FastAPI (venv + uvicorn) | Tahap B0 selesai: konfigurasi, bentuk galat, Alembic, PostgreSQL + pgvector, Celery, health check, tes. Belum ada endpoint fitur |

## Menjalankan frontend

```bash
cd admin
cp .env.example .env.local
npm install
npm run dev
```

Buka http://localhost:3000 dan masuk dengan tombol **Masuk dengan akun demo**. Selama fase frontend, semua data adalah data contoh di peramban.

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

Ekstensi `vector` diaktifkan oleh migrasi. Bila akun database tidak boleh membuat ekstensi, minta administrator menjalankan `CREATE EXTENSION vector;` di kedua database.

### Menjalankan

Semua perintah dijalankan dari `server/` dengan venv aktif.

```bash
alembic upgrade head
```

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Worker dan penjadwal Celery, masing-masing di terminal sendiri:

```bash
celery -A app.workers.celery_app worker --loglevel=info
```

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

Bila `server/.env` memakai server jauh (mis. Neon), tes integrasi butuh koneksi internet dan lebih lambat.

`pytest tests/unit` berjalan tanpa database. Tes di `tests/integration` butuh PostgreSQL dan Redis, memakai database `mbuti_test` pada server yang sama, serta memasang dan membatalkan migrasi di sana. Jangan menyimpan data apa pun di database uji.
