"""Jejak audit

Revision ID: a9c4e7d1b360
Revises: f6a1b8c37d52
Create Date: 2026-11-28 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a9c4e7d1b360"
down_revision: str | None = "f6a1b8c37d52"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def text(name: str, length: int) -> sa.Column:
    return sa.Column(name, sa.String(length), nullable=False)


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID, nullable=False),
        sa.Column("seq", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("organization_id", UUID, nullable=True),
        sa.Column("user_id", UUID, nullable=True),
        text("actor_name", 150),
        text("actor_email", 255),
        text("action", 40),
        text("target", 200),
        text("ip", 45),
        text("request_id", 36),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_audit_logs_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_user_id_users"),
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_audit_logs_organization_seq", "audit_logs", ["organization_id", "seq"])


def downgrade() -> None:
    op.drop_table("audit_logs")
