import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

from app.api.v1.common import RequestModel

UnitColor = Literal["violet", "honey", "pink", "teal", "sky", "lime", "orange", "slate"]


class UnitWrite(RequestModel):
    name: str
    code: str = ""
    description: str = ""
    parent_id: str | None = None
    color: UnitColor = "violet"
    lead_member_id: str | None = None
    sort_order: int = 0

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        if len(value) < 2:
            raise ValueError("Nama unit minimal 2 karakter.")
        if len(value) > 120:
            raise ValueError("Nama unit maksimal 120 karakter.")
        return value

    @field_validator("code")
    @classmethod
    def check_code(cls, value: str) -> str:
        if len(value) > 12:
            raise ValueError("Kode unit maksimal 12 karakter.")
        return value.upper()

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        if len(value) > 1000:
            raise ValueError("Deskripsi maksimal 1000 karakter.")
        return value

    @field_validator("sort_order")
    @classmethod
    def check_order(cls, value: int) -> int:
        if not 0 <= value <= 100_000:
            raise ValueError("Urutan harus antara 0 dan 100000.")
        return value


class UnitItem(BaseModel):
    id: str
    name: str
    code: str
    description: str
    parent_id: str | None
    parent_name: str | None
    color: str
    lead_member_id: str | None
    lead_name: str | None
    sort_order: int
    member_count: int
    agent_count: int
    child_count: int
    created_at: datetime.datetime
    updated_at: datetime.datetime
