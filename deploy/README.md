# Memasang MBUTI di server (tanpa Docker)

Untuk Ubuntu/Debian dengan satu domain: Nginx melayani HTTPS, meneruskan `/api` ke uvicorn dan
sisanya ke Next.js. Berkas di folder ini **belum diuji di server sungguhan**; periksa dan sesuaikan
saat pemasangan pertama.

| Folder | Isi |
|---|---|
| `systemd/` | Layanan API, dua worker, penjadwal, frontend, cadangan harian, dan pemeriksaan tiap 5 menit |
| `nginx/` | Situs HTTPS, header keamanan, dan pembatas laju |
| `env/` | Contoh pengaturan produksi |

## 1. Kebutuhan

Python 3.12, Node.js 24 LTS atau lebih baru, Redis, Nginx, dan PostgreSQL dengan pgvector (di server ini
atau layanan jarak jauh yang **dekat** dengan server; tiap query menempuh jarak itu). Redis cukup
mendengarkan di `127.0.0.1`.

## 2. Pengguna, folder, dan kode

```bash
sudo useradd --system --home /var/lib/mbuti --shell /usr/sbin/nologin mbuti
sudo install -d -o mbuti -g mbuti /opt/mbuti /var/lib/mbuti /var/lib/mbuti/uploads
sudo install -d -o mbuti -g mbuti -m 700 /var/backups/mbuti
sudo -u mbuti git clone https://github.com/lowhanfish/mbuti.git /opt/mbuti
```

## 3. Backend

```bash
cd /opt/mbuti/server
sudo -u mbuti python3.12 -m venv .venv
sudo -u mbuti .venv/bin/pip install -e .
sudo install -o mbuti -g mbuti -m 600 /opt/mbuti/deploy/env/server.env.contoh .env
sudo -u mbuti nano .env
sudo -u mbuti .venv/bin/alembic upgrade head
sudo -u mbuti .venv/bin/python -m scripts.create_account
```

Aplikasi menolak menyala di produksi bila `JWT_SECRET_KEY` kurang dari 32 karakter,
`VAULT_KEY` kosong, atau `COOKIE_SECURE` bukan `true`. Simpan salinan `VAULT_KEY` terpisah dari
cadangan database. Verifikasi dua langkah yang tidak bisa dibuka pemiliknya dimatikan dengan
`.venv/bin/python -m scripts.matikan_dua_langkah <email>`. Skrip akun meminta kata sandi secara tersembunyi.

## 4. Frontend

```bash
cd /opt/mbuti/admin
sudo -u mbuti cp /opt/mbuti/deploy/env/admin.env.contoh .env.local
sudo -u mbuti nano .env.local
sudo -u mbuti npm ci
sudo -u mbuti npm run build
```

## 5. Layanan

```bash
sudo cp /opt/mbuti/deploy/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mbuti-api mbuti-worker mbuti-worker-eksekusi mbuti-beat mbuti-web
sudo systemctl enable --now mbuti-cadangan.timer mbuti-periksa.timer
```

## 6. Nginx

Ganti `mbuti.contoh.go.id` dan alamat sertifikat di `nginx/mbuti.conf`, lalu:

```bash
sudo cp /opt/mbuti/deploy/nginx/mbuti.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Periksa

```bash
curl -s https://mbuti.contoh.go.id/api/v1/health
sudo systemctl start mbuti-periksa; journalctl -u mbuti-periksa -n 20 --no-pager
```

## Memperbarui

```bash
sudo systemctl start mbuti-cadangan
cd /opt/mbuti && sudo -u mbuti git pull
cd server && sudo -u mbuti .venv/bin/pip install -e . && sudo -u mbuti .venv/bin/alembic upgrade head
cd ../admin && sudo -u mbuti npm ci && sudo -u mbuti npm run build
sudo systemctl restart mbuti-api mbuti-worker mbuti-worker-eksekusi mbuti-beat mbuti-web
```

## Cadangan dan pemulihan

Cadangan harian disimpan 14 arsip di `/var/backups/mbuti`: isi semua tabel dan berkas unggahan.
Arsip memuat hash kata sandi, jadi salin ke mesin lain lewat jalur yang aman. Cadangan di mesin yang
sama saja tidak menolong bila disknya rusak. Layanan database terkelola biasanya juga punya pemulihan
sendiri; aktifkan.

Memulihkan ke database **kosong** (hentikan semua layanan dulu, dan arahkan `.env` ke database itu):

```bash
sudo -u mbuti .venv/bin/alembic upgrade head
sudo -u mbuti .venv/bin/python -m scripts.cadangan pulihkan /var/backups/mbuti/NAMA-ARSIP.tar.gz
```

Skema database harus sama dengan saat cadangan dibuat; bila berbeda, skrip menyebut revisi yang
dibutuhkan. Uji pemulihan ke database percobaan secara berkala.

## Melacak galat

- Pemeriksaan: `journalctl -u mbuti-periksa`, atau `systemctl --failed` bila ada yang GAGAL.
- Setiap permintaan punya kode (`X-Request-ID`). Galat server menampilkan kodenya kepada pengguna;
  cari dengan `journalctl -u mbuti-api | grep KODE`.
- Worker: `journalctl -u mbuti-worker-eksekusi -f`.
- Siapa melakukan apa: menu **Pengaturan > Jejak Audit**.

Pemberitahuan otomatis (email atau pesan) belum ada; hubungkan status layanan systemd ke alat
pemantauan Anda.
