"""Pembentukan role (E1a): revisi, keterampilan, tanya jawab, permintaan alat, kategori dokumen

Revision ID: c8e2a6f4d913
Revises: b3d5f8e2a417
Create Date: 2026-11-30 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c8e2a6f4d913"
down_revision: str | None = "b3d5f8e2a417"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()
OPEN = "('draft', 'analyzing', 'questioning', 'ready')"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "agent_revisions",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("agent_id", UUID, nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("materials", JSONB, nullable=False),
        sa.Column("card", JSONB, nullable=True),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column("round_no", sa.Integer(), nullable=False),
        sa.Column("changed", JSONB, nullable=False),
        sa.Column("agent_satisfied", sa.Boolean(), nullable=False),
        sa.Column("change_note", sa.String(1000), nullable=False),
        sa.Column("job", sa.String(10), nullable=True),
        sa.Column("job_finish", sa.Boolean(), nullable=False),
        sa.Column("job_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.String(300), nullable=True),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finalized_by_member_id", UUID, nullable=True),
        *_timestamps(),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("created_by", UUID, nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_revisions")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_agent_revisions_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"],
            ["agents.id"],
            name=op.f("fk_agent_revisions_agent_id_agents"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["finalized_by_member_id"],
            ["memberships.id"],
            name=op.f("fk_agent_revisions_finalized_by_member_id_memberships"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_agent_revisions_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("agent_id", "version_no", name="uq_agent_revisions_number"),
        sa.CheckConstraint(
            "status IN ('draft', 'analyzing', 'questioning', 'ready', 'final', 'superseded', "
            "'discarded')",
            name=op.f("ck_agent_revisions_status"),
        ),
        sa.CheckConstraint(
            "source IN ('formation', 'manual', 'restore')", name=op.f("ck_agent_revisions_source")
        ),
        sa.CheckConstraint(
            "job IS NULL OR job IN ('analysis', 'round')", name=op.f("ck_agent_revisions_job")
        ),
    )
    op.create_index(
        op.f("ix_agent_revisions_organization_id"), "agent_revisions", ["organization_id"]
    )
    op.create_index(op.f("ix_agent_revisions_agent_id"), "agent_revisions", ["agent_id"])
    op.create_index(
        "uq_agent_revisions_open",
        "agent_revisions",
        ["agent_id"],
        unique=True,
        postgresql_where=sa.text(f"status IN {OPEN}"),
    )

    op.create_table(
        "agent_skills",
        sa.Column("id", UUID, nullable=False),
        sa.Column("revision_id", UUID, nullable=False),
        sa.Column("key", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(600), nullable=False),
        sa.Column("steps", JSONB, nullable=False),
        sa.Column("inputs", JSONB, nullable=False),
        sa.Column("outputs", JSONB, nullable=False),
        sa.Column("tools", JSONB, nullable=False),
        sa.Column("support", sa.String(12), nullable=False),
        sa.Column("substitute_note", sa.String(400), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_skills")),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["agent_revisions.id"],
            name=op.f("fk_agent_skills_revision_id_agent_revisions"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("revision_id", "key", name="uq_agent_skills_key"),
        sa.CheckConstraint(
            "support IN ('supported', 'upcoming', 'substitute', 'unsupported')",
            name=op.f("ck_agent_skills_support"),
        ),
    )
    op.create_index(op.f("ix_agent_skills_revision_id"), "agent_skills", ["revision_id"])

    op.create_table(
        "agent_formation_messages",
        sa.Column("id", UUID, nullable=False),
        sa.Column("revision_id", UUID, nullable=False),
        sa.Column("round_no", sa.Integer(), nullable=False),
        sa.Column("author", sa.String(10), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("question_id", UUID, nullable=True),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("skipped", sa.Boolean(), nullable=False),
        sa.Column("refs", JSONB, nullable=False),
        sa.Column("author_member_id", UUID, nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_formation_messages")),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["agent_revisions.id"],
            name=op.f("fk_agent_formation_messages_revision_id_agent_revisions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_member_id"],
            ["memberships.id"],
            name=op.f("fk_agent_formation_messages_author_member_id_memberships"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "author IN ('agent', 'member')", name=op.f("ck_agent_formation_messages_author")
        ),
        sa.CheckConstraint(
            "kind IN ('question', 'answer', 'objection', 'note')",
            name=op.f("ck_agent_formation_messages_kind"),
        ),
    )
    op.create_index(
        op.f("ix_agent_formation_messages_revision_id"),
        "agent_formation_messages",
        ["revision_id"],
    )

    op.create_table(
        "tool_requests",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("agent_id", UUID, nullable=False),
        sa.Column("revision_id", UUID, nullable=True),
        sa.Column("skill_name", sa.String(120), nullable=False),
        sa.Column("requested", sa.String(80), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tool_requests")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_tool_requests_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"],
            ["agents.id"],
            name=op.f("fk_tool_requests_agent_id_agents"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["agent_revisions.id"],
            name=op.f("fk_tool_requests_revision_id_agent_revisions"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'planned', 'done', 'declined')",
            name=op.f("ck_tool_requests_status"),
        ),
    )
    op.create_index(op.f("ix_tool_requests_organization_id"), "tool_requests", ["organization_id"])

    op.add_column(
        "agents",
        sa.Column("web_search", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("agents", sa.Column("active_revision_id", UUID, nullable=True))
    op.create_foreign_key(
        op.f("fk_agents_active_revision_id_agent_revisions"),
        "agents",
        "agent_revisions",
        ["active_revision_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.alter_column("documents", "doc_type", type_=sa.String(20), existing_nullable=False)
    op.add_column(
        "documents",
        sa.Column("category", sa.String(12), nullable=False, server_default="knowledge"),
    )
    op.create_check_constraint(
        op.f("ck_documents_category"),
        "documents",
        "category IN ('knowledge', 'policy', 'formation', 'qa', 'web')",
    )

    # Role yang sudah ada menjadi versi 1 isian manual yang Final
    op.execute(
        """
        INSERT INTO agent_revisions (
            id, organization_id, agent_id, version_no, status, source, materials, card, snapshot,
            round_no, changed, agent_satisfied, change_note, job_finish, finalized_at,
            finalized_by_member_id, created_at, updated_at, created_by
        )
        SELECT
            gen_random_uuid(), a.organization_id, a.id, 1, 'final', 'manual',
            jsonb_build_object(
                'description', '', 'tools', '[]'::jsonb, 'represented', '',
                'owner_member_id', a.owner_member_id::text
            ),
            NULL,
            jsonb_build_object(
                'goal', a.goal, 'instructions', a.instructions, 'input_spec', a.input_spec,
                'output_format', a.output_format, 'output_template', a.output_template,
                'acceptance_criteria', a.acceptance_criteria,
                'knowledge_scope', a.knowledge_scope, 'model_profile', a.model_profile,
                'web_search', false
            ),
            0, '[]'::jsonb, false, 'Dibuat sebelum pembentukan role (isian manual).', false,
            a.created_at, a.owner_member_id, a.created_at, a.created_at, a.created_by
        FROM agents a
        """
    )
    op.execute(
        """
        UPDATE agents a SET active_revision_id = r.id
        FROM agent_revisions r WHERE r.agent_id = a.id AND r.version_no = 1
        """
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_documents_category"), "documents", type_="check")
    op.drop_column("documents", "category")
    op.execute("UPDATE documents SET doc_type = 'lainnya' WHERE length(doc_type) > 10")
    op.alter_column("documents", "doc_type", type_=sa.String(10), existing_nullable=False)
    op.drop_constraint(
        op.f("fk_agents_active_revision_id_agent_revisions"), "agents", type_="foreignkey"
    )
    op.drop_column("agents", "active_revision_id")
    op.drop_column("agents", "web_search")
    op.drop_table("tool_requests")
    op.drop_table("agent_formation_messages")
    op.drop_table("agent_skills")
    op.drop_table("agent_revisions")
