"""Kapan role mencari di internet dan penomoran sumbernya (kontrak 16.7)."""

import uuid

import pytest

from app.services.engine.web import number_sources, should_search
from app.services.knowledge.search import Chunk


def chunk(score: int) -> Chunk:
    return Chunk(uuid.uuid4(), "Dok", uuid.uuid4(), 1, 1, "Bagian", "isi", score)


@pytest.mark.parametrize(
    ("enabled", "mode", "query", "excerpts", "expected"),
    [
        (False, "role", "kabar terbaru", [], False),
        (True, "off", "kabar terbaru", [], False),
        (True, "role", "surat undangan", [], True),
        (True, "role", "surat undangan", [chunk(40)], True),
        (True, "role", "surat undangan", [chunk(90)], False),
        (True, "role", "harga kertas terbaru", [chunk(90)], True),
    ],
)
def test_should_search(enabled, mode, query, excerpts, expected):
    assert should_search(enabled, mode, query, excerpts) is expected


def test_sources_are_unique_numbered_and_limited():
    sources = [{"url": f"https://contoh.test/{n % 7}", "title": f"T{n}"} for n in range(12)]
    sources.insert(0, {"url": "javascript:alert(1)", "title": "x"})

    numbered = number_sources(sources, "2026-11-28T00:00:00Z")

    assert [s["no"] for s in numbered] == [1, 2, 3, 4, 5]
    assert len({s["url"] for s in numbered}) == 5
    assert all(s["url"].startswith("https://") for s in numbered)
