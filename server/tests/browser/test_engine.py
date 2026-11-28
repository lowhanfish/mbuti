"""Belajar dan memutar ulang dengan Chromium sungguhan terhadap aplikasi tiruan lokal."""

import asyncio

import pytest
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright

from app.services.browser.learn import learn
from app.services.browser.replay import replay
from app.services.browser.session import Stop, open_session
from scripts.aplikasi_tiruan import PASSWORD, SMS_CODE, USERNAME, MockApp
from tests.browser.helpers import (
    INPUTS,
    LOGIN,
    REPORT,
    FakeHooks,
    ScriptedModel,
    credentials,
)

GIVEN = {"tanggal": "2026-12-01", "uraian": "Menyusun laporan jaringan"}


@pytest.fixture(autouse=True)
async def chromium_installed() -> None:
    async with async_playwright() as playwright:
        try:
            browser = await playwright.chromium.launch()
        except PlaywrightError:
            pytest.skip("Chromium belum dipasang: playwright install --only-shell chromium")
        await browser.close()


@pytest.fixture
def app():
    with MockApp() as server:
        yield server


async def teach(app, script, creds=None, hooks=None, inputs=INPUTS):
    hooks = hooks or FakeHooks()
    model = ScriptedModel(*script)
    async with open_session(creds or credentials(app), hooks) as browser:
        outcome = await learn(browser, model, "Isi laporan harian lalu kirim.", inputs)
    return outcome, model, hooks


async def play(app, steps, *, approved=None, trusted=False, state=None, creds=None, hooks=None):
    hooks = hooks or FakeHooks()
    async with open_session(creds or credentials(app), hooks, state) as browser:
        outcome = await replay(
            browser,
            steps,
            INPUTS,
            GIVEN,
            approved_step=approved,
            trusted=trusted,
            resumed_session=state is not None,
        )
        return outcome, await browser.state(), hooks


async def test_learn_then_replay_with_approval_and_saved_session(app):
    app.second_step = "totp"
    creds = credentials(app, totp=True)
    script = (
        *LOGIN,
        ("fill", "Kode verifikasi", "secret", "totp"),
        ("click", "Verifikasi"),
        *REPORT,
    )
    outcome, model, hooks = await teach(app, script, creds)

    assert outcome.status == "succeeded"
    steps = outcome.steps
    # Belajar tidak mengirim apa pun; tombol kirim dicatat sebagai langkah terakhir
    assert app.reports == [] and steps[-1]["risk"] == "submit"
    assert [s["login"] for s in steps[1:6]] == [True] * 5
    asked = " ".join(model.prompts)
    assert PASSWORD not in asked and USERNAME not in asked
    assert hooks.shots and hooks.shots[0][:4] == b"RIFF"

    waiting, state, hooks = await play(app, steps, creds=creds)
    assert waiting.status == "waiting_approval" and app.reports == []
    assert hooks.submitted == 0
    assert {"label": "Isian tetap: Jenis", "value": "Lembur"} in waiting.pending["values"]

    logins = app.login_attempts
    done, _, hooks = await play(
        app, steps, creds=creds, state=state, approved=waiting.pending["step_no"]
    )
    assert done.status == "succeeded", done.message
    assert app.reports == [
        {"tanggal": GIVEN["tanggal"], "uraian": GIVEN["uraian"], "jenis": "Lembur"}
    ]
    assert hooks.submitted == 1
    assert "Nomor bukti LH-001" in done.outputs[-1]["value"]
    # Sesi tersimpan dipakai: tidak masuk ulang
    assert app.login_attempts == logins


async def test_trusted_flow_sends_directly_and_reports_rejection(app):
    outcome, _, _ = await teach(app, (*LOGIN, *REPORT))
    app.reject = True
    with pytest.raises(Stop, match="menolak"):
        await play(app, outcome.steps, trusted=True)
    app.reject = False
    done, _, _ = await play(app, outcome.steps, trusted=True)
    assert done.status == "succeeded" and len(app.reports) == 1


async def test_changed_layout_needs_repair(app):
    outcome, _, _ = await teach(app, (*LOGIN, *REPORT))
    app.changed = True
    result, _, _ = await play(app, outcome.steps, trusted=True)

    assert result.status == "needs_repair" and "Uraian kegiatan" in result.message
    assert app.reports == []


async def test_wrong_password_stops_after_two_attempts(app):
    creds = credentials(app, password="sandi-yang-salah")
    with pytest.raises(Stop) as stopped:
        await teach(app, (*LOGIN, *LOGIN, *LOGIN), creds)

    assert stopped.value.login_failed and app.login_attempts == 2


async def test_captcha_is_not_passed(app):
    app.captcha = True
    with pytest.raises(Stop, match="CAPTCHA"):
        await teach(app, LOGIN)
    assert app.login_attempts == 0


async def test_sms_code_comes_from_the_owner(app):
    app.second_step = "sms"
    hooks = FakeHooks(otp=SMS_CODE)
    script = (
        *LOGIN,
        ("fill", "Kode verifikasi", "secret", "otp"),
        ("click", "Verifikasi"),
        ("click", "Laporan Harian"),
        ("read", "Tanggal Uraian Belum ada laporan.", "", "Daftar laporan"),
        ("done", ""),
    )
    outcome, model, _ = await teach(app, script, hooks=hooks, inputs=[])

    assert outcome.status == "succeeded" and hooks.asked_otp == 1
    assert SMS_CODE not in " ".join(model.prompts)


async def test_hidden_write_is_blocked_and_recorded_as_submit(app):
    app.hidden_write = True
    script = (*LOGIN, *REPORT[:2], ("click", "Perbarui"))
    outcome, _, _ = await teach(app, script)

    assert outcome.steps[-1]["risk"] == "submit" and app.drafts == 0


async def test_password_only_goes_into_a_password_field(app):
    script = (
        ("fill", "Username", "secret", "password"),
        ("fill", "Username", "text", "x"),
        ("fail", "cukup"),
    )
    with pytest.raises(Stop, match="cukup"):
        await teach(app, script)


async def test_other_internal_addresses_cannot_be_reached_at_all(app):
    """Bukti bahwa lalu lintas localhost pun lewat perantara yang memeriksa alamat."""
    with MockApp() as other:
        async with open_session(credentials(app), FakeHooks()) as browser:
            await browser.goto()
            await browser.page.evaluate(
                "url => fetch(url, {mode: 'no-cors'}).catch(() => null)", f"{other.url}/masuk"
            )
            await asyncio.sleep(0.5)
        assert app.requests >= 1 and other.requests == 0


async def test_pages_outside_the_registered_address_are_not_opened(app):
    with MockApp() as other:
        creds = credentials(app)
        hooks = FakeHooks()
        async with open_session(creds, hooks) as browser:
            await browser.goto()
            await browser.page.evaluate("url => { location.href = url }", f"{other.url}/masuk")
            await asyncio.sleep(1)
            with pytest.raises(Stop, match="di luar alamat"):
                browser.check_page()
