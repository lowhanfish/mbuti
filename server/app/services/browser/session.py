"""
Satu sesi peramban untuk satu putaran, beserta tindakan yang menyentuh rahasia.

Pesan galat Playwright memuat nilai yang sedang diisikan, jadi tidak pernah dicatat atau
diteruskan; hanya jenisnya.
"""

import asyncio
import contextlib
import io
import os
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from PIL import Image
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright

from app.core.config import settings
from app.services.browser.network import AddressProxy, RequestGate, request_origin
from app.services.browser.risk import click_risk, is_card_field
from app.services.vault.secrets import Credentials

PAGE_SCRIPT = (Path(__file__).parent / "page.js").read_text(encoding="utf-8")
VIEWPORT = {"width": 1280, "height": 800}
SHOT_WIDTH = 1280
MAX_LOGIN_FAILURES = 2
HIDDEN = "‹rahasia›"
BROWSER_ENV = ("HOME", "PATH", "TMPDIR", "LANG", "TZ")

CAPTCHA = (
    "Aplikasi menampilkan CAPTCHA. Putaran dihentikan karena MBUTI tidak melewati CAPTCHA; "
    "selesaikan pekerjaan ini langsung di aplikasinya."
)
PAYMENT = "Pembayaran dan transfer tidak didukung. Putaran dihentikan."
OUTSIDE = "Halaman di luar alamat yang terdaftar di brankas tidak dibuka."
LOGIN_FAILED = (
    "Gagal masuk 2 kali. Periksa username dan password di tab Brankas; akun ini tidak dipakai "
    "lagi sampai passwordnya diganti atau dikonfirmasi."
)
OTP_TIMEOUT = "Kode OTP tidak dimasukkan dalam batas waktu."
APP_UNREACHABLE = "Aplikasi tidak bisa dibuka. Periksa alamatnya, lalu coba lagi."


class Stop(Exception):
    """Putaran berhenti dengan penjelasan untuk pengguna."""

    def __init__(self, message: str, *, status: str = "failed", login_failed: bool = False):
        super().__init__(message)
        self.message = message
        self.status = status
        self.login_failed = login_failed


class Refused(Exception):
    """Satu tindakan ditolak program; saat belajar, model diberi tahu dan boleh memilih lain."""


class Cancelled(Exception):
    """Pengguna menghentikan putaran."""


class Hooks(Protocol):
    async def event(
        self, message: str, status: str = "done", step_no: int | None = None, shot=None
    ) -> int: ...

    async def checkpoint(self) -> None: ...

    async def wait_otp(self, question: str, shot) -> str | None: ...

    async def before_risk(self) -> None: ...


@dataclass
class Outcome:
    status: str
    message: str = ""
    steps: list[dict] = field(default_factory=list)
    outputs: list[dict] = field(default_factory=list)
    pending: dict | None = None
    # Sesi tersimpan tidak cocok; ulangi dari awal tanpa sesi itu
    retry_fresh: bool = False


class Session:
    """Halaman, penjaga, dan rahasia satu putaran."""

    def __init__(self, page, context, gate: RequestGate, creds: Credentials, hooks: Hooks):
        self.page = page
        self.context = context
        self.gate = gate
        self.creds = creds
        self.hooks = hooks
        self.accept_dialogs = False
        self.login_failures = 0
        self.logged_in = False
        self._codes: set[str] = set()

    # ---------- membaca ----------

    async def pause(self) -> None:
        await asyncio.sleep(settings.BROWSER_ACTION_DELAY_MS / 1000)

    async def settle(self) -> None:
        for state, limit in (
            ("domcontentloaded", settings.BROWSER_TIMEOUT_MS),
            ("networkidle", 4000),
        ):
            with contextlib.suppress(PlaywrightError):
                await self.page.wait_for_load_state(state, timeout=limit)
        await self.pause()

    async def observe(self) -> dict:
        for attempt in range(3):
            try:
                return await self.page.evaluate(PAGE_SCRIPT)
            except PlaywrightError:
                # Halaman sedang berpindah
                if attempt == 2:
                    raise Stop(APP_UNREACHABLE) from None
                await self.settle()
        raise Stop(APP_UNREACHABLE)

    def redact(self, text: str) -> str:
        """Rahasia yang ikut tampil di halaman tidak boleh sampai ke model atau catatan."""
        for secret in (self.creds.password, self.creds.username, *self._codes):
            if len(secret) >= 3:
                index = text.lower().find(secret.lower())
                while index >= 0:
                    text = text[:index] + HIDDEN + text[index + len(secret) :]
                    index = text.lower().find(secret.lower(), index + len(HIDDEN))
        return text

    def check_page(self) -> None:
        if self.gate.blocked_pages or request_origin(self.page.url) not in self.creds.origins:
            raise Stop(OUTSIDE)

    async def screenshot(self) -> bytes | None:
        """WebP dengan kolom rahasia ditutup."""
        try:
            raw = await self.page.screenshot(
                type="png",
                mask=[
                    self.page.locator("input[type=password]"),
                    self.page.locator("[data-mbuti-secret]"),
                ],
                timeout=settings.BROWSER_TIMEOUT_MS,
            )
        except PlaywrightError:
            return None
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        if image.width > SHOT_WIDTH:
            image.thumbnail((SHOT_WIDTH, image.height))
        output = io.BytesIO()
        image.save(output, "WEBP", quality=70)
        return output.getvalue()

    # ---------- bertindak ----------

    def locate(self, element: dict):
        return self.page.locator(f'[data-mbuti-ref="{int(element["ref"])}"]')

    async def goto(self) -> None:
        self.gate.reset()
        try:
            await self.page.goto(self.creds.url, timeout=settings.BROWSER_TIMEOUT_MS)
        except PlaywrightError:
            if self.gate.blocked_pages:
                raise Stop(OUTSIDE) from None
            raise Stop(APP_UNREACHABLE) from None
        await self.settle()
        self.check_page()

    async def _act(self, action) -> None:
        try:
            await action
        except PlaywrightError:
            raise Refused("Elemen tidak bisa dipakai.") from None

    async def fill(self, element: dict, value: str) -> None:
        if element["role"] != "textbox" or element.get("disabled"):
            raise Refused("Elemen itu bukan kolom isian.")
        if element.get("type") == "password":
            raise Refused("Kolom password hanya boleh diisi password dari brankas.")
        if element.get("type") == "file":
            raise Refused("Unggah berkas belum didukung.")
        if is_card_field(element):
            raise Stop(PAYMENT)
        await self._act(self.locate(element).fill(value, timeout=settings.BROWSER_TIMEOUT_MS))
        await self.pause()

    async def select(self, element: dict, value: str) -> None:
        if element.get("tag") != "select":
            raise Refused("Elemen itu bukan daftar pilihan.")
        options = element.get("options", [])
        match = next((o for o in options if o.strip().lower() == value.strip().lower()), None)
        if match is None:
            raise Refused(f"Pilihan tidak ada. Yang tersedia: {', '.join(options[:10])}.")
        await self._act(
            self.locate(element).select_option(label=match, timeout=settings.BROWSER_TIMEOUT_MS)
        )
        await self.pause()

    async def check(self, element: dict) -> None:
        if element.get("role") not in ("checkbox", "radio"):
            raise Refused("Elemen itu bukan kotak centang.")
        await self._act(self.locate(element).check(timeout=settings.BROWSER_TIMEOUT_MS))
        await self.pause()

    async def click(self, element: dict) -> None:
        await self._act(self.locate(element).click(timeout=settings.BROWSER_TIMEOUT_MS))
        await self.settle()

    # ---------- rahasia ----------

    async def secret_value(self, key: str, shot_question: str) -> str:
        if key == "username":
            return self.creds.username
        if key == "password":
            return self.creds.password
        if key == "totp":
            if self.creds.totp is None:
                raise Refused("Akun ini tidak punya kunci authenticator.")
            # Kode yang hampir berganti ditunggu agar tidak kedaluwarsa di tengah pengiriman
            if self.creds.totp.seconds_left(time.time()) < 3:
                await asyncio.sleep(3)
            return self.creds.totp.code_at(time.time())
        if key == "otp":
            code = await self.hooks.wait_otp(shot_question, await self.screenshot())
            if code is None:
                raise Stop(OTP_TIMEOUT)
            return code
        raise Refused("Rahasia tidak dikenal.")

    async def fill_secret(self, element: dict, key: str) -> None:
        """Rahasia hanya diisikan ke kolom yang wajar, pada halaman di alamat terdaftar."""
        self.check_page()
        kind = element.get("type", "")
        form = element.get("form")
        if element["role"] != "textbox" or element.get("disabled"):
            raise Refused("Rahasia hanya diisikan ke kolom isian.")
        if form and form.get("action_origin") not in self.creds.origins:
            raise Stop(OUTSIDE)
        if key == "password" and kind != "password":
            raise Refused("Password hanya diisikan ke kolom password.")
        if key == "username" and kind not in ("", "text", "email", "tel"):
            raise Refused("Username hanya diisikan ke kolom teks atau email.")
        if key in ("totp", "otp") and kind not in ("", "text", "number", "tel", "password"):
            raise Refused("Kode hanya diisikan ke kolom kode.")
        value = await self.secret_value(
            key, "Aplikasi meminta kode OTP yang dikirim ke ponsel atau email Anda."
        )
        if key in ("totp", "otp"):
            self._codes.add(value)
        # Halaman bisa berubah selama menunggu kode OTP
        if key == "otp":
            self.check_page()
            element = await self.refresh_element(element)
        locator = self.locate(element)
        await self._act(
            locator.evaluate("(el, key) => el.setAttribute('data-mbuti-secret', key)", key)
        )
        await self._act(locator.fill(value, timeout=settings.BROWSER_TIMEOUT_MS))
        await self.pause()

    async def refresh_element(self, element: dict) -> dict:
        found = match_element(await self.observe(), element)
        if found is None:
            raise Stop("Kolom kode OTP sudah tidak ada. Jalankan lagi.")
        return found

    async def is_login_click(self, element: dict) -> bool:
        """Tombol yang mengirim formulir masuk: formulirnya berisi rahasia yang diisi program."""
        if element.get("role") not in ("button", "link") or click_risk(element) in (
            "delete",
            "payment",
        ):
            return False
        try:
            return await self.locate(element).evaluate(
                """el => {
                  const scope = el.form || el.closest('form') || document;
                  const shown = e => e.getClientRects().length > 0;
                  const skipped = ['hidden', 'submit', 'button', 'checkbox', 'radio'];
                  const fields = [...scope.querySelectorAll('input, textarea')]
                    .filter(e => shown(e) && !skipped.includes(e.type));
                  const secrets = fields.filter(e => e.hasAttribute('data-mbuti-secret'));
                  const passwords = fields.filter(e => e.type === 'password');
                  // Formulir ganti password punya beberapa kolom password
                  return secrets.length > 0 && fields.length <= 4 && passwords.length <= 1
                    && passwords.every(e => e.hasAttribute('data-mbuti-secret'));
                }"""
            )
        except PlaywrightError:
            return False

    async def login_click(self, element: dict) -> bool:
        """Tekan tombol masuk. False bila halamannya tetap meminta rahasia yang sama."""
        probe = await self.locate(element).evaluate(
            """el => {
              const scope = el.form || el.closest('form') || document;
              const found = [...scope.querySelectorAll('[data-mbuti-secret]')]
                .filter(e => e.getAttribute('data-mbuti-secret') !== 'username');
              if (!found.length) return null;
              const last = found[found.length - 1];
              return last.id ? '#' + CSS.escape(last.id)
                : last.name ? `input[name="${CSS.escape(last.name)}"]` : 'input[type=password]';
            }"""
        )
        with self.gate.permit():
            await self.click(element)
        self.check_page()
        failed = False
        if probe:
            with contextlib.suppress(PlaywrightError):
                failed = await self.page.locator(probe).first.is_visible()
        if failed:
            self.login_failures += 1
            if self.login_failures >= MAX_LOGIN_FAILURES:
                raise Stop(LOGIN_FAILED, login_failed=True)
            return False
        # Langkah username saja belum berarti sudah masuk
        self.logged_in = self.logged_in or bool(probe)
        return True

    async def state(self) -> dict | None:
        try:
            return await self.context.storage_state()
        except PlaywrightError:
            return None


def normal(name: str) -> str:
    return " ".join(name.lower().split())


def match_element(observation: dict, target: dict, *, reading: bool = False) -> dict | None:
    """
    Elemen yang sama dengan sasaran langkah: selektor yang tetap cocok perannya dan namanya,
    atau satu-satunya elemen dengan peran dan nama itu. Teks yang dibaca boleh berganti isi.
    """
    candidates = [*observation["elements"], *observation["readables"]]
    selector, role = target.get("selector", ""), target.get("role", "")
    name = normal(target.get("name", ""))
    for item in candidates:
        if item["selector"] == selector and item["role"] == role:
            if reading or normal(item["name"]) == name:
                return item
    if reading:
        return None
    same = [i for i in observation["elements"] if i["role"] == role and normal(i["name"]) == name]
    return same[0] if len(same) == 1 and name else None


@contextlib.asynccontextmanager
async def open_session(
    creds: Credentials, hooks: Hooks, storage_state: dict | None = None
) -> AsyncIterator[Session]:
    async with AddressProxy(creds.origins) as proxy, async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=settings.BROWSER_HEADLESS,
            chromium_sandbox=settings.BROWSER_SANDBOX,
            # Variabel lingkungan worker tidak diwariskan ke peramban
            env={k: v for k, v in os.environ.items() if k in BROWSER_ENV},
            # "<-loopback>": alamat localhost pun lewat perantara dan ikut diperiksa
            proxy={"server": proxy.url, "bypass": "<-loopback>"},
            args=["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
        )
        try:
            context = await browser.new_context(
                viewport=VIEWPORT,
                locale="id-ID",
                storage_state=storage_state,
                service_workers="block",
                accept_downloads=False,
            )
            context.set_default_timeout(settings.BROWSER_TIMEOUT_MS)
            gate = RequestGate(creds.origins)
            await context.route("**/*", gate.handle)
            await context.route_web_socket("**/*", gate.refuse_socket)
            context.on("response", gate.saw_response)
            page = await context.new_page()
            session = Session(page, context, gate, creds, hooks)

            async def dialog(found) -> None:
                with contextlib.suppress(PlaywrightError):
                    if session.accept_dialogs:
                        await found.accept()
                    else:
                        await found.dismiss()

            async def popup(other) -> None:
                if other is not page:
                    with contextlib.suppress(PlaywrightError):
                        await other.close()

            page.on("dialog", lambda found: asyncio.ensure_future(dialog(found)))
            context.on("page", lambda other: asyncio.ensure_future(popup(other)))
            yield session
        finally:
            with contextlib.suppress(PlaywrightError):
                await browser.close()
