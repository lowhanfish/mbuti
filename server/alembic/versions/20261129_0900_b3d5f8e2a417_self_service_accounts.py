"""Akun mandiri: token email, status organisasi, persetujuan ketentuan

Revision ID: b3d5f8e2a417
Revises: a9c4e7d1b360
Create Date: 2026-11-29 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b3d5f8e2a417"
down_revision: str | None = "a9c4e7d1b360"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # Organisasi yang sudah ada tetap aktif
    op.add_column(
        "organizations",
        sa.Column("status", sa.String(10), nullable=False, server_default="active"),
    )
    op.create_check_constraint(
        op.f("ck_organizations_status"),
        "organizations",
        "status IN ('pending', 'active', 'suspended')",
    )
    op.add_column(
        "users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.create_table(
        "auth_tokens",
        sa.Column("id", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("purpose", sa.String(10), nullable=False),
        sa.Column("membership_id", UUID, nullable=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("created_by", UUID, nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_tokens")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_auth_tokens_user_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["membership_id"],
            ["memberships.id"],
            name=op.f("fk_auth_tokens_membership_id_memberships"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_auth_tokens_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("token_hash", name=op.f("uq_auth_tokens_token_hash")),
        sa.CheckConstraint(
            "purpose IN ('verify', 'reset', 'invite')", name=op.f("ck_auth_tokens_purpose")
        ),
    )
    op.create_index(op.f("ix_auth_tokens_user_id"), "auth_tokens", ["user_id"])
    op.create_index(op.f("ix_auth_tokens_membership_id"), "auth_tokens", ["membership_id"])


def downgrade() -> None:
    op.drop_table("auth_tokens")
    op.drop_column("users", "terms_accepted_at")
    op.drop_constraint(op.f("ck_organizations_status"), "organizations", type_="check")
    op.drop_column("organizations", "status")
