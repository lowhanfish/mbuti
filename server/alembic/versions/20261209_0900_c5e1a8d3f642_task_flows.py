"""Alur aplikasi dalam tugas dan tugas rutin (E4c)

Revision ID: c5e1a8d3f642
Revises: b4d9e2f7a1c3
Create Date: 2026-12-09 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c5e1a8d3f642"
down_revision: str | None = "b4d9e2f7a1c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("tasks", "schedules"):
        op.add_column(table, sa.Column("flow", postgresql.JSONB(), nullable=True))
    op.add_column("tasks", sa.Column("flow_stage", sa.String(8), nullable=True))
    op.add_column("browser_runs", sa.Column("task_id", postgresql.UUID(as_uuid=True)))
    op.add_column(
        "browser_runs",
        sa.Column("force_approval", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_foreign_key(
        op.f("fk_browser_runs_task_id_tasks"),
        "browser_runs",
        "tasks",
        ["task_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_browser_runs_task_id"), "browser_runs", ["task_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_browser_runs_task_id"), table_name="browser_runs")
    op.drop_constraint(op.f("fk_browser_runs_task_id_tasks"), "browser_runs", type_="foreignkey")
    op.drop_column("browser_runs", "force_approval")
    op.drop_column("browser_runs", "task_id")
    op.drop_column("tasks", "flow_stage")
    for table in ("tasks", "schedules"):
        op.drop_column(table, "flow")
