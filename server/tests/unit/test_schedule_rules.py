"""Penghitungan putaran tugas rutin (kontrak 17.4)."""

import datetime
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from app.services.schedule.rules import (
    ScheduleRule,
    Shift,
    WorkCalendar,
    next_run,
    occurrences,
    rule_text,
)

ZONE = ZoneInfo("Asia/Makassar")
# Selasa, 1 Desember 2026
NOW = datetime.datetime(2026, 12, 1, 7, 0, tzinfo=ZONE)
NIGHT = Shift("Malam", datetime.time(22), datetime.time(6), (1, 2, 3, 4, 5))
DAY = datetime.date.fromisoformat


def rule(**values) -> ScheduleRule:
    return ScheduleRule(**{"frequency": "workdays", "start_date": "2026-12-01", **values})


def calendar(**values) -> WorkCalendar:
    return WorkCalendar(**{"zone": ZONE, "workdays": (1, 2, 3, 4, 5), **values})


def runs(cal, schedule, count=5, after=NOW) -> list[str]:
    return [
        f"{o.at:%m-%d %H:%M}" for o in occurrences(cal, schedule, after, count) if o.status == "run"
    ]


def holiday(*dates: str) -> dict:
    return {DAY(d): ("holiday", "Libur uji") for d in dates}


def test_workdays_skip_weekend_and_past_time():
    assert runs(calendar(), rule(time="06:00")) == [
        "12-02 06:00",
        "12-03 06:00",
        "12-04 06:00",
        "12-07 06:00",
        "12-08 06:00",
    ]


def test_holiday_is_skipped_with_reason_and_weekend_holiday_ignored():
    cal = calendar(days=holiday("2026-12-02", "2026-12-06"))

    result = occurrences(cal, rule(on_holiday="next"), NOW, 5)
    skipping = occurrences(cal, rule(), NOW, 3)

    assert [(o.status, f"{o.at:%d}") for o in skipping] == [
        ("run", "01"),
        ("skipped_holiday", "02"),
        ("run", "03"),
        ("run", "04"),
    ]
    assert skipping[1].reason == "Libur: Libur uji"
    # Libur hari Minggu tidak menimbulkan putaran tambahan
    assert [f"{o.at:%d}" for o in result] == ["01", "03", "04", "07", "08"]
    assert result[1].moved_from == DAY("2026-12-02")


@pytest.mark.parametrize("policy,expected", [("previous", "12-03 08:00"), ("next", "12-07 08:00")])
def test_holiday_moves_weekly_run(policy, expected):
    cal = calendar(days=holiday("2026-12-04"))

    assert runs(cal, rule(frequency="weekly", weekdays=[5], on_holiday=policy), 1) == [expected]


def test_replacement_workday_counts():
    cal = calendar(days={DAY("2026-12-05"): ("workday", "Pengganti")})

    assert "12-05 08:00" in runs(cal, rule())


def test_daily_runs_on_weekend_but_not_holiday():
    cal = calendar(days=holiday("2026-12-02"))

    assert runs(cal, rule(frequency="daily"), 5)[:5] == [
        "12-01 08:00",
        "12-03 08:00",
        "12-04 08:00",
        "12-05 08:00",
        "12-06 08:00",
    ]


def test_monthly_last_workday_and_short_month():
    cal = calendar(days=holiday("2026-12-31"))
    last = rule(frequency="monthly", month_day=0)
    end = rule(frequency="monthly", month_day=31, on_holiday="previous")

    assert runs(cal, last, 2) == ["12-30 08:00", "01-29 08:00"]
    assert runs(calendar(), end, 3) == ["12-31 08:00", "01-29 08:00", "02-26 08:00"]


def test_quarterly_follows_start_month_and_dates_end():
    quarterly = rule(frequency="quarterly", month_day=1)
    listed = rule(frequency="dates", dates=["2026-12-15", "2026-12-14"], end_date="2026-12-14")

    assert runs(calendar(), quarterly, 3) == ["12-01 08:00", "03-01 08:00", "06-01 08:00"]
    assert runs(calendar(), listed) == ["12-14 08:00"]
    assert next_run(calendar(), listed, NOW.replace(month=12, day=20)) is None


def test_night_shift_end_runs_next_morning():
    cal = calendar(shift=NIGHT, days=holiday("2026-12-02"))
    schedule = rule(time_mode="shift_end", shift_id="x", offset_minutes=-15)

    # Shift 1 Desember selesai 2 Desember pagi; libur dinilai dari tanggal shiftnya
    assert runs(cal, schedule, 2) == ["12-02 05:45", "12-04 05:45"]
    assert rule_text(schedule, "Malam") == (
        "Setiap hari kerja 15 menit sebelum akhir shift Malam, libur dilewati."
    )


def test_leave_waits_or_skips():
    cal = calendar(leaves=((DAY("2026-12-01"), DAY("2026-12-02")),))

    waiting = occurrences(cal, rule(), NOW, 1)
    skipping = occurrences(cal, rule(on_leave="skip"), NOW, 1)

    assert waiting[0].reason == "Pemilik cuti: persetujuan menunggu"
    assert [o.status for o in skipping] == ["skipped_leave", "skipped_leave", "run"]


def test_long_leave_does_not_hide_the_next_run():
    cal = calendar(leaves=((DAY("2026-12-01"), DAY("2027-01-29")),))
    schedule = rule(on_leave="skip")

    assert f"{next_run(cal, schedule, NOW):%Y-%m-%d}" == "2027-02-01"
    assert len(occurrences(cal, schedule, NOW, 5, limit=20)) == 20


def test_spread_is_stable_and_in_range():
    schedule = rule(time="16:00", spread_minutes=30)

    first = occurrences(calendar(), schedule, NOW, 5, "a")

    assert first == occurrences(calendar(), schedule, NOW, 5, "a")
    assert all(o.at.hour == 16 and o.at.minute <= 30 for o in first)
    assert len({o.at.minute for o in first}) > 1


@pytest.mark.parametrize(
    "values,message",
    [
        ({"start_date": ""}, "Isi tanggal mulai."),
        ({"end_date": "2026-11-01"}, "Tanggal berakhir sebelum tanggal mulai."),
        ({"frequency": "weekly"}, "Pilih minimal satu hari."),
        ({"frequency": "dates"}, "Tambahkan minimal satu tanggal."),
        ({"time": "25:00"}, "Isi jam putaran."),
        ({"time_mode": "shift_end"}, "Pilih shift."),
        ({"spread_minutes": 241}, "Rentang sebar 0–240 menit."),
        ({"start_date": "9999-12-31"}, "Isi tanggal mulai."),
    ],
)
def test_invalid_rule(values, message):
    with pytest.raises(ValidationError, match=message):
        rule(**values)
