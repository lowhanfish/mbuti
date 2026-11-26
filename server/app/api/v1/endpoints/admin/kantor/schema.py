"""Sama dengan `kantor/types.ts` (kontrak bagian 9)."""

import datetime

from pydantic import BaseModel


class OfficeAgent(BaseModel):
    id: str
    name: str
    title: str
    unit_id: str | None
    status: str
    avatar: dict[str, str]
    activity: str
    task_id: str | None
    task_title: str | None
    tasks_today: int


class OfficeUnit(BaseModel):
    id: str
    name: str
    code: str
    color: str
    parent_id: str | None
    lead_name: str | None
    member_count: int
    document_count: int
    active_task_count: int


class OfficeTransfer(BaseModel):
    task_id: str
    from_agent_id: str
    to_agent_id: str
    relation_type: str | None


class OfficeState(BaseModel):
    units: list[OfficeUnit]
    agents: list[OfficeAgent]
    transfers: list[OfficeTransfer]
    generated_at: datetime.datetime
