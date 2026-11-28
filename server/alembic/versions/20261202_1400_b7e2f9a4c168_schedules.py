"""Tugas rutin (E2b): jadwal beserta aturannya

Revision ID: b7e2f9a4c168
Revises: a1d4e7c9b352
Create Date: 2026-12-02 14:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b7e2f9a4c168"
down_revision: str | None = "a1d4e7c9b352"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _reference(column: str, table: str, on_delete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        [f"{table}.id"],
        name=op.f(f"fk_schedules_{column}_{table}"),
        ondelete=on_delete,
    )


def upgrade() -> None:
    op.create_table(
        "schedules",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("entry_agent_id", UUID, nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("brief", sa.String(4000), nullable=False),
        sa.Column("inputs", JSONB, nullable=False),
        sa.Column("priority", sa.String(6), nullable=False),
        sa.Column("budget_limit", sa.Integer(), nullable=False),
        sa.Column("web_search", sa.String(4), nullable=False),
        sa.Column("rule", JSONB, nullable=False),
        sa.Column("shift_id", UUID, nullable=True),
        sa.Column("source_text", sa.String(500), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_member_id", UUID, nullable=True),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.Column("created_by", UUID, nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_schedules")),
        _reference("organization_id", "organizations", "CASCADE"),
        _reference("entry_agent_id", "agents", "CASCADE"),
        _reference("shift_id", "work_shifts", "RESTRICT"),
        _reference("created_by_member_id", "memberships", "SET NULL"),
        _reference("created_by", "users", "SET NULL"),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'paused', 'ended')", name=op.f("ck_schedules_status")
        ),
    )
    for column in ("organization_id", "entry_agent_id", "shift_id"):
        op.create_index(op.f(f"ix_schedules_{column}"), "schedules", [column])
    op.create_index("ix_schedules_due", "schedules", ["status", "next_run_at"])


def downgrade() -> None:
    op.drop_table("schedules")
