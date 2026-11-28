"""Penjadwal tugas rutin: putaran, terlewat, coba ulang, susulan, dan jalankan (kontrak 17.6)."""

import datetime
import uuid

from sqlalchemy import select, update

from app.models import Agent, Schedule, ScheduleRun, Task
from app.services.schedule.runner import dispatch
from tests.integration.world import add_agents

ADMIN = "/api/v1/admin"
BASE = f"{ADMIN}/tugas-rutin"
# Senin dan Selasa jauh di depan; 08.00 di Makassar
DATES = ["2099-03-02", "2099-03-03"]
FIRST = datetime.datetime(2099, 3, 2, 0, 0, tzinfo=datetime.UTC)
MINUTE = datetime.timedelta(minutes=1)
HOUR = datetime.timedelta(hours=1)


async def make(client, agent: str, **rule) -> str:
    response = await client.post(
        BASE,
        json={
            "title": "Isi laporan harian",
            "entry_agent_id": agent,
            "budget_limit": 5000,
            "rule": {
                "frequency": "dates",
                "dates": DATES,
                "time": "08:00",
                "start_date": "2099-01-01",
                **rule,
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


async def detail(client, schedule: str) -> dict:
    return (await client.get(f"{BASE}/{schedule}")).json()["data"]


async def end_task(world, task_id: str, status: str) -> None:
    async with world.sessions() as session:
        await session.execute(
            update(Task).where(Task.id == uuid.UUID(task_id)).values(status=status)
        )
        await session.commit()


async def stored(world, schedule: str) -> list[tuple]:
    async with world.sessions() as session:
        rows = await session.execute(
            select(ScheduleRun.origin, ScheduleRun.status, ScheduleRun.attempt)
            .where(ScheduleRun.schedule_id == uuid.UUID(schedule))
            .order_by(ScheduleRun.planned_for, ScheduleRun.created_at)
        )
        return [tuple(r) for r in rows]


async def test_due_run_creates_one_task(world, sign_in, database, queued_tasks):
    [agent] = await add_agents(world, "a", "Rina")
    client = await sign_in("a_owner")
    schedule = await make(client, agent)

    await dispatch(database, FIRST - MINUTE)
    assert await stored(world, schedule) == []
    await dispatch(database, FIRST + MINUTE)
    await dispatch(database, FIRST + 2 * MINUTE)

    data = await detail(client, schedule)
    [run] = data["runs"]
    assert (run["status"], run["task_status"], run["attachment_count"]) == ("created", "queued", 0)
    assert queued_tasks == [run["task_id"]]
    assert data["last_run"]["id"] == run["id"]
    async with world.sessions() as session:
        task = await session.get(Task, uuid.UUID(run["task_id"]))
        assert task.created_by_member_id == world.members["a_owner"].id
        assert task.title == "Isi laporan harian"
        row = await session.get(Schedule, uuid.UUID(schedule))
        assert row.next_run_at == FIRST + datetime.timedelta(days=1)

    await end_task(world, run["task_id"], "completed")
    await dispatch(database, FIRST + datetime.timedelta(days=1, minutes=1))
    assert [r[1] for r in await stored(world, schedule)] == ["created", "created"]
    assert (await detail(client, schedule))["status"] == "ended"


async def test_failed_task_retries_twice_then_backfills(
    world, sign_in, database, queued_tasks, sent_emails
):
    [agent] = await add_agents(world, "a", "Rina")
    client = await sign_in("a_owner")
    schedule = await make(client, agent, dates=DATES[:1])
    now = FIRST + MINUTE
    await dispatch(database, now)

    for attempt, wait in ((1, 15 * MINUTE), (2, HOUR)):
        await end_task(world, queued_tasks[-1], "failed")
        await dispatch(database, now)
        assert await stored(world, schedule) == [("scheduled", "retrying", attempt)]
        await dispatch(database, now + wait - MINUTE)
        assert len(queued_tasks) == attempt
        now += wait
        await dispatch(database, now)
        assert len(queued_tasks) == attempt + 1

    await end_task(world, queued_tasks[-1], "failed")
    await dispatch(database, now)

    assert await stored(world, schedule) == [
        ("scheduled", "failed", 3),
        ("backfill", "scheduled", 1),
    ]
    assert [e["to"] for e in sent_emails] == [world.email("a_owner")]
    await dispatch(database, FIRST + datetime.timedelta(days=1, minutes=1))
    assert (await stored(world, schedule))[1] == ("backfill", "backfill", 1)


async def test_late_run_is_missed_and_can_be_backfilled(world, sign_in, database, queued_tasks):
    [agent] = await add_agents(world, "a", "Rina")
    client = await sign_in("a_owner")
    schedule = await make(client, agent)

    # Penjadwal baru jalan lagi tiga hari kemudian: dua terlewat, satu susulan
    later = FIRST + datetime.timedelta(days=3)
    await dispatch(database, later)

    assert await stored(world, schedule) == [
        ("scheduled", "missed", 1),
        ("scheduled", "missed", 1),
        ("backfill", "scheduled", 1),
    ]
    assert queued_tasks == []
    runs = (await detail(client, schedule))["runs"]
    pending, first = runs[0], runs[-1]
    assert (await client.post(f"{BASE}/{schedule}/susulan/{pending['id']}")).status_code == 409
    response = await client.post(f"{BASE}/{schedule}/susulan/{first['id']}")
    assert response.status_code == 200, response.text
    assert response.json()["message"] == "Susulan dibuat."
    assert sorted(r[:2] for r in await stored(world, schedule)) == [
        ("backfill", "skipped"),
        ("manual", "backfill"),
        ("scheduled", "missed"),
        ("scheduled", "skipped"),
    ]
    assert len(queued_tasks) == 1


async def test_skipped_day_is_recorded_and_pause_stops_dispatch(world, sign_in, database):
    [agent] = await add_agents(world, "a", "Rina")
    client = await sign_in("a_owner")
    await client.post(
        f"{ADMIN}/pengaturan/kalender/hari", json={"date": DATES[0], "name": "Libur uji"}
    )
    schedule = await make(client, agent)
    paused = await make(client, agent)
    await client.post(f"{BASE}/{paused}/jeda")

    await dispatch(database, FIRST + MINUTE)

    assert await stored(world, schedule) == [("scheduled", "skipped_holiday", 1)]
    assert await stored(world, paused) == []


async def test_run_now_reports_why_it_failed(world, sign_in, database, queued_tasks, sent_emails):
    [agent] = await add_agents(world, "a", "Rina")
    client = await sign_in("a_owner")
    member = await sign_in("a_member")
    schedule = await make(client, agent)
    url = f"{BASE}/{schedule}/jalankan"

    refused = await member.post(url)
    created = await client.post(url)
    async with world.sessions() as session:
        await session.execute(
            update(Agent).where(Agent.id == uuid.UUID(agent)).values(status="paused")
        )
        await session.commit()
    failed = await client.post(url)

    assert (refused.status_code, created.status_code, failed.status_code) == (403, 200, 200)
    assert created.json()["message"] == "Tugas dibuat."
    assert failed.json()["message"] == "Role tidak aktif."
    assert sorted(r[1] for r in await stored(world, schedule)) == ["created", "failed"]
    assert len(queued_tasks) == 1 and sent_emails == []
    assert (await detail(client, schedule))["next_run_at"] == "2099-03-02T00:00:00Z"
