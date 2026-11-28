"""Alur aplikasi luar, putaran, bukti, dan sesi tersimpan (E4b)

Revision ID: b4d9e2f7a1c3
Revises: a7e1c4d92b36
Create Date: 2026-12-08 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b4d9e2f7a1c3"
down_revision: str | None = "a7e1c4d92b36"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FLOW_STATUSES = ("learning", "review", "approved", "needs_repair", "failed")
RUN_MODES = ("learn", "replay", "repair")
RUN_STATUSES = (
    "queued",
    "running",
    "waiting_approval",
    "waiting_otp",
    "succeeded",
    "failed",
    "stopped",
    "needs_repair",
)


def _id(name: str = "id") -> sa.Column:
    return sa.Column(name, postgresql.UUID(as_uuid=True), nullable=False)


def _time(name: str, nullable: bool = True) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def _stamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _json(name: str, empty: str = "[]") -> sa.Column:
    return sa.Column(
        name, postgresql.JSONB(), server_default=sa.text(f"'{empty}'::jsonb"), nullable=False
    )


def _link(table: str, column: str, target: str, ondelete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        [f"{target}.id"],
        name=op.f(f"fk_{table}_{column}_{target}"),
        ondelete=ondelete,
    )


def _member(name: str) -> sa.Column:
    return sa.Column(name, postgresql.UUID(as_uuid=True), nullable=True)


def upgrade() -> None:
    op.add_column("vault_accounts", sa.Column("session_encrypted", sa.Text(), nullable=True))
    op.add_column("vault_accounts", _time("login_blocked_at"))

    flows = "browser_flows"
    op.create_table(
        flows,
        _id(),
        _id("organization_id"),
        _id("agent_id"),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("goal", sa.String(1000), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        _json("inputs"),
        _json("steps"),
        sa.Column("note", sa.String(500), nullable=False),
        sa.Column("trusted_submit", sa.Boolean(), nullable=False),
        sa.Column("successful_runs", sa.Integer(), nullable=False),
        _time("approved_at"),
        _member("approved_by_member_id"),
        _member("created_by_member_id"),
        _stamp("created_at"),
        _stamp("updated_at"),
        sa.CheckConstraint(f"status IN {FLOW_STATUSES}", name=op.f("ck_browser_flows_status")),
        _link(flows, "organization_id", "organizations", "CASCADE"),
        _link(flows, "agent_id", "agents", "CASCADE"),
        _link(flows, "account_id", "vault_accounts", "SET NULL"),
        _link(flows, "approved_by_member_id", "memberships", "SET NULL"),
        _link(flows, "created_by_member_id", "memberships", "SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_browser_flows")),
    )
    for column in ("organization_id", "agent_id", "account_id"):
        op.create_index(op.f(f"ix_browser_flows_{column}"), flows, [column])

    runs = "browser_runs"
    op.create_table(
        runs,
        _id(),
        _id("organization_id"),
        _id("flow_id"),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("flow_version", sa.Integer(), nullable=False),
        _json("inputs", "{}"),
        _json("outputs"),
        sa.Column("pending", postgresql.JSONB(), nullable=True),
        sa.Column("approved_step", sa.Integer(), nullable=True),
        _member("approved_by_member_id"),
        sa.Column("otp_encrypted", sa.Text(), nullable=True),
        _time("submitted_at"),
        _member("created_by_member_id"),
        _stamp("created_at"),
        _time("started_at"),
        _time("finished_at"),
        _time("claimed_at"),
        sa.CheckConstraint(f"status IN {RUN_STATUSES}", name=op.f("ck_browser_runs_status")),
        sa.CheckConstraint(f"mode IN {RUN_MODES}", name=op.f("ck_browser_runs_mode")),
        _link(runs, "organization_id", "organizations", "CASCADE"),
        _link(runs, "flow_id", "browser_flows", "CASCADE"),
        _link(runs, "approved_by_member_id", "memberships", "SET NULL"),
        _link(runs, "created_by_member_id", "memberships", "SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_browser_runs")),
    )
    for column in ("organization_id", "flow_id", "status"):
        op.create_index(op.f(f"ix_browser_runs_{column}"), runs, [column])

    events = "browser_run_events"
    op.create_table(
        events,
        _id(),
        _id("run_id"),
        sa.Column("no", sa.Integer(), nullable=False),
        sa.Column("step_no", sa.Integer(), nullable=True),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("has_screenshot", sa.Boolean(), nullable=False),
        _stamp("created_at"),
        _link(events, "run_id", "browser_runs", "CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_browser_run_events")),
        sa.UniqueConstraint("run_id", "no", name=op.f("uq_browser_run_events_run_id")),
    )
    op.create_index(op.f("ix_browser_run_events_run_id"), events, ["run_id"])


def downgrade() -> None:
    op.drop_table("browser_run_events")
    op.drop_table("browser_runs")
    op.drop_table("browser_flows")
    op.drop_column("vault_accounts", "login_blocked_at")
    op.drop_column("vault_accounts", "session_encrypted")
