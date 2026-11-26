"""Tugas, langkah, rujukan, persetujuan, dan linimasa

Revision ID: f6a1b8c37d52
Revises: e5c3d8a1f924
Create Date: 2026-11-27 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f6a1b8c37d52"
down_revision: str | None = "e5c3d8a1f924"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def column(name: str, type_: sa.types.TypeEngine, nullable: bool = False) -> sa.Column:
    return sa.Column(name, type_, nullable=nullable)


def seq() -> sa.Column:
    return sa.Column("seq", sa.Integer(), sa.Identity(), nullable=False)


def timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def moment(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=True)


def foreign_key(table: str, name: str, target: str, ondelete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [name], [f"{target}.id"], name=op.f(f"fk_{table}_{name}_{target}"), ondelete=ondelete
    )


def primary_key(table: str) -> sa.PrimaryKeyConstraint:
    return sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}"))


def indexes(table: str, *names: str) -> None:
    for name in names:
        op.create_index(op.f(f"ix_{table}_{name}"), table, [name])


def upgrade() -> None:
    op.create_table(
        "tasks",
        column("id", UUID),
        column("organization_id", UUID),
        column("title", sa.String(150)),
        column("brief", sa.String(4000)),
        column("inputs", JSONB),
        column("entry_agent_id", UUID),
        column("status", sa.String(20)),
        column("priority", sa.String(10)),
        moment("due_at"),
        column("budget_limit", sa.Integer()),
        column("cost_used", sa.Integer()),
        column("review_rounds", JSONB),
        column("pending_routes", JSONB),
        column("created_by_member_id", UUID, True),
        timestamp("created_at"),
        timestamp("updated_at"),
        moment("completed_at"),
        column("created_by", UUID, True),
        primary_key("tasks"),
        foreign_key("tasks", "organization_id", "organizations", "CASCADE"),
        foreign_key("tasks", "entry_agent_id", "agents", "CASCADE"),
        foreign_key("tasks", "created_by_member_id", "memberships", "SET NULL"),
        foreign_key("tasks", "created_by", "users", "SET NULL"),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', "
            "'cancelled', 'stopped_budget')",
            name=op.f("ck_tasks_status"),
        ),
    )
    op.create_index("ix_tasks_organization_updated", "tasks", ["organization_id", "updated_at"])
    op.create_index("ix_tasks_status", "tasks", ["status"])

    op.create_table(
        "task_steps",
        column("id", UUID),
        seq(),
        column("task_id", UUID),
        column("agent_id", UUID),
        column("kind", sa.String(10)),
        column("via_relation_id", UUID, True),
        column("parent_step_id", UUID, True),
        column("attempt_no", sa.Integer()),
        column("status", sa.String(20)),
        column("queue_no", sa.Float(), True),
        column("consults_expanded", sa.Boolean()),
        column("tries", sa.Integer()),
        column("input_notes", sa.Text()),
        column("output", sa.Text()),
        column("verdict", sa.String(10), True),
        column("model", sa.String(60)),
        column("cost", sa.Integer()),
        column("tokens", sa.Integer()),
        column("error_code", sa.String(40), True),
        moment("claimed_at"),
        moment("started_at"),
        moment("finished_at"),
        timestamp("created_at"),
        primary_key("task_steps"),
        foreign_key("task_steps", "task_id", "tasks", "CASCADE"),
        foreign_key("task_steps", "agent_id", "agents", "CASCADE"),
        foreign_key("task_steps", "via_relation_id", "agent_relations", "SET NULL"),
        foreign_key("task_steps", "parent_step_id", "task_steps", "SET NULL"),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'done', 'revise_requested', 'failed', 'skipped')",
            name=op.f("ck_task_steps_status"),
        ),
    )
    indexes("task_steps", "task_id", "agent_id")

    op.create_table(
        "citations",
        column("id", UUID),
        column("step_id", UUID),
        column("document_id", UUID),
        column("version_id", UUID),
        column("order_no", sa.Integer()),
        column("document_title", sa.String(200)),
        column("version_no", sa.Integer()),
        column("page_no", sa.Integer()),
        column("heading", sa.String(200)),
        column("snippet", sa.String(400)),
        column("score", sa.Integer()),
        primary_key("citations"),
        foreign_key("citations", "step_id", "task_steps", "CASCADE"),
        foreign_key("citations", "document_id", "documents", "CASCADE"),
        foreign_key("citations", "version_id", "document_versions", "CASCADE"),
    )
    indexes("citations", "step_id", "document_id")

    op.create_table(
        "task_events",
        column("id", UUID),
        seq(),
        column("task_id", UUID),
        column("step_id", UUID, True),
        column("type", sa.String(30)),
        column("message", sa.String(1000)),
        timestamp("created_at"),
        primary_key("task_events"),
        foreign_key("task_events", "task_id", "tasks", "CASCADE"),
        foreign_key("task_events", "step_id", "task_steps", "CASCADE"),
    )
    indexes("task_events", "task_id")

    op.create_table(
        "approvals",
        column("id", UUID),
        seq(),
        column("task_id", UUID),
        column("step_id", UUID, True),
        column("reason", sa.String(20)),
        column("question", sa.String(1000)),
        column("requested_from_member_id", UUID, True),
        column("status", sa.String(10)),
        column("comment", sa.String(1000)),
        column("follow_up", JSONB),
        column("decided_by_member_id", UUID, True),
        moment("decided_at"),
        timestamp("created_at"),
        primary_key("approvals"),
        foreign_key("approvals", "task_id", "tasks", "CASCADE"),
        foreign_key("approvals", "step_id", "task_steps", "CASCADE"),
        foreign_key("approvals", "requested_from_member_id", "memberships", "SET NULL"),
        foreign_key("approvals", "decided_by_member_id", "memberships", "SET NULL"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'revise')",
            name=op.f("ck_approvals_status"),
        ),
    )
    indexes("approvals", "task_id", "status")

    op.add_column("llm_calls", column("task_id", UUID, True))


def downgrade() -> None:
    op.drop_column("llm_calls", "task_id")
    for table in ("approvals", "task_events", "citations", "task_steps", "tasks"):
        op.drop_table(table)
