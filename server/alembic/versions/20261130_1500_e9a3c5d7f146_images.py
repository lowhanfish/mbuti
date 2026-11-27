"""Gambar (E1c): halaman bergambar, lampiran tugas, temuan

Revision ID: e9a3c5d7f146
Revises: d4f7b1c9e025
Create Date: 2026-11-30 15:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e9a3c5d7f146"
down_revision: str | None = "d4f7b1c9e025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def upgrade() -> None:
    op.add_column(
        "document_sections",
        sa.Column("render", sa.String(6), nullable=False, server_default="text"),
    )
    op.add_column("document_sections", sa.Column("image_path", sa.String(200), nullable=True))
    op.add_column("document_sections", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("document_sections", sa.Column("height", sa.Integer(), nullable=True))
    op.add_column(
        "document_sections",
        sa.Column("visual_text", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "document_chunks",
        sa.Column("kind", sa.String(10), nullable=False, server_default="text"),
    )
    op.add_column(
        "document_versions",
        sa.Column("media_kind", sa.String(6), nullable=False, server_default="text"),
    )
    op.execute(
        "UPDATE document_versions SET media_kind = 'pdf' WHERE mime_type = 'application/pdf'"
    )
    op.add_column(
        "document_versions",
        sa.Column("visual_pages", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "document_versions",
        sa.Column("visual_pages_over_limit", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("document_versions", sa.Column("exif", JSONB, nullable=True))
    op.add_column("task_steps", sa.Column("findings", JSONB, nullable=False, server_default="[]"))
    op.alter_column("llm_calls", "kind", type_=sa.String(16), existing_nullable=False)

    op.create_table(
        "task_attachments",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("task_id", UUID, nullable=True),
        sa.Column("file_name", sa.String(200), nullable=False),
        sa.Column("storage_path", sa.String(200), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("page_paths", JSONB, nullable=False),
        sa.Column("exif", JSONB, nullable=True),
        sa.Column("uploaded_by_member_id", UUID, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_task_attachments")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_task_attachments_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_task_attachments_task_id_tasks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_member_id"],
            ["memberships.id"],
            name=op.f("fk_task_attachments_uploaded_by_member_id_memberships"),
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        op.f("ix_task_attachments_organization_id"), "task_attachments", ["organization_id"]
    )
    op.create_index(op.f("ix_task_attachments_task_id"), "task_attachments", ["task_id"])


def downgrade() -> None:
    op.drop_table("task_attachments")
    op.execute("UPDATE llm_calls SET kind = left(kind, 10)")
    op.alter_column("llm_calls", "kind", type_=sa.String(10), existing_nullable=False)
    op.drop_column("task_steps", "findings")
    for column in ("exif", "visual_pages_over_limit", "visual_pages", "media_kind"):
        op.drop_column("document_versions", column)
    op.drop_column("document_chunks", "kind")
    for column in ("visual_text", "height", "width", "image_path", "render"):
        op.drop_column("document_sections", column)
