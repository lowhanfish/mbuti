"""Usulan temuan internet menjadi pengetahuan (kontrak 16.7)."""

import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.api.v1.common import ApiListResponse, RequestModel

ProposalStatus = Literal["pending", "approved", "rejected"]


class ProposalRequest(RequestModel):
    url: str = Field(max_length=500)
    title: str = Field(default="", max_length=200)
    excerpt: str = Field(default="", max_length=2000)
    task_id: str | None = None
    agent_id: str | None = None

    @field_validator("url")
    @classmethod
    def check_url(cls, value: str) -> str:
        if not value.lower().startswith(("http://", "https://")) or any(c.isspace() for c in value):
            raise ValueError("Alamat sumber tidak valid.")
        return value


class ProposalItem(BaseModel):
    id: str
    url: str
    title: str
    excerpt: str
    status: str
    task_id: str | None
    task_title: str | None
    agent_name: str | None
    proposed_by_name: str | None
    decided_by_name: str | None
    decided_at: datetime.datetime | None
    document_id: str | None
    created_at: datetime.datetime


class ProposalSummary(BaseModel):
    pending: int = 0
    approved: int = 0
    rejected: int = 0


class ProposalList(ApiListResponse[ProposalItem]):
    summary: ProposalSummary
