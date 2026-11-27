"""Kapan role mencari di internet dan bagaimana sumbernya disusun (E1d, kontrak 16.7)."""

import re
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LlmCall, Organization
from app.models.base import utcnow
from app.services.knowledge.search import Chunk

# Skor teratas pencarian internal di bawah ini dianggap dokumen kurang
WEAK_SCORE = 60
MAX_SOURCES = 5
FRESH = re.compile(
    r"\b(terbaru|terkini|sekarang|hari ini|tahun ini|internet|tren|harga|berita|kabar)\b",
    re.IGNORECASE,
)


def should_search(enabled: bool, mode: str, query: str, excerpts: list[Chunk]) -> bool:
    """Bila role mengizinkan, tugas tidak mematikannya, dan dokumen kurang atau minta terkini."""
    if not enabled or mode == "off":
        return False
    weak = not excerpts or max(chunk.score for chunk in excerpts) < WEAK_SCORE
    return weak or bool(FRESH.search(query))


async def searches_today(session: AsyncSession, organization_id: uuid.UUID) -> int:
    """Pencarian internet hari ini menurut zona waktu organisasi, termasuk yang gagal."""
    timezone = await session.scalar(
        select(Organization.timezone).where(Organization.id == organization_id)
    )
    start = (
        utcnow()
        .astimezone(ZoneInfo(timezone or "Asia/Makassar"))
        .replace(hour=0, minute=0, second=0, microsecond=0)
    )
    return await session.scalar(
        select(func.count()).where(
            LlmCall.organization_id == organization_id,
            LlmCall.kind == "web_search",
            LlmCall.created_at >= start,
        )
    )


def number_sources(sources: list[dict], retrieved_at: str) -> list[dict]:
    """Sumber unik per alamat, diberi nomor W1, W2, … (paling banyak lima)."""
    seen: set[str] = set()
    numbered: list[dict] = []
    for source in sources:
        url = str(source.get("url") or "")
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        numbered.append(
            {
                "no": len(numbered) + 1,
                "title": str(source.get("title") or url)[:200],
                "url": url[:500],
                "domain": str(source.get("domain") or "")[:120],
                "snippet": str(source.get("snippet") or "")[:400],
                "retrieved_at": retrieved_at,
            }
        )
        if len(numbered) >= MAX_SOURCES:
            break
    return numbered
