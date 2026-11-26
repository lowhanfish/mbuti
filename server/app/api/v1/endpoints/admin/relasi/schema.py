"""Bentuk data peta relasi, sama dengan `relasi/types.ts` (kontrak bagian 6)."""

import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, FiniteFloat

from app.api.v1.common import RequestModel

RelationType = Literal["handoff", "review", "consult", "escalate"]
RelationTrigger = Literal["on_complete", "on_rejected", "on_condition"]
PayloadSpec = Literal["result_only", "result_context", "references"]


class RelationFields(RequestModel):
    relation_type: RelationType
    trigger: RelationTrigger = "on_complete"
    condition: str = Field(default="", max_length=500)
    payload_spec: PayloadSpec = "result_context"
    expected_output: str = Field(default="", max_length=500)
    max_revisions: int = Field(default=2, ge=1, le=5)
    requires_approval: bool = False
    label: str = Field(default="", max_length=60)


class RelationCreate(RelationFields):
    source_id: str
    # Role tujuan, atau keanggotaan manusia tujuan untuk eskalasi
    target_id: str


class RelationUpdate(RequestModel):
    """Ubah sebagian: kolom yang tidak dikirim tetap seperti semula."""

    source_id: str = Field(default=None)
    target_id: str = Field(default=None)
    relation_type: RelationType = Field(default=None)
    trigger: RelationTrigger = Field(default=None)
    condition: str = Field(default=None, max_length=500)
    payload_spec: PayloadSpec = Field(default=None)
    expected_output: str = Field(default=None, max_length=500)
    max_revisions: int = Field(default=None, ge=1, le=5)
    requires_approval: bool = Field(default=None)
    label: str = Field(default=None, max_length=60)


class RelationItem(BaseModel):
    id: str
    source_id: str
    target_id: str
    source_kind: Literal["agent", "human"]
    target_kind: Literal["agent", "human"]
    relation_type: str
    trigger: str
    condition: str
    payload_spec: str
    expected_output: str
    max_revisions: int
    requires_approval: bool
    label: str
    created_at: datetime.datetime
    updated_at: datetime.datetime


class Position(BaseModel):
    x: FiniteFloat = Field(ge=-1_000_000, le=1_000_000)
    y: FiniteFloat = Field(ge=-1_000_000, le=1_000_000)


class PositionsRequest(RequestModel):
    positions: dict[str, Position] = Field(max_length=1000)


class HumanRequest(RequestModel):
    member_id: str


class Graph(BaseModel):
    # Node role dan manusia punya kolom berbeda
    nodes: list[dict[str, Any]]
    relations: list[RelationItem]
    positions: dict[str, dict[str, int]]
    revision_limit: int
