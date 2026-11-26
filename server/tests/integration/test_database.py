"""Koneksi psycopg async, pgvector, dan galat unik PostgreSQL."""

import pytest
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Integer, String, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.orm import declarative_base

from app.core.exceptions import ConflictException
from app.db.transaction import commit_or_raise_unique_conflict

# Basis terpisah agar tabel contoh tidak ikut terbaca Alembic.
ScratchBase = declarative_base()


class Item(ScratchBase):
    """Tabel sementara: hilang bersama koneksinya."""

    __tablename__ = "tmp_items"
    __table_args__ = {"prefixes": ["TEMPORARY"]}

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True)
    embedding = Column(Vector(3))


async def test_connection_uses_utc(db_session: AsyncSession) -> None:
    assert await db_session.scalar(text("SHOW timezone")) == "UTC"


async def test_vector_similarity_search(test_engine: AsyncEngine) -> None:
    async with test_engine.connect() as connection:
        await connection.run_sync(ScratchBase.metadata.create_all)
        async with AsyncSession(bind=connection) as session:
            session.add_all(
                [
                    Item(code="jauh", embedding=[0.0, 0.0, 1.0]),
                    Item(code="dekat", embedding=[1.0, 0.1, 0.0]),
                ]
            )
            await session.flush()

            nearest = await session.scalar(
                select(Item.code).order_by(Item.embedding.cosine_distance([1.0, 0.0, 0.0])).limit(1)
            )

    assert nearest == "dekat"


async def test_duplicate_value_raises_conflict(test_engine: AsyncEngine) -> None:
    async with test_engine.connect() as connection:
        await connection.run_sync(ScratchBase.metadata.create_all)
        await connection.commit()
        try:
            async with AsyncSession(bind=connection) as session:
                session.add_all([Item(code="sama"), Item(code="sama")])

                with pytest.raises(ConflictException):
                    await commit_or_raise_unique_conflict(session)
        finally:
            # Dihapus sendiri: pada server dengan pooler, sesi (beserta tabel sementaranya)
            # tetap hidup setelah klien memutus, sehingga menghalangi penurunan migrasi.
            await connection.rollback()
            await connection.run_sync(ScratchBase.metadata.drop_all)
            await connection.commit()
