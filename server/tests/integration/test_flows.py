"""Alur aplikasi luar lewat API dan pelarinya (E4b, kontrak API bagian 22)."""

import uuid

import pytest
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright
from sqlalchemy import select, update

from app.core import encryption
from app.models import Agent, AuditLog, BrowserFlow, BrowserRun, LlmCall, VaultAccount
from app.services.browser import runner
from app.services.llm.generation import Generation
from app.services.vault import secrets
from scripts.aplikasi_tiruan import PASSWORD, USERNAME, MockApp
from tests.browser.helpers import INPUTS, LOGIN, REPORT, ScriptedModel
from tests.integration.world import add_agents

ADMIN = "/api/v1/admin"


class ScriptedLlm:
    name = "mock"

    def __init__(self, *script):
        self.model = ScriptedModel(*script)

    async def generate(self, model, system, user, schema, images=()):
        return Generation(await self.model(system, user, schema), 100, 20)


@pytest.fixture(autouse=True)
async def chromium_installed() -> None:
    async with async_playwright() as playwright:
        try:
            browser = await playwright.chromium.launch()
        except PlaywrightError:
            pytest.skip("Chromium belum dipasang")
        await browser.close()


@pytest.fixture
def app():
    with MockApp() as server:
        yield server


async def prepare(world, app, *, password: str = PASSWORD) -> tuple[str, str]:
    """Role yang ditanggung `a_member` beserta satu akun brankas."""
    [agent] = await add_agents(world, "a", "Rani")
    async with world.sessions() as session:
        await session.execute(
            update(Agent)
            .where(Agent.id == uuid.UUID(agent))
            .values(owner_member_id=world.members["a_member"].id)
        )
        account = VaultAccount(
            id=uuid.uuid4(),
            organization_id=world.organizations["a"].id,
            agent_id=uuid.UUID(agent),
            name="Aplikasi Tiruan",
            responsible_member_id=world.members["a_member"].id,
            password_changed_at=world.members["a_member"].joined_at,
        )
        for column, value in (
            ("url", f"{app.url}/masuk"),
            ("other_urls", "[]"),
            ("username", USERNAME),
            ("password", password),
        ):
            secrets.seal(account, column, value)
        session.add(account)
        await session.commit()
    return agent, str(account.id)


async def work(world, queued: list[str], llm=None) -> str | None:
    return await runner.execute(world.sessions, uuid.UUID(queued.pop(0)), lambda: llm)


def body(account_id: str) -> dict:
    return {
        "account_id": account_id,
        "name": "Isi laporan",
        "goal": "Isi laporan harian lalu kirim.",
        "inputs": INPUTS,
    }


async def test_learn_approve_run_and_repair(world, sign_in, app, queued_runs, sent_emails):
    agent, account = await prepare(world, app)
    member, admin = await sign_in("a_member"), await sign_in("a_admin")
    viewer, outsider = await sign_in("a_viewer"), await sign_in("b_owner")

    assert (await viewer.post(f"{ADMIN}/role/{agent}/alur", json=body(account))).status_code == 403
    assert (await outsider.get(f"{ADMIN}/role/{agent}/alur")).status_code == 404
    created = await member.post(f"{ADMIN}/role/{agent}/alur", json=body(account))
    assert created.status_code == 201, created.text
    flow = created.json()["data"]
    assert flow["status"] == "learning" and flow["active_run_id"]
    # Satu alur satu putaran
    busy = await member.post(f"{ADMIN}/alur/{flow['id']}/hapus")
    assert busy.status_code == 409

    llm = ScriptedLlm(*LOGIN, *REPORT)
    assert await work(world, queued_runs, llm) is None
    learned = (await member.get(f"{ADMIN}/alur/{flow['id']}")).json()["data"]
    assert learned["status"] == "review", learned["note"]
    assert learned["steps"][-1]["risk"] == "submit" and app.reports == []
    assert PASSWORD not in str(learned) and PASSWORD not in " ".join(llm.model.prompts)
    shot = learned["steps"][-1]["screenshot_url"]
    picture = await member.get(shot)
    assert picture.status_code == 200 and picture.headers["content-type"] == "image/webp"
    # Anggota lain melihat langkahnya, bukan isi akunnya
    hidden = (await viewer.get(f"{ADMIN}/alur/{flow['id']}")).json()["data"]
    assert hidden["steps"][-1]["screenshot_url"] is None and hidden["inputs"][0]["sample"] == ""
    assert (await viewer.get(shot)).status_code == 403
    assert (await outsider.get(shot)).status_code == 404

    run_url = f"{ADMIN}/alur/{flow['id']}/jalankan"
    values = {"tanggal": "2026-12-01", "uraian": "Menyusun laporan"}
    assert (await member.post(run_url, json={"inputs": values})).status_code == 409
    stale = await member.post(f"{ADMIN}/alur/{flow['id']}/setujui", json={"version": 9})
    assert stale.status_code == 409
    approved = await member.post(f"{ADMIN}/alur/{flow['id']}/setujui", json={"version": 1})
    assert approved.json()["data"]["status"] == "approved", approved.text
    missing = await member.post(run_url, json={"inputs": {"tanggal": "x"}})
    assert missing.status_code == 422 and "Uraian" in missing.json()["message"]

    started = await member.post(run_url, json={"inputs": values})
    assert started.status_code == 201, started.text
    run = f"{ADMIN}/alur-jalan/{started.json()['data']['id']}"
    await work(world, queued_runs)
    waiting = (await member.get(run)).json()["data"]
    assert waiting["status"] == "waiting_approval", waiting["message"]
    assert app.reports == [] and waiting["pending"]["screenshot_url"]
    assert (await viewer.get(run)).json()["data"]["pending"] is None
    assert any("perlu diperiksa" in e["subject"] for e in sent_emails)
    refused = await viewer.post(f"{run}/putuskan", json={"decision": "approved"})
    assert refused.status_code == 403

    decided = await admin.post(f"{run}/putuskan", json={"decision": "approved"})
    assert decided.json()["data"]["status"] == "queued", decided.text
    await work(world, queued_runs)
    done = (await member.get(run)).json()["data"]
    assert done["status"] == "succeeded", done["message"]
    assert len(app.reports) == 1 and "LH-001" in done["outputs"][-1]["value"]
    async with world.sessions() as session:
        stored = await session.get(VaultAccount, uuid.UUID(account))
        assert stored.session_encrypted and "sesi" not in stored.session_encrypted
        calls = list(await session.scalars(select(LlmCall.kind)))
    assert calls and set(calls) == {"browser"}

    # Tampilan berubah: berhenti, lalu satu percobaan perbaikan otomatis
    app.changed = True
    again = await member.post(run_url, json={"inputs": values})
    follow_up = await work(world, queued_runs)
    broken = (await member.get(f"{ADMIN}/alur-jalan/{again.json()['data']['id']}")).json()["data"]
    assert broken["status"] == "needs_repair" and follow_up
    mending = (await member.get(f"{ADMIN}/alur/{flow['id']}")).json()["data"]
    assert (mending["status"], mending["version"]) == ("learning", 2)
    assert mending["runs"][0]["created_by_name"] == "Sistem" and mending["approved_at"] is None
    repaired = ScriptedLlm(
        *LOGIN,
        *REPORT[:3],
        ("fill", "Catatan pekerjaan", "input", "uraian"),
        ("click", "Ajukan sekarang"),
    )
    queued_runs.append(follow_up)
    await work(world, queued_runs, repaired)
    fixed = (await member.get(f"{ADMIN}/alur/{flow['id']}")).json()["data"]
    assert fixed["status"] == "review", fixed["note"]
    assert len(app.reports) == 1

    async with world.sessions() as session:
        entries = (await session.scalars(select(AuditLog))).all()
    actions = {e.action for e in entries}
    assert {"alur.belajar", "alur.setujui", "alur.jalankan", "alur.putuskan"} <= actions
    assert all("Menyusun laporan" not in e.target for e in entries)
    assert (await member.post(f"{ADMIN}/alur/{flow['id']}/hapus")).status_code == 200


async def test_login_failure_blocks_the_account_and_otp_is_sealed(world, sign_in, app, queued_runs):
    agent, account = await prepare(world, app, password="sandi-yang-salah")
    member = await sign_in("a_member")
    created = await member.post(f"{ADMIN}/role/{agent}/alur", json=body(account))
    flow = created.json()["data"]
    await work(world, queued_runs, ScriptedLlm(*LOGIN, *LOGIN))

    failed = (await member.get(f"{ADMIN}/alur/{flow['id']}")).json()["data"]
    assert failed["status"] == "failed" and "Gagal masuk 2 kali" in failed["note"]
    assert app.login_attempts == 2
    vault = (await member.get(f"{ADMIN}/role/{agent}/brankas")).json()["data"]
    assert vault["accounts"][0]["login_failed"] is True
    retry = await member.post(
        f"{ADMIN}/alur/{flow['id']}/pelajari",
        json={"name": "Isi laporan", "goal": "Isi laporan harian lalu kirim.", "inputs": []},
    )
    assert retry.status_code == 409

    # Kode OTP titipan disimpan terenkripsi, hanya saat putaran menunggunya
    run_id = failed["runs"][0]["id"]
    url = f"{ADMIN}/alur-jalan/{run_id}"
    assert (await member.post(f"{url}/otp", json={"code": "246810"})).status_code == 409
    async with world.sessions() as session:
        await session.execute(
            update(BrowserRun)
            .where(BrowserRun.id == uuid.UUID(run_id))
            .values(status="waiting_otp")
        )
        await session.execute(update(BrowserFlow).values(status="learning"))
        await session.commit()
    sent = await member.post(f"{url}/otp", json={"code": "246810"})
    assert sent.status_code == 200 and "246810" not in sent.text, sent.text
    async with world.sessions() as session:
        row = await session.get(BrowserRun, uuid.UUID(run_id))
    assert "246810" not in row.otp_encrypted
    assert encryption.decrypt(row.otp_encrypted, runner.otp_context(row.id)) == "246810"
    stopped = await member.post(f"{url}/hentikan")
    assert stopped.json()["data"]["status"] == "stopped", stopped.text
    async with world.sessions() as session:
        row = await session.get(BrowserRun, uuid.UUID(run_id))
        assert row.otp_encrypted is None
        assert (await session.get(BrowserFlow, row.flow_id)).status == "failed"
