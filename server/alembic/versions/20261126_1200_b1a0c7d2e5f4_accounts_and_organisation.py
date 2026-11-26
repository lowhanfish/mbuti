"""Akun, sesi, organisasi, keanggotaan, dan unit

Revision ID: b1a0c7d2e5f4
Revises: 7c1f4a9d2b30
Create Date: 2026-11-26 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b1a0c7d2e5f4"
down_revision: str | None = "7c1f4a9d2b30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def id_column() -> sa.Column:
    return sa.Column("id", UUID, nullable=False)


def timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def text_column(name: str, length: int) -> sa.Column:
    return sa.Column(name, sa.String(length), nullable=False)


def foreign_key(table: str, column: str, target: str, ondelete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        [f"{target}.id"],
        name=op.f(f"fk_{table}_{column}_{target}"),
        ondelete=ondelete,
    )


def primary_key(table: str) -> sa.PrimaryKeyConstraint:
    return sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}"))


def upgrade() -> None:
    op.create_table(
        "users",
        id_column(),
        text_column("email", 150),
        sa.Column("password_hash", sa.String(255), nullable=True),
        text_column("full_name", 150),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        timestamp("created_at"),
        timestamp("updated_at"),
        primary_key("users"),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )

    op.create_table(
        "refresh_sessions",
        id_column(),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("family_id", UUID, nullable=False),
        text_column("token_hash", 64),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(20), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        timestamp("created_at"),
        primary_key("refresh_sessions"),
        foreign_key("refresh_sessions", "user_id", "users", "CASCADE"),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_sessions_token_hash")),
    )
    op.create_index(op.f("ix_refresh_sessions_user_id"), "refresh_sessions", ["user_id"])
    op.create_index(op.f("ix_refresh_sessions_family_id"), "refresh_sessions", ["family_id"])

    op.create_table(
        "organizations",
        id_column(),
        text_column("name", 150),
        text_column("slug", 160),
        text_column("description", 1000),
        text_column("sector", 20),
        text_column("timezone", 60),
        text_column("email", 150),
        text_column("phone", 30),
        text_column("address", 300),
        text_column("website", 200),
        timestamp("created_at"),
        timestamp("updated_at"),
        primary_key("organizations"),
        sa.UniqueConstraint("slug", name=op.f("uq_organizations_slug")),
    )

    op.create_table(
        "memberships",
        id_column(),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        text_column("access_role", 10),
        sa.Column("unit_id", UUID, nullable=True),
        text_column("status", 10),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        timestamp("created_at"),
        timestamp("updated_at"),
        sa.Column("created_by", UUID, nullable=True),
        primary_key("memberships"),
        foreign_key("memberships", "organization_id", "organizations", "CASCADE"),
        foreign_key("memberships", "user_id", "users", "CASCADE"),
        foreign_key("memberships", "created_by", "users", "SET NULL"),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_memberships_organization_user"),
        sa.CheckConstraint(
            "access_role IN ('owner', 'admin', 'member', 'viewer')",
            name=op.f("ck_memberships_access_role"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'invited', 'disabled')", name=op.f("ck_memberships_status")
        ),
    )
    op.create_index(op.f("ix_memberships_organization_id"), "memberships", ["organization_id"])
    op.create_index(op.f("ix_memberships_user_id"), "memberships", ["user_id"])
    op.create_index(op.f("ix_memberships_unit_id"), "memberships", ["unit_id"])

    op.create_table(
        "units",
        id_column(),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("parent_id", UUID, nullable=True),
        text_column("name", 120),
        text_column("code", 12),
        text_column("description", 1000),
        text_column("color", 10),
        sa.Column("lead_member_id", UUID, nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        timestamp("created_at"),
        timestamp("updated_at"),
        sa.Column("created_by", UUID, nullable=True),
        primary_key("units"),
        foreign_key("units", "organization_id", "organizations", "CASCADE"),
        foreign_key("units", "parent_id", "units", "RESTRICT"),
        foreign_key("units", "lead_member_id", "memberships", "SET NULL"),
        foreign_key("units", "created_by", "users", "SET NULL"),
    )
    op.create_index(op.f("ix_units_organization_id"), "units", ["organization_id"])
    op.create_index(op.f("ix_units_parent_id"), "units", ["parent_id"])
    op.create_index(
        "uq_units_organization_name",
        "units",
        ["organization_id", sa.text("lower(name)")],
        unique=True,
    )
    op.create_index(
        "uq_units_organization_code",
        "units",
        ["organization_id", "code"],
        unique=True,
        postgresql_where=sa.text("code <> ''"),
    )

    # Dibuat setelah kedua tabel ada karena saling merujuk
    op.create_foreign_key(
        "fk_memberships_unit_id_units",
        "memberships",
        "units",
        ["unit_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_memberships_unit_id_units", "memberships", type_="foreignkey")
    op.drop_table("units")
    op.drop_table("memberships")
    op.drop_table("organizations")
    op.drop_table("refresh_sessions")
    op.drop_table("users")
