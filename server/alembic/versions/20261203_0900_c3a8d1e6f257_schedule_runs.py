"""Penjadwal (E2c): riwayat putaran dan penanda kejadian yang sudah diproses

Revision ID: c3a8d1e6f257
Revises: b7e2f9a4c168
Create Date: 2026-12-03 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c3a8d1e6f257"
down_revision: str | None = "b7e2f9a4c168"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _reference(column: str, table: str, on_delete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        [f"{table}.id"],
        name=op.f(f"fk_schedule_runs_{column}_{table}"),
        ondelete=on_delete,
    )


def upgrade() -> None:
    op.add_column("schedules", sa.Column("cursor_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("check_at", sa.DateTime(timezone=True), nullable=True))
    # Jadwal yang sudah ada diproses sejak terakhir disimpan
    op.execute(
        "UPDATE schedules SET cursor_at = updated_at, check_at = next_run_at "
        "WHERE status = 'active'"
    )
    op.drop_index("ix_schedules_due", table_name="schedules")
    op.create_index("ix_schedules_due", "schedules", ["status", "check_at"])
    op.create_table(
        "schedule_runs",
        sa.Column("id", UUID, nullable=False),
        sa.Column("schedule_id", UUID, nullable=False),
        sa.Column("planned_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("origin", sa.String(10), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column("task_id", UUID, nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("watching", sa.Boolean(), nullable=False),
        sa.Column("source_id", UUID, nullable=True),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_schedule_runs")),
        _reference("schedule_id", "schedules", "CASCADE"),
        _reference("task_id", "tasks", "SET NULL"),
        _reference("source_id", "schedule_runs", "SET NULL"),
        sa.CheckConstraint(
            "origin IN ('scheduled', 'backfill', 'manual')",
            name=op.f("ck_schedule_runs_origin"),
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'created', 'skipped_holiday', 'skipped_leave', 'missed', "
            "'failed', 'retrying', 'backfill', 'skipped', 'stopped_budget')",
            name=op.f("ck_schedule_runs_status"),
        ),
    )
    op.create_index("ix_schedule_runs_schedule", "schedule_runs", ["schedule_id", "planned_for"])
    op.create_index(
        "uq_schedule_runs_planned",
        "schedule_runs",
        ["schedule_id", "planned_for"],
        unique=True,
        postgresql_where=sa.text("origin = 'scheduled'"),
    )
    op.create_index(
        "ix_schedule_runs_due",
        "schedule_runs",
        ["due_at"],
        postgresql_where=sa.text("due_at IS NOT NULL"),
    )
    op.create_index(
        "ix_schedule_runs_watching",
        "schedule_runs",
        ["task_id"],
        postgresql_where=sa.text("watching"),
    )


def downgrade() -> None:
    op.drop_table("schedule_runs")
    op.drop_index("ix_schedules_due", table_name="schedules")
    op.create_index("ix_schedules_due", "schedules", ["status", "next_run_at"])
    op.drop_column("schedules", "check_at")
    op.drop_column("schedules", "cursor_at")
