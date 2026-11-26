"""Sama dengan bagian persetujuan pada `tugas/types.ts` (kontrak bagian 8)."""

from typing import Literal

from pydantic import Field

from app.api.v1.common import ApiListResponse, RequestModel
from app.services.engine.views import ApprovalItem


class ApprovalList(ApiListResponse[ApprovalItem]):
    pending_count: int


class Decision(RequestModel):
    decision: Literal["approved", "rejected", "revise"]
    comment: str = Field(default="", max_length=1000)
