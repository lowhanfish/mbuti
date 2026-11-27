"""Pencarian internet (E1d): pilihan internet per tugas, sumber per langkah, usulan pengetahuan

Revision ID: f2b6d8e4a571
Revises: e9a3c5d7f146
Create Date: 2026-12-01 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f2b6d8e4a571"
down_revision: str | None = "e9a3c5d7f146"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def upgrade() -> None:
    op.add_column(
        "tasks", sa.Column("web_search", sa.String(4), nullable=False, server_default="role")
    )
    op.add_column(
        "task_steps", sa.Column("web_sources", JSONB, nullable=False, server_default="[]")
    )
    op.add_column("documents", sa.Column("source_url", sa.String(500), nullable=True))
    op.create_table(
        "knowledge_proposals",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("excerpt", sa.String(2000), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("task_id", UUID, nullable=True),
        sa.Column("agent_id", UUID, nullable=True),
        sa.Column("proposed_by_member_id", UUID, nullable=True),
        sa.Column("decided_by_member_id", UUID, nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("document_id", UUID, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_knowledge_proposals")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_knowledge_proposals_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_knowledge_proposals_task_id_tasks"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"],
            ["agents.id"],
            name=op.f("fk_knowledge_proposals_agent_id_agents"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["proposed_by_member_id"],
            ["memberships.id"],
            name=op.f("fk_knowledge_proposals_proposed_by_member_id_memberships"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by_member_id"],
            ["memberships.id"],
            name=op.f("fk_knowledge_proposals_decided_by_member_id_memberships"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name=op.f("fk_knowledge_proposals_document_id_documents"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name=op.f("ck_knowledge_proposals_status"),
        ),
    )
    op.create_index(
        op.f("ix_knowledge_proposals_organization_id"), "knowledge_proposals", ["organization_id"]
    )
    op.create_index(
        "uq_knowledge_proposals_pending",
        "knowledge_proposals",
        ["organization_id", "url"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_table("knowledge_proposals")
    op.drop_column("documents", "source_url")
    op.drop_column("task_steps", "web_sources")
    op.drop_column("tasks", "web_search")
