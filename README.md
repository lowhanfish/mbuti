# MBUTI

MBUTI (Multi-agent Business & Unified Task Intelligence) adalah platform organisasi virtual berbasis AI. Organisasi menyusun **role AI** yang bekerja berdasarkan SOP, manual book, dan panduan kerja yang diunggah, lalu mengatur hubungan antar-role: siapa menyerahkan ke siapa, siapa memeriksa, dan kapan manusia harus memutuskan.

Rencana lengkap: [PLANNING.md](PLANNING.md).

## Struktur

| Folder | Isi | Status |
|---|---|---|
| [`admin/`](admin/) | Frontend Next.js | Tahap A0–A4 selesai: kerangka, login, organisasi, unit, pengguna, role, pengetahuan, peta relasi (data contoh) |
| `server/` | Backend FastAPI (venv + uvicorn) | Belum dibuat; dikerjakan setelah fase frontend |

## Menjalankan frontend

```bash
cd admin
cp .env.example .env.local
npm install
npm run dev
```

Buka http://localhost:3000 dan masuk dengan tombol **Masuk dengan akun demo**. Selama fase frontend, semua data adalah data contoh di peramban.
