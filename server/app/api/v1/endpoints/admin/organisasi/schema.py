import datetime
from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, field_validator

from app.api.v1.common import EMAIL_PATTERN, RequestModel

Sector = Literal["pemerintahan", "pendidikan", "kesehatan", "usaha", "nirlaba", "lainnya"]


def _limit(value: str, maximum: int, label: str) -> str:
    if len(value) > maximum:
        raise ValueError(f"{label} maksimal {maximum} karakter.")
    return value


class ProfileUpdate(RequestModel):
    name: str
    description: str = ""
    sector: Sector
    timezone: str
    email: str = ""
    phone: str = ""
    address: str = ""
    website: str = ""

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        if len(value) < 3:
            raise ValueError("Nama organisasi minimal 3 karakter.")
        return _limit(value, 150, "Nama organisasi")

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        return _limit(value, 1000, "Deskripsi")

    @field_validator("timezone")
    @classmethod
    def check_timezone(cls, value: str) -> str:
        if value not in available_timezones():
            raise ValueError("Zona waktu tidak dikenal.")
        return value

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        if value and not EMAIL_PATTERN.match(value):
            raise ValueError("Format email tidak valid.")
        return _limit(value, 150, "Email")

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str) -> str:
        return _limit(value, 30, "Telepon")

    @field_validator("address")
    @classmethod
    def check_address(cls, value: str) -> str:
        return _limit(value, 300, "Alamat")

    @field_validator("website")
    @classmethod
    def check_website(cls, value: str) -> str:
        if value and not value.startswith(("http://", "https://")):
            raise ValueError("Situs web harus diawali http:// atau https://.")
        return _limit(value, 200, "Situs web")


class ProfileStats(BaseModel):
    unit_count: int
    member_count: int
    agent_count: int


class Profile(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    sector: str
    timezone: str
    email: str
    phone: str
    address: str
    website: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    stats: ProfileStats
