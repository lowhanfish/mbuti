"""Alur aplikasi luar (kontrak API bagian 22)."""

import datetime
import re
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator

from app.api.v1.common import RequestModel

MAX_INPUTS = 10
MAX_VALUE = 2000
TRUST_AFTER_RUNS = 3
RECENT_RUNS = 20
KEY = re.compile(r"^[a-z0-9_]{1,30}$")
OTP = re.compile(r"^[A-Za-z0-9]{4,12}$")

FlowStatus = Literal["learning", "review", "approved", "needs_repair", "failed"]
RunMode = Literal["learn", "replay", "repair"]
RunStatus = Literal[
    "queued",
    "running",
    "waiting_approval",
    "waiting_otp",
    "succeeded",
    "failed",
    "stopped",
    "needs_repair",
]


class FlowInput(RequestModel):
    key: str = ""
    label: str = ""
    sample: str = ""


class FlowBody(RequestModel):
    name: str
    goal: str
    inputs: list[FlowInput] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        if not 2 <= len(value) <= 100:
            raise ValueError("Nama alur 2 sampai 100 karakter.")
        return value

    @field_validator("goal")
    @classmethod
    def check_goal(cls, value: str) -> str:
        if not 10 <= len(value) <= 1000:
            raise ValueError("Jelaskan tujuannya, 10 sampai 1000 karakter.")
        return value

    @field_validator("inputs")
    @classmethod
    def check_inputs(cls, value: list[FlowInput]) -> list[FlowInput]:
        if len(value) > MAX_INPUTS:
            raise ValueError(f"Isian maksimal {MAX_INPUTS}.")
        for item in value:
            if not KEY.match(item.key) or not 1 <= len(item.label) <= 60:
                raise ValueError("Setiap isian perlu nama, maksimal 60 karakter.")
            if not 1 <= len(item.sample) <= 500:
                raise ValueError("Setiap isian perlu nilai contoh, maksimal 500 karakter.")
        if len({item.key for item in value}) != len(value):
            raise ValueError("Nama isian tidak boleh sama.")
        return value


class LearnRequest(FlowBody):
    account_id: str = ""


class ApproveRequest(RequestModel):
    version: int


class RunRequest(RequestModel):
    inputs: dict[str, str] = Field(default_factory=dict)


class TrustRequest(RequestModel):
    enabled: bool
    code: str = Field(default="", max_length=20)


class DecisionRequest(RequestModel):
    decision: Literal["approved", "rejected"]


class OtpRequest(RequestModel):
    code: SecretStr

    @field_validator("code")
    @classmethod
    def check_code(cls, value: SecretStr) -> SecretStr:
        text = value.get_secret_value().strip()
        if not OTP.match(text):
            raise ValueError("Kode OTP 4 sampai 12 huruf atau angka.")
        return SecretStr(text)


class FlowStep(BaseModel):
    no: int
    action: Literal["open", "login", "fill", "select", "check", "click", "read"]
    description: str
    value_label: str
    risk: Literal["none", "submit", "delete"]
    screenshot_url: str | None


class RunSummary(BaseModel):
    id: str
    mode: RunMode
    status: RunStatus
    message: str
    flow_version: int
    created_by_name: str
    created_at: datetime.datetime
    finished_at: datetime.datetime | None


class FlowAccess(BaseModel):
    can_manage: bool
    can_trust: bool


class FlowBase(BaseModel):
    id: str
    name: str
    account_id: str | None
    account_name: str
    status: FlowStatus
    version: int
    trusted_submit: bool
    successful_runs: int
    updated_at: datetime.datetime


class FlowListItem(FlowBase):
    steps_count: int
    last_run: RunSummary | None


class AccountOption(BaseModel):
    id: str
    name: str
    locked: bool


class FlowList(BaseModel):
    flows: list[FlowListItem]
    accounts: list[AccountOption]
    can_manage: bool


class FlowDetail(FlowBase):
    role_id: str
    role_name: str
    goal: str
    inputs: list[FlowInput]
    steps: list[FlowStep]
    note: str
    approved_at: datetime.datetime | None
    approved_by_name: str | None
    active_run_id: str | None
    access: FlowAccess
    runs: list[RunSummary]
    created_at: datetime.datetime


class NamedValue(BaseModel):
    label: str
    value: str


class RunEvent(BaseModel):
    no: int
    step_no: int | None
    message: str
    status: Literal["done", "waiting", "blocked", "failed"]
    screenshot_url: str | None
    created_at: datetime.datetime


class RunPending(BaseModel):
    kind: Literal["approval", "otp"]
    question: str
    values: list[NamedValue]
    screenshot_url: str | None
    expires_at: datetime.datetime | None = None


class RunDetail(RunSummary):
    flow_id: str
    flow_name: str
    role_id: str
    role_name: str
    inputs: list[NamedValue]
    events: list[RunEvent]
    outputs: list[NamedValue]
    pending: RunPending | None
    can_decide: bool
