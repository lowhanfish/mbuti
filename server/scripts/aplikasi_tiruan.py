"""
Aplikasi web tiruan untuk menguji alur aplikasi luar (E4b). Semua datanya di memori.

    python -m scripts.aplikasi_tiruan                 # http://127.0.0.1:8765/masuk
    python -m scripts.aplikasi_tiruan --kode sms      # minta kode SMS sesudah masuk
    python -m scripts.aplikasi_tiruan --berubah       # tampilan formulir berubah

Akun uji ada di `USERNAME` dan `PASSWORD` di bawah; nilai itu hanya berlaku di aplikasi ini.
"""

import argparse
import html
import secrets
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from app.core.totp import TotpKey

USERNAME = "operator.uji"
PASSWORD = "sandi-aplikasi-uji"
# Kunci authenticator contoh dan kode "SMS" tetap, hanya untuk aplikasi tiruan
TOTP_SECRET = "JBSWY3DPEHPK3PXP"
SMS_CODE = "246810"


class MockApp:
    """Perilakunya bisa diubah lewat atribut selagi berjalan."""

    def __init__(self, port: int = 0, host: str = "127.0.0.1"):
        # "", "totp", atau "sms"
        self.second_step = ""
        self.changed = False
        self.captcha = False
        self.reject = False
        # Tombol biasa yang diam-diam mengirim data
        self.hidden_write = False
        self.password = PASSWORD
        self.reports: list[dict] = []
        self.deleted: list[str] = []
        self.drafts = 0
        self.login_attempts = 0
        # Semua permintaan yang benar-benar sampai
        self.requests = 0
        self.sessions: dict[str, bool] = {}
        handler = type("Handler", (_Handler,), {"app": self})
        self.server = ThreadingHTTPServer((host, port), handler)
        self.server.daemon_threads = True

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}"

    def __enter__(self) -> "MockApp":
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *_) -> None:
        self.server.shutdown()
        self.server.server_close()


def _page(title: str, body: str) -> str:
    return (
        '<!doctype html><html lang="id"><head><meta charset="utf-8">'
        f"<title>{title} · Aplikasi Tiruan</title><style>"
        "body{font-family:sans-serif;max-width:640px;margin:32px auto;padding:0 16px}"
        "label{display:block;margin:12px 0 4px}input,textarea,select{padding:8px;width:100%}"
        "input[type=checkbox]{width:auto}button{margin-top:16px;padding:8px 16px}"
        "td,th{border:1px solid #ccc;padding:6px}table{border-collapse:collapse;width:100%}"
        f"</style></head><body><h1>{title}</h1>{body}</body></html>"
    )


class _Handler(BaseHTTPRequestHandler):
    app: MockApp

    def log_message(self, *_) -> None:
        pass

    def _send(self, body: str, status: int = 200) -> None:
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _go(self, path: str, cookie: str | None = None) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", path)
        if cookie:
            self.send_header("Set-Cookie", f"sesi={cookie}; Path=/; HttpOnly; Max-Age=3600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _token(self) -> str:
        for part in self.headers.get("Cookie", "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == "sesi":
                return value
        return ""

    def _form(self) -> dict[str, str]:
        size = int(self.headers.get("Content-Length") or 0)
        return {k: v[0] for k, v in parse_qs(self.rfile.read(size).decode()).items()}

    def _login_page(self, error: str = "") -> str:
        alert = f'<p role="alert">{error}</p>' if error else ""
        captcha = (
            '<div class="g-recaptcha" style="width:300px;height:70px">Saya bukan robot</div>'
            if self.app.captcha
            else ""
        )
        return _page(
            "Masuk",
            f"""{alert}<form method="post" action="/masuk">
            <label for="username">Username</label><input id="username" name="username">
            <label for="password">Password</label>
            <input id="password" name="password" type="password">
            {captcha}<button type="submit">Masuk</button></form>""",
        )

    def _code_page(self, error: str = "") -> str:
        alert = f'<p role="alert">{error}</p>' if error else ""
        source = "aplikasi authenticator" if self.app.second_step == "totp" else "SMS"
        return _page(
            "Verifikasi",
            f"""{alert}<p>Masukkan kode dari {source}.</p><form method="post" action="/kode">
            <label for="kode">Kode verifikasi</label>
            <input id="kode" name="kode" inputmode="numeric">
            <button type="submit">Verifikasi</button></form>""",
        )

    def do_GET(self) -> None:
        self.app.requests += 1
        path = urlsplit(self.path).path
        state = self.app.sessions.get(self._token())
        if path in ("/", "/masuk"):
            return self._go("/beranda") if state else self._send(self._login_page())
        if path == "/kode":
            return self._send(self._code_page())
        if not state:
            return self._go("/masuk")
        if path == "/beranda":
            return self._send(
                _page("Beranda", '<p>Selamat datang.</p><a href="/laporan">Laporan Harian</a>')
            )
        if path == "/laporan":
            return self._send(self._list_page())
        if path == "/laporan/baru":
            return self._send(self._new_page())
        if path == "/laporan/selesai":
            number = f"LH-{len(self.app.reports):03d}"
            return self._send(
                _page(
                    "Terkirim",
                    f'<p role="status">Laporan terkirim. Nomor bukti {number}</p>'
                    '<a href="/laporan">Kembali ke daftar</a>',
                )
            )
        self._send(_page("Tidak ada", ""), 404)

    def _list_page(self) -> str:
        rows = "".join(
            f"<tr><td>{html.escape(r['tanggal'])}</td><td>{html.escape(r['uraian'])}</td>"
            f'<td><form method="post" action="/laporan/{i}/hapus">'
            f"<button>Hapus laporan {i}</button></form></td></tr>"
            for i, r in enumerate(self.app.reports, start=1)
            if str(i) not in self.app.deleted
        )
        empty = "<tr><td colspan=3>Belum ada laporan.</td></tr>"
        return _page(
            "Laporan Harian",
            '<a href="/laporan/baru">Tambah laporan</a>'
            f"<table><tr><th>Tanggal</th><th>Uraian</th><th></th></tr>{rows or empty}</table>",
        )

    def _new_page(self) -> str:
        label, field, button = (
            ("Catatan pekerjaan", "catatan", "Ajukan sekarang")
            if self.app.changed
            else ("Uraian kegiatan", "uraian", "Kirim laporan")
        )
        extra = (
            "<button type=\"button\" onclick=\"fetch('/laporan/draf',{method:'POST'})\">"
            "Perbarui</button>"
            if self.app.hidden_write
            else ""
        )
        return _page(
            "Laporan Baru",
            f"""<form method="post" action="/laporan">
            <label for="tanggal">Tanggal</label><input id="tanggal" name="tanggal">
            <label for="{field}">{label}</label>
            <textarea id="{field}" name="{field}" required></textarea>
            <label for="jenis">Jenis</label>
            <select id="jenis" name="jenis"><option>Harian</option><option>Lembur</option></select>
            <label><input type="checkbox" name="benar"> Data sudah benar</label>
            {extra}<button type="submit">{button}</button></form>""",
        )

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        form = self._form()
        if path == "/masuk":
            self.app.login_attempts += 1
            if form.get("username") != USERNAME or form.get("password") != self.app.password:
                return self._send(self._login_page("Username atau password salah."))
            token = secrets.token_hex(16)
            self.app.sessions[token] = not self.app.second_step
            return self._go("/kode" if self.app.second_step else "/beranda", token)
        token = self._token()
        if path == "/kode" and token in self.app.sessions:
            expected = {SMS_CODE}
            if self.app.second_step == "totp":
                key = TotpKey(TOTP_SECRET)
                expected = {key.code_at(time.time() + shift) for shift in (-30, 0, 30)}
            if form.get("kode", "").strip() not in expected:
                return self._send(self._code_page("Kode salah."))
            self.app.sessions[token] = True
            return self._go("/beranda")
        if not self.app.sessions.get(token):
            return self._go("/masuk")
        if path == "/laporan":
            if self.app.reject:
                return self._send(_page("Gagal", '<p role="alert">Ditolak.</p>'), 500)
            self.app.reports.append(
                {
                    "tanggal": form.get("tanggal", ""),
                    "uraian": form.get("uraian") or form.get("catatan", ""),
                    "jenis": form.get("jenis", ""),
                }
            )
            return self._go("/laporan/selesai")
        if path == "/laporan/draf":
            self.app.drafts += 1
            return self._send("ok")
        if path.startswith("/laporan/") and path.endswith("/hapus"):
            self.app.deleted.append(path.split("/")[2])
            return self._go("/laporan")
        self._send(_page("Tidak ada", ""), 404)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--kode", choices=["totp", "sms"], default="")
    parser.add_argument("--berubah", action="store_true")
    parser.add_argument("--captcha", action="store_true")
    options = parser.parse_args()
    app = MockApp(options.port)
    app.second_step = options.kode
    app.changed, app.captcha = options.berubah, options.captcha
    print(f"Aplikasi tiruan di {app.url}/masuk (akun uji ada di berkas ini).")
    print("Tekan Ctrl+C untuk berhenti.")
    try:
        app.server.serve_forever()
    except KeyboardInterrupt:
        app.server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
