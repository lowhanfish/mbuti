"""Sama dengan `tugas/types.ts` (kontrak bagian 7)."""

import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.api.v1.common import ApiListResponse, RequestModel
from app.api.v1.endpoints.admin.pengetahuan.schema import SearchHit
from app.services.engine.views import AgentRef, ApprovalItem


class TaskCreate(RequestModel):
    title: str
    brief: str = Field(default="", max_length=4000)
    entry_agent_id: str
    inputs: dict[str, Annotated[str, Field(max_length=2000)]] = Field(
        default_factory=dict, max_length=20
    )
    priority: Literal["low", "normal", "high"] = "normal"
    # Tanggal tanpa jam: berlaku sampai akhir hari itu
    due_at: datetime.date | None = None
    budget_limit: int = Field(strict=True)

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        if len(value) < 5:
            raise ValueError("Judul tugas minimal 5 karakter.")
        if len(value) > 150:
            raise ValueError("Judul tugas maksimal 150 karakter.")
        return value

    @field_validator("due_at", mode="before")
    @classmethod
    def empty_date(cls, value):
        return None if value == "" else value


class Step(BaseModel):
    id: str
    agent: AgentRef
    kind: str
    via_relation_type: str | None
    attempt_no: int
    status: str
    input_notes: str
    output: str
    citations: list[SearchHit]
    verdict: str | None
    model: str
    cost: int
    tokens: int
    started_at: datetime.datetime | None
    finished_at: datetime.datetime | None


class Event(BaseModel):
    id: str
    type: str
    message: str
    step_id: str | None
    created_at: datetime.datetime


class TaskItem(BaseModel):
    id: str
    title: str
    brief: str
    entry_agent: AgentRef
    participants: list[AgentRef]
    status: str
    priority: str
    due_at: datetime.datetime | None
    budget_limit: int
    cost_used: int
    step_count: int
    steps_done: int
    pending_approval_count: int
    created_by_name: str | None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    completed_at: datetime.datetime | None


class InputValue(BaseModel):
    label: str
    value: str


class TaskDetail(TaskItem):
    inputs: list[InputValue]
    steps: list[Step]
    approvals: list[ApprovalItem]
    events: list[Event]


class TaskSummary(BaseModel):
    queued: int = 0
    running: int = 0
    waiting_approval: int = 0
    completed: int = 0
    failed: int = 0
    cancelled: int = 0
    stopped_budget: int = 0


class TaskList(ApiListResponse[TaskItem]):
    summary: TaskSummary
