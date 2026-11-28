"""Kapan role mencari di internet dan penomoran sumbernya (kontrak 16.7)."""

import uuid

import pytest

from app.core.config import settings
from app.services.engine.web import number_sources, public_query, should_search
from app.services.knowledge.search import Chunk
from app.services.search import free


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


@pytest.mark.parametrize(
    ("topic", "role", "expected"),
    [
        (
            "Buat surat undangan rapat 2027\nrincian internal tidak ikut",
            "Staf Persuratan",
            "Buat surat undangan rapat 2027 Staf Persuratan",
        ),
        (
            "Surat untuk Pak Budi Santoso nomor 800/123/BKPSDM budi@contoh.test 081234567890",
            "Staf",
            "Surat untuk nomor Staf",
        ),
        ("Rekap kinerja Rina Wulandari", "Staf", "Rekap kinerja Staf"),
    ],
)
def test_public_query_hides_names_numbers_and_addresses(topic, role, expected):
    assert public_query(topic, role, ["Rina Wulandari"]) == expected


async def test_free_search_tries_next_engine(monkeypatch):
    calls = []

    def engine(query, backend):
        calls.append(backend)
        if backend == "yahoo":
            raise RuntimeError("diblokir")
        return [{"url": "https://contoh.test/a", "title": "A", "domain": "contoh.test"}]

    monkeypatch.setattr(free, "_engine_results", engine)
    monkeypatch.setattr(settings, "WEB_SEARCH_BACKENDS", "yahoo, auto")

    backend, results = await free.search("surat undangan")

    assert (backend, len(results), calls) == ("auto", 1, ["yahoo", "auto"])


def test_only_https_results_are_kept(monkeypatch):
    class Fake:
        def __init__(self, **_):
            pass

        def text(self, query, **_):
            return [
                {"href": "http://tidak-aman.test", "title": "x"},
                {"href": "https://www.contoh.test/b", "title": "", "body": "cuplikan"},
            ]

    monkeypatch.setattr("ddgs.DDGS", Fake)

    assert free._engine_results("apa saja", "yahoo") == [
        {
            "title": "contoh.test",
            "url": "https://www.contoh.test/b",
            "domain": "contoh.test",
            "snippet": "cuplikan",
        }
    ]
