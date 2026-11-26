"""Pengaturan organisasi dan catatan panggilan model

Revision ID: e5c3d8a1f924
Revises: d7a2b9c04e18
Create Date: 2026-11-26 20:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e5c3d8a1f924"
down_revision: str | None = "d7a2b9c04e18"
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


def upgrade() -> None:
    op.create_table(
        "organization_settings",
        column("organization_id", UUID),
        column("models", postgresql.JSONB(), True),
        column("monthly_budget", sa.Integer()),
        column("default_task_budget", sa.Integer()),
        column("max_steps_per_task", sa.Integer()),
        column("max_revisions", sa.Integer()),
        timestamp("updated_at"),
        sa.PrimaryKeyConstraint("organization_id", name=op.f("pk_organization_settings")),
        foreign_key("organization_settings", "organization_id", "organizations", "CASCADE"),
    )
    op.create_table(
        "llm_calls",
        column("id", UUID),
        column("organization_id", UUID),
        column("agent_id", UUID, True),
        column("step_id", UUID, True),
        column("kind", sa.String(10)),
        column("provider", sa.String(20)),
        column("model", sa.String(60)),
        column("input_tokens", sa.Integer()),
        column("output_tokens", sa.Integer()),
        column("cost", sa.Integer()),
        column("latency_ms", sa.Integer()),
        column("status", sa.String(10)),
        timestamp("created_at"),
        column("created_by", UUID, True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_llm_calls")),
        foreign_key("llm_calls", "organization_id", "organizations", "CASCADE"),
        foreign_key("llm_calls", "agent_id", "agents", "SET NULL"),
        foreign_key("llm_calls", "created_by", "users", "SET NULL"),
    )
    op.create_index(
        "ix_llm_calls_organization_created", "llm_calls", ["organization_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("llm_calls")
    op.drop_table("organization_settings")
