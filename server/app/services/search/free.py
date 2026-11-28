"""
Pencarian internet gratis lewat pustaka `ddgs` (MIT), tanpa kunci API (kontrak 16.7).

Diadaptasi dari cara Toto-L. Pustaka ini membaca halaman hasil mesin pencari, jadi sewaktu-waktu
bisa kosong atau diblokir. Hasilnya teks dari luar: selalu diperlakukan sebagai data.
"""

import asyncio
import logging
from urllib.parse import urlparse

from app.core.config import settings

logger = logging.getLogger("mbuti.search")

MAX_RESULTS = 5
ENGINE_TIMEOUT_SECONDS = 10


def _engine_results(query: str, backend: str) -> list[dict]:
    from ddgs import DDGS  # noqa: PLC0415 - berat, hanya dimuat saat mencari

    rows = DDGS(timeout=ENGINE_TIMEOUT_SECONDS).text(
        query, region="wt-wt", backend=backend, max_results=MAX_RESULTS
    )
    results = []
    for row in rows or []:
        url = str(row.get("href") or "").strip()
        if not url.startswith("https://"):
            continue
        domain = urlparse(url).netloc.lower().removeprefix("www.")
        results.append(
            {
                "title": str(row.get("title") or domain).strip(),
                "url": url,
                "domain": domain,
                "snippet": str(row.get("body") or "").strip(),
            }
        )
    return results


def _search(query: str) -> tuple[str, list[dict]]:
    """(mesin, hasil) dari mesin pertama yang memberi hasil; ('', []) bila tidak ada."""
    for backend in (b.strip() for b in settings.WEB_SEARCH_BACKENDS.split(",")):
        if not backend:
            continue
        try:
            results = _engine_results(query, backend)
        except Exception as exc:  # satu mesin gagal tidak menghentikan yang lain
            # Hanya jenis galatnya: pesannya memuat alamat beserta kata pencarian
            logger.warning("Pencarian %s gagal: %s", backend, type(exc).__name__)
            continue
        if results:
            return backend, results
    return "", []


async def search(query: str) -> tuple[str, list[dict]]:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_search, query), settings.WEB_SEARCH_TIMEOUT_SECONDS
        )
    except TimeoutError:
        logger.warning("Pencarian internet melewati batas waktu.")
        return "", []
