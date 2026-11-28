"""Sama dengan `tugas/rutin/types.ts` (kontrak 17.3–17.5)."""

import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.api.v1.common import RequestModel
from app.services.engine.views import AgentRef
from app.services.schedule.rules import ScheduleRule


class ScheduleRequest(RequestModel):
    title: str
    brief: str = Field(default="", max_length=4000)
    entry_agent_id: str
    inputs: dict[str, Annotated[str, Field(max_length=2000)]] = Field(
        default_factory=dict, max_length=20
    )
    priority: Literal["low", "normal", "high"] = "normal"
    budget_limit: int = Field(strict=True)
    web_search: Literal["role", "off"] = "role"
    rule: ScheduleRule
    source_text: str = Field(default="", max_length=500)
    status: Literal["draft", "active"] = "active"

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        if len(value) < 5:
            raise ValueError("Judul tugas minimal 5 karakter.")
        if len(value) > 150:
            raise ValueError("Judul tugas maksimal 150 karakter.")
        return value


class ParseRequest(RequestModel):
    text: str

    @field_validator("text")
    @classmethod
    def check_text(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Tulis jadwalnya lebih lengkap.")
        if len(value) > 500:
            raise ValueError("Kalimat jadwal paling panjang 500 karakter.")
        return value


class PreviewRequest(RequestModel):
    rule: ScheduleRule
    entry_agent_id: str | None = None


class OccurrenceItem(BaseModel):
    date: datetime.date
    time: str
    status: str
    moved_from: datetime.date | None
    reason: str


class Preview(BaseModel):
    rule_text: str
    occurrences: list[OccurrenceItem]


class ParseResult(Preview):
    rule: ScheduleRule
    title: str
    # Hal yang tidak dipahami atau diasumsikan
    notes: list[str]


class RunItem(BaseModel):
    id: str
    planned_for: datetime.datetime
    status: str
    attempt: int
    reason: str
    task_id: str | None
    task_status: str | None
    attachment_count: int


class ScheduleItem(BaseModel):
    id: str
    title: str
    brief: str
    entry_agent: AgentRef
    inputs: dict[str, str]
    priority: str
    budget_limit: int
    web_search: str
    rule: ScheduleRule
    rule_text: str
    source_text: str
    status: str
    next_run_at: datetime.datetime | None
    last_run: RunItem | None
    created_by_name: str | None
    can_manage: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ScheduleDetail(ScheduleItem):
    upcoming: list[OccurrenceItem]
    runs: list[RunItem]
