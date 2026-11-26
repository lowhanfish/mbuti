"""Kolom bersama untuk model."""

import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def uuid_pk() -> Column:
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def created_at() -> Column:
    return Column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )


def updated_at() -> Column:
    # Diisi dari Python agar nilainya langsung terbaca setelah commit (tanpa refresh).
    return Column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )


def created_by() -> Column:
    return Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
