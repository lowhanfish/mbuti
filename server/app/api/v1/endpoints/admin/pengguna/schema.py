import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

from app.api.v1.common import ApiListResponse, Email, RequestModel

AccessRole = Literal["owner", "admin", "member", "viewer"]


class InviteRequest(RequestModel):
    full_name: str
    email: Email
    access_role: AccessRole
    unit_id: str | None = None

    @field_validator("full_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        if len(value) < 2:
            raise ValueError("Nama minimal 2 karakter.")
        if len(value) > 150:
            raise ValueError("Nama maksimal 150 karakter.")
        return value

    @field_validator("email")
    @classmethod
    def check_email_length(cls, value: str) -> str:
        if len(value) > 150:
            raise ValueError("Email maksimal 150 karakter.")
        return value


class MemberUpdate(RequestModel):
    access_role: AccessRole
    unit_id: str | None = None
    status: Literal["active", "disabled"]


class MemberItem(BaseModel):
    id: str
    user_id: str
    full_name: str
    email: str
    access_role: str
    unit_id: str | None
    unit_name: str | None
    status: str
    joined_at: datetime.datetime
    last_active_at: datetime.datetime | None
    is_self: bool


class MemberSummary(BaseModel):
    active: int = 0
    invited: int = 0
    disabled: int = 0


class MemberList(ApiListResponse[MemberItem]):
    summary: MemberSummary
