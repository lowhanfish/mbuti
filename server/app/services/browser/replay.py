"""Memutar ulang alur yang disetujui. Tidak memakai model."""

import asyncio
import time

from playwright.async_api import Error as PlaywrightError

from app.core.config import settings
from app.services.browser.risk import click_risk
from app.services.browser.session import (
    CAPTCHA,
    PAYMENT,
    Outcome,
    Refused,
    Session,
    Stop,
    match_element,
)
from app.services.browser.steps import approval_values, describe, name_of

NOTHING_SENT = "Tombol ditekan tetapi tidak ada yang terkirim. Periksa isian lalu coba lagi."
CHANGED = "Tampilan aplikasi kemungkinan berubah."
EXPIRED = "Sesi masuk tersimpan tidak berlaku lagi."


async def _find(session: Session, step: dict) -> tuple[dict | None, dict]:
    """Tunggu sasaran langkah muncul. Mengembalikan (elemen, pengamatan terakhir)."""
    deadline = time.monotonic() + settings.BROWSER_TIMEOUT_MS / 1000
    while True:
        observation = await session.observe()
        if observation["captcha"]:
            raise Stop(CAPTCHA)
        found = match_element(observation, step["target"], reading=step["action"] == "read")
        if found is not None:
            return found, observation
        # Halaman masuk sudah tampil penuh: tidak perlu menunggu kolom yang memang tidak ada
        if step["login"] and not observation["password_visible"] and observation["elements"]:
            if time.monotonic() > deadline - settings.BROWSER_TIMEOUT_MS / 1000 + 1.5:
                return None, observation
        if time.monotonic() > deadline:
            return None, observation
        await asyncio.sleep(0.4)


async def _message(session: Session) -> str:
    """Pesan yang ditampilkan aplikasi sesudah pengiriman."""
    observation = await session.observe()
    by_role = [r["name"] for r in observation["readables"] if r["role"] in ("status", "alert")]
    headings = [r["name"] for r in observation["readables"] if r["tag"] in ("h1", "h2")]
    return session.redact(" · ".join(by_role or headings[:1]) or observation["title"])[:300]


async def _perform_risk(session: Session, element: dict) -> str:
    """Tekan tombol yang disetujui dan pastikan sesuatu benar-benar terkirim."""
    before = session.page.url
    session.gate.reset()
    await session.hooks.before_risk()
    session.accept_dialogs = True
    try:
        with session.gate.permit():
            await session.click(element)
    except Refused:
        raise Stop("Tombol tidak bisa ditekan. Tidak ada jaminan apa pun terkirim.") from None
    finally:
        session.accept_dialogs = False
    if session.gate.failed_status is not None:
        raise Stop(f"Aplikasi menolak pengiriman (kode {session.gate.failed_status}).")
    if session.gate.blocked_pages:
        raise Stop("Aplikasi mengalihkan ke halaman di luar alamat terdaftar setelah dikirim.")
    if not session.gate.writes and session.page.url == before:
        raise Stop(NOTHING_SENT)
    return await _message(session)


async def replay(
    session: Session,
    steps: list[dict],
    inputs: list[dict],
    given: dict[str, str],
    *,
    approved_step: int | None,
    trusted: bool,
    resumed_session: bool,
) -> Outcome:
    hooks = session.hooks
    await session.goto()
    await hooks.event(describe(steps[0]), "done", 1, await session.screenshot())
    outputs: list[dict] = []
    skip_login = False
    index = 1
    while index < len(steps):
        step, number = steps[index], index + 1
        index += 1
        await hooks.checkpoint()
        if step["login"] and skip_login:
            continue
        element, observation = await _find(session, step)
        if element is None:
            if step["login"] and not observation["password_visible"]:
                skip_login = True
                await hooks.event("Sesi masih berlaku, langkah masuk dilewati.", "done", number)
                continue
            if resumed_session and not session.logged_in:
                return Outcome("failed", EXPIRED, retry_fresh=True)
            reason = f"Langkah {number} ({describe(step)}) tidak ditemukan. {CHANGED}"
            await hooks.event(reason, "failed", number, await session.screenshot())
            return Outcome("needs_repair", reason, outputs=outputs)

        action = step["action"]
        try:
            if action == "read":
                text = await session.locate(element).inner_text()
                outputs.append(
                    {"label": step["label"] or name_of(step), "value": session.redact(text)[:2000]}
                )
            elif step["source"] == "secret":
                await session.fill_secret(element, step["key"])
            elif action in ("fill", "select"):
                value = step["text"] if step["source"] == "text" else given.get(step["key"], "")
                await getattr(session, action)(element, value)
            elif action == "check":
                await session.check(element)
            else:
                risk = click_risk(element)
                if risk == "payment":
                    raise Stop(PAYMENT)
                if step["risk"] != "none":
                    needs = step["risk"] == "delete" or risk == "delete" or not trusted
                    if needs and approved_step != number:
                        question = (
                            f'Program akan menekan "{element["name"]}". Data yang dihapus '
                            "mungkin tidak bisa dikembalikan."
                            if "delete" in (step["risk"], risk)
                            else f'Isian sudah lengkap. Tekan "{element["name"]}" untuk '
                            "mengirim ke aplikasi?"
                        )
                        shot = await hooks.event(
                            "Menunggu persetujuan sebelum menekan tombol.",
                            "waiting",
                            number,
                            await session.screenshot(),
                        )
                        return Outcome(
                            "waiting_approval",
                            outputs=outputs,
                            pending={
                                "kind": "approval",
                                "step_no": number,
                                "question": question,
                                "values": approval_values(steps, inputs, given),
                                "shot": shot,
                            },
                        )
                    message = await _perform_risk(session, element)
                    outputs.append({"label": "Pesan aplikasi", "value": message})
                elif step["login"]:
                    if not await session.is_login_click(element):
                        return Outcome(
                            "needs_repair", f"Formulir masuk berubah. {CHANGED}", outputs=outputs
                        )
                    if not await session.login_click(element):
                        # Satu kali lagi dari awal rangkaian masuk; kegagalan kedua menghentikan
                        await hooks.event("Masuk gagal, dicoba sekali lagi.", "failed", number)
                        index = next(i for i, s in enumerate(steps) if s["login"])
                        await session.goto()
                        continue
                else:
                    if risk != "none":
                        return Outcome(
                            "needs_repair",
                            f"Tombol pada langkah {number} sekarang tampak berisiko. {CHANGED}",
                            outputs=outputs,
                        )
                    session.gate.reset()
                    await session.click(element)
                    if session.gate.blocked_writes:
                        return Outcome(
                            "needs_repair",
                            f"Langkah {number} sekarang mengirim data, jadi ditahan. {CHANGED}",
                            outputs=outputs,
                        )
                    session.check_page()
        except Refused as exc:
            reason = f"Langkah {number} ({describe(step)}) tidak bisa dijalankan. {exc}"
            await hooks.event(reason, "failed", number, await session.screenshot())
            return Outcome("needs_repair", reason, outputs=outputs)
        except PlaywrightError:
            return Outcome(
                "needs_repair",
                f"Langkah {number} ({describe(step)}) gagal. {CHANGED}",
                outputs=outputs,
            )
        await hooks.event(
            session.redact(describe(step)), "done", number, await session.screenshot()
        )
    return Outcome("succeeded", "Selesai. Bukti tersimpan.", outputs=outputs)
