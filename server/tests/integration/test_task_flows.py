"""Alur aplikasi di dalam tugas dan tugas rutin (E4c, kontrak API bagian 23)."""

import uuid

import pytest
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright
from sqlalchemy import select, update

from app.models import Agent, BrowserFlow, BrowserRun, TaskStep, VaultAccount
from app.services.browser.learn import learn
from app.services.browser.session import open_session
from app.services.schedule.runner import dispatch
from scripts.aplikasi_tiruan import MockApp
from tests.browser.helpers import INPUTS, LOGIN, REPORT, FakeHooks, ScriptedModel, credentials
from tests.integration.tasks import (
    ScriptedLlm,
    create_task,
    decide,
    detail,
    events,
    pending,
    run,
    work,
)
from tests.integration.test_flows import prepare
from tests.integration.test_flows import work as run_browser
from tests.integration.test_schedule_runner import BASE, DATES, FIRST, MINUTE

ADMIN = "/api/v1/admin"
URAIAN = "Menyusun laporan jaringan"


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


async def approved_flow(world, app) -> tuple[str, str]:
    """Role yang ditanggung `a_admin` dengan satu alur yang sudah disetujui."""
    agent, account = await prepare(world, app)
    async with open_session(credentials(app), FakeHooks()) as browser:
        learned = await learn(browser, ScriptedModel(*LOGIN, *REPORT), "Isi laporan.", INPUTS)
    async with world.sessions() as session:
        responsible = world.members["a_admin"].id
        await session.execute(
            update(Agent).where(Agent.id == uuid.UUID(agent)).values(owner_member_id=responsible)
        )
        await session.execute(
            update(VaultAccount)
            .where(VaultAccount.id == uuid.UUID(account))
            .values(responsible_member_id=responsible)
        )
        flow = BrowserFlow(
            id=uuid.uuid4(),
            organization_id=world.organizations["a"].id,
            agent_id=uuid.UUID(agent),
            account_id=uuid.UUID(account),
            name="Isi laporan harian",
            goal="Isi laporan harian lalu kirim.",
            inputs=INPUTS,
            steps=learned.steps,
            status="approved",
            version=1,
        )
        session.add(flow)
        await session.commit()
    return agent, str(flow.id)


def with_flow(flow: str, **values) -> dict:
    return {"flow_id": flow, "flow_values": values, "compose_mode": "complete"}


def filled(value: str) -> dict:
    return {"values": [{"key": "uraian", "value": value}, {"key": "lain", "value": "x"}]}


async def test_task_runs_the_flow_after_approval(
    world, sign_in, database, app, queued_runs, queued_tasks
):
    agent, flow = await approved_flow(world, app)
    owner, member = await sign_in("a_admin"), await sign_in("a_member")
    body = {
        "title": "Laporan harian",
        "entry_agent_id": agent,
        "budget_limit": 50_000,
        **with_flow(flow, tanggal="2026-12-01"),
    }
    # Memakai akun orang lain bukan hak sembarang anggota
    assert (await member.post(f"{ADMIN}/tugas/create", json=body)).status_code == 403
    unknown = await owner.post(
        f"{ADMIN}/tugas/create", json={**body, "flow_values": {"asing": "x"}}
    )
    assert unknown.status_code == 422, unknown.text

    task_id = await create_task(owner, agent, **with_flow(flow, tanggal="2026-12-01"))
    llm = ScriptedLlm(work(output=f"{URAIAN}.", sources=[]), filled(URAIAN))
    await run(database, task_id, llm)
    task = await detail(owner, task_id)
    assert task["status"] == "running" and task["flow"]["run_status"] == "queued", task["events"]
    assert URAIAN in llm.prompt(1) and len(queued_runs) == 1

    await run_browser(world, queued_runs)
    task = await detail(owner, task_id)
    [approval] = pending(task)
    assert task["status"] == "waiting_approval" and approval["reason"] == "flow"
    assert {"label": "Uraian", "value": URAIAN} in approval["flow"]["values"]
    assert approval["flow"]["screenshot_url"] and app.reports == []
    hidden = await detail(member, task_id)
    assert hidden["flow"]["values"] == [] and pending(hidden)[0]["flow"]["values"] == []
    assert (await decide(owner, approval["id"], "revise", "perbaiki")).status_code == 422

    decided = await decide(owner, approval["id"], "approved")
    assert decided.status_code == 200, decided.text
    assert len(queued_runs) == 1
    queued_tasks.clear()
    await run_browser(world, queued_runs)
    task = await detail(owner, task_id)
    assert task["status"] == "completed", task["events"]
    assert app.reports[0]["uraian"] == URAIAN and app.reports[0]["tanggal"] == "2026-12-01"
    assert "LH-001" in task["flow"]["outputs"][-1]["value"]
    assert events(task, "flow_done") and queued_tasks == [task_id]


async def test_composed_content_still_needs_approval_and_rejection_sends_nothing(
    world, sign_in, database, app, queued_runs
):
    agent, flow = await approved_flow(world, app)
    async with world.sessions() as session:
        await session.execute(update(BrowserFlow).values(trusted_submit=True))
        await session.commit()
    owner = await sign_in("a_admin")

    first = await create_task(owner, agent, **with_flow(flow, tanggal="x", uraian="y"))
    await run(database, first, ScriptedLlm(work(sources=[])))
    async with world.sessions() as session:
        await session.execute(
            update(TaskStep)
            .where(TaskStep.task_id == uuid.UUID(first))
            .values(composed=[{"part": "Angka", "note": "contoh"}])
        )
        await session.commit()
    # Isian sudah dibuat sebelum langkah ditandai: tandai putarannya seperti yang dilakukan mesin
    async with world.sessions() as session:
        await session.execute(
            update(BrowserRun)
            .where(BrowserRun.task_id == uuid.UUID(first))
            .values(force_approval=True)
        )
        await session.commit()
    await run_browser(world, queued_runs)
    task = await detail(owner, first)
    assert task["status"] == "waiting_approval" and app.reports == []
    # Menolak dari halaman putaran sama dengan menolak persetujuannya
    url = f"{ADMIN}/alur-jalan/{task['flow']['run_id']}/putuskan"
    rejected = await owner.post(url, json={"decision": "rejected"})
    assert rejected.json()["data"]["status"] == "stopped", rejected.text
    task = await detail(owner, first)
    assert task["status"] == "failed" and not pending(task) and app.reports == []

    # Menghentikan tugas menghentikan putarannya
    second = await create_task(owner, agent, **with_flow(flow, tanggal="x", uraian="y"))
    await run(database, second, ScriptedLlm(work(sources=[])))
    cancelled = await owner.post(f"{ADMIN}/tugas/{second}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    await run_browser(world, queued_runs)
    task = await detail(owner, second)
    assert task["flow"]["run_status"] == "stopped" and app.reports == []

    # Isian yang tidak bisa diisi dari bahan membuat tugas gagal dengan namanya
    third = await create_task(owner, agent, **with_flow(flow, tanggal="x"))
    await run(database, third, ScriptedLlm(work(sources=[]), {"values": []}))
    task = await detail(owner, third)
    assert task["status"] == "failed" and "Uraian" in events(task, "failed")[0]
    assert queued_runs == []


async def test_routine_task_is_not_retried_after_a_possible_send(
    world, sign_in, database, app, queued_runs, queued_tasks
):
    agent, flow = await approved_flow(world, app)
    async with world.sessions() as session:
        await session.execute(update(BrowserFlow).values(trusted_submit=True))
        await session.commit()
    owner = await sign_in("a_admin")
    created = await owner.post(
        BASE,
        json={
            "title": "Isi laporan harian",
            "entry_agent_id": agent,
            "budget_limit": 5000,
            "compose_mode": "complete",
            "flow_id": flow,
            "flow_values": {"tanggal": "2099-03-02", "uraian": "Rutin"},
            "rule": {
                "frequency": "dates",
                "dates": DATES,
                "time": "08:00",
                "start_date": "2099-01-01",
            },
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["data"]["flow_name"] == "Isi laporan harian"
    schedule = created.json()["data"]["id"]

    await dispatch(database, FIRST + MINUTE)
    task_id = queued_tasks[-1]
    await run(database, task_id, ScriptedLlm(work(sources=[])))
    app.reject = True
    await run_browser(world, queued_runs)
    task = await detail(owner, task_id)
    assert task["status"] == "failed", task["events"]
    async with world.sessions() as session:
        sent = await session.scalar(select(BrowserRun.submitted_at))
    assert sent is not None

    await dispatch(database, FIRST + 2 * MINUTE)
    runs = (await owner.get(f"{BASE}/{schedule}")).json()["data"]["runs"]
    first = next(r for r in runs if r["task_id"] == task_id)
    assert first["status"] == "failed" and "Mungkin sudah terkirim" in first["reason"]
