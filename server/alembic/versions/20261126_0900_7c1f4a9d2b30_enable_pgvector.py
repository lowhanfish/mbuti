"""Aktifkan ekstensi pgvector

Revision ID: 7c1f4a9d2b30
Revises:
Create Date: 2026-11-26 09:00:00

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c1f4a9d2b30"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Butuh hak superuser bila ekstensi belum dibuat; di server produksi buat lebih dulu.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
