"""Tugas rutin: simpan, pratinjau, pemahaman kalimat, hak akses (kontrak 17.3–17.5)."""

import uuid

from sqlalchemy import select, update

from app.models import Agent, AuditLog, LlmCall
from tests.integration.world import add_agents

ADMIN = "/api/v1/admin"
BASE = f"{ADMIN}/tugas-rutin"
CALENDAR = f"{ADMIN}/pengaturan/kalender"
# Jauh di depan agar hasilnya tidak bergantung pada tanggal pengujian
DATES = ["2099-03-02", "2099-03-03"]


def rule(**values) -> dict:
    return {
        "frequency": "dates",
        "dates": DATES,
        "time": "16:05",
        "start_date": "2099-01-01",
        **values,
    }


def body(agent_id: str, **values) -> dict:
    return {
        "title": "Isi laporan harian",
        "entry_agent_id": agent_id,
        "budget_limit": 5000,
        "rule": rule(),
        **values,
    }


async def own(world, agent_id: str, member: str) -> None:
    async with world.sessions() as session:
        await session.execute(
            update(Agent)
            .where(Agent.id == uuid.UUID(agent_id))
            .values(owner_member_id=world.members[member].id)
        )
        await session.commit()


async def detail(client, schedule_id: str) -> dict:
    response = await client.get(f"{BASE}/{schedule_id}")
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_schedule_lifecycle(world, sign_in):
    [agent] = await add_agents(world, "a", "Rina")
    client = await sign_in("a_owner")

    created = await client.post(BASE, json=body(agent))
    assert created.status_code == 201, created.text
    item = created.json()["data"]
    # 16.05 di Makassar
    assert item["next_run_at"] == "2099-03-02T08:05:00Z"
    assert item["rule_text"] == "Pada 2 tanggal tertentu pukul 16.05, libur dilewati."
    assert (item["status"], item["last_run"], item["can_manage"]) == ("active", None, True)
    assert item["entry_agent"]["name"] == "Rina"
    url = f"{BASE}/{item['id']}"

    full = await detail(client, item["id"])
    assert [(o["date"], o["time"]) for o in full["upcoming"]] == [(d, "16:05") for d in DATES]
    assert full["runs"] == []

    again = await client.post(f"{url}/lanjutkan")
    paused = await client.post(f"{url}/jeda")
    twice = await client.post(f"{url}/jeda")
    resumed = await client.post(f"{url}/lanjutkan")
    assert [r.status_code for r in (again, paused, twice, resumed)] == [409, 200, 409, 200]
    assert paused.json()["data"]["next_run_at"] is None
    assert resumed.json()["data"]["status"] == "active"

    draft = await client.put(url, json=body(agent, status="draft", title="Laporan sore"))
    assert draft.status_code == 200, draft.text
    assert (draft.json()["data"]["status"], draft.json()["data"]["next_run_at"]) == ("draft", None)
    past = rule(dates=["2020-01-01"], start_date="2020-01-01")
    ended = await client.put(url, json=body(agent, rule=past))
    assert ended.json()["data"]["status"] == "ended"
    assert [s["id"] for s in (await client.get(BASE)).json()["data"]] == [item["id"]]

    assert (await client.delete(url)).status_code == 200
    assert (await client.get(url)).status_code == 404
    async with world.sessions() as session:
        targets = await session.scalars(
            select(AuditLog.target).where(AuditLog.action == "rutin.ubah")
        )
        assert len(targets.all()) == 6


async def test_invalid_schedule_is_rejected(world, sign_in):
    [agent] = await add_agents(world, "a", "Rina")
    client = await sign_in("a_owner")

    responses = [
        await client.post(BASE, json=body(agent, title="Abc")),
        await client.post(BASE, json=body(agent, budget_limit=1)),
        await client.post(BASE, json=body(str(uuid.uuid4()))),
        await client.post(BASE, json=body(agent, rule=rule(time="99:00"))),
        await client.post(
            BASE,
            json=body(agent, rule=rule(time_mode="shift_end", shift_id=str(uuid.uuid4()))),
        ),
    ]

    assert [r.status_code for r in responses] == [422] * 5, [r.text for r in responses]
    assert responses[-1].json()["message"] == "Pilih shift."
    assert (await client.get(BASE)).json()["data"] == []


async def test_member_manages_only_own_roles(world, sign_in):
    mine, other = await add_agents(world, "a", "Rina", "Budi")
    await own(world, mine, "a_member")
    owner = await sign_in("a_owner")
    member = await sign_in("a_member")
    viewer = await sign_in("a_viewer")
    theirs = (await owner.post(BASE, json=body(other))).json()["data"]["id"]

    created = await member.post(BASE, json=body(mine))
    refused = [
        await member.post(BASE, json=body(other)),
        await member.put(f"{BASE}/{theirs}", json=body(mine)),
        await member.put(f"{BASE}/{created.json()['data']['id']}", json=body(other)),
        await member.post(f"{BASE}/{theirs}/jeda"),
        await member.delete(f"{BASE}/{theirs}"),
        await viewer.post(BASE, json=body(mine)),
        await viewer.post(f"{BASE}/{theirs}/jeda"),
        await viewer.post(f"{BASE}/pahami", json={"text": "Setiap hari pukul 08.00"}),
    ]

    assert created.status_code == 201, created.text
    assert [r.status_code for r in refused] == [403] * 8
    listed = {s["id"]: s["can_manage"] for s in (await viewer.get(BASE)).json()["data"]}
    assert len(listed) == 2 and not any(listed.values())


async def test_calendar_leave_and_role_changes_follow_through(world, sign_in):
    [agent] = await add_agents(world, "a", "Rina")
    await own(world, agent, "a_member")
    client = await sign_in("a_owner")
    shift = {"name": "Pagi", "start_time": "07:00", "end_time": "15:00", "weekdays": [1]}
    await client.post(f"{CALENDAR}/shift", json=shift)
    shift_id = (await client.get(CALENDAR)).json()["data"]["shifts"][0]["id"]
    schedule = rule(on_leave="skip")
    item = (await client.post(BASE, json=body(agent, rule=schedule))).json()["data"]

    async def next_day() -> str:
        return (await detail(client, item["id"]))["next_run_at"][:10]

    await client.post(f"{CALENDAR}/hari", json={"date": DATES[0], "name": "Libur uji"})
    assert await next_day() == DATES[1]
    day = (await client.get(f"{CALENDAR}/hari")).json()["data"][0]["id"]
    await client.delete(f"{CALENDAR}/hari/{day}")
    assert await next_day() == DATES[0]
    leave = f"{ADMIN}/organisasi/pengguna/{world.member_id('a_member')}/cuti"
    await client.post(leave, json={"start_date": DATES[0], "end_date": DATES[0]})
    assert await next_day() == DATES[1]

    by_shift = rule(time_mode="shift_start", shift_id=shift_id, on_holiday="next")
    await client.put(f"{BASE}/{item['id']}", json=body(agent, rule=by_shift))
    in_use = await client.delete(f"{CALENDAR}/shift/{shift_id}")
    assert in_use.status_code == 409
    assert in_use.json()["message"] == 'Shift masih dipakai tugas rutin "Isi laporan harian".'
    await client.put(f"{CALENDAR}/shift/{shift_id}", json={**shift, "start_time": "09:30"})
    assert "T01:30" in (await detail(client, item["id"]))["next_run_at"]

    removed = await client.delete(f"{ADMIN}/role/delete/{agent}")
    assert removed.status_code == 200, removed.text
    ended = await detail(client, item["id"])
    assert (ended["status"], ended["next_run_at"]) == ("ended", None)


async def test_preview_and_understand(world, sign_in):
    client = await sign_in("a_owner")

    preview = await client.post(f"{BASE}/pratinjau", json={"rule": rule()})
    parsed = await client.post(
        f"{BASE}/pahami",
        json={"text": "Isi laporan harian setiap hari kerja pukul 16.05"},
    )

    assert preview.status_code == 200, preview.text
    assert len(preview.json()["data"]["occurrences"]) == 2
    assert parsed.status_code == 200, parsed.text
    data = parsed.json()["data"]
    assert (data["rule"]["frequency"], data["rule"]["time"]) == ("workdays", "16:05")
    assert data["title"] == "Isi laporan harian"
    assert len([o for o in data["occurrences"] if o["status"] == "run"]) == 5
    usage = (await client.get(f"{ADMIN}/pengaturan/model-ai")).json()["data"]["usage_today"]
    assert {u["purpose"]: u["calls"] for u in usage}["schedule_parse"] == 1
    async with world.sessions() as session:
        calls = await session.scalars(select(LlmCall.kind))
        assert calls.all() == ["schedule_parse"]
    assert (await client.get(BASE)).json()["data"] == []


async def test_schedules_stay_inside_organisation(world, sign_in):
    [theirs] = await add_agents(world, "b", "Sari")
    [mine] = await add_agents(world, "a", "Rina")
    other = await sign_in("b_owner")
    schedule = (await other.post(BASE, json=body(theirs))).json()["data"]["id"]

    client = await sign_in("a_owner")
    responses = [
        await client.get(f"{BASE}/{schedule}"),
        await client.put(f"{BASE}/{schedule}", json=body(mine)),
        await client.delete(f"{BASE}/{schedule}"),
        await client.post(f"{BASE}/{schedule}/jeda"),
        await client.post(f"{BASE}/{schedule}/lanjutkan"),
    ]

    assert [r.status_code for r in responses] == [404] * 5
    assert (await client.post(BASE, json=body(theirs))).status_code == 422
    assert (await client.get(BASE)).json()["data"] == []
    assert (await detail(other, schedule))["status"] == "active"
