"""Kalender kerja, shift, tanggal khusus, impor CSV, dan cuti anggota (kontrak 17.1–17.2)."""

import pytest
from sqlalchemy import select

from app.models import AuditLog, CalendarDay, MemberLeave, WorkShift

ADMIN = "/api/v1/admin"
CALENDAR = f"{ADMIN}/pengaturan/kalender"
DAYS = f"{CALENDAR}/hari"

SHIFT = {"name": "Pagi", "start_time": "07:00", "end_time": "15:00", "weekdays": [1, 2, 3]}
HOLIDAY = {"date": "2027-01-01", "kind": "holiday", "name": "Tahun Baru", "label": "Nasional"}


def leave_url(world, name: str) -> str:
    return f"{ADMIN}/organisasi/pengguna/{world.member_id(name)}/cuti"


async def calendar(client) -> dict:
    response = await client.get(CALENDAR)
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def days(client, year: int | str = "") -> list[dict]:
    return (await client.get(DAYS, params={"year": year})).json()["data"]


def upload(client, content: bytes):
    return client.post(f"{DAYS}/impor", files={"file": ("libur.csv", content, "text/csv")})


async def test_new_organisation_has_default_calendar(world, sign_in):
    owner = await sign_in("a_owner")
    viewer = await sign_in("a_viewer")

    data = await calendar(owner)

    assert data["workdays"] == [1, 2, 3, 4, 5]
    assert data["shifts"] == []
    assert data["timezone"] == "Asia/Makassar"
    assert data["can_edit"] is True
    assert (await calendar(viewer))["can_edit"] is False
    assert await days(viewer) == []


async def test_only_managers_change_the_calendar(world, sign_in):
    for name in ("a_member", "a_viewer"):
        client = await sign_in(name)
        responses = [
            await client.put(CALENDAR, json={"workdays": [1]}),
            await client.post(f"{CALENDAR}/shift", json=SHIFT),
            await client.post(DAYS, json=HOLIDAY),
            await upload(client, b"2027-01-01,Tahun Baru\n"),
        ]
        assert [r.status_code for r in responses] == [403, 403, 403, 403], name
    admin = await sign_in("a_admin")
    assert (await admin.put(CALENDAR, json={"workdays": [1]})).status_code == 200


async def test_workdays_are_cleaned_and_checked(world, sign_in):
    client = await sign_in("a_owner")

    saved = await client.put(CALENDAR, json={"workdays": [6, 1, 1, 3]})
    empty = await client.put(CALENDAR, json={"workdays": []})
    unknown = await client.put(CALENDAR, json={"workdays": [0, 8]})

    assert saved.status_code == 200, saved.text
    assert (await calendar(client))["workdays"] == [1, 3, 6]
    assert empty.status_code == 422
    assert empty.json()["message"] == "Pilih minimal satu hari kerja."
    assert unknown.status_code == 422


async def test_shift_lifecycle(world, sign_in):
    client = await sign_in("a_owner")
    night = {**SHIFT, "name": "Malam", "start_time": "22:00", "end_time": "06:00"}

    created = await client.post(f"{CALENDAR}/shift", json=night)
    await client.post(f"{CALENDAR}/shift", json={**SHIFT, "weekdays": [3, 1, 3]})
    shifts = (await calendar(client))["shifts"]

    assert created.status_code == 201, created.text
    assert [s["name"] for s in shifts] == ["Pagi", "Malam"]
    assert shifts[0]["weekdays"] == [1, 3]
    assert (shifts[1]["start_time"], shifts[1]["end_time"]) == ("22:00", "06:00")

    duplicate = await client.post(f"{CALENDAR}/shift", json={**SHIFT, "name": "pagi"})
    clash = await client.put(f"{CALENDAR}/shift/{shifts[1]['id']}", json=SHIFT)
    renamed = await client.put(
        f"{CALENDAR}/shift/{shifts[1]['id']}", json={**night, "name": "Jaga Malam"}
    )
    removed = await client.delete(f"{CALENDAR}/shift/{shifts[0]['id']}")
    again = await client.delete(f"{CALENDAR}/shift/{shifts[0]['id']}")

    assert (duplicate.status_code, clash.status_code) == (409, 409)
    assert renamed.status_code == 200, renamed.text
    assert removed.status_code == 200
    assert again.status_code == 404
    assert [s["name"] for s in (await calendar(client))["shifts"]] == ["Jaga Malam"]


@pytest.mark.parametrize(
    "change",
    [
        {"name": "P"},
        {"start_time": "7:00"},
        {"end_time": "24:00"},
        {"end_time": "07:00"},
        {"weekdays": []},
        {"weekdays": [9]},
    ],
)
async def test_invalid_shift_is_rejected(world, sign_in, change):
    client = await sign_in("a_owner")

    response = await client.post(f"{CALENDAR}/shift", json={**SHIFT, **change})

    assert response.status_code == 422, response.text
    assert (await calendar(client))["shifts"] == []


async def test_special_days_replace_same_date(world, sign_in):
    client = await sign_in("a_owner")
    replacement = {**HOLIDAY, "kind": "workday", "name": "Masuk pengganti", "label": ""}

    first = await client.post(DAYS, json=HOLIDAY)
    await client.post(DAYS, json={**HOLIDAY, "date": "2026-12-25", "name": "Natal"})
    second = await client.post(DAYS, json=replacement)

    assert (first.status_code, second.status_code) == (201, 201), second.text
    this_year = await days(client, 2027)
    assert [(d["name"], d["kind"]) for d in this_year] == [("Masuk pengganti", "workday")]
    assert [d["date"] for d in await days(client)] == ["2026-12-25", "2027-01-01"]
    assert len(await days(client, "abc")) == 2

    removed = await client.delete(f"{DAYS}/{this_year[0]['id']}")
    assert removed.status_code == 200
    assert await days(client, 2027) == []


@pytest.mark.parametrize(
    "change",
    [{"date": "2027-02-30"}, {"date": "20270101"}, {"name": "X"}, {"kind": "lain"}],
)
async def test_invalid_day_is_rejected(world, sign_in, change):
    client = await sign_in("a_owner")

    response = await client.post(DAYS, json={**HOLIDAY, **change})

    assert response.status_code == 422, response.text
    assert await days(client) == []


async def test_import_csv(world, sign_in):
    client = await sign_in("a_owner")
    await client.post(DAYS, json=HOLIDAY)
    content = (
        "﻿tanggal,nama,jenis\r\n"
        "2027-01-01,Tahun Baru Masehi,Libur nasional\r\n"
        "\r\n"
        '2027-03-10,"Libur daerah, bersama",Daerah\r\n'
        "10/03/2027,Salah bentuk,\r\n"
        "2027-03-13,Masuk Sabtu,Hari kerja pengganti\r\n"
        "2027-03-13,Masuk Sabtu pagi,Hari kerja\r\n"
        "2027-04-01,Tanpa jenis\r\n"
    ).encode()

    response = await upload(client, content)

    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert (result["added"], result["updated"]) == (3, 2)
    assert result["errors"] == ["Baris 5: Tanggal harus berbentuk YYYY-MM-DD."]
    rows = {d["date"]: d for d in await days(client, 2027)}
    assert rows["2027-01-01"]["name"] == "Tahun Baru Masehi"
    assert rows["2027-03-10"]["name"] == "Libur daerah, bersama"
    assert rows["2027-03-13"] | {"id": ""} == {
        "id": "",
        "date": "2027-03-13",
        "kind": "workday",
        "name": "Masuk Sabtu pagi",
        "label": "Hari kerja",
    }
    assert (rows["2027-04-01"]["kind"], rows["2027-04-01"]["label"]) == ("holiday", "")


async def test_import_semicolon_without_header(world, sign_in):
    client = await sign_in("a_owner")

    response = await upload(client, b"2027-05-01;Hari Buruh;Nasional\n")

    assert response.json()["data"] == {"added": 1, "updated": 0, "errors": []}
    assert (await days(client))[0]["label"] == "Nasional"


@pytest.mark.parametrize(
    "content,message",
    [
        (b"tanggal,nama,jenis\n", "Tidak ada baris yang bisa diimpor."),
        (b"besok,Libur,\n", "Baris 1: Tanggal harus berbentuk YYYY-MM-DD."),
        (b"\xff\xfe\x00bukan teks", "Berkas harus berupa teks CSV berkode UTF-8."),
        (b"2027-01-01,A\x00B,\n", "Berkas harus berupa teks CSV berkode UTF-8."),
        (b"x" * 200_001, "Berkas CSV paling besar 200 KB."),
        (b"2027-01-01,Libur\n" * 1001, "Paling banyak 1.000 baris per berkas."),
    ],
)
async def test_unusable_csv_is_rejected(world, sign_in, content, message):
    client = await sign_in("a_owner")

    response = await upload(client, content)

    assert response.status_code == 422, response.text
    assert response.json()["message"] == message
    assert await days(client) == []


async def test_import_needs_a_file(world, sign_in):
    client = await sign_in("a_owner")

    response = await client.post(f"{DAYS}/impor")

    assert response.status_code == 422
    assert response.json()["message"] == "Pilih berkas CSV."


async def test_manager_manages_anyones_leave(world, sign_in):
    admin = await sign_in("a_admin")
    url = leave_url(world, "a_member")
    first = {"start_date": "2027-01-04", "end_date": "2027-01-06", "note": "Keluarga"}

    created = await admin.post(url, json=first)
    later = await admin.post(url, json={"start_date": "2027-02-01", "end_date": "2027-02-01"})
    overlap = await admin.post(url, json={"start_date": "2027-01-06", "end_date": "2027-01-08"})
    backwards = await admin.post(url, json={"start_date": "2027-03-02", "end_date": "2027-03-01"})
    other = await admin.post(leave_url(world, "a_owner"), json=first)

    assert [r.status_code for r in (created, later, overlap, backwards, other)] == [
        201,
        201,
        409,
        422,
        201,
    ]
    leaves = (await admin.get(url)).json()["data"]
    assert [leave["start_date"] for leave in leaves] == ["2027-02-01", "2027-01-04"]
    assert leaves[1]["note"] == "Keluarga"

    # ID cuti milik anggota lain tidak bisa dihapus lewat alamat anggota ini
    owners = (await admin.get(leave_url(world, "a_owner"))).json()["data"]
    assert (await admin.delete(f"{url}/{owners[0]['id']}")).status_code == 404
    assert (await admin.delete(f"{url}/{leaves[0]['id']}")).status_code == 200
    assert len((await admin.get(url)).json()["data"]) == 1


async def test_member_manages_only_own_leave(world, sign_in):
    member = await sign_in("a_member")
    viewer = await sign_in("a_viewer")
    body = {"start_date": "2027-01-04", "end_date": "2027-01-04"}

    own = await member.post(leave_url(world, "a_member"), json=body)
    others = [
        await member.get(leave_url(world, "a_owner")),
        await member.post(leave_url(world, "a_owner"), json=body),
        await viewer.get(leave_url(world, "a_viewer")),
        await viewer.post(leave_url(world, "a_viewer"), json=body),
    ]

    assert own.status_code == 201, own.text
    assert [r.status_code for r in others] == [403, 403, 403, 403]


async def test_calendar_and_leave_stay_inside_organisation(world, sign_in):
    other = await sign_in("b_owner")
    await other.put(CALENDAR, json={"workdays": [7]})
    await other.post(f"{CALENDAR}/shift", json=SHIFT)
    await other.post(DAYS, json=HOLIDAY)
    body = {"start_date": "2027-01-04", "end_date": "2027-01-04"}
    await other.post(leave_url(world, "b_member"), json=body)
    shift = (await calendar(other))["shifts"][0]["id"]
    day = (await days(other))[0]["id"]
    leave = (await other.get(leave_url(world, "b_member"))).json()["data"][0]["id"]

    client = await sign_in("a_owner")
    data = await calendar(client)
    responses = [
        await client.put(f"{CALENDAR}/shift/{shift}", json={**SHIFT, "name": "Diambil"}),
        await client.delete(f"{CALENDAR}/shift/{shift}"),
        await client.delete(f"{DAYS}/{day}"),
        await client.get(leave_url(world, "b_member")),
        await client.post(leave_url(world, "b_member"), json=body),
        await client.delete(f"{leave_url(world, 'b_member')}/{leave}"),
        await client.delete(f"{leave_url(world, 'a_member')}/{leave}"),
    ]
    # Nama shift dan tanggal yang sama boleh dipakai organisasi lain
    same_shift = await client.post(f"{CALENDAR}/shift", json=SHIFT)
    same_day = await client.post(DAYS, json=HOLIDAY)

    assert (data["workdays"], data["shifts"]) == ([1, 2, 3, 4, 5], [])
    assert [r.status_code for r in responses] == [404] * 7
    assert (same_shift.status_code, same_day.status_code) == (201, 201)
    organisation = world.organizations["b"].id
    async with world.sessions() as session:
        for model, expected in ((WorkShift, "Pagi"), (CalendarDay, "Tahun Baru")):
            rows = await session.scalars(
                select(model.name).where(model.organization_id == organisation)
            )
            assert rows.all() == [expected]
        leaves = await session.scalars(
            select(MemberLeave.id).where(MemberLeave.organization_id == organisation)
        )
        assert len(leaves.all()) == 1


async def test_changes_are_audited(world, sign_in):
    client = await sign_in("a_owner")
    await client.post(f"{CALENDAR}/shift", json=SHIFT)
    shift = (await calendar(client))["shifts"][0]["id"]
    await client.delete(f"{CALENDAR}/shift/{shift}")
    await client.post(
        leave_url(world, "a_member"),
        json={"start_date": "2027-01-04", "end_date": "2027-01-04", "note": "Rahasia"},
    )

    async with world.sessions() as session:
        rows = (
            await session.execute(
                select(AuditLog.action, AuditLog.target)
                .where(
                    AuditLog.organization_id == world.organizations["a"].id,
                    AuditLog.action.in_(("kalender.ubah", "cuti.ubah")),
                )
                .order_by(AuditLog.action, AuditLog.target)
            )
        ).all()

    assert [tuple(r) for r in rows] == [
        ("cuti.ubah", "A Member"),
        ("kalender.ubah", "Pagi"),
        ("kalender.ubah", "Pagi"),
    ]
