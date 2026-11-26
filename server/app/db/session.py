"""Sesi database untuk permintaan API."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.engine import build_async_engine

# Membuat engine tidak membuka koneksi; koneksi pertama dibuka saat dipakai.
engine = build_async_engine()
session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency FastAPI: satu sesi per permintaan."""
    async with session_factory() as session:
        yield session
