"""
Pencarian gabungan: kata kunci (`tsvector`) dan kemiripan makna (pgvector),
digabung dengan reciprocal rank fusion. Hanya versi aktif yang sudah siap yang dicari.
"""

import datetime
import hashlib
import json
import logging
import re
import uuid
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import and_, func, literal, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.config import settings
from app.models import Document, DocumentChunk, DocumentSection, DocumentVersion, Organization
from app.models.base import utcnow
from app.services.llm.embedding import EmbeddingProvider

logger = logging.getLogger("mbuti.search")

# Urutan rujukan (kontrak 16.4): kebijakan organisasi, hasil tanya jawab, lalu dokumen
REFERENCE_TIER = {"policy": 0, "qa": 1, "document": 2}


async def local_today(session: AsyncSession, organization_id: uuid.UUID) -> datetime.date:
    """Tanggal hari ini menurut zona waktu organisasi."""
    timezone = await session.scalar(
        select(Organization.timezone).where(Organization.id == organization_id)
    )
    return utcnow().astimezone(ZoneInfo(timezone or "Asia/Makassar")).date()


def policy_in_force(document: Document, today: datetime.date) -> bool:
    return (
        document.policy_status == "berlaku"
        and (document.effective_from is None or document.effective_from <= today)
        and (document.effective_until is None or document.effective_until >= today)
    )


def in_force(today: datetime.date) -> ColumnElement[bool]:
    """Kebijakan yang dicabut, belum berlaku, atau lewat masa berlaku tidak ikut dicari."""
    return or_(
        Document.category != "policy",
        and_(
            Document.policy_status == "berlaku",
            or_(Document.effective_from.is_(None), Document.effective_from <= today),
            or_(Document.effective_until.is_(None), Document.effective_until >= today),
        ),
    )


def reference_order(items: list) -> list:
    """Susun hasil menurut urutan rujukan; di dalam kelompok tetap menurut relevansi."""
    return sorted(items, key=lambda item: REFERENCE_TIER.get(item.source_kind, 2))


CANDIDATES = 24
RRF_K = 60
SNIPPET_LENGTH = 230
QUERY_CACHE_SECONDS = 86_400
STOPWORDS = frozenset(
    "yang dan untuk dengan dari pada atau ini itu dalam akan agar kami apa bagaimana berapa "
    "kapan buat buatkan tolong".split()
)


@dataclass
class Chunk:
    """Potongan dokumen yang cocok, lengkap dengan asal rujukannya."""

    document_id: uuid.UUID
    document_title: str
    version_id: uuid.UUID
    version_no: int
    page_no: int
    heading: str
    text: str
    score: int
    # policy, qa, atau document (kontrak 16.4)
    source_kind: str = "document"


@dataclass
class Hit:
    document_id: uuid.UUID
    document_title: str
    version_id: uuid.UUID
    version_no: int
    page_no: int
    heading: str
    snippet: str
    score: int
    source_kind: str = "document"


def tokenize(query: str) -> list[str]:
    words = re.findall(r"[a-z0-9à-ÿ]+", query.lower())
    return list(dict.fromkeys(w for w in words if len(w) >= 3 and w not in STOPWORDS))


def snippet_around(body: str, terms: list[str]) -> str:
    lower = body.lower()
    found = [position for term in terms if (position := lower.find(term)) >= 0]
    start = max(0, min(found) - 70) if found else 0
    piece = body[start : start + SNIPPET_LENGTH].strip()
    return f"{'…' if start else ''}{piece}{'…' if start + SNIPPET_LENGTH < len(body) else ''}"


async def _query_vector(query: str, provider: EmbeddingProvider) -> list[float]:
    """Vektor pertanyaan disimpan sehari di Redis agar pertanyaan sama tidak memakai kuota lagi."""
    digest = hashlib.sha256(query.lower().encode()).hexdigest()
    key = (
        f"mbuti:{settings.APP_ENV}:embed:{settings.EMBEDDING_PROVIDER}:"
        f"{settings.EMBEDDING_MODEL}:{digest}"
    )
    try:
        async with Redis.from_url(settings.REDIS_URL) as client:
            cached = await client.get(key)
            if cached:
                return json.loads(cached)
            vector = await provider.embed_query(query)
            await client.set(key, json.dumps(vector), ex=QUERY_CACHE_SECONDS)
            return vector
    except RedisError as exc:
        logger.warning("Cache pertanyaan tidak tersedia: %s", type(exc).__name__)
        return await provider.embed_query(query)


async def rank_chunks(
    session: AsyncSession,
    organization_id: uuid.UUID,
    query: str,
    provider: EmbeddingProvider,
    visibility: ColumnElement[bool] | None = None,
    max_distance: float | None = None,
) -> list[Chunk]:
    """Semua potongan yang cocok, terurut dari yang paling relevan."""
    max_distance = settings.SEARCH_MAX_DISTANCE if max_distance is None else max_distance
    terms = tokenize(query)
    if not terms:
        return []

    filters = [
        Document.organization_id == organization_id,
        Document.deleted_at.is_(None),
        DocumentVersion.is_active.is_(True),
        DocumentVersion.status == "ready",
        in_force(await local_today(session, organization_id)),
    ]
    if visibility is not None:
        filters.append(visibility)

    def candidates(*columns):
        return (
            select(DocumentChunk.id, *columns)
            .join(DocumentVersion, DocumentVersion.id == DocumentChunk.version_id)
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(*filters)
        )

    # Kata kunci: salah satu kata cukup; yang lebih banyak cocok berada di atas
    tsquery = func.to_tsquery(text("'indonesian'::regconfig"), literal(" | ".join(terms)))
    rank = func.ts_rank_cd(DocumentChunk.search, tsquery)
    keyword = (
        (
            await session.execute(
                candidates()
                .where(DocumentChunk.search.op("@@")(tsquery))
                .order_by(rank.desc(), DocumentChunk.id)
                .limit(CANDIDATES)
            )
        )
        .scalars()
        .all()
    )

    semantic: list[uuid.UUID] = []
    try:
        vector = await _query_vector(query, provider)
    except Exception as exc:
        # Tanpa vektor (mis. kuota habis) pencarian kata kunci tetap berjalan
        logger.warning("Pencarian makna dilewati: %s", type(exc).__name__)
    else:
        distance = DocumentChunk.embedding.cosine_distance(vector)
        # Indeks HNSW diteruskan sampai cukup hasil yang lolos saringan organisasi
        await session.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
        semantic = list(
            await session.scalars(
                candidates()
                .where(DocumentChunk.embedding.is_not(None), distance <= max_distance)
                .order_by(distance)
                .limit(CANDIDATES)
            )
        )

    scores: dict[uuid.UUID, float] = {}
    for ranking in (keyword, semantic):
        for position, chunk_id in enumerate(ranking, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1 / (RRF_K + position)
    if not scores:
        return []

    rows = await session.execute(
        select(
            DocumentChunk.id,
            DocumentChunk.text,
            DocumentSection.page_no,
            DocumentSection.heading,
            DocumentVersion.id.label("version_id"),
            DocumentVersion.version_no,
            Document.id.label("document_id"),
            Document.title,
            Document.category,
        )
        .join(DocumentSection, DocumentSection.id == DocumentChunk.section_id)
        .join(DocumentVersion, DocumentVersion.id == DocumentChunk.version_id)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(DocumentChunk.id.in_(scores))
    )
    best = 2 / (RRF_K + 1)
    return [
        Chunk(
            document_id=row.document_id,
            document_title=row.title,
            version_id=row.version_id,
            version_no=row.version_no,
            page_no=row.page_no,
            heading=row.heading,
            text=row.text,
            score=round(scores[row.id] / best * 100),
            source_kind=row.category if row.category in ("policy", "qa") else "document",
        )
        for row in sorted(rows, key=lambda r: (-scores[r.id], r.page_no))
    ]


def to_hit(chunk: Chunk, terms: list[str]) -> Hit:
    return Hit(
        document_id=chunk.document_id,
        document_title=chunk.document_title,
        version_id=chunk.version_id,
        version_no=chunk.version_no,
        page_no=chunk.page_no,
        heading=chunk.heading,
        snippet=snippet_around(chunk.text, terms),
        score=chunk.score,
        source_kind=chunk.source_kind,
    )


async def search_documents(
    session: AsyncSession,
    organization_id: uuid.UUID,
    query: str,
    provider: EmbeddingProvider,
    visibility: ColumnElement[bool] | None = None,
    limit: int = 8,
) -> list[Hit]:
    """Hasil per halaman: potongan terbaik mewakili halamannya."""
    chunks = await rank_chunks(session, organization_id, query, provider, visibility)
    terms = tokenize(query)
    pages: dict[tuple[uuid.UUID, int], Hit] = {}
    for chunk in chunks:
        pages.setdefault((chunk.version_id, chunk.page_no), to_hit(chunk, terms))
    return reference_order(list(pages.values())[:limit])
