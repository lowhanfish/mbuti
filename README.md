# MBUTI

MBUTI (Multi-agent Business & Unified Task Intelligence) adalah platform organisasi virtual berbasis AI. Organisasi menyusun **role AI** yang bekerja berdasarkan SOP, manual book, dan panduan kerja yang diunggah, lalu mengatur hubungan antar-role: siapa menyerahkan ke siapa, siapa memeriksa, dan kapan manusia harus memutuskan.

Rencana lengkap: [PLANNING.md](PLANNING.md). Kontrak API (disetujui): [admin/API_CONTRACT.md](admin/API_CONTRACT.md).

## Struktur

| Folder | Isi | Status |
|---|---|---|
| [`admin/`](admin/) | Frontend Next.js | Tahap A0–A8 selesai: kerangka, login, organisasi, unit, pengguna, role, pengetahuan, peta relasi, tugas, persetujuan, kantor 3D, dashboard, pengaturan model AI dan batas biaya. Tersambung ke backend (B6) |
| [`deploy/`](deploy/) | Berkas pemasangan di server | `systemd`, Nginx, dan panduan; belum diuji di server |
| [`server/`](server/) | Backend FastAPI (venv + uvicorn) | Tahap B0–B5 selesai: auth, organisasi, role, peta relasi, pengetahuan, pengaturan model dan biaya, uji coba role, tugas lintas role, persetujuan, kantor, dashboard, jejak audit, batas laju, dan cadangan |

## Menjalankan frontend

Butuh Node.js 24 LTS atau lebih baru (versinya tercatat di `.nvmrc`; dengan nvm cukup `nvm use` di folder proyek).

```bash
cd admin
cp .env.example .env.local
npm install
npm run dev
```

Frontend memakai backend di `NEXT_PUBLIC_API_URL`, jadi nyalakan backend, kedua worker, dan buat akun dulu (lihat di bawah). Buka http://localhost:3000 dan masuk dengan akun itu.

Untuk mencoba tanpa backend, isi `NEXT_PUBLIC_DATA_SOURCE=mock` di `admin/.env.local` lalu masuk dengan tombol **Masuk dengan akun demo**. Semua datanya data contoh di peramban.

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
celery -A app.workers.celery_app worker -Q default,ingestion --concurrency=2 -n umum@%h --loglevel=info
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

### Pendaftaran dan email

Organisasi bisa mendaftar sendiri di `/daftar` (`REGISTRATION_MODE=approval`, bawaan). Setelah emailnya
diverifikasi, organisasi menunggu persetujuan pengelola:

```bash
python -m scripts.setujui_organisasi --daftar
```

```bash
python -m scripts.setujui_organisasi SLUG-ORGANISASI
```

Tambahkan `--tangguhkan` untuk menangguhkan. Email verifikasi, undangan, dan atur ulang kata sandi dikirim worker
antrean `default`. Dengan `EMAIL_BACKEND=console` (bawaan pengembangan) isinya, termasuk tautannya, hanya ditulis ke
log worker; isi `SMTP_*` dan `EMAIL_BACKEND=smtp` untuk mengirim sungguhan.

### Data contoh

Setelah punya akun pemilik, tambahkan alur contoh **Penyusun Surat → Pemeriksa Surat → Persetujuan Kepala** (dua role, relasinya, dan satu SOP karangan di `server/contoh/`). Worker harus menyala agar SOP-nya diolah.

```bash
python -m scripts.data_contoh --email nama@instansi.go.id
```

Setelah dokumennya siap, buat tugas untuk **Rani**.

### Perawatan

Cadangan seluruh data dan berkas unggahan, serta pemulihannya ke database kosong:

```bash
python -m scripts.cadangan buat --tujuan ~/cadangan-mbuti --simpan 14
```

```bash
python -m scripts.cadangan pulihkan ~/cadangan-mbuti/NAMA-ARSIP.tar.gz
```

Pemeriksaan kesehatan (database, Redis, worker, antrean, tugas macet, disk, umur cadangan); kode keluar 1 bila ada yang gagal:

```bash
python -m scripts.periksa --cadangan ~/cadangan-mbuti
```

Bila `ALERT_EMAILS` diisi, pengelola diberi email saat ada yang gagal, pengingat tiap `ALERT_REMIND_HOURS` jam
(bawaan 6) selama masih gagal, dan email saat pulih. Email ini dikirim langsung, tidak lewat antrean, agar tetap
sampai walau Redis atau worker mati. Tambahkan `--tanpa-email` saat memeriksa dengan tangan.

Jejak tindakan ada di aplikasi: **Pengaturan > Jejak Audit**.

### Menguji

```bash
pytest
```

```bash
ruff check .
```

Bila `server/.env` memakai server jauh (mis. Neon), aplikasi dan tes integrasi butuh koneksi internet. Tiap query menempuh jarak ke server itu, jadi pilih wilayah database yang dekat; dengan database di benua lain, halaman butuh beberapa detik untuk terisi dan seluruh tes butuh lebih dari setengah jam.

`pytest tests/unit` berjalan tanpa database. Tes di `tests/integration` butuh PostgreSQL dan Redis, memakai database `mbuti_test` pada server yang sama, serta memasang dan membatalkan migrasi di sana. Jangan menyimpan data apa pun di database uji.

## Memasang di server

Panduan, layanan `systemd`, dan konfigurasi Nginx ada di [deploy/README.md](deploy/README.md). Berkas itu belum diuji di server sungguhan.

## Membuat modul baru

1. Rancang di frontend dulu dengan data contoh, ikuti [admin/README.md](admin/README.md#menambah-fitur-baru), lalu tulis bentuk datanya di kontrak API.
2. Model di `server/app/models/<domain>/`, daftarkan di `app/models/__init__.py`, lalu buat migrasi (`alembic revision --autogenerate -m "..."`) dan periksa isinya.
3. Endpoint di `server/app/api/v1/endpoints/admin/<fitur>/`: `schema.py` (sama dengan `types.ts`), `service.py` (aturan dan query, selalu disaring `organization_id`), `route.py` (hak akses dan jawaban). Daftarkan di `app/api/v1/router.py`.
4. Rute yang mengubah data wajib didaftarkan di `app/services/audit.py` (tes akan gagal bila terlewat). Beri `limited(...)` bila tindakannya mahal.
5. Tes di `server/tests/`, termasuk bahwa organisasi lain tidak bisa melihat atau mengubah datanya.
