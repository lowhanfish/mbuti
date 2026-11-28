"""Bentuk data role, sama dengan `role/types.ts` di frontend (kontrak bagian 4)."""

import datetime
import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.api.v1.common import ApiListResponse, RequestModel
from app.api.v1.endpoints.admin.pengetahuan.schema import SearchHit

AgentStatus = Literal["draft", "active", "paused"]
OutputFormat = Literal["text", "template", "table", "json"]
KnowledgeScope = Literal["own", "unit", "organization"]
ModelProfile = Literal["fast", "balanced", "thorough"]
InputFieldType = Literal["short_text", "long_text", "number", "date", "choice"]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


def _length(value: str, minimum: int, maximum: int, label: str) -> str:
    if len(value) < minimum:
        raise ValueError(f"{label} minimal {minimum} karakter.")
    if len(value) > maximum:
        raise ValueError(f"{label} maksimal {maximum} karakter.")
    return value


class InputField(RequestModel):
    key: str = Field(default="", max_length=40)
    label: str
    type: InputFieldType = "short_text"
    required: bool = False
    options: list[Annotated[str, Field(max_length=60)]] | None = Field(default=None, max_length=12)

    @field_validator("label")
    @classmethod
    def check_label(cls, value: str) -> str:
        return _length(value, 1, 80, "Nama isian")


class Avatar(RequestModel):
    skin: Color
    hair: Color
    hair_style: Literal["short", "long", "bun", "cap", "bald"]
    shirt: Color
    pants: Color
    accessory: Literal["none", "glasses", "headset", "tie", "flower", "antenna"]


class RoleChecks(RequestModel):
    """Aturan panjang yang sama untuk buat dan ubah."""

    @field_validator("name", check_fields=False)
    @classmethod
    def check_name(cls, value: str) -> str:
        return _length(value, 2, 60, "Nama role")

    @field_validator("title", check_fields=False)
    @classmethod
    def check_title(cls, value: str) -> str:
        return _length(value, 3, 100, "Jabatan")

    @field_validator("goal", check_fields=False)
    @classmethod
    def check_goal(cls, value: str) -> str:
        return _length(value, 0, 500, "Tujuan kerja")


class RoleCreate(RoleChecks):
    name: str
    title: str
    unit_id: str | None = None
    goal: str = ""
    status: AgentStatus = "draft"
    # formation: mulai sebagai draf dengan revisi pembentukan; manual: langsung versi 1 (16.3)
    mode: Literal["formation", "manual"] = "manual"


class RoleUpdate(RoleChecks):
    """
    Ubah sebagian: hanya kolom yang dikirim yang berubah. Nilai bawaan `None` tidak
    divalidasi, tetapi mengirim `null` tetap ditolak kecuali untuk kolom yang boleh kosong.
    """

    name: str = Field(default=None)
    title: str = Field(default=None)
    unit_id: str | None = None
    goal: str = Field(default=None)
    status: AgentStatus = Field(default=None)
    instructions: str = Field(default=None, max_length=8000)
    input_spec: list[InputField] = Field(default=None, max_length=20)
    output_format: OutputFormat = Field(default=None)
    output_template: str = Field(default=None, max_length=4000)
    acceptance_criteria: list[Annotated[str, Field(max_length=200)]] = Field(
        default=None, max_length=15
    )
    knowledge_scope: KnowledgeScope = Field(default=None)
    model_profile: ModelProfile = Field(default=None)
    owner_member_id: str | None = None
    avatar: Avatar = Field(default=None)
    web_search: bool = Field(default=None)
    compose_mode: Literal["data", "complete", "free"] = Field(default=None)

    @field_validator("input_spec")
    @classmethod
    def unique_keys(cls, fields: list[InputField]) -> list[InputField]:
        """Kunci kosong dibuat dari nama isian; kunci ganda diberi akhiran."""
        seen: set[str] = set()
        for field in fields:
            key = field.key or re.sub(r"[^a-z0-9]+", "_", field.label.lower()).strip("_")[:40]
            key = key or "isian"
            while key in seen:
                key = f"{key}_2"
            seen.add(key)
            field.key = key
            if field.type != "choice":
                field.options = None
            elif field.options is not None:
                field.options = [option for option in field.options if option]
        return fields

    @field_validator("acceptance_criteria")
    @classmethod
    def drop_empty(cls, criteria: list[str]) -> list[str]:
        return [item for item in criteria if item]


class RoleItem(BaseModel):
    id: str
    name: str
    title: str
    unit_id: str | None
    goal: str
    status: str
    instructions: str
    input_spec: list[dict[str, Any]]
    output_format: str
    output_template: str
    acceptance_criteria: list[str]
    knowledge_scope: str
    model_profile: str
    owner_member_id: str | None
    avatar: dict[str, str]
    web_search: bool
    compose_mode: str
    active_version_no: int
    revision_status: str | None
    unit_name: str | None
    unit_color: str | None
    owner_name: str | None
    document_count: int
    relation_count: int
    task_count: int
    created_at: datetime.datetime
    updated_at: datetime.datetime


class TrialRequest(RequestModel):
    brief: str = Field(default="", max_length=4000)
    # Lampiran dari POST /tugas/lampiran; boleh dipakai ulang (E1c)
    attachment_ids: list[str] = Field(default_factory=list, max_length=10)
    inputs: dict[str, Annotated[str, Field(max_length=2000)]] = Field(
        default_factory=dict, max_length=20
    )


class TrialResult(BaseModel):
    simulated: bool = False
    status: Literal["done", "need_info", "not_in_documents"]
    output: str
    notes: str
    prompt_preview: str
    missing_inputs: list[str]
    citations: list[SearchHit]
    cost: int
    model: str
    # Diisi mulai E1c dan E1d; kosong sampai saat itu
    attachments: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    web_sources: list[dict[str, Any]] = []
    # Mode yang dipakai dan bagian buatan role (E3c)
    compose_mode: str = "data"
    composed: list[dict[str, Any]] = []


class RoleSummary(BaseModel):
    draft: int = 0
    active: int = 0
    paused: int = 0


class RoleList(ApiListResponse[RoleItem]):
    summary: RoleSummary
