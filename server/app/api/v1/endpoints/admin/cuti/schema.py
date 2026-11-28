"""Cuti anggota (kontrak 17.2)."""

import datetime

from pydantic import BaseModel, field_validator, model_validator

from app.api.v1.common import RequestModel
from app.api.v1.endpoints.admin.kalender.schema import parse_date

BAD_RANGE = "Isi rentang tanggal cuti yang benar."


class LeaveRequest(RequestModel):
    start_date: str
    end_date: str
    note: str = ""

    @field_validator("start_date", "end_date")
    @classmethod
    def check_date(cls, value: str) -> str:
        parse_date(value)
        return value

    @field_validator("note")
    @classmethod
    def check_note(cls, value: str) -> str:
        if len(value) > 200:
            raise ValueError("Catatan paling panjang 200 karakter.")
        return value

    @model_validator(mode="after")
    def check_range(self):
        if self.end_date < self.start_date:
            raise ValueError(BAD_RANGE)
        return self


class LeaveItem(BaseModel):
    id: str
    start_date: datetime.date
    end_date: datetime.date
    note: str
