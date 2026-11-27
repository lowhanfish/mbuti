"""Bentuk data pembentukan role, sama dengan `role/formation-types.ts` (kontrak 16.1 dan 16.2)."""

import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.api.v1.common import RequestModel


class MaterialDocument(BaseModel):
    id: str
    title: str
    file_name: str
    status: str
    progress: int
    page_count: int


class FormationMessage(BaseModel):
    id: str
    round_no: int
    author: str
    kind: str
    question_id: str | None
    required: bool
    text: str
    skipped: bool
    author_name: str
    created_at: datetime.datetime


class Formation(BaseModel):
    id: str
    agent_id: str
    version_no: int
    status: str
    source: str
    processing: bool
    can_edit: bool
    materials: dict[str, Any]
    material_documents: list[MaterialDocument]
    # summary, goal, skills, findings
    card: dict[str, Any] | None
    snapshot: dict[str, Any] | None
    round_no: int
    messages: list[FormationMessage]
    open_required: int
    changed: list[str]
    agent_satisfied: bool
    error_message: str | None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class VersionItem(BaseModel):
    id: str
    version_no: int
    status: str
    source: str
    change_note: str
    finalized_at: datetime.datetime | None
    finalized_by_name: str | None
    is_active: bool
    skill_count: int
    question_count: int


class VersionDetail(VersionItem):
    snapshot: dict[str, Any]
    card: dict[str, Any] | None


class StartRequest(RequestModel):
    from_version_id: str | None = None


class MaterialsRequest(RequestModel):
    description: str = Field(default="", max_length=4000)
    tools: list[Annotated[str, Field(max_length=80)]] = Field(default_factory=list, max_length=30)
    represented: str = Field(default="", max_length=160)
    owner_member_id: str | None = None


class CardUpdateRequest(RequestModel):
    summary: str = Field(default="", max_length=1500)
    goal: str = Field(default="", max_length=500)
    # Dirapikan server: panjang dipangkas dan alat dipetakan ulang ke katalog
    skills: list[dict[str, Any]] = Field(min_length=1, max_length=20)


class Answer(RequestModel):
    question_id: str
    text: str = Field(default="", max_length=2000)
    skipped: bool = False


class AnswerRequest(RequestModel):
    answers: list[Answer] = Field(default_factory=list, max_length=20)
    note: str = Field(default="", max_length=2000)
    finish: bool = False


class FinalRequest(RequestModel):
    change_note: str = Field(default="", max_length=500)
    status_after: Literal["active", "paused"] = "active"
    override_reason: str = Field(default="", max_length=500)


class ToolCatalogItem(BaseModel):
    key: str
    name: str
    group: str
    support: str
    stage: str
    description: str
    software: str


class ToolRequestItem(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    skill_name: str
    requested: str
    status: str
    created_at: datetime.datetime
