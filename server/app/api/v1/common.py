"""Bentuk respons dan parameter bersama sesuai kontrak API bagian 1."""

import re
import uuid
from typing import Annotated

from fastapi import Query
from pydantic import AfterValidator, BaseModel, ConfigDict

from app.core.exceptions import NotFoundException

MAX_LIMIT = 200
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class ApiResponse[T](BaseModel):
    success: bool = True
    statusCode: int = 200
    message: str = "Berhasil."
    data: T


class ApiListResponse[T](BaseModel):
    success: bool = True
    statusCode: int = 200
    total: int
    skip: int
    limit: int
    data: list[T]


class Option(BaseModel):
    id: str
    value: str
    sub_value: str | None = None


class RequestModel(BaseModel):
    """Isian dari klien: spasi tepi dibuang, kolom yang tidak dikenal diabaikan."""

    model_config = ConfigDict(str_strip_whitespace=True)


class Paging(BaseModel):
    skip: int
    limit: int


def paging(default_limit: int):
    """`skip` dan `limit` dari query; `limit` dibatasi MAX_LIMIT."""

    def dependency(
        skip: Annotated[int, Query()] = 0, limit: Annotated[int, Query()] = default_limit
    ) -> Paging:
        return Paging(
            skip=max(skip, 0), limit=min(limit, MAX_LIMIT) if limit > 0 else default_limit
        )

    return dependency


def valid_email(value: str) -> str:
    value = value.strip().lower()
    if not EMAIL_PATTERN.match(value):
        raise ValueError("Format email tidak valid.")
    return value


Email = Annotated[str, AfterValidator(valid_email)]


def parse_id(value: str, message: str) -> uuid.UUID:
    """ID pada alamat yang bukan UUID diperlakukan sama dengan data yang tidak ada."""
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundException(message) from None


def like_pattern(text: str) -> str:
    """Pola ILIKE 'mengandung', dengan karakter khusus dimatikan (escape='\\\\')."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
