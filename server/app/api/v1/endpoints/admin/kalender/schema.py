"""Kalender kerja (kontrak 17.1)."""

import datetime
import re
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

from app.api.v1.common import RequestModel

DayKind = Literal["holiday", "workday"]

TIME = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
BAD_DATE = "Tanggal harus berbentuk YYYY-MM-DD."


def clean_weekdays(values: list[int], empty: str) -> list[int]:
    """Hari 1 (Senin) sampai 7 (Minggu), tanpa ulangan, berurutan."""
    if any(day < 1 or day > 7 for day in values):
        raise ValueError("Hari tidak dikenal.")
    if not values:
        raise ValueError(empty)
    return sorted(set(values))


def parse_date(value: str) -> datetime.date:
    if DATE.fullmatch(value):
        try:
            return datetime.date.fromisoformat(value)
        except ValueError:
            pass
    raise ValueError(BAD_DATE)


class WorkdaysUpdate(RequestModel):
    workdays: list[int]

    @field_validator("workdays")
    @classmethod
    def check_workdays(cls, value: list[int]) -> list[int]:
        return clean_weekdays(value, "Pilih minimal satu hari kerja.")


class ShiftRequest(RequestModel):
    name: str
    start_time: str
    end_time: str
    weekdays: list[int]

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not 2 <= len(value) <= 60:
            raise ValueError("Nama shift harus 2–60 karakter.")
        return value

    @field_validator("start_time", "end_time")
    @classmethod
    def check_time(cls, value: str) -> str:
        if not TIME.fullmatch(value):
            raise ValueError("Jam harus berbentuk HH:MM.")
        return value

    @field_validator("weekdays")
    @classmethod
    def check_weekdays(cls, value: list[int]) -> list[int]:
        return clean_weekdays(value, "Pilih minimal satu hari.")

    @model_validator(mode="after")
    def check_times(self):
        if self.start_time == self.end_time:
            raise ValueError("Isi jam mulai dan selesai yang berbeda.")
        return self


class CalendarDayRequest(RequestModel):
    date: str
    kind: DayKind = "holiday"
    name: str
    label: str = ""

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        parse_date(value)
        return value

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not 2 <= len(value) <= 120:
            raise ValueError("Nama harus 2–120 karakter.")
        return value

    @field_validator("label")
    @classmethod
    def check_label(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) > 60:
            raise ValueError("Jenis paling panjang 60 karakter.")
        return value


class ShiftItem(BaseModel):
    id: str
    name: str
    start_time: str
    end_time: str
    weekdays: list[int]


class CalendarSettings(BaseModel):
    timezone: str
    workdays: list[int]
    shifts: list[ShiftItem]
    can_edit: bool


class CalendarDayItem(BaseModel):
    id: str
    date: datetime.date
    kind: str
    name: str
    label: str


class ImportResult(BaseModel):
    added: int
    updated: int
    errors: list[str]
