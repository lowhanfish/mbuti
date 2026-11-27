"""Mengubah teks menjadi vektor makna: Gemini, atau tiruan lokal untuk pengujian."""

import hashlib
import math
import re
from functools import lru_cache
from typing import Protocol

from google.genai import types

from app.core.config import settings
from app.services.llm.gemini_keys import KeyPool


class EmbeddingProvider(Protocol):
    async def embed_document(self, title: str, text: str) -> list[float]: ...

    async def embed_query(self, query: str) -> list[float]: ...

    async def embed_image(self, data: bytes, mime_type: str, caption: str) -> list[float]: ...


class GeminiEmbedding:
    """Satu teks per permintaan: daftar teks dianggap satu isi oleh model ini."""

    def __init__(self, pool: KeyPool | None = None):
        self._pool = pool

    async def _embed(self, content) -> list[float]:
        if self._pool is None:
            self._pool = KeyPool.configured()
        config = types.EmbedContentConfig(output_dimensionality=settings.EMBEDDING_DIMENSION)

        async def call(client):
            return await client.aio.models.embed_content(
                model=settings.EMBEDDING_MODEL, contents=content, config=config
            )

        response = await self._pool.run(settings.EMBEDDING_MODEL, call)
        values = response.embeddings[0].values if response.embeddings else None
        if not values or len(values) != settings.EMBEDDING_DIMENSION:
            raise ValueError("Model embedding mengembalikan vektor yang tidak sesuai.")
        return list(values)

    # Awalan tugas sesuai anjuran gemini-embedding-2 untuk pencarian dokumen
    async def embed_document(self, title: str, text: str) -> list[float]:
        return await self._embed(f"title: {title or 'none'} | text: {text}")

    async def embed_query(self, query: str) -> list[float]:
        return await self._embed(f"task: search result | query: {query}")

    async def embed_image(self, data: bytes, mime_type: str, caption: str) -> list[float]:
        """Embedding multimodal satu gambar halaman (E1c), satu ruang vektor dengan teks."""
        return await self._embed(types.Part.from_bytes(data=data, mime_type=mime_type))


class MockEmbedding:
    """Kantong kata yang di-hash: teks dengan kata yang sama menghasilkan vektor berdekatan."""

    async def embed_document(self, title: str, text: str) -> list[float]:
        return self._vector(f"{title} {text}")

    async def embed_query(self, query: str) -> list[float]:
        return self._vector(query)

    async def embed_image(self, data: bytes, mime_type: str, caption: str) -> list[float]:
        # Tiruan: gambar diwakili keterangannya agar bisa ditemukan dengan kata yang sama
        return self._vector(caption)

    def _vector(self, text: str) -> list[float]:
        values = [0.0] * settings.EMBEDDING_DIMENSION
        for word in re.findall(r"[a-z0-9]{3,}", text.lower()):
            slot = int.from_bytes(hashlib.sha256(word.encode()).digest()[:4], "big")
            values[slot % len(values)] += 1.0
        length = math.sqrt(sum(v * v for v in values))
        if not length:
            values[0] = length = 1.0
        return [v / length for v in values]


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    return MockEmbedding() if settings.EMBEDDING_PROVIDER == "mock" else GeminiEmbedding()
