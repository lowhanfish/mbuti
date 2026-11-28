"""Kalender kerja (E2a): hari kerja organisasi, shift, tanggal khusus, cuti anggota

Revision ID: a1d4e7c9b352
Revises: f2b6d8e4a571
Create Date: 2026-12-02 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1d4e7c9b352"
down_revision: str | None = "f2b6d8e4a571"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _owner(table: str) -> list:
    """Kunci utama beserta rujukan ke organisasi dan pembuat."""
    return [
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f(f"fk_{table}_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f(f"fk_{table}_created_by_users"),
            ondelete="SET NULL",
        ),
    ]


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("workdays", JSONB, nullable=False, server_default="[1, 2, 3, 4, 5]"),
    )
    op.create_table(
        "work_shifts",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("weekdays", JSONB, nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.Column("created_by", UUID, nullable=True),
        *_owner("work_shifts"),
        sa.CheckConstraint("start_time <> end_time", name=op.f("ck_work_shifts_times")),
    )
    op.create_index(op.f("ix_work_shifts_organization_id"), "work_shifts", ["organization_id"])
    op.create_index(
        "uq_work_shifts_organization_name",
        "work_shifts",
        ["organization_id", sa.text("lower(name)")],
        unique=True,
    )
    op.create_table(
        "calendar_days",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("label", sa.String(60), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.Column("created_by", UUID, nullable=True),
        *_owner("calendar_days"),
        sa.UniqueConstraint("organization_id", "date", name="uq_calendar_days_organization_date"),
        sa.CheckConstraint("kind IN ('holiday', 'workday')", name=op.f("ck_calendar_days_kind")),
    )
    op.create_table(
        "member_leaves",
        sa.Column("id", UUID, nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("member_id", UUID, nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(200), nullable=False),
        _timestamp("created_at"),
        sa.Column("created_by", UUID, nullable=True),
        *_owner("member_leaves"),
        sa.ForeignKeyConstraint(
            ["member_id"],
            ["memberships.id"],
            name=op.f("fk_member_leaves_member_id_memberships"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("end_date >= start_date", name=op.f("ck_member_leaves_dates")),
    )
    op.create_index(op.f("ix_member_leaves_organization_id"), "member_leaves", ["organization_id"])
    op.create_index(op.f("ix_member_leaves_member_id"), "member_leaves", ["member_id"])


def downgrade() -> None:
    op.drop_table("member_leaves")
    op.drop_table("calendar_days")
    op.drop_table("work_shifts")
    op.drop_column("organizations", "workdays")
