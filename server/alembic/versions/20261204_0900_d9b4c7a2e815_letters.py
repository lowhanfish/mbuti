"""Surat dan berkas hasil (E3a): format, kop, contoh, register nomor, dan berkas

Revision ID: d9b4c7a2e815
Revises: c3a8d1e6f257
Create Date: 2026-12-04 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d9b4c7a2e815"
down_revision: str | None = "c3a8d1e6f257"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _text(name: str, length: int, nullable: bool = False) -> sa.Column:
    return sa.Column(name, sa.String(length), nullable=nullable)


def _table(name: str, references: dict[str, tuple[str, str, bool]], *items) -> None:
    """Tabel dengan kunci `id` dan rujukan {kolom: (tabel, saat dihapus, boleh kosong)}."""
    columns = [sa.Column("id", UUID, nullable=False)]
    constraints = [sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{name}"))]
    for column, (table, on_delete, nullable) in references.items():
        columns.append(sa.Column(column, UUID, nullable=nullable))
        constraints.append(
            sa.ForeignKeyConstraint(
                [column],
                [f"{table}.id"],
                name=op.f(f"fk_{name}_{column}_{table}"),
                ondelete=on_delete,
            )
        )
    op.create_table(name, *columns, *items, *constraints)


ORGANIZATION = {"organization_id": ("organizations", "CASCADE", False)}
CREATOR = {"created_by": ("users", "SET NULL", True)}


def upgrade() -> None:
    _table(
        "letter_formats",
        ORGANIZATION,
        _text("name", 60),
        sa.Column("spec", JSONB, nullable=False),
        sa.Column("sources", JSONB, nullable=False),
        sa.Column("notes", JSONB, nullable=False),
        _text("number_pattern", 80, True),
        sa.Column("checked", sa.Boolean(), nullable=False),
        sa.Column("corrections", JSONB, nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_index(
        "uq_letter_formats_name",
        "letter_formats",
        ["organization_id", sa.text("lower(name)")],
        unique=True,
    )
    _table(
        "letterheads",
        {**ORGANIZATION, "unit_id": ("units", "CASCADE", True), **CREATOR},
        _text("path", 200),
        _timestamp("created_at"),
    )
    op.create_index(op.f("ix_letterheads_organization_id"), "letterheads", ["organization_id"])
    _table(
        "letter_samples",
        {**ORGANIZATION, **CREATOR},
        _text("file_name", 200),
        _text("path", 200),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        _timestamp("created_at"),
    )
    op.create_index(
        op.f("ix_letter_samples_organization_id"), "letter_samples", ["organization_id"]
    )
    _table(
        "letter_registers",
        ORGANIZATION,
        _text("name", 60),
        _text("pattern", 80),
        sa.Column("next_number", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_index(
        "uq_letter_registers_name",
        "letter_registers",
        ["organization_id", sa.text("lower(name)")],
        unique=True,
    )
    _table(
        "letter_numbers",
        {
            "register_id": ("letter_registers", "CASCADE", False),
            "task_id": ("tasks", "SET NULL", True),
        },
        _text("number", 120),
        _text("title", 150),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("register_id", "number", name="uq_letter_numbers_register_number"),
    )
    _table(
        "result_documents",
        {
            **ORGANIZATION,
            "task_id": ("tasks", "CASCADE", False),
            "agent_id": ("agents", "SET NULL", True),
            "format_id": ("letter_formats", "SET NULL", True),
        },
        _text("letter_type", 60),
        _text("title", 150),
        sa.Column("content", JSONB, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        _text("number", 120, True),
        _text("docx_path", 200, True),
        _text("pdf_path", 200, True),
        sa.Column("page_paths", JSONB, nullable=False),
        sa.Column("spec", JSONB, nullable=True),
        sa.Column("sources", JSONB, nullable=False),
        sa.Column("checks", JSONB, nullable=False),
        sa.Column("needs_render", sa.Boolean(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.UniqueConstraint("task_id", "agent_id", name="uq_result_documents_task_agent"),
    )
    op.create_index(
        op.f("ix_result_documents_organization_id"), "result_documents", ["organization_id"]
    )


def downgrade() -> None:
    for table in (
        "result_documents",
        "letter_numbers",
        "letter_registers",
        "letter_samples",
        "letterheads",
        "letter_formats",
    ):
        op.drop_table(table)
