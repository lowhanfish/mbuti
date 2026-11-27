"""Bentuk data dokumen, sama dengan `pengetahuan/types.ts` (kontrak bagian 5)."""

import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.api.v1.common import ApiListResponse, RequestModel

DocumentScope = Literal["organization", "unit", "agent"]
DocumentType = Literal[
    "sop", "manual", "pedoman", "templat", "regulasi", "uraian_jabatan", "lainnya"
]
DocumentCategory = Literal["knowledge", "policy", "formation", "qa", "web"]
PolicyKind = Literal["peraturan", "kebijakan", "standar_mutu", "panduan_merek", "lainnya"]


class PolicyFields(RequestModel):
    """Keterangan dokumen di pustaka Kebijakan & Aturan (kontrak 16.4)."""

    kind: PolicyKind = "lainnya"
    reference_no: str = Field(default="", max_length=100)
    issuer: str = Field(default="", max_length=150)
    effective_from: datetime.date | None = None
    effective_until: datetime.date | None = None
    status: Literal["berlaku", "dicabut"] = "berlaku"

    @model_validator(mode="after")
    def check_dates(self) -> "PolicyFields":
        if (
            self.effective_from
            and self.effective_until
            and self.effective_until < self.effective_from
        ):
            raise ValueError("Tanggal akhir berlaku tidak boleh sebelum tanggal mulai.")
        return self


class PolicyInfo(BaseModel):
    kind: str
    reference_no: str
    issuer: str
    effective_from: datetime.date | None
    effective_until: datetime.date | None
    status: str
    # Berstatus berlaku dan hari ini (zona waktu organisasi) di dalam masa berlaku
    in_force: bool


class DocumentMeta(RequestModel):
    title: str
    description: str = ""
    doc_type: DocumentType = "lainnya"
    scope: DocumentScope
    scope_id: str | None = None
    # Hanya untuk dokumen kebijakan; diabaikan untuk kategori lain
    policy: PolicyFields | None = None

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        if len(value) < 3:
            raise ValueError("Judul minimal 3 karakter.")
        if len(value) > 200:
            raise ValueError("Judul maksimal 200 karakter.")
        return value

    @field_validator("description")
    @classmethod
    def check_description(cls, value: str) -> str:
        if len(value) > 1000:
            raise ValueError("Deskripsi maksimal 1000 karakter.")
        return value


class Version(BaseModel):
    id: str
    version_no: int
    file_name: str
    mime_type: str
    size_bytes: int
    sha256: str
    page_count: int
    is_active: bool
    status: str
    progress: int
    error_message: str | None
    uploaded_by_name: str | None
    # Halaman bergambar mulai E1c; sampai saat itu nol
    media_kind: str = "text"
    visual_pages: int = 0
    visual_pages_over_limit: int = 0
    created_at: datetime.datetime


class Section(BaseModel):
    page_no: int
    heading: str
    text: str
    # Halaman bergambar mulai E1c
    render: str = "text"
    image_url: str | None = None
    visual_text: str = ""


class VersionDetail(Version):
    sections: list[Section]


class DocumentItem(BaseModel):
    id: str
    title: str
    description: str
    doc_type: str
    scope: str
    scope_id: str | None
    scope_name: str | None
    scope_color: str | None
    active_version: Version | None
    version_count: int
    category: str
    # Terisi untuk kebijakan (E1b) dan temuan internet (E1d)
    policy: PolicyInfo | None = None
    source_url: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class DocumentDetail(DocumentItem):
    versions: list[Version]
    sections: list[Section]
    archived_at: datetime.datetime | None


class IngestionSummary(BaseModel):
    queued: int = 0
    processing: int = 0
    ready: int = 0
    failed: int = 0


class DocumentList(ApiListResponse[DocumentItem]):
    summary: IngestionSummary


class SearchHit(BaseModel):
    document_id: str
    document_title: str
    version_id: str
    version_no: int
    page_no: int
    heading: str
    snippet: str
    score: int
    source_kind: str = "document"
    image_url: str | None = None


def hit_to_schema(hit) -> SearchHit:
    return SearchHit(
        **{
            **hit.__dict__,
            "document_id": str(hit.document_id),
            "version_id": str(hit.version_id),
        }
    )
