"""Commit dengan penerjemahan galat integritas PostgreSQL."""

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestException, ConflictException

logger = logging.getLogger("mbuti.transaction")

# Kode SQLSTATE PostgreSQL untuk pelanggaran batasan unik.
UNIQUE_VIOLATION = "23505"


def is_unique_violation(exc: IntegrityError) -> bool:
    return getattr(exc.orig, "sqlstate", None) == UNIQUE_VIOLATION


async def commit_or_raise_unique_conflict(
    session: AsyncSession,
    conflict_message: str = "Data dengan nilai yang sama sudah ada.",
) -> None:
    """
    Commit transaksi berjalan. Pelanggaran unik menjadi 409; galat integritas lain
    (kunci asing, kolom wajib) menjadi 400. Transaksi selalu digulung balik saat gagal.
    """
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # Hanya kode dan nama batasan; pesan asli PostgreSQL bisa memuat isi data.
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        logger.warning(
            "Galat integritas database: sqlstate=%s batasan=%s",
            getattr(exc.orig, "sqlstate", None),
            constraint,
        )
        if is_unique_violation(exc):
            raise ConflictException(conflict_message) from exc
        raise BadRequestException(
            "Data tidak dapat disimpan karena rujukan atau isian wajib tidak sesuai."
        ) from exc
    except Exception:
        await session.rollback()
        raise
