"""Pustaka kebijakan dan aturan (E1b): kolom kebijakan dokumen dan asal rujukan

Revision ID: d4f7b1c9e025
Revises: c8e2a6f4d913
Create Date: 2026-11-30 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4f7b1c9e025"
down_revision: str | None = "c8e2a6f4d913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("policy_kind", sa.String(20), nullable=True))
    op.add_column(
        "documents",
        sa.Column("reference_no", sa.String(100), nullable=False, server_default=""),
    )
    op.add_column(
        "documents", sa.Column("issuer", sa.String(150), nullable=False, server_default="")
    )
    op.add_column("documents", sa.Column("effective_from", sa.Date(), nullable=True))
    op.add_column("documents", sa.Column("effective_until", sa.Date(), nullable=True))
    op.add_column("documents", sa.Column("policy_status", sa.String(10), nullable=True))
    op.create_check_constraint(
        op.f("ck_documents_policy_kind"),
        "documents",
        "policy_kind IS NULL OR policy_kind IN "
        "('peraturan', 'kebijakan', 'standar_mutu', 'panduan_merek', 'lainnya')",
    )
    op.create_check_constraint(
        op.f("ck_documents_policy_status"),
        "documents",
        "policy_status IS NULL OR policy_status IN ('berlaku', 'dicabut')",
    )
    op.add_column(
        "citations",
        sa.Column("source_kind", sa.String(12), nullable=False, server_default="document"),
    )


def downgrade() -> None:
    op.drop_column("citations", "source_kind")
    op.drop_constraint(op.f("ck_documents_policy_status"), "documents", type_="check")
    op.drop_constraint(op.f("ck_documents_policy_kind"), "documents", type_="check")
    for column in (
        "policy_status",
        "effective_until",
        "effective_from",
        "issuer",
        "reference_no",
        "policy_kind",
    ):
        op.drop_column("documents", column)
