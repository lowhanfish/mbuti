"""Pabrik AsyncEngine PostgreSQL (psycopg 3)."""

from typing import Any

from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import settings


def build_async_engine(url: URL | None = None, **options: Any) -> AsyncEngine:
    """
    Buat engine async. Tanpa argumen memakai pengaturan aplikasi.

    `options` diteruskan ke `create_async_engine`, mis. `poolclass=NullPool` untuk pengujian.
    """
    # Pengaturan ukuran pool tidak berlaku bila kelas pool diganti.
    pool_options: dict[str, Any] = {}
    if "poolclass" not in options:
        pool_options = {
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT,
            "pool_recycle": settings.DB_POOL_RECYCLE,
            "pool_pre_ping": True,
        }

    return create_async_engine(
        url or settings.get_database_url(),
        echo=settings.DB_ECHO,
        # Nilai parameter query (isi dokumen, hash kata sandi) tidak boleh masuk log.
        hide_parameters=True,
        connect_args={
            "connect_timeout": settings.DB_CONNECT_TIMEOUT,
            "options": "-c timezone=UTC",
        },
        **pool_options,
        **options,
    )
