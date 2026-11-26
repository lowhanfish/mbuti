"""Dokumen, versi, seksi, dan potongan untuk pencarian

Revision ID: d7a2b9c04e18
Revises: c4e8f1a93b67
Create Date: 2026-11-26 17:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d7a2b9c04e18"
down_revision: str | None = "c4e8f1a93b67"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def column(name: str, type_: sa.types.TypeEngine, nullable: bool = False) -> sa.Column:
    return sa.Column(name, type_, nullable=nullable)


def timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def foreign_key(table: str, name: str, target: str, ondelete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [name], [f"{target}.id"], name=op.f(f"fk_{table}_{name}_{target}"), ondelete=ondelete
    )


def primary_key(table: str) -> sa.PrimaryKeyConstraint:
    return sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}"))


def index(table: str, name: str) -> None:
    op.create_index(op.f(f"ix_{table}_{name}"), table, [name])


def upgrade() -> None:
    op.create_table(
        "documents",
        column("id", UUID),
        column("organization_id", UUID),
        column("title", sa.String(200)),
        column("description", sa.String(1000)),
        column("doc_type", sa.String(10)),
        column("scope", sa.String(12)),
        column("unit_id", UUID, True),
        column("agent_id", UUID, True),
        column("deleted_at", sa.DateTime(timezone=True), True),
        timestamp("created_at"),
        timestamp("updated_at"),
        column("created_by", UUID, True),
        primary_key("documents"),
        foreign_key("documents", "organization_id", "organizations", "CASCADE"),
        foreign_key("documents", "unit_id", "units", "SET NULL"),
        foreign_key("documents", "agent_id", "agents", "SET NULL"),
        foreign_key("documents", "created_by", "users", "SET NULL"),
        sa.CheckConstraint(
            "deleted_at IS NOT NULL"
            " OR (scope = 'organization' AND unit_id IS NULL AND agent_id IS NULL)"
            " OR (scope = 'unit' AND unit_id IS NOT NULL AND agent_id IS NULL)"
            " OR (scope = 'agent' AND agent_id IS NOT NULL AND unit_id IS NULL)",
            name=op.f("ck_documents_scope"),
        ),
    )
    for name in ("organization_id", "unit_id", "agent_id"):
        index("documents", name)

    op.create_table(
        "document_versions",
        column("id", UUID),
        column("document_id", UUID),
        column("version_no", sa.Integer()),
        column("file_name", sa.String(200)),
        column("storage_path", sa.String(200)),
        column("mime_type", sa.String(100)),
        column("size_bytes", sa.Integer()),
        column("sha256", sa.String(64)),
        column("page_count", sa.Integer()),
        column("is_active", sa.Boolean()),
        column("activate_when_ready", sa.Boolean()),
        column("status", sa.String(12)),
        column("progress", sa.Integer()),
        column("error_message", sa.String(300), True),
        column("attempts", sa.Integer()),
        column("started_at", sa.DateTime(timezone=True), True),
        column("finished_at", sa.DateTime(timezone=True), True),
        column("uploaded_by_member_id", UUID, True),
        timestamp("created_at"),
        primary_key("document_versions"),
        foreign_key("document_versions", "document_id", "documents", "CASCADE"),
        foreign_key("document_versions", "uploaded_by_member_id", "memberships", "SET NULL"),
        sa.UniqueConstraint("document_id", "version_no", name="uq_document_versions_number"),
        sa.CheckConstraint(
            "status IN ('queued', 'processing', 'ready', 'failed')",
            name=op.f("ck_document_versions_status"),
        ),
    )
    index("document_versions", "document_id")
    op.create_index(
        "uq_document_versions_active",
        "document_versions",
        ["document_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )
    op.create_index(
        "uq_document_versions_file",
        "document_versions",
        ["document_id", "sha256"],
        unique=True,
        postgresql_where=sa.text("status <> 'failed'"),
    )

    op.create_table(
        "document_sections",
        column("id", UUID),
        column("version_id", UUID),
        column("page_no", sa.Integer()),
        column("heading", sa.String(200)),
        column("text", sa.Text()),
        primary_key("document_sections"),
        foreign_key("document_sections", "version_id", "document_versions", "CASCADE"),
    )
    index("document_sections", "version_id")

    op.create_table(
        "document_chunks",
        column("id", UUID),
        column("section_id", UUID),
        column("version_id", UUID),
        column("chunk_no", sa.Integer()),
        column("heading", sa.String(200)),
        column("text", sa.Text()),
        sa.Column(
            "search",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('indonesian'::regconfig, heading || ' ' || text)", persisted=True
            ),
        ),
        column("embedding", Vector(768), True),
        primary_key("document_chunks"),
        foreign_key("document_chunks", "section_id", "document_sections", "CASCADE"),
        foreign_key("document_chunks", "version_id", "document_versions", "CASCADE"),
    )
    index("document_chunks", "section_id")
    index("document_chunks", "version_id")
    op.create_index(
        "ix_document_chunks_search", "document_chunks", ["search"], postgresql_using="gin"
    )
    op.create_index(
        "ix_document_chunks_embedding",
        "document_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_table("document_chunks")
    op.drop_table("document_sections")
    op.drop_table("document_versions")
    op.drop_table("documents")
