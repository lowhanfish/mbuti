"""
Aturan jadwal dan penghitungan putaran (kontrak 17.4).

Tanpa database dan tanpa model AI: hasilnya pasti dan bisa diuji. Tanggal dan jam memakai
zona waktu organisasi.
"""

import calendar
import datetime
import hashlib
import re
from dataclasses import dataclass, field
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, field_validator, model_validator

Frequency = Literal["daily", "workdays", "weekly", "monthly", "quarterly", "dates"]
TimeMode = Literal["fixed", "shift_start", "shift_end"]
OnHoliday = Literal["skip", "previous", "next"]
OnLeave = Literal["run", "skip"]
OnFail = Literal["backfill", "skip"]

WEEKDAYS = ("", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")
TIME = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
MAX_DATES = 100
MAX_SPREAD = 240
MAX_OFFSET = 720
# Paling jauh mencari hari kerja saat putaran digeser
MOVE_LIMIT = 31
# Paling jauh melihat ke depan
HORIZON_DAYS = 800
LEAVE_SKIPPED = "Pemilik role sedang cuti"
LEAVE_WAITS = "Pemilik cuti: persetujuan menunggu"


def to_date(value: str) -> datetime.date | None:
    if not DATE.fullmatch(value or ""):
        return None
    try:
        day = datetime.date.fromisoformat(value)
    except ValueError:
        return None
    # Tahun yang masuk akal agar penambahan hari tidak melewati batas tanggal
    return day if 2000 <= day.year <= 2200 else None


class ScheduleRule(BaseModel):
    frequency: Frequency
    # Mingguan: 1 = Senin … 7 = Minggu
    weekdays: list[int] = []
    # Bulanan dan triwulan: tanggal 1–31, atau 0 = hari kerja terakhir
    month_day: int = 1
    dates: list[str] = []
    time_mode: TimeMode = "fixed"
    time: str = "08:00"
    shift_id: str | None = None
    # Menit sebelum (negatif) atau sesudah awal/akhir shift
    offset_minutes: int = 0
    spread_minutes: int = 0
    start_date: str
    end_date: str | None = None
    on_holiday: OnHoliday = "skip"
    on_leave: OnLeave = "run"
    on_fail: OnFail = "backfill"

    @field_validator("end_date", "shift_id", mode="before")
    @classmethod
    def empty_to_none(cls, value):
        return None if value == "" else value

    @field_validator("weekdays")
    @classmethod
    def check_weekdays(cls, value: list[int]) -> list[int]:
        if any(day < 1 or day > 7 for day in value):
            raise ValueError("Hari tidak dikenal.")
        return sorted(set(value))

    @field_validator("dates")
    @classmethod
    def check_dates(cls, value: list[str]) -> list[str]:
        if any(to_date(day) is None for day in value):
            raise ValueError("Tanggal harus berbentuk YYYY-MM-DD.")
        if len(set(value)) > MAX_DATES:
            raise ValueError(f"Paling banyak {MAX_DATES} tanggal.")
        return sorted(set(value))

    @model_validator(mode="after")
    def check_rule(self):
        if to_date(self.start_date) is None:
            raise ValueError("Isi tanggal mulai.")
        if self.end_date is not None:
            if to_date(self.end_date) is None:
                raise ValueError("Tanggal berakhir harus berbentuk YYYY-MM-DD.")
            if self.end_date < self.start_date:
                raise ValueError("Tanggal berakhir sebelum tanggal mulai.")
        if self.frequency == "weekly" and not self.weekdays:
            raise ValueError("Pilih minimal satu hari.")
        if self.frequency == "dates" and not self.dates:
            raise ValueError("Tambahkan minimal satu tanggal.")
        if not 0 <= self.month_day <= 31:
            raise ValueError("Tanggal bulanan 1–31, atau hari kerja terakhir.")
        if not 0 <= self.spread_minutes <= MAX_SPREAD:
            raise ValueError(f"Rentang sebar 0–{MAX_SPREAD} menit.")
        if abs(self.offset_minutes) > MAX_OFFSET:
            raise ValueError(f"Geser waktu paling banyak {MAX_OFFSET} menit.")
        if self.time_mode == "fixed":
            if not TIME.fullmatch(self.time):
                raise ValueError("Isi jam putaran.")
            self.shift_id, self.offset_minutes = None, 0
        else:
            if self.shift_id is None:
                raise ValueError("Pilih shift.")
            self.time = self.time if TIME.fullmatch(self.time) else "08:00"
        return self


@dataclass(frozen=True)
class Shift:
    name: str
    start: datetime.time
    end: datetime.time
    weekdays: tuple[int, ...]


@dataclass(frozen=True)
class WorkCalendar:
    """Kalender yang berlaku bagi satu jadwal."""

    zone: ZoneInfo
    workdays: tuple[int, ...]
    # Hanya untuk jadwal terkait shift
    shift: Shift | None = None
    # tanggal -> (jenis, nama)
    days: dict[datetime.date, tuple[str, str]] = field(default_factory=dict)
    # Cuti penanggung jawab role, kedua tanggalnya termasuk
    leaves: tuple[tuple[datetime.date, datetime.date], ...] = ()

    @property
    def active_weekdays(self) -> tuple[int, ...]:
        return tuple(self.shift.weekdays if self.shift else self.workdays)

    def off_reason(self, day: datetime.date) -> str:
        """Alasan sebuah tanggal bukan hari kerja; kosong berarti hari kerja."""
        special = self.days.get(day)
        if special:
            return f"Libur: {special[1]}" if special[0] == "holiday" else ""
        if day.isoweekday() in self.active_weekdays:
            return ""
        return f"Shift {self.shift.name} tidak berlaku" if self.shift else "Libur mingguan"

    def is_holiday(self, day: datetime.date) -> bool:
        return self.days.get(day, ("", ""))[0] == "holiday"

    def on_leave(self, day: datetime.date) -> bool:
        return any(start <= day <= end for start, end in self.leaves)


@dataclass(frozen=True)
class Occurrence:
    # Saat putaran benar-benar jalan, dalam zona waktu organisasi
    at: datetime.datetime
    status: str
    moved_from: datetime.date | None = None
    reason: str = ""


def last_workday(cal: WorkCalendar, year: int, month: int) -> datetime.date | None:
    for number in range(calendar.monthrange(year, month)[1], 0, -1):
        day = datetime.date(year, month, number)
        if not cal.off_reason(day):
            return day
    return None


def _wanted(cal: WorkCalendar, rule: ScheduleRule, day: datetime.date) -> bool:
    """Tanggal yang diminta aturan, sebelum aturan libur diterapkan."""
    match rule.frequency:
        case "daily":
            return True
        case "workdays":
            # Libur di kalender pada hari yang biasanya kerja tetap dihitung agar aturan libur
            # berlaku; libur mingguan bukan putaran
            return not cal.off_reason(day) or (
                cal.is_holiday(day) and day.isoweekday() in cal.active_weekdays
            )
        case "weekly":
            return day.isoweekday() in rule.weekdays
        case "dates":
            return day.isoformat() in rule.dates
    if rule.frequency == "quarterly" and (day.month - to_date(rule.start_date).month) % 3:
        return False
    if rule.month_day == 0:
        return day == last_workday(cal, day.year, day.month)
    return day.day == min(rule.month_day, calendar.monthrange(day.year, day.month)[1])


def _moment(
    cal: WorkCalendar, rule: ScheduleRule, day: datetime.date, seed: str
) -> datetime.datetime:
    """Saat jalan untuk putaran milik tanggal `day`."""
    if rule.time_mode == "fixed":
        minutes = int(rule.time[:2]) * 60 + int(rule.time[3:])
    else:
        clock = cal.shift.start if rule.time_mode == "shift_start" else cal.shift.end
        minutes = clock.hour * 60 + clock.minute + rule.offset_minutes
        # Akhir shift malam jatuh pada hari berikutnya
        if rule.time_mode == "shift_end" and cal.shift.end < cal.shift.start:
            minutes += 24 * 60
    if rule.spread_minutes:
        # Tetap untuk pasangan jadwal dan tanggal agar pratinjau tidak berubah-ubah
        digest = hashlib.sha256(f"{seed}:{day.isoformat()}".encode()).digest()
        minutes += int.from_bytes(digest[:4], "big") % (rule.spread_minutes + 1)
    local = datetime.datetime.combine(day, datetime.time()) + datetime.timedelta(minutes=minutes)
    return local.replace(tzinfo=cal.zone)


def occurrences(
    cal: WorkCalendar,
    rule: ScheduleRule,
    after: datetime.datetime,
    count: int = 5,
    seed: str = "",
) -> list[Occurrence]:
    """Putaran sesudah `after`, termasuk yang dilewati, sampai `count` putaran yang jalan."""
    if rule.time_mode != "fixed" and cal.shift is None:
        return []
    start = to_date(rule.start_date)
    today = after.astimezone(cal.zone).date()
    # Mundur sedikit: putaran lama bisa bergeser maju melewati sekarang
    day = max(start, today - datetime.timedelta(days=MOVE_LIMIT + 2))
    stop = day + datetime.timedelta(days=HORIZON_DAYS)
    if rule.end_date:
        stop = min(stop, to_date(rule.end_date))
    if rule.frequency == "dates":
        stop = to_date(rule.dates[-1])
        if rule.end_date:
            stop = min(stop, to_date(rule.end_date))

    found: list[Occurrence] = []
    taken: set[datetime.date] = set()
    runs = 0
    enough: datetime.date | None = None
    while day <= stop and (enough is None or day <= enough):
        current, day = day, day + datetime.timedelta(days=1)
        if not _wanted(cal, rule, current):
            continue
        reason = cal.off_reason(current)
        # "Setiap hari" hanya terpengaruh libur di kalender, bukan libur mingguan
        blocked = cal.is_holiday(current) if rule.frequency == "daily" else bool(reason)
        target = current
        if blocked and rule.on_holiday != "skip":
            step = datetime.timedelta(days=1 if rule.on_holiday == "next" else -1)
            for _ in range(MOVE_LIMIT):
                if not cal.off_reason(target):
                    break
                target += step
        skipped = blocked and (rule.on_holiday == "skip" or bool(cal.off_reason(target)))
        at = _moment(cal, rule, target, seed)
        if at <= after:
            continue
        if skipped:
            found.append(Occurrence(at, "skipped_holiday", None, reason))
            continue
        if target in taken:
            continue
        taken.add(target)
        away = cal.on_leave(target)
        if rule.on_leave == "skip" and away:
            found.append(Occurrence(at, "skipped_leave", None, LEAVE_SKIPPED))
            continue
        moved = current if target != current else None
        notes = [f"Digeser dari {current.isoformat()} ({reason})" if moved else ""]
        notes.append(LEAVE_WAITS if away else "")
        found.append(Occurrence(at, "run", moved, " · ".join(n for n in notes if n)))
        runs += 1
        # Tanggal sesudahnya masih bisa bergeser mundur ke depan putaran terakhir
        if runs >= count and enough is None:
            enough = current + datetime.timedelta(days=MOVE_LIMIT)

    found.sort(key=lambda o: o.at)
    result: list[Occurrence] = []
    runs = 0
    for item in found:
        result.append(item)
        runs += item.status == "run"
        if runs >= count or len(result) >= count * 4:
            break
    return result


def next_run(
    cal: WorkCalendar, rule: ScheduleRule, after: datetime.datetime, seed: str = ""
) -> datetime.datetime | None:
    for item in occurrences(cal, rule, after, 1, seed):
        if item.status == "run":
            return item.at
    return None


def rule_text(rule: ScheduleRule, shift_name: str | None = None) -> str:
    """Jadwal dalam satu kalimat."""
    month_day = "hari kerja terakhir" if rule.month_day == 0 else f"tanggal {rule.month_day}"
    base = {
        "daily": "Setiap hari",
        "workdays": "Setiap hari kerja",
        "weekly": f"Setiap {', '.join(WEEKDAYS[d] for d in rule.weekdays)}",
        "monthly": f"Setiap bulan pada {month_day}",
        "quarterly": f"Setiap triwulan pada {month_day}",
        "dates": f"Pada {len(rule.dates)} tanggal tertentu",
    }[rule.frequency]
    if rule.time_mode == "fixed":
        moment = f"pukul {rule.time.replace(':', '.')}"
    else:
        offset = "saat"
        if rule.offset_minutes:
            side = "sebelum" if rule.offset_minutes < 0 else "sesudah"
            offset = f"{abs(rule.offset_minutes)} menit {side}"
        edge = "awal" if rule.time_mode == "shift_start" else "akhir"
        moment = f"{offset} {edge} shift {shift_name or '…'}"
    spread = f" (disebar sampai {rule.spread_minutes} menit)" if rule.spread_minutes else ""
    holiday = {
        "skip": "libur dilewati",
        "previous": "libur dimajukan",
        "next": "libur dimundurkan",
    }[rule.on_holiday]
    return f"{base} {moment}{spread}, {holiday}."
