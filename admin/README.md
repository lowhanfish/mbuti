# MBUTI — Frontend (`admin/`)

Antarmuka MBUTI: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, TanStack Query, Zustand, SweetAlert2.
Struktur dan pola kode mengikuti `admin/` di repo edusetara. Rencana lengkap ada di [`../PLANNING.md`](../PLANNING.md).
Kontrak API untuk backend ada di [`API_CONTRACT.md`](API_CONTRACT.md).

## Menjalankan

Butuh Node.js 20.9 atau lebih baru (disarankan 22 LTS).

```bash
cd admin
cp .env.example .env.local
npm install
npm run dev
```

Buka http://localhost:3000, lalu masuk dengan tombol **Masuk dengan akun demo**.

## Sumber data

`NEXT_PUBLIC_DATA_SOURCE` di `.env.local`:

| Nilai | Arti |
|---|---|
| `mock` (bawaan) | Data contoh di peramban (`lib/mock/`), tanpa backend. Tersimpan di `localStorage`. |
| `api` | Backend FastAPI di `NEXT_PUBLIC_API_URL`. |

Semua permintaan lewat `lib/transport.ts`. Halaman dan hooks tidak tahu apakah datanya contoh atau sungguhan,
jadi pindah ke backend cukup dengan mengganti variabel ini.

Untuk mengembalikan data contoh ke keadaan awal, hapus kunci `mbuti-mock-db` di `localStorage` peramban.
Bila bentuk data contoh berubah, naikkan `MOCK_DB_VERSION` di `lib/mock/seed.ts`.
Role dan relasi yang dihapus setelah dipakai tugas dipindah ke arsip (`lib/mock/lookup.ts`).

Mesin simulasi (`lib/mock/engine.ts`) membaca **Pengaturan > Model AI** (model dan biaya per langkah) serta
**Pengaturan > Batas Biaya** (anggaran bulanan, batas langkah, batas revisi). Daftar model, biaya, dan status
kunci API adalah data contoh (`lib/mock/settings.ts`, `lib/mock/routes/pengaturan.ts`); nilai kunci tidak pernah
ada di frontend.

## Pemeriksaan

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Struktur

```text
app/
  (publish)/            halaman depan
  (auth)/login/         masuk
  (admin)/
    _components/ui/     komponen bersama (Button, Card, Modal, Table, ...)
    _components/        ikon, logo, halaman sementara
    _data/              menu sidebar
    admin/<fitur>/      page.tsx, types.ts, hooks/crud.tsx, components/
lib/
  api.ts                permintaan tanpa sesi
  api_secure.ts         permintaan ber-sesi (CSRF, refresh otomatis)
  transport.ts          pengalih mock / api
  mock/                 data contoh: seed.ts, db.ts, router.ts, engine.ts, settings.ts, routes/
store/                  Zustand: useAuthStore, useUrlStore
types/                  tipe bersama dan bentuk respons API
```

## Menambah fitur baru

1. Buat `app/(admin)/admin/<fitur>/` berisi `page.tsx`, `types.ts`, `hooks/crud.tsx`, dan `components/`.
2. Tulis bentuk data di `types.ts`. Bentuk ini menjadi kontrak API untuk backend.
3. Tambahkan route contoh di `lib/mock/routes/<fitur>.ts`, lalu daftarkan di `lib/mock/index.ts`.
4. Panggil endpoint di `hooks/crud.tsx` lewat `fetchData` dengan URL dari `useUrlStore`.
5. Tambahkan menu di `app/(admin)/_data/admin-menu.json`.
6. Tambahkan endpoint dan bentuk datanya ke `API_CONTRACT.md`.

## Catatan Next.js 16

Proyek memakai `cacheComponents` dan `partialPrefetching`. Layout admin selalu merender `{children}`;
selama sesi diperiksa, isi ditutup lapisan pemuat. Jangan mengembalikan layout tanpa `{children}`,
karena Next.js akan menolak validasi *instant navigation*. Dokumentasi Next.js versi terpasang ada di
`node_modules/next/dist/docs/`.
