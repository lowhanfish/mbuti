"""Sama dengan `ResultDocument` dan `pengaturan/persuratan/types.ts` (kontrak bagian 18)."""

import datetime

from pydantic import BaseModel

from app.api.v1.common import RequestModel


class CorrectionRequest(RequestModel):
    text: str


class CheckedRequest(RequestModel):
    checked: bool


class RegisterRequest(RequestModel):
    pattern: str
    next_number: int


class Source(BaseModel):
    kind: str
    title: str
    detail: str
    url: str | None
    document_id: str | None


class Check(BaseModel):
    text: str
    passed: bool
    ref: str


class ResultDocumentItem(BaseModel):
    kind: str = "letter"
    id: str
    title: str
    letter_type: str
    format_id: str | None
    version: int
    number: str | None
    can_number: bool
    processing: bool
    pages: list[str]
    docx_url: str | None
    pdf_url: str | None
    sources: list[Source]
    format_checked: bool
    official: bool
    checks: list[Check]
    created_at: datetime.datetime
    updated_at: datetime.datetime


class SheetColumn(BaseModel):
    header: str
    format: str
    formula: str


class SheetRow(BaseModel):
    style: str
    cells: list[str]


class SheetPreview(BaseModel):
    name: str
    columns: list[SheetColumn]
    rows: list[SheetRow]
    row_count: int
    flagged: int
    flag_rule: str


class SheetResultItem(BaseModel):
    """`SheetResult` (kontrak 19.4)."""

    kind: str = "sheet"
    id: str
    title: str
    version: int
    processing: bool
    checks: list[Check]
    created_at: datetime.datetime
    updated_at: datetime.datetime
    xlsx_url: str | None
    origin: str
    source_files: list[str]
    sheets: list[SheetPreview]


class Margins(BaseModel):
    top: float
    right: float
    bottom: float
    left: float


class Correction(BaseModel):
    id: str
    text: str
    author_name: str
    created_at: datetime.datetime


class FormatItem(BaseModel):
    id: str
    name: str
    paper: str
    margins: Margins
    font: str
    sections: list[str]
    sources: list[Source]
    checked: bool
    corrections: list[Correction]
    updated_at: datetime.datetime


class LetterheadItem(BaseModel):
    id: str
    unit_id: str | None
    unit_name: str | None
    image_url: str
    created_at: datetime.datetime


class IssuedNumber(BaseModel):
    number: str
    title: str
    task_id: str | None
    issued_at: datetime.datetime


class RegisterItem(BaseModel):
    id: str
    name: str
    pattern: str
    next_number: int
    preview: str
    issued: list[IssuedNumber]


class SampleItem(BaseModel):
    id: str
    file_name: str
    size_bytes: int
    uploaded_by_name: str | None
    created_at: datetime.datetime


class LetterSettings(BaseModel):
    formats: list[FormatItem]
    letterheads: list[LetterheadItem]
    registers: list[RegisterItem]
    samples: list[SampleItem]
    can_edit: bool
