"""Role AI, relasi, dan peta relasi

Revision ID: c4e8f1a93b67
Revises: b1a0c7d2e5f4
Create Date: 2026-11-26 14:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4e8f1a93b67"
down_revision: str | None = "b1a0c7d2e5f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


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
        "agents",
        column("id", UUID),
        column("organization_id", UUID),
        column("unit_id", UUID, True),
        column("name", sa.String(60)),
        column("title", sa.String(100)),
        column("goal", sa.String(500)),
        column("status", sa.String(10)),
        column("instructions", sa.String(8000)),
        column("input_spec", JSONB),
        column("output_format", sa.String(10)),
        column("output_template", sa.String(4000)),
        column("acceptance_criteria", JSONB),
        column("knowledge_scope", sa.String(14)),
        column("model_profile", sa.String(10)),
        column("owner_member_id", UUID, True),
        column("avatar", JSONB),
        column("deleted_at", sa.DateTime(timezone=True), True),
        timestamp("created_at"),
        timestamp("updated_at"),
        column("created_by", UUID, True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agents")),
        foreign_key("agents", "organization_id", "organizations", "CASCADE"),
        foreign_key("agents", "unit_id", "units", "SET NULL"),
        foreign_key("agents", "owner_member_id", "memberships", "SET NULL"),
        foreign_key("agents", "created_by", "users", "SET NULL"),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'paused')", name=op.f("ck_agents_status")
        ),
    )
    op.create_index(op.f("ix_agents_organization_id"), "agents", ["organization_id"])
    op.create_index(op.f("ix_agents_unit_id"), "agents", ["unit_id"])

    op.create_table(
        "agent_relations",
        column("id", UUID),
        column("organization_id", UUID),
        column("source_agent_id", UUID),
        column("target_agent_id", UUID, True),
        column("target_member_id", UUID, True),
        column("relation_type", sa.String(10)),
        column("trigger", sa.String(14)),
        column("condition", sa.String(500)),
        column("payload_spec", sa.String(16)),
        column("expected_output", sa.String(500)),
        column("max_revisions", sa.Integer()),
        column("requires_approval", sa.Boolean()),
        column("label", sa.String(60)),
        column("deleted_at", sa.DateTime(timezone=True), True),
        timestamp("created_at"),
        timestamp("updated_at"),
        column("created_by", UUID, True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_relations")),
        foreign_key("agent_relations", "organization_id", "organizations", "CASCADE"),
        foreign_key("agent_relations", "source_agent_id", "agents", "CASCADE"),
        foreign_key("agent_relations", "target_agent_id", "agents", "CASCADE"),
        foreign_key("agent_relations", "target_member_id", "memberships", "SET NULL"),
        foreign_key("agent_relations", "created_by", "users", "SET NULL"),
        sa.CheckConstraint(
            "relation_type IN ('handoff', 'review', 'consult', 'escalate')",
            name=op.f("ck_agent_relations_relation_type"),
        ),
        sa.CheckConstraint(
            "deleted_at IS NOT NULL OR num_nonnulls(target_agent_id, target_member_id) = 1",
            name=op.f("ck_agent_relations_target"),
        ),
    )
    for name in ("organization_id", "source_agent_id", "target_agent_id", "target_member_id"):
        op.create_index(op.f(f"ix_agent_relations_{name}"), "agent_relations", [name])
    for suffix, target in (
        ("agent_target", "target_agent_id"),
        ("member_target", "target_member_id"),
    ):
        op.create_index(
            f"uq_agent_relations_{suffix}",
            "agent_relations",
            ["source_agent_id", target, "relation_type"],
            unique=True,
            postgresql_where=sa.text(f"deleted_at IS NULL AND {target} IS NOT NULL"),
        )

    op.create_table(
        "flow_humans",
        column("member_id", UUID),
        column("organization_id", UUID),
        timestamp("created_at"),
        sa.PrimaryKeyConstraint("member_id", name=op.f("pk_flow_humans")),
        foreign_key("flow_humans", "member_id", "memberships", "CASCADE"),
        foreign_key("flow_humans", "organization_id", "organizations", "CASCADE"),
    )
    # Nama kunci asing mengikuti tabel tujuan
    op.create_index(op.f("ix_flow_humans_organization_id"), "flow_humans", ["organization_id"])

    op.create_table(
        "flow_positions",
        column("organization_id", UUID),
        column("node_id", UUID),
        column("x", sa.Integer()),
        column("y", sa.Integer()),
        sa.PrimaryKeyConstraint("organization_id", "node_id", name=op.f("pk_flow_positions")),
        foreign_key("flow_positions", "organization_id", "organizations", "CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("flow_positions")
    op.drop_table("flow_humans")
    op.drop_table("agent_relations")
    op.drop_table("agents")
