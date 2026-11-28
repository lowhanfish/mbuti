"""Spreadsheet (E3b): lembar data lampiran dan berkas hasil berjenis spreadsheet

Revision ID: e5c8a3f1b904
Revises: d9b4c7a2e815
Create Date: 2026-12-05 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e5c8a3f1b904"
down_revision: str | None = "d9b4c7a2e815"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONB = postgresql.JSONB()
UNIQUE = "uq_result_documents_task_agent"


def upgrade() -> None:
    op.add_column("task_attachments", sa.Column("tables", JSONB, nullable=True))
    op.add_column(
        "result_documents",
        sa.Column("kind", sa.String(10), nullable=False, server_default="letter"),
    )
    op.add_column("result_documents", sa.Column("xlsx_path", sa.String(200), nullable=True))
    op.add_column(
        "result_documents",
        sa.Column("preview", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    # Satu role boleh punya surat dan spreadsheet pada tugas yang sama
    op.drop_constraint(UNIQUE, "result_documents", type_="unique")
    op.create_unique_constraint(UNIQUE, "result_documents", ["task_id", "agent_id", "kind"])


def downgrade() -> None:
    op.execute("DELETE FROM result_documents WHERE kind <> 'letter'")
    op.drop_constraint(UNIQUE, "result_documents", type_="unique")
    op.create_unique_constraint(UNIQUE, "result_documents", ["task_id", "agent_id"])
    op.drop_column("result_documents", "preview")
    op.drop_column("result_documents", "xlsx_path")
    op.drop_column("result_documents", "kind")
    op.drop_column("task_attachments", "tables")
