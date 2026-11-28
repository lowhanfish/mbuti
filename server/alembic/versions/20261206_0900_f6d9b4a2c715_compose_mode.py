"""Mode penyusunan (E3c): mode role, tugas, dan tugas rutin; bagian buatan pada langkah

Revision ID: f6d9b4a2c715
Revises: e5c8a3f1b904
Create Date: 2026-12-06 09:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f6d9b4a2c715"
down_revision: str | None = "e5c8a3f1b904"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CHOICES = (("agents", "data"), ("tasks", "role"), ("schedules", "role"))


def upgrade() -> None:
    for table, default in CHOICES:
        op.add_column(
            table, sa.Column("compose_mode", sa.String(8), nullable=False, server_default=default)
        )
    op.add_column("task_steps", sa.Column("compose_mode", sa.String(8), nullable=True))
    op.add_column(
        "task_steps",
        sa.Column(
            "composed", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
    )


def downgrade() -> None:
    op.execute("DELETE FROM result_documents WHERE kind = 'report'")
    op.drop_column("task_steps", "composed")
    op.drop_column("task_steps", "compose_mode")
    for table, _ in CHOICES:
        op.drop_column(table, "compose_mode")
